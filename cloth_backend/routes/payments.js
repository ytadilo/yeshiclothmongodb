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
 * Signature is validated via Chapa-Signature header in production
 */
router.post('/chapa/webhook', express.json({
    // Capture raw body so we can verify the Chapa-Signature header
    verify: (req, _res, buf) => { req.rawBody = buf; }
}), paymentController.chapaWebhook);

/**
 * GET /api/payments/verify/:tx_ref
 * Verify a payment with Chapa
 * Auth: Optional
 */
router.get('/verify/:tx_ref', optionalAuth, paymentController.verifyPayment);

/**
 * GET /api/payments/user/:userId
 * Get user's payment history
 * Auth: Required
 * NOTE: must be defined BEFORE /:tx_ref to avoid route shadowing
 */
router.get('/user/:userId', auth, paymentController.getUserPayments);

/**
 * POST /api/payments/:tx_ref/retry
 * Retry a failed payment
 * Auth: Required
 * NOTE: must be defined BEFORE /:tx_ref to avoid route shadowing
 */
router.post('/:tx_ref/retry', auth, paymentController.retryPayment);

/**
 * GET /api/payments/:tx_ref
 * Get payment details
 * Auth: Optional (for public reference, auth required for owned payments)
 * NOTE: keep this LAST among parameterised GET routes
 */
router.get('/:tx_ref', optionalAuth, paymentController.getPaymentDetails);

module.exports = router;
