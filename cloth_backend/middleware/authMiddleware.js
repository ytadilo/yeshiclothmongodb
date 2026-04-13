const jwt = require('jsonwebtoken');
const User = require('../models/User');
const crypto = require('crypto');
const BlockedDevice = require('../models/BlockedDevice');

function getDeviceHashFromReq(req) {
    const rawId = String(req.header('x-device-id') || '').trim();
    if (rawId && /^[a-f0-9]{64}$/i.test(rawId)) {
        return rawId.toLowerCase();
    }

    const fp = String(req.header('x-device-fingerprint') || '').trim();
    if (!fp) return null;
    return crypto.createHash('sha256').update(fp).digest('hex');
}

// Middleware to check if user is admin
function adminOnly(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }
    
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied. Admin only.' });
    }
    
    next();
}

module.exports = async function (req, res, next) {
    const cookieToken = (() => {
        const raw = String(req.headers && req.headers.cookie || '').trim();
        if (!raw) return '';
        const parts = raw.split(';').map((p) => p.trim());
        const hit = parts.find((p) => p.toLowerCase().startsWith('yeshi_token='));
        if (!hit) return '';
        const idx = hit.indexOf('=');
        return idx >= 0 ? decodeURIComponent(hit.slice(idx + 1)) : '';
    })();

    // Get token from header
    const token = req.header('x-auth-token') || req.query.token || cookieToken;

    // Check if not token
    if (!token) {
        return res.status(401).json({ msg: 'No token, authorization denied' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded.user;

        // Enforce active account (blocks inactive/banned even if token is valid)
        const dbUser = await User.findById(req.user.id).select('status isBanned role approval_status');
        if (!dbUser) {
            return res.status(401).json({ msg: 'User not found' });
        }

        const status = dbUser.status || (dbUser.isBanned ? 'banned' : 'active');
        if (status === 'banned' || dbUser.isBanned) {
            return res.status(403).json({ msg: 'User is banned' });
        }
        if (status === 'inactive') {
            return res.status(403).json({ msg: 'User is inactive' });
        }

        // Keep role from DB authoritative
        req.user.role = dbUser.role;

        // Approval gate for worker roles
        if ((req.user.role === 'employee' || req.user.role === 'driver') && String(dbUser.approval_status || '').toUpperCase() !== 'APPROVED') {
            const statusMsg = String(dbUser.approval_status || '').toUpperCase() === 'REJECTED'
                ? 'Your account was rejected'
                : 'Your account is pending approval';
            return res.status(403).json({ msg: statusMsg });
        }

        if (req.user.role === 'admin') {
            const deviceHash = getDeviceHashFromReq(req);
            if (!deviceHash) {
                return res.status(400).json({ msg: 'Missing device fingerprint' });
            }

            const blocked = await BlockedDevice.findOne({ deviceHash, blocked: true })
                .select('_id')
                .lean();

            if (blocked) {
                return res.status(403).json({ msg: 'Device is blocked' });
            }

            req.deviceHash = deviceHash;
        }

        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token is not valid' });
    }
};

module.exports.protect = module.exports;
module.exports.adminOnly = adminOnly;
