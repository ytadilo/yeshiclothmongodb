const User = require('../models/User');
const UserDevice = require('../models/UserDevice');
const BlockedDevice = require('../models/BlockedDevice');
const AuditLog = require('../models/AuditLog');

const ALLOWED_STATUS = new Set(['active', 'inactive', 'banned']);

function getEffectiveStatus(user) {
    if (user.status) return user.status;
    return user.isBanned ? 'banned' : 'active';
}

async function writeAudit(actorId, action, entityType, entityId, metadata) {
    try {
        await AuditLog.create({
            actor_id: actorId || null,
            action,
            entity_type: entityType,
            entity_id: String(entityId || ''),
            metadata: metadata || {}
        });
    } catch (_) {
        // ignore audit failures
    }
}

// GET /api/admin/users
exports.listUsers = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const roleFilter = String(req.query.role || '').trim().toLowerCase();
        const query = {};
        if (roleFilter && ['admin', 'customer'].includes(roleFilter)) {
            query.role = roleFilter;
        }

        const users = await User.find(query)
            .select('fullName fatherName email phone age sex profileImage role status isBanned createdAt authProvider')
            .sort({ createdAt: -1 });

        const result = users.map((u) => ({
            _id: u._id,
            fullName: u.fullName,
            fatherName: u.fatherName,
            email: u.email,
            phone: u.phone,
            age: u.age ?? null,
            sex: u.sex || '',
            profileImage: u.profileImage || '',
            role: u.role,
            authProvider: u.authProvider,
            status: getEffectiveStatus(u),
            createdAt: u.createdAt
        }));

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error' });
    }
};

// PUT /api/admin/users/:id/approve
exports.approveUser = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        return res.status(410).json({ msg: 'Account approval is no longer used.' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

// PUT /api/admin/users/:id/reject
exports.rejectUser = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        return res.status(410).json({ msg: 'Account rejection is no longer used.' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

// PUT /api/admin/users/:id/status
exports.updateUserStatus = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const { status } = req.body;
        const nextStatus = String(status || '').trim().toLowerCase();
        if (!ALLOWED_STATUS.has(nextStatus)) {
            return res.status(400).json({ msg: 'Invalid status' });
        }

        const user = await User.findById(req.params.id);
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        // Safety: do not allow disabling admin user via UI
        if (user.role === 'admin' && nextStatus !== 'active') {
            return res.status(400).json({ msg: 'Cannot disable admin account' });
        }

        user.status = nextStatus;
        user.isBanned = nextStatus === 'banned';
        await user.save();
        await writeAudit(req.user.id, 'USER_STATUS_UPDATED', 'user', user._id, { status: user.status });

        res.json({
            msg: 'Updated',
            user: {
                _id: user._id,
                status: user.status,
                isBanned: user.isBanned
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Server error' });
    }
};

// GET /api/admin/users/:id/devices
exports.listUserDevices = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const userId = String(req.params.id || '').trim();
        if (!userId) {
            return res.status(400).json({ msg: 'Missing user id' });
        }

        const devices = await UserDevice.find({ userId })
            .select('deviceHash userAgent firstSeenAt lastSeenAt')
            .sort({ lastSeenAt: -1 })
            .lean();

        const hashes = (devices || []).map((d) => String(d.deviceHash || '')).filter(Boolean);
        const blockedDocs = hashes.length
            ? await BlockedDevice.find({ deviceHash: { $in: hashes }, blocked: true })
                  .select('deviceHash')
                  .lean()
            : [];

        const blockedSet = new Set((blockedDocs || []).map((d) => String(d.deviceHash || '')));

        return res.json({
            devices: (devices || []).map((d) => ({
                deviceHash: d.deviceHash,
                userAgent: d.userAgent || '',
                firstSeenAt: d.firstSeenAt,
                lastSeenAt: d.lastSeenAt,
                blocked: blockedSet.has(String(d.deviceHash || ''))
            }))
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};
