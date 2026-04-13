const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const hpp = require('hpp');
const User = require('./models/User');
const connectDB = require('./utils/db');
const ensureAdminUser = require('./utils/ensureAdminUser');
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

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.AUTH_RATE_LIMIT_MAX || 20),
    standardHeaders: true,
    legacyHeaders: false,
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

function getCookieValue(req, key) {
    const raw = String((req && req.headers && req.headers.cookie) || '').trim();
    if (!raw) return '';
    const parts = raw.split(';').map((chunk) => chunk.trim());
    const hit = parts.find((chunk) => chunk.toLowerCase().startsWith(String(key).toLowerCase() + '='));
    if (!hit) return '';
    const idx = hit.indexOf('=');
    return idx >= 0 ? decodeURIComponent(hit.slice(idx + 1)) : '';
}

async function ensureAdminPageAccess(req, res, next) {
    const adminPath = '/admin' + String(req.path || '');
    if (ADMIN_PUBLIC_PATHS.has(adminPath)) return next();

    const token = req.header('x-auth-token') || req.query.token || getCookieValue(req, 'yeshi_token');
    if (!token) {
        return res.redirect(302, '/user/login.html');
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded && decoded.user && decoded.user.id;
        if (!userId) {
            return res.redirect(302, '/user/login.html');
        }

        const dbUser = await User.findById(userId).select('role status isBanned').lean();
        if (!dbUser) {
            return res.redirect(302, '/user/login.html');
        }

        const status = dbUser.status || (dbUser.isBanned ? 'banned' : 'active');
        if (status === 'banned' || status === 'inactive' || dbUser.isBanned) {
            return res.redirect(302, '/user/login.html');
        }

        if (String(dbUser.role || '').toLowerCase() !== 'admin') {
            return res.redirect(302, '/user/login.html');
        }

        return next();
    } catch (_) {
        return res.redirect(302, '/user/login.html');
    }
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
const frontendRoot = path.join(__dirname, '../frontend');
const userRoot = path.join(frontendRoot, 'user');
const hasFrontend = fs.existsSync(frontendRoot) && fs.existsSync(userRoot);

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
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/deliveries', require('./routes/deliveries'));
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
        res.sendFile(path.join(__dirname, '../frontend/admin/login.html'));
    });

// Backward-compatible admin login URLs
    app.get(['/admin-login', '/admin-login.html', '/frontend/admin-login.html'], (req, res) => {
        res.redirect(302, '/admin/login');
    });

    app.get('/admin/forgot-password', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/admin/forgot-password.html'));
    });

    app.get('/admin/verify-otp', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/admin/verify-otp.html'));
    });

    app.get('/admin/reset-password', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/admin/reset-password.html'));
    });

    app.get('/admin/users', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/admin/users.html'));
    });

    app.get('/admin/employee-management', (req, res) => {
        res.redirect(302, '/admin/users?role=employee');
    });

    app.get('/admin/delivery-management', (req, res) => {
        res.redirect(302, '/admin/users?role=driver');
    });

    app.get('/admin/orders', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/admin/orders.html'));
    });

    app.get('/admin/order-stats', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/admin/order-stats.html'));
    });

    app.get('/admin/links', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/admin/links.html'));
    });

    app.get('/admin/posts', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/admin/posts.html'));
    });

    app.get('/admin/workflow', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/admin/workflow.html'));
    });

    app.get('/admin/products', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/admin/products.html'));
    });

// Admin Dashboard - Generic catch for /admin that isn't login/recovery
// Ideally this should check token but for a simple server-served structure:
    app.get('/admin', (req, res) => {
        res.redirect(302, '/admin/orders');
    });

// Auth pages (user)
    app.get('/auth/login', (req, res) => {
        res.sendFile(path.join(userRoot, 'login.html'));
    });

    app.get('/auth/forgot-password', (req, res) => {
        res.sendFile(path.join(userRoot, 'forgot-password.html'));
    });

    app.get('/auth/reset-password', (req, res) => {
        res.sendFile(path.join(userRoot, 'reset-password.html'));
    });

    app.get(['/auth/register', '/auth/signup'], (req, res) => {
        res.sendFile(path.join(userRoot, 'signup.html'));
    });

    app.get('/shop', (req, res) => {
        res.sendFile(path.join(userRoot, 'shop.html'));
    });

    app.get('/checkout', (req, res) => {
        res.sendFile(path.join(userRoot, 'checkout.html'));
    });

// Backward-compatible dashboard URLs
    app.get(['/dashboard', '/dashboard.html', '/frontend/dashboard.html'], (req, res) => {
        res.redirect(302, '/admin');
    });

    app.get('/employee', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/employee/dashboard.html'));
    });

    app.get('/employee/dashboard', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/employee/dashboard.html'));
    });

    app.get('/employee/jobs', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/employee/jobs.html'));
    });

    app.get('/employee/offers', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/employee/offers.html'));
    });

    app.get('/employee/chat', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/employee/chat.html'));
    });

    app.get('/employee/notifications', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/employee/notifications.html'));
    });

    app.get('/driver', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/driver/dashboard.html'));
    });

    app.get('/driver/dashboard', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/driver/dashboard.html'));
    });

    app.get('/driver/jobs', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/driver/jobs.html'));
    });

    app.get('/driver/offers', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/driver/offers.html'));
    });

    app.get('/driver/chat', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/driver/chat.html'));
    });

    app.get('/driver/notifications', (req, res) => {
        res.sendFile(path.join(__dirname, '../frontend/driver/notifications.html'));
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
    try {
        await connectDB();
        await ensureAdminUser();
    } catch (error) {
        const message = error && error.message ? error.message : String(error);
        if (message.includes('MongoDB connection string is missing')) {
            throw error;
        }

        console.error('Starting without MongoDB connection:', message);
    }

    app.listen(PORT, () => console.log(`Server started on port ${PORT}`));
}

startServer().catch((err) => {
    console.error('Fatal startup error:', err && err.message ? err.message : err);
    process.exit(1);
});
