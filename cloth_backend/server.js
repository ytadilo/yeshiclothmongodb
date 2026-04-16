const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const connectDB = require('./utils/db');
const { getDatabaseProvider } = require('./utils/db');
const ensureAdminUser = require('./utils/ensureAdminUser');
const { resolveRequestUser } = require('./middleware/authCore');
require('dotenv').config();

const app = express();

// Needed when deployed behind proxies (Render/Netlify/NGINX) so req.protocol reflects X-Forwarded-Proto
app.set('trust proxy', 1);
app.disable('x-powered-by');

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_MAX || 300),
    standardHeaders: true,
    legacyHeaders: false
});

const firebaseSessionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.FIREBASE_SESSION_RATE_LIMIT_MAX || 12),
    standardHeaders: true,
    legacyHeaders: false,
    message: { msg: 'Too many Firebase session attempts. Please try again later.' }
});

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        const path = String(req.originalUrl || req.url || '').split('?')[0];
        if (req.method === 'GET') return true;
        return path === '/api/auth/logout';
    },
    message: { msg: 'Too many authentication attempts. Please try again later.' }
});

const hppMiddleware = hpp();

function sanitizeObject(input) {
    if (Array.isArray(input)) {
        return input.map((value) => sanitizeObject(value));
    }

    if (!input || typeof input !== 'object') {
        return input;
    }

    const clean = {};
    Object.entries(input).forEach(([key, value]) => {
        const safeKey = String(key).replace(/\$/g, '').replace(/\./g, '_');
        clean[safeKey] = sanitizeObject(value);
    });
    return clean;
}

// Middleware
app.use(
    helmet({
        crossOriginResourcePolicy: false,
        contentSecurityPolicy: false
    })
);
app.use(express.json({ limit: '1mb' }));
app.use((req, _res, next) => {
    try {
        if (req.body && typeof req.body === 'object') {
            req.body = sanitizeObject(req.body);
        }
    } catch (error) {
        console.error('body sanitize middleware skipped:', error?.message || error);
    }
    return next();
});
app.use((req, res, next) => {
    try {
        return hppMiddleware(req, res, next);
    } catch (error) {
        console.error('hpp middleware skipped:', error?.message || error);
        return next();
    }
});
app.use('/api', globalLimiter);
app.use('/api/auth/firebase/session', firebaseSessionLimiter);
app.use('/api/auth', authLimiter);
app.use(
    cors({
        origin: function (origin, cb) {
            // Allow server-to-server (Netlify proxy) and tools like curl/postman
            if (!origin) return cb(null, true);

            const allowList = String(process.env.CORS_ORIGINS || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);

            if (allowList.length === 0) return cb(null, true);
            return cb(null, allowList.includes(origin));
        },
        credentials: true
    })
);

// Health endpoints (useful for Render + quick checks)
app.get('/api/health', (req, res) => {
    res.json({
        ok: true,
        commit: process.env.RENDER_GIT_COMMIT || process.env.COMMIT_SHA || null
    });
});

app.get('/api/download', async (req, res) => {
    try {
        const rawUrl = String(req.query.url || '').trim();
        const requestedName = String(req.query.filename || '').trim();

        if (!/^https?:\/\//i.test(rawUrl)) {
            return res.status(400).json({ msg: 'Invalid download URL' });
        }

        let parsed;
        try {
            parsed = new URL(rawUrl);
        } catch (_) {
            return res.status(400).json({ msg: 'Invalid download URL' });
        }

        const response = await fetch(parsed.toString(), { redirect: 'follow' });
        if (!response.ok) {
            return res.status(400).json({ msg: 'Could not fetch file' });
        }

        const length = Number(response.headers.get('content-length') || 0);
        if (Number.isFinite(length) && length > 30 * 1024 * 1024) {
            return res.status(413).json({ msg: 'File too large to download' });
        }

        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const buf = Buffer.from(await response.arrayBuffer());

        let filename = requestedName;
        if (!filename) {
            const fromPath = String(parsed.pathname || '').split('/').pop() || 'download';
            filename = fromPath;
        }
        filename = filename.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'download';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(buf);
    } catch (err) {
        console.error('download proxy error:', err?.message || err);
        return res.status(500).json({ msg: 'Download failed' });
    }
});

