const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const User = require('../models/User');
const BlockedDevice = require('../models/BlockedDevice');
const { getFirebaseAdmin } = require('../utils/firebase');

function getCookieValue(req, key) {
    const raw = String((req && req.headers && req.headers.cookie) || '').trim();
    if (!raw) return '';
    const parts = raw.split(';').map((chunk) => chunk.trim());
    const hit = parts.find((chunk) => chunk.toLowerCase().startsWith(String(key).toLowerCase() + '='));
    if (!hit) return '';
    const idx = hit.indexOf('=');
    return idx >= 0 ? decodeURIComponent(hit.slice(idx + 1)) : '';
}

function getDeviceHashFromReq(req) {
    const rawId = String(req.header('x-device-id') || '').trim();
    if (rawId && /^[a-f0-9]{64}$/i.test(rawId)) {
        return rawId.toLowerCase();
    }

    const fp = String(req.header('x-device-fingerprint') || '').trim();
    if (!fp) return null;
    return crypto.createHash('sha256').update(fp).digest('hex');
}

function shouldSkipAdminDeviceCheck(req) {
    const baseUrl = String(req.baseUrl || '').toLowerCase();
    const path = String(req.path || '').toLowerCase();
    return baseUrl === '/api/auth' && (path === '/me' || path === '/logout');
}

function getFirebaseToken(req) {
    const authHeader = String(req.header('authorization') || '').trim();
    if (/^bearer\s+/i.test(authHeader)) {
        return authHeader.replace(/^bearer\s+/i, '').trim();
    }

    return String(req.header('x-firebase-token') || '').trim();
}

function getLegacyTokens(req) {
    const seen = new Set();
    const candidates = [
        req.header('x-auth-token'),
        getCookieValue(req, 'yeshi_token'),
        req.query?.token
    ];

    const tokens = [];
    candidates.forEach((raw) => {
        const token = String(raw || '').trim();
        if (!token || seen.has(token)) return;
        seen.add(token);
        tokens.push(token);
    });

    return tokens;
}

async function enforceActiveUser(req, dbUser, options = {}) {
    if (!dbUser) {
        return { ok: false, status: 401, msg: 'User not found' };
    }

    const status = dbUser.status || (dbUser.isBanned ? 'banned' : 'active');
    if (status === 'banned' || dbUser.isBanned) {
        return { ok: false, status: 403, msg: 'User is banned' };
    }

    if (status === 'inactive') {
        return { ok: false, status: 403, msg: 'User is inactive' };
    }

    if (dbUser.role !== 'admin' && dbUser.role !== 'customer') {
        return { ok: false, status: 403, msg: 'This account type is no longer supported' };
    }

    const skipAdminDeviceCheck = !!options.skipAdminDeviceCheck;

    if (dbUser.role === 'admin' && !skipAdminDeviceCheck && !shouldSkipAdminDeviceCheck(req)) {
        const deviceHash = getDeviceHashFromReq(req);
        if (!deviceHash) {
            return { ok: false, status: 400, msg: 'Missing device fingerprint' };
        }

        const blocked = await BlockedDevice.findOne({ deviceHash, blocked: true })
            .select('_id')
            .lean();

        if (blocked) {
            return { ok: false, status: 403, msg: 'Device is blocked' };
        }

        req.deviceHash = deviceHash;
    }

    return { ok: true };
}

async function attachResolvedUser(req, dbUser, authSource, extra = {}) {
    const activeCheck = await enforceActiveUser(req, dbUser, extra.options || {});
    if (!activeCheck.ok) return activeCheck;

    req.user = {
        id: String(dbUser._id || dbUser.id || ''),
        role: dbUser.role,
        email: String(dbUser.email || '').trim().toLowerCase(),
        firebaseUid: String(dbUser.firebaseUid || extra.firebaseUid || '').trim(),
        authSource
    };

    if (extra.firebase) {
        req.firebase = extra.firebase;
    }

    return { ok: true };
}

async function resolveFromFirebaseToken(req, firebaseToken) {
    if (!firebaseToken) return null;

    try {
        const admin = getFirebaseAdmin();
        const decoded = await admin.auth().verifyIdToken(firebaseToken);
        const provider = String(decoded?.firebase?.sign_in_provider || '').trim();
        if (provider !== 'google.com' && decoded?.email_verified === false) {
            return { ok: false, status: 403, msg: 'Please verify your email first' };
        }
        const normalizedEmail = String(decoded?.email || '').trim().toLowerCase();
        let dbUser = null;

        if (decoded?.uid) {
            dbUser = await User.findOne({ firebaseUid: String(decoded.uid) }).select('role status isBanned email firebaseUid');
        }

        if (!dbUser && normalizedEmail) {
            dbUser = await User.findOne({ email: normalizedEmail }).select('role status isBanned email firebaseUid');
        }

        if (!dbUser) {
            return { ok: false, status: 401, msg: 'User not found for Firebase session' };
        }

        return attachResolvedUser(req, dbUser, 'firebase', {
            firebaseUid: decoded.uid,
            firebase: { decodedToken: decoded },
            options: {
                skipAdminDeviceCheck: !!req.__skipAdminDeviceCheck
            }
        });
    } catch (_err) {
        return null;
    }
}

async function resolveFromLegacyJwt(req, token) {
    if (!token) return null;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded && decoded.user && decoded.user.id;
        if (!userId) {
            return { ok: false, status: 401, msg: 'Token is not valid' };
        }

        const dbUser = await User.findById(userId).select('role status isBanned email firebaseUid');
        if (!dbUser) {
            return { ok: false, status: 401, msg: 'User not found' };
        }

        return attachResolvedUser(req, dbUser, 'legacy-jwt', {
            options: {
                skipAdminDeviceCheck: !!req.__skipAdminDeviceCheck
            }
        });
    } catch (_err) {
        return { ok: false, status: 401, msg: 'Token is not valid' };
    }
}

async function resolveRequestUser(req, options = {}) {
    const settings = {
        allowLegacyJwt: options.allowLegacyJwt !== false,
        optional: !!options.optional
    };

    const firebaseToken = getFirebaseToken(req);
    const legacyTokens = getLegacyTokens(req);

    const firebaseResult = await resolveFromFirebaseToken(req, firebaseToken);
    if (firebaseResult) {
        return firebaseResult;
    }

    if (settings.allowLegacyJwt) {
        for (const legacyToken of legacyTokens) {
            const legacyResult = await resolveFromLegacyJwt(req, legacyToken);
            if (legacyResult && legacyResult.ok) {
                return legacyResult;
            }
        }
    }

    if (settings.optional) {
        return { ok: false, status: 401, msg: 'No token, authorization denied', optional: true };
    }

    return { ok: false, status: 401, msg: 'No token, authorization denied' };
}

module.exports = {
    getDeviceHashFromReq,
    shouldSkipAdminDeviceCheck,
    resolveRequestUser
};