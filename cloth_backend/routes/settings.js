const express = require('express');
const router = express.Router();

const auth = require('../middleware/authMiddleware');
const {
	getSocialLinks,
	updateSocialLinks,
	getContent,
	updateContent,
	getDeliverySettings,
	updateDeliverySettings
} = require('../controllers/settingsController');

// Public
router.get('/social', getSocialLinks);

// Public
router.get('/content', getContent);

// Public
router.get('/delivery', getDeliverySettings);

// Admin
router.put('/social', auth, updateSocialLinks);

router.put('/content', auth, updateContent);

router.put('/delivery', auth, updateDeliverySettings);

module.exports = router;
