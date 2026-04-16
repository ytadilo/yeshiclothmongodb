const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

const {
    sendMessage,
    uploadChatAttachment,
    listChatContacts,
    listMessages,
    blockMessaging,
    getNotifications,
    getUnreadCount,
    getUnreadCounts,
    markNotificationRead,
    markAllNotificationsRead,
    streamNotifications,
    getAuditLogs
} = require('../controllers/workflowController');

router.post('/chat/messages', auth, sendMessage);
router.post('/chat/upload', auth, upload.single('file'), uploadChatAttachment);
router.get('/chat/messages', auth, listMessages);
router.get('/chat/contacts', auth, listChatContacts);
router.put('/chat/block/:userId', auth, adminOnly, blockMessaging);

router.get('/notifications', auth, getNotifications);
router.get('/notifications/unread-count', auth, getUnreadCount);
router.get('/unread-counts', auth, getUnreadCounts);
router.put('/notifications/read-all', auth, markAllNotificationsRead);
router.put('/notifications/:id/read', auth, markNotificationRead);
router.get('/notifications/stream', auth, streamNotifications);

router.get('/audit-logs', auth, adminOnly, getAuditLogs);

module.exports = router;
