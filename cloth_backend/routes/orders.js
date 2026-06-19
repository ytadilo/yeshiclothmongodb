const express = require('express');
const multer = require('multer');
const router = express.Router();
const {
	createOrder,
	getOrders,
	updateOrder,
	getLastDeliveryLocation,
	updateOrderPayment,
	updateOrderStatusStep,
	addNegotiationMessage,
	uploadOrderPaymentProof,
	cancelOrder
} = require('../controllers/orderController');
const { getOrderStats } = require('../controllers/orderStatsController');
const auth = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const upload = require('../middleware/upload');

const orderUploadMiddleware = upload.fields([
	{ name: 'paymentScreenshot', maxCount: 1 },
	{ name: 'referenceImages', maxCount: 3 },
	// Backward-compatible single reference image field
	{ name: 'refImage', maxCount: 1 }
]);

function maybeHandleOrderUploads(req, res, next) {
	if (req.is('application/json')) {
		return next();
	}
	return orderUploadMiddleware(req, res, next);
}

// Public or Semi-protected (Guest ordering allowed now, handled in controller)
// But for now, let's keep it simple. If we want guests, we might remove global auth middleware here.
// Spec says "Optional registration".
// For now, let's assume valid token OR we handle "no token" in a looser middleware or skip middleware for POST if generic.
// Given strict time, I'll stick to auth required for now per previous impl, or make it optional.
// Let's keep it auth required for now to ensure consistency, but if spec is STRICT on guest, I need to change.
// "Registration optional — users can order as guests." -> OK, I must remove generic router.use(auth).

router.post(
	'/',
	[
		optionalAuth,
		maybeHandleOrderUploads
	],
	createOrder
);
router.get('/last-location', auth, getLastDeliveryLocation);
router.get('/stats', auth, adminOnly, getOrderStats);
router.get('/my', auth, getOrders); // Backward-compatible alias for user order history
router.get('/', auth, getOrders); // Only admin/user should see history
router.put('/:id', auth, adminOnly, updateOrder);
router.put('/:id/payment', auth, adminOnly, updateOrderPayment);
router.put('/:id/status', auth, adminOnly, updateOrderStatusStep);
router.post('/:id/negotiation', auth, upload.single('image'), addNegotiationMessage);
router.post('/:id/payment-proof', auth, upload.single('paymentScreenshot'), uploadOrderPaymentProof);
router.delete('/:id/cancel', auth, cancelOrder);

router.use((err, _req, res, _next) => {
	if (!err) {
		return res.status(500).json({ msg: 'Unknown upload error' });
	}

	if (err instanceof multer.MulterError) {
		if (err.code === 'LIMIT_FILE_SIZE') {
			return res.status(400).json({ msg: 'Uploaded file is too large. Max allowed size is 12MB.' });
		}
		return res.status(400).json({ msg: err.message || 'Upload failed' });
	}

	if (typeof err.message === 'string' && err.message.toLowerCase().includes('only image or pdf')) {
		return res.status(400).json({ msg: err.message });
	}

	return res.status(500).json({ msg: err.message || 'Server Error' });
});

module.exports = router;
