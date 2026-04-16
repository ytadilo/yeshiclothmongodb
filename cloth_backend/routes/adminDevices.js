const express = require('express');
const crypto = require('crypto');

const auth = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/authMiddleware');
const BlockedDevice = require('../models/BlockedDevice');
const UserDevice = require('../models/UserDevice');
const User = require('../models/User');

const router = express.Router();

function toDeviceHash(input) {
    const value = String(input || '').trim();
    if (!value) return null;
    if (/^[a-f0-9]{64}$/i.test(value)) return value.toLowerCase();
    return crypto.createHash('sha256').update(value).digest('hex');
}

router.get('/blocked', auth, adminOnly, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const docs = await BlockedDevice.find({ blocked: true })
            .select('deviceHash reason createdAt updatedAt')
            .sort({ updatedAt: -1 })
            .lean();

        return res.json({ blocked: docs || [] });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
});

router.get('/all', auth, adminOnly, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const devices = await UserDevice.find({})
            .select('userId deviceHash userAgent firstSeenAt lastSeenAt')
            .sort({ lastSeenAt: -1 })
            .lean();

        const userIds = Array.from(new Set((devices || []).map((device) => String(device.userId || '')).filter(Boolean)));
        const users = userIds.length
            ? await User.find({ _id: { $in: userIds } })
                .select('_id fullName email phone role status')
                .lean()
            : [];
        const userMap = new Map((users || []).map((user) => [String(user._id || user.id || ''), user]));

        const hashes = (devices || []).map((device) => String(device.deviceHash || '')).filter(Boolean);
        const blockedDocs = hashes.length
            ? await BlockedDevice.find({ deviceHash: { $in: hashes }, blocked: true })
                .select('deviceHash')
                .lean()
            : [];

        const blockedSet = new Set((blockedDocs || []).map((device) => String(device.deviceHash || '')));

        return res.json({
            devices: (devices || []).map((device) => ({
                deviceHash: device.deviceHash,
                userAgent: device.userAgent || '',
                firstSeenAt: device.firstSeenAt,
                lastSeenAt: device.lastSeenAt,
                blocked: blockedSet.has(String(device.deviceHash || '')),
                user: userMap.has(String(device.userId || '')) ? {
                    id: userMap.get(String(device.userId || ''))._id || userMap.get(String(device.userId || '')).id,
                    fullName: userMap.get(String(device.userId || '')).fullName || '',
                    email: userMap.get(String(device.userId || '')).email || '',
                    phone: userMap.get(String(device.userId || '')).phone || '',
                    role: userMap.get(String(device.userId || '')).role || '',
                    status: userMap.get(String(device.userId || '')).status || ''
                } : null
            }))
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
});

router.post('/block', auth, adminOnly, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const raw = req.body?.deviceHash || req.body?.fingerprint || req.body?.deviceId;
        const deviceHash = toDeviceHash(raw);
        if (!deviceHash) {
            return res.status(400).json({ msg: 'Missing deviceHash/fingerprint' });
        }

        const reason = String(req.body?.reason || '').trim();

        const doc = await BlockedDevice.findOneAndUpdate(
            { deviceHash },
            {
                $set: {
                    blocked: true,
                    reason,
                    updatedAt: new Date()
                },
                $setOnInsert: {
                    createdByUserId: req.user.id,
                    createdAt: new Date()
                }
            },
            { new: true, upsert: true }
        ).lean();

        return res.json({ msg: 'Device blocked', blocked: doc });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
});

router.post('/unblock', auth, adminOnly, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const raw = req.body?.deviceHash || req.body?.fingerprint || req.body?.deviceId;
        const deviceHash = toDeviceHash(raw);
        if (!deviceHash) {
            return res.status(400).json({ msg: 'Missing deviceHash/fingerprint' });
        }

        const doc = await BlockedDevice.findOneAndUpdate(
            { deviceHash },
            { $set: { blocked: false, updatedAt: new Date() } },
            { new: true }
        ).lean();

        return res.json({ msg: 'Device unblocked', deviceHash, blocked: doc });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
});

module.exports = router;
