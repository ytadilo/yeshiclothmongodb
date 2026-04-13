const mongoose = require('mongoose');
const ChatMessage = require('../models/ChatMessage');
const Notification = require('../models/Notification');
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const Order = require('../models/Order');
const Upload = require('../models/Upload');
const Post = require('../models/Post');
const { subscribe, unsubscribe, pushEvent } = require('../utils/realtime');

function isAdmin(req) {
    return req.user && req.user.role === 'admin';
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
        // no-op
    }
}

async function createNotification(userId, type, title, body, referenceId) {
    const doc = await Notification.create({
        user_id: userId,
        type,
        title,
        body,
        reference_id: String(referenceId || ''),
        is_read: false
    });

    pushEvent(userId, 'notification', {
        _id: doc._id,
        type: doc.type,
        title: doc.title,
        body: doc.body,
        reference_id: doc.reference_id,
        is_read: doc.is_read,
        timestamp: doc.timestamp
    });

    return doc;
}

const STAFFING_FEATURE_REMOVAL_MSG = 'Legacy staffing workflows are no longer supported.';

function staffingFeatureRemoved(res) {
    return res.status(410).json({ msg: STAFFING_FEATURE_REMOVAL_MSG });
}

exports.createJob = async (_req, res) => staffingFeatureRemoved(res);
exports.updateJob = async (_req, res) => staffingFeatureRemoved(res);
exports.listJobs = async (_req, res) => staffingFeatureRemoved(res);
exports.submitOffer = async (_req, res) => staffingFeatureRemoved(res);
exports.listOffers = async (_req, res) => staffingFeatureRemoved(res);
exports.compareOffers = async (_req, res) => staffingFeatureRemoved(res);
exports.assignEmployee = async (_req, res) => staffingFeatureRemoved(res);
exports.markProductionReady = async (_req, res) => staffingFeatureRemoved(res);
exports.assignDriver = async (_req, res) => staffingFeatureRemoved(res);
exports.updateDeliveryStatus = async (_req, res) => staffingFeatureRemoved(res);
exports.uploadProductionImages = async (_req, res) => staffingFeatureRemoved(res);

