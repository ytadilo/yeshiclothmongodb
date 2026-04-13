const nodemailer = require('nodemailer');
const https = require('https');

async function sendWithResend({ apiKey, from, to, subject, text, html }) {
    const payload = JSON.stringify({
        from,
        to,
        subject,
        text,
        ...(html ? { html } : {})
    });

    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                method: 'POST',
                hostname: 'api.resend.com',
                path: '/emails',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload),
                    Authorization: `Bearer ${apiKey}`
                }
            },
            (res) => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    let body;
                    try {
                        body = data ? JSON.parse(data) : null;
                    } catch (_) {
                        body = { raw: data };
                    }

                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        return resolve(body);
                    }

                    const err = new Error(
                        (body && (body.message || body.error)) || `Resend error (HTTP ${res.statusCode || 0})`
                    );
                    err.code = 'RESEND_ERROR';
                    err.status = res.statusCode;
                    err.responseBody = body;
                    return reject(err);
                });
            }
        );

        req.setTimeout(15000, () => {
            const err = new Error('Resend request timed out');
            err.code = 'ETIMEDOUT';
            req.destroy(err);
        });

        req.on('error', (err) => reject(err));
        req.write(payload);
        req.end();
    });
}

function getEmailConfig() {
    const host = String(process.env.SMTP_HOST || '').trim();
    const portRaw = String(process.env.SMTP_PORT || '').trim();
    const port = portRaw ? Number(portRaw) : undefined;
    const secure = String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true';

    // Back-compat with existing env names
    const user = String(process.env.SMTP_USER || process.env.SMTP_EMAIL || '').trim();
    const pass = String(process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '').trim();

    const service = String(process.env.SMTP_SERVICE || '').trim();

    const fromEmail = String(process.env.FROM_EMAIL || user || '').trim();
    const fromName = String(process.env.FROM_NAME || 'Yeshi').trim();

    const provider = String(process.env.EMAIL_PROVIDER || 'smtp').trim().toLowerCase();
    const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
    const resendFrom = String(process.env.RESEND_FROM || fromEmail || 'onboarding@resend.dev').trim();

    const connectionTimeoutMs = Number(process.env.SMTP_CONNECTION_TIMEOUT_MS || 10000);
    const greetingTimeoutMs = Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000);
    const socketTimeoutMs = Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 20000);

    const isConfigured = Boolean(user && pass && (host || service || user));

    return {
        host,
        port,
        secure,
        user,
        pass,
        service,
        fromEmail,
        fromName,
        provider,
        resendApiKey,
        resendFrom,
        connectionTimeoutMs,
        greetingTimeoutMs,
        socketTimeoutMs,
        isConfigured
    };
}

function createTransporter(cfg) {
    if (!cfg.isConfigured) {
        const err = new Error(
            'Email is not configured. Set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS (recommended) or SMTP_SERVICE + SMTP_EMAIL/SMTP_PASSWORD.'
        );
        err.code = 'EMAIL_NOT_CONFIGURED';
        throw err;
    }

    if (cfg.host) {
        return nodemailer.createTransport({
            host: cfg.host,
            port: cfg.port || (cfg.secure ? 465 : 587),
            secure: cfg.secure,
            auth: { user: cfg.user, pass: cfg.pass },
            connectionTimeout: cfg.connectionTimeoutMs,
            greetingTimeout: cfg.greetingTimeoutMs,
            socketTimeout: cfg.socketTimeoutMs,
            // If using STARTTLS on 587, require TLS upgrade.
            ...(cfg.secure ? {} : { requireTLS: true })
        });
    }

    // Fallback: service-based (e.g. gmail)
    return nodemailer.createTransport({
        service: cfg.service || 'gmail',
        auth: { user: cfg.user, pass: cfg.pass },
        connectionTimeout: cfg.connectionTimeoutMs,
        greetingTimeout: cfg.greetingTimeoutMs,
        socketTimeout: cfg.socketTimeoutMs
    });
}

const sendEmail = async (options) => {
    const cfg = getEmailConfig();

    // Optional HTTPS provider to avoid SMTP egress blocks on some hosts.
    if (cfg.provider === 'resend') {
        if (!cfg.resendApiKey) {
            const err = new Error('RESEND_API_KEY is missing');
            err.code = 'EMAIL_NOT_CONFIGURED';
            throw err;
        }

        const from = cfg.resendFrom || 'onboarding@resend.dev';
        return sendWithResend({
            apiKey: cfg.resendApiKey,
            from,
            to: options.email,
            subject: options.subject,
            text: options.message,
            html: options.html
        });
    }

    const transporter = createTransporter(cfg);

    const mail = {
        from: cfg.fromEmail ? `${cfg.fromName} <${cfg.fromEmail}>` : cfg.user,
        to: options.email,
        subject: options.subject,
        text: options.message,
        ...(options.html ? { html: options.html } : {})
    };

    try {
        const info = await transporter.sendMail(mail);
        if (process.env.NODE_ENV !== 'production') {
            console.log('Email sent: %s', info.messageId);
        }
        return info;
    } catch (err) {
        // Workaround: some hosts block/timeout port 465. If Gmail + 465 times out, retry once on 587 (STARTTLS).
        const isGmailHost = String(cfg.host || '').toLowerCase() === 'smtp.gmail.com' || /gmail\.com$/i.test(cfg.user);
        const isTimeout = err && (err.code === 'ETIMEDOUT' || err.code === 'ESOCKET' || /timeout/i.test(String(err.message || '')));
        const using465 = Number(cfg.port || 0) === 465 || (cfg.secure && !cfg.port);

        if (isGmailHost && using465 && isTimeout) {
            console.warn('SMTP timeout on 465; retrying on 587 (STARTTLS)');
            try {
                const retryCfg = {
                    ...cfg,
                    port: 587,
                    secure: false
                };
                const retryTransporter = createTransporter(retryCfg);
                const info = await retryTransporter.sendMail(mail);
                if (process.env.NODE_ENV !== 'production') {
                    console.log('Email sent (retry 587): %s', info.messageId);
                }
                return info;
            } catch (retryErr) {
                console.warn('SMTP retry on 587 failed');
                err = retryErr;
            }
        }

        // Add a clearer hint for common Gmail failures
        const message = String(err && err.message ? err.message : err);
        if (/gmail/i.test(cfg.service || '') || /gmail\.com$/i.test(cfg.user)) {
            err.message = `${message} (If you use Gmail, you usually need an App Password, not your normal password.)`;
        }
        throw err;
    }
};

module.exports = sendEmail;