app.get('/', (req, res) => {
    res.type('text').send('OK');
});

const ADMIN_PUBLIC_PATHS = new Set([
    '/admin/login',
    '/admin/forgot-password',
    '/admin/verify-otp',
    '/admin/reset-password'
]);

async function ensureAdminPageAccess(req, res, next) {
    const adminPath = '/admin' + String(req.path || '');
    if (ADMIN_PUBLIC_PATHS.has(adminPath)) return next();

    req.__skipAdminDeviceCheck = true;

    const resolved = await resolveRequestUser(req, {
        allowLegacyJwt: true,
        optional: false
    });

    delete req.__skipAdminDeviceCheck;

    if (!resolved.ok || !req.user || String(req.user.role || '').toLowerCase() !== 'admin') {
        return res.redirect(302, '/auth/login');
    }

    return next();
}

app.use('/admin', ensureAdminPageAccess);

// Log whether email is configured (do not log secrets)
const smtpUser = String(process.env.SMTP_USER || process.env.SMTP_EMAIL || '').trim();
const smtpPass = String(process.env.SMTP_PASS || process.env.SMTP_PASSWORD || '').trim();
const smtpHostOrService = String(process.env.SMTP_HOST || process.env.SMTP_SERVICE || '').trim();
const emailConfigured = Boolean(smtpUser && smtpPass && (smtpHostOrService || smtpUser));
console.log(`Email configured: ${emailConfigured ? 'yes' : 'no'}`);

// Render exposes the deployed git commit hash in RENDER_GIT_COMMIT
if (process.env.RENDER_GIT_COMMIT) {
    console.log(`Deployed commit: ${process.env.RENDER_GIT_COMMIT}`);
}

// Serve uploads folder (if present)
app.use(
    '/uploads',
    express.static(path.join(__dirname, 'uploads'), {
        maxAge: '7d',
        etag: true
    })
);

// Optional frontend serving (local dev only). On Render this repo is API-only,
// so avoid throwing ENOENT errors when frontend files are missing.
const frontendRootCandidates = [
    path.join(__dirname, '../frontend'),
    path.join(__dirname, '../cloth_frontend/frontend')
];
const frontendRoot = frontendRootCandidates.find((candidate) => fs.existsSync(path.join(candidate, 'user'))) || frontendRootCandidates[0];
const userRoot = path.join(frontendRoot, 'user');
const adminRoot = path.join(frontendRoot, 'admin');
const hasFrontend = fs.existsSync(frontendRoot) && fs.existsSync(userRoot);

function sendFrontendFile(res, filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        return res.status(404).type('text').send('Frontend page not found');
    }
    return res.sendFile(filePath);
}

