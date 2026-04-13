const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

const {
    createJob,
    updateJob,
    listJobs,
    submitOffer,
    listOffers,
    compareOffers,
    assignEmployee,
    markProductionReady,
    assignDriver,
    updateDeliveryStatus,
    uploadProductionImages,
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

router.get('/jobs', auth, listJobs);
router.post('/jobs', auth, createJob);
router.put('/jobs/:jobId', auth, updateJob);
router.post('/jobs/:jobId/offers', auth, submitOffer);
router.get('/jobs/:jobId/offers', auth, listOffers);
router.get('/jobs/:jobId/offers/compare', auth, compareOffers);
router.put('/jobs/:jobId/assign-employee', auth, assignEmployee);
router.put('/jobs/:jobId/mark-production-ready', auth, markProductionReady);
router.put('/jobs/:jobId/assign-driver', auth, assignDriver);
router.put('/jobs/:jobId/delivery-status', auth, updateDeliveryStatus);
router.post('/jobs/:jobId/production-images', auth, upload.array('images', 6), uploadProductionImages);

router.post('/chat/messages', auth, sendMessage);
router.post('/chat/upload', auth, upload.single('file'), uploadChatAttachment);
router.get('/chat/messages', auth, listMessages);
router.get('/chat/contacts', auth, listChatContacts);
router.put('/chat/block/:userId', auth, blockMessaging);

router.get('/notifications', auth, getNotifications);
router.get('/notifications/unread-count', auth, getUnreadCount);
router.get('/unread-counts', auth, getUnreadCounts);
router.put('/notifications/read-all', auth, markAllNotificationsRead);
router.put('/notifications/:id/read', auth, markNotificationRead);
router.get('/notifications/stream', auth, streamNotifications);

router.get('/audit-logs', auth, getAuditLogs);

module.exports = router;
