const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const {
    assignDriver,
    getPendingDeliveries,
    getAllDrivers,
    getDriverPerformance,
    getMyDeliveries,
    getMyDeliveryHistory,
    updateDeliveryStatus,
    getCustomerContact,
    markPickedUp,
    markDelivered,
    reportFailedDelivery
} = require('../controllers/deliveryController');

// ======================
// ADMIN ROUTES
// ======================

// Assign driver to order
router.post('/assign', auth, assignDriver);

// Get pending deliveries
router.get('/pending', auth, getPendingDeliveries);

// Get all drivers
router.get('/drivers', auth, getAllDrivers);

// Get driver performance stats
router.get('/performance', auth, getDriverPerformance);

// ======================
// DRIVER ROUTES
// ======================

// Get my assigned deliveries
router.get('/my', auth, getMyDeliveries);

// Get my delivery history
router.get('/history', auth, getMyDeliveryHistory);

// Get customer contact info
router.get('/:orderId/contact', auth, getCustomerContact);

// Update delivery status
router.put('/:orderId/status', auth, updateDeliveryStatus);

// Mark as picked up
router.put('/:orderId/picked-up', auth, markPickedUp);

// Mark as delivered
router.put('/:orderId/delivered', auth, markDelivered);

// Report failed delivery
router.put('/:orderId/failed', auth, reportFailedDelivery);

module.exports = router;