exports.sendMessage = async (req, res) => {
    try {
        const sender = await User.findById(req.user.id).select('role blocked_status status isBanned');
        if (!sender) return res.status(401).json({ msg: 'User not found' });

        if (!isAdmin(req) && sender.blocked_status) {
            return res.status(403).json({ msg: 'Messaging is blocked for your account' });
        }

        const receiverId = String(req.body.receiver_id || '').trim();
        const text = String(req.body.message || '').trim();
        const jobId = String(req.body.job_id || '').trim();
        const deliveryId = String(req.body.delivery_id || '').trim();
        const replyTo = req.body.reply_to && mongoose.isValidObjectId(req.body.reply_to) ? req.body.reply_to : null;

        if (!mongoose.isValidObjectId(receiverId)) return res.status(400).json({ msg: 'Invalid receiver' });
        if (!text) return res.status(400).json({ msg: 'Message is required' });

        const receiver = await User.findById(receiverId).select('role');
        if (!receiver) return res.status(404).json({ msg: 'Receiver not found' });

        if (!isAdmin(req)) {
            if (receiver.role !== 'admin') {
                return res.status(403).json({ msg: 'Only admin chat is allowed for this account' });
            }
        }

        if (jobId) {
            return staffingFeatureRemoved(res);
        }

        const message = await ChatMessage.create({
            sender_id: req.user.id,
            receiver_id: receiverId,
            job_id: mongoose.isValidObjectId(jobId) ? jobId : null,
            delivery_id: mongoose.isValidObjectId(deliveryId) ? deliveryId : null,
            message: text,
            reply_to: replyTo
        });

        const senderName = String(sender?.fullName || sender?.email || 'User').trim();
        const notificationPreview = String(text || '').trim() || 'Sent an attachment';
        await createNotification(
            receiverId,
            'message',
            req.user.role === 'admin' ? 'New admin message' : 'New customer message',
            `${senderName}: ${notificationPreview}`.slice(0, 240),
            message._id
        );
        await writeAudit(req.user.id, 'CHAT_MESSAGE_SENT', 'chat', message._id, { receiverId, jobId: jobId || null, deliveryId: deliveryId || null, replyTo });

        return res.json({ msg: 'Sent', message });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.uploadChatAttachment = async (req, res) => {
    try {
        const sender = await User.findById(req.user.id).select('role blocked_status status isBanned');
        if (!sender) return res.status(401).json({ msg: 'User not found' });

        if (!isAdmin(req) && sender.blocked_status) {
            return res.status(403).json({ msg: 'Messaging is blocked for your account' });
        }

        if (!req.file || !req.file.buffer) {
            return res.status(400).json({ msg: 'Missing file' });
        }

        const doc = await Upload.create({
            originalName: req.file.originalname || 'attachment',
            mimeType: req.file.mimetype || 'application/octet-stream',
            size: Number(req.file.size || 0),
            data: req.file.buffer,
            visibility: 'private',
            owner_user_id: req.user.id,
            purpose: 'chat_attachment'
        });

        return res.json({
            id: doc._id,
            url: '/api/uploads/' + doc._id,
            name: doc.originalName,
            size: doc.size,
            mimeType: doc.mimeType
        });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.listChatContacts = async (req, res) => {
    try {
        if (isAdmin(req)) {
            // Return only customers for admin chat.
            const users = await User.find({
                role: 'customer',
                status: { $ne: 'banned' },
                isBanned: { $ne: true }
            })
            .select('fullName email phone age sex profileImage role status blocked_status createdAt')
            .sort({ createdAt: -1 })
            .lean();
            return res.json(users.map((user) => ({
                _id: user._id,
                fullName: user.fullName,
                email: user.email || '',
                phone: user.phone || '',
                age: user.age ?? null,
                sex: user.sex || '',
                profileImage: user.profileImage || '',
                role: user.role,
                status: user.status || 'active',
                blocked_status: !!user.blocked_status
            })));
        }

        const adminFilter = {
            role: 'admin',
            isBanned: { $ne: true },
            $or: [
                { status: 'active' },
                { status: { $exists: false } },
                { status: null },
                { status: '' }
            ]
        };

        const admins = await User.find(adminFilter)
            .select('fullName role')
            .sort({ createdAt: 1 })
            .lean();

        return res.json(admins.map((admin) => ({
            _id: admin._id,
            fullName: admin.fullName,
            role: admin.role
        })));
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.listMessages = async (req, res) => {
    try {
        const jobId = String(req.query.job_id || '').trim();
        const deliveryId = String(req.query.delivery_id || '').trim();
        const otherId = String(req.query.other_user_id || '').trim();

        const query = {};
        if (mongoose.isValidObjectId(jobId)) query.job_id = jobId;
        if (mongoose.isValidObjectId(deliveryId)) query.delivery_id = deliveryId;

        if (!isAdmin(req)) {
            // User: only allow chat with admin(s), and only see their own messages
            const adminFilter = {
                role: 'admin',
                isBanned: { $ne: true },
                $or: [
                    { status: 'active' },
                    { status: { $exists: false } },
                    { status: null },
                    { status: '' }
                ]
            };
            const adminDocs = await User.find(adminFilter).select('_id').lean();
            const adminIds = adminDocs.map((admin) => String(admin._id));
            if (!adminIds.length) return res.json([]);
            // Only allow messages with admin(s)
            if (mongoose.isValidObjectId(otherId) && adminIds.includes(otherId)) {
                query.$or = [
                    { sender_id: req.user.id, receiver_id: otherId },
                    { sender_id: otherId, receiver_id: req.user.id }
                ];
            } else {
                // Default: show all messages between user and any admin
                query.$or = [
                    { sender_id: req.user.id, receiver_id: { $in: adminIds } },
                    { sender_id: { $in: adminIds }, receiver_id: req.user.id }
                ];
            }
        } else if (isAdmin(req) && mongoose.isValidObjectId(otherId)) {
            // Admin: see chat with any user (otherId)
            query.$or = [
                { sender_id: req.user.id, receiver_id: otherId },
                { sender_id: otherId, receiver_id: req.user.id }
            ];
        }

        // Find messages
        const messages = await ChatMessage.find(query)
            .populate('sender_id', 'fullName email profileImage role')
            .populate('receiver_id', 'fullName email profileImage role')
            .populate('reply_to')
            .sort({ timestamp: 1 })
            .limit(400)
            .lean();

        // Mark as seen all messages received by the current user that are not yet seen
        const unseenIds = messages
            .filter(m => String(m.receiver_id?._id || m.receiver_id) === String(req.user.id) && !m.seen)
            .map(m => m._id);
        if (unseenIds.length) {
            await ChatMessage.updateMany(
                { _id: { $in: unseenIds } },
                { $set: { seen: true, seen_at: new Date() } }
            );
        }

        // If any messages were updated, reload them to return updated seen status
        if (unseenIds.length) {
            const updatedMessages = await ChatMessage.find(query)
                .populate('sender_id', 'fullName email profileImage role')
                .populate('receiver_id', 'fullName email profileImage role')
                .populate('reply_to')
                .sort({ timestamp: 1 })
                .limit(400)
                .lean();
            return res.json(updatedMessages);
        }

        return res.json(messages);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.blockMessaging = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ msg: 'Access denied' });
        const userId = String(req.params.userId || '').trim();
        const blocked = !!req.body.blocked_status;
        if (!mongoose.isValidObjectId(userId)) return res.status(400).json({ msg: 'Invalid user id' });

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ msg: 'User not found' });

        user.blocked_status = blocked;
        await user.save();

        await writeAudit(req.user.id, blocked ? 'MESSAGING_BLOCKED' : 'MESSAGING_UNBLOCKED', 'user', userId, {});
        return res.json({ msg: blocked ? 'Messaging blocked' : 'Messaging unblocked' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};

exports.getNotifications = async (req, res) => {
    try {
        if (!Notification || typeof Notification.find !== 'function') {
            return res.json([]);
        }
        const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
        const list = await Notification.find({ user_id: req.user.id })
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();
        return res.json(list);
    } catch (err) {
        console.error('getNotifications error:', err?.message || err);
        return res.json([]);
    }
};

exports.getUnreadCount = async (req, res) => {
    try {
        if (!Notification || typeof Notification.countDocuments !== 'function') {
            return res.json({ unread: 0 });
        }
        const count = await Notification.countDocuments({ user_id: req.user.id, is_read: false });
        return res.json({ unread: count });
    } catch (err) {
        console.error('getUnreadCount error:', err?.message || err);
        return res.json({ unread: 0 });
    }
};

exports.getUnreadCounts = async (req, res) => {
    try {
        const userId = String(req.user.id || '');
        if (!userId) {
            return res.status(401).json({ msg: 'Unauthorized' });
        }

        let unreadMessagesQuery = {
            receiver_id: userId,
            seen: false
        };

        if (!isAdmin(req)) {
            const adminFilter = {
                role: 'admin',
                isBanned: { $ne: true },
                $or: [
                    { status: 'active' },
                    { status: { $exists: false } },
                    { status: null },
                    { status: '' }
                ]
            };
            const adminDocs = await User.find(adminFilter).select('_id').lean();
            const adminIds = adminDocs.map((admin) => String(admin._id));

            if (!adminIds.length) {
                unreadMessagesQuery = { _id: null };
            } else {
                unreadMessagesQuery.sender_id = { $in: adminIds };
            }
        }

        const [unreadMessages, unreadNotifications] = await Promise.all([
            ChatMessage.countDocuments(unreadMessagesQuery),
            (Notification && typeof Notification.countDocuments === 'function')
                ? Notification.countDocuments({ user_id: userId, is_read: false })
                : Promise.resolve(0)
        ]);

        return res.json({
            unreadMessages: Number(unreadMessages) || 0,
            unreadNotifications: Number(unreadNotifications) || 0
        });
    } catch (err) {
        console.error('getUnreadCounts error:', err?.message || err);
        return res.json({
            unreadMessages: 0,
            unreadNotifications: 0
        });
    }
};

exports.markNotificationRead = async (req, res) => {
    try {
        if (!Notification || typeof Notification.findOneAndUpdate !== 'function') {
            return res.json({ msg: 'Marked read', notification: null });
        }
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(400).json({ msg: 'Invalid notification id' });
        const isFirebaseNotificationModel = typeof Notification.collection === 'function';
        if (!isFirebaseNotificationModel && !mongoose.isValidObjectId(id)) {
            return res.status(400).json({ msg: 'Invalid notification id' });
        }
        const doc = await Notification.findOneAndUpdate(
            { _id: id, user_id: req.user.id },
            { $set: { is_read: true } },
            { new: true }
        );
        if (!doc) return res.status(404).json({ msg: 'Not found' });
        return res.json({ msg: 'Marked read', notification: doc });
    } catch (err) {
        console.error('markNotificationRead error:', err?.message || err);
        return res.json({ msg: 'Marked read', notification: null });
    }
};

exports.markAllNotificationsRead = async (req, res) => {
    try {
        if (!Notification || typeof Notification.updateMany !== 'function') {
            return res.json({ msg: 'All notifications marked read' });
        }
        await Notification.updateMany({ user_id: req.user.id, is_read: false }, { $set: { is_read: true } });
        return res.json({ msg: 'All notifications marked read' });
    } catch (err) {
        console.error('markAllNotificationsRead error:', err?.message || err);
        return res.json({ msg: 'All notifications marked read' });
    }
};

exports.streamNotifications = async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    const keepAlive = setInterval(() => {
        try {
            res.write('event: ping\\ndata: {}\\n\\n');
        } catch (_) {
            // ignore
        }
    }, 25000);

    subscribe(req.user.id, res);

    req.on('close', () => {
        clearInterval(keepAlive);
        unsubscribe(req.user.id, res);
    });
};

exports.getAuditLogs = async (req, res) => {
    try {
        if (!isAdmin(req)) return res.status(403).json({ msg: 'Access denied' });
        const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 300);

        const logs = await AuditLog.find({})
            .populate('actor_id', 'fullName email role')
            .sort({ timestamp: -1 })
            .limit(limit)
            .lean();

        return res.json(logs);
    } catch (err) {
        console.error(err);
        return res.status(500).json({ msg: 'Server error' });
    }
};
