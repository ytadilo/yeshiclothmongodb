const express = require('express');
const router = express.Router();
const telebirrController = require('../controllers/telebirrController');
const auth = require('../middleware/authMiddleware');

router.post('/checkout/:id', auth, telebirrController.initiatePayment);
router.post('/webhook', express.json(), telebirrController.telebirrWebhook);

module.exports = router;
