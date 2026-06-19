const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const auth = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');

/**
 * Payment Routes
 * 
 * All payment endpoints follow this pattern:
 * POST   /api/payments/initialize          - Start payment process
 * POST   /api/payments/chapa/webhook       - Chapa webhook callback
 * GET    /api/payments/verify/:tx_ref      - Verify payment status
 * GET    /api/payments/:tx_ref             - Get payment details
 * GET    /api/payments/user/:userId        - Get user's payments
 * POST   /api/payments/:tx_ref/retry       - Retry failed payment
 */

/**
 * POST /api/payments/initialize
 * Initialize a new payment
 * Auth: Required
 */
router.post('/initialize', auth, paymentController.initializePayment);

/**
 * POST /api/payments/chapa/webhook
 * Webhook endpoint for Chapa callbacks
 * Auth: None (Chapa posts to this endpoint)
 * Note: In production, validate webhook signatures
 */
router.post('/chapa/webhook', express.json(), paymentController.chapaWebhook);

/**
 * GET /api/payments/verify/:tx_ref
 * Verify a payment with Chapa
 * Auth: Optional
 */
router.get('/verify/:tx_ref', optionalAuth, paymentController.verifyPayment);

/**
 * GET /api/payments/:tx_ref
 * Get payment details
 * Auth: Optional (for public reference, auth required for owned payments)
 */
router.get('/:tx_ref', optionalAuth, paymentController.getPaymentDetails);

/**
 * GET /api/payments/user/:userId
 * Get user's payment history
 * Auth: Required
 */
router.get('/user/:userId', auth, paymentController.getUserPayments);

/**
 * POST /api/payments/:tx_ref/retry
 * Retry a failed payment
 * Auth: Required
 */
router.post('/:tx_ref/retry', auth, paymentController.retryPayment);

module.exports = router;