if (hasFrontend) {
    app.use(express.static(frontendRoot));
    // Backward-compatible static prefix (some old links used /frontend/...)
    app.use('/frontend', express.static(frontendRoot));
    // Optional: allow direct /user/* access too
    app.use('/user', express.static(userRoot));
}

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/posts', require('./routes/posts'));
app.use('/api/products', require('./routes/products'));
app.use('/api/exchange', require('./routes/exchange'));
app.use('/api/workflow', require('./routes/workflow'));
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/admin/users', require('./routes/adminUsers'));
app.use('/api/admin/devices', require('./routes/adminDevices'));
app.use('/api/admin/uploads', require('./routes/adminUploads'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/backup', require('./routes/backup'));

// Admin specific routes handling (only if frontend exists)
// We map /admin/* to the HTML files in frontend/admin/
if (hasFrontend) {
    app.get('/admin/login', (req, res) => {
        return sendFrontendFile(res, path.join(adminRoot, 'login.html'));
    });

// Backward-compatible admin login URLs
    app.get(['/admin-login', '/admin-login.html', '/frontend/admin-login.html'], (req, res) => {
        res.redirect(302, '/admin/login');
    });

    app.get('/admin/forgot-password', (req, res) => {
        return sendFrontendFile(res, path.join(adminRoot, 'forgot-password.html'));
    });

    app.get('/admin/verify-otp', (req, res) => {
        return sendFrontendFile(res, path.join(adminRoot, 'verify-otp.html'));
    });

    app.get('/admin/reset-password', (req, res) => {
        return sendFrontendFile(res, path.join(adminRoot, 'reset-password.html'));
    });

    app.get('/admin/users', (req, res) => {
        return sendFrontendFile(res, path.join(adminRoot, 'users.html'));
    });

    app.get('/admin/orders', (req, res) => {
        return sendFrontendFile(res, path.join(adminRoot, 'orders.html'));
    });

    app.get('/admin/order-stats', (req, res) => {
        return sendFrontendFile(res, path.join(adminRoot, 'order-stats.html'));
    });

    app.get('/admin/links', (req, res) => {
        return sendFrontendFile(res, path.join(adminRoot, 'links.html'));
    });

    app.get('/admin/posts', (req, res) => {
        return sendFrontendFile(res, path.join(adminRoot, 'posts.html'));
    });

    app.get('/admin/workflow', (req, res) => {
        return sendFrontendFile(res, path.join(adminRoot, 'workflow.html'));
    });

    app.get('/admin/products', (req, res) => {
        return sendFrontendFile(res, path.join(adminRoot, 'products.html'));
    });

// Admin Dashboard - Generic catch for /admin that isn't login/recovery
// Ideally this should check token but for a simple server-served structure:
    app.get('/admin', (req, res) => {
        res.redirect(302, '/admin/orders');
    });

// Auth pages (user)
    app.get('/auth/login', (req, res) => {
        return sendFrontendFile(res, path.join(userRoot, 'login.html'));
    });

    app.get('/auth/forgot-password', (req, res) => {
        return sendFrontendFile(res, path.join(userRoot, 'forgot-password.html'));
    });

    app.get('/auth/reset-password', (req, res) => {
        return sendFrontendFile(res, path.join(userRoot, 'reset-password.html'));
    });

    app.get(['/auth/register', '/auth/signup'], (req, res) => {
        return sendFrontendFile(res, path.join(userRoot, 'signup.html'));
    });

    app.get('/shop', (req, res) => {
        return sendFrontendFile(res, path.join(userRoot, 'shop.html'));
    });

    app.get('/checkout', (req, res) => {
        return sendFrontendFile(res, path.join(userRoot, 'checkout.html'));
    });

// Backward-compatible dashboard URLs
    app.get(['/dashboard', '/dashboard.html', '/frontend/dashboard.html'], (req, res) => {
        res.redirect(302, '/admin');
    });
}


// Serve Frontend for any unknown route (SPA Fallback)
if (hasFrontend) {
    app.get(/(.*)/, (req, res) => {
        if (req.path.startsWith('/api')) {
            return res.status(404).json({ msg: 'API route not found' });
        }

        let reqPath = req.path;
        if (reqPath === '/') reqPath = '/index';

        const rel = reqPath.replace(/^\/+/, '');

        const candidates = [
            path.join(frontendRoot, rel),
            path.join(frontendRoot, rel + '.html'),
            path.join(userRoot, rel),
            path.join(userRoot, rel + '.html')
        ];

        const found = candidates.find((p) => fs.existsSync(p));
        if (found) {
            return res.sendFile(found);
        }

        return res.sendFile(path.join(userRoot, 'index.html'));
    });
}

const PORT = process.env.PORT || 5000;

async function startServer() {
    const provider = getDatabaseProvider();

    try {
        await connectDB();
        if (provider === 'mongo') {
            await ensureAdminUser();
        } else {
            console.log('Skipping ensureAdminUser in Firebase mode');
        }
    } catch (error) {
        const message = error && error.message ? error.message : String(error);
        if (message.includes('MongoDB connection string is missing') || message.includes('Firebase credentials are missing')) {
            throw error;
        }

        console.error(`Starting without ${provider} connection:`, message);
    }

    app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
}

startServer().catch((err) => {
    console.error('Fatal startup error:', err && err.message ? err.message : err);
    process.exit(1);
});
