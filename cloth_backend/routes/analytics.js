// analytics.js
// Analytics event tracking routes

const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const optionalAuth = require('../middleware/optionalAuth');
const auth = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/authMiddleware');

// Track an event (public, guest or user)
router.post('/track', optionalAuth, analyticsController.trackEvent);

// Get user activity summary (admin only)
router.get('/user-activity', auth, adminOnly, analyticsController.getUserActivity);

module.exports = router;
