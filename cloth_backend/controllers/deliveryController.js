const Order = require('../models/Order');
const User = require('../models/User');

// ======================
// ADMIN: DELIVERY MANAGEMENT
// ======================

// Assign order to a driver (Admin)
exports.assignDriver = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied. Admin only.' });
        }

        const { order_id, driver_id } = req.body;

        // Verify order exists
        const order = await Order.findById(order_id);
        if (!order) {
            return res.status(404).json({ msg: 'Order not found' });
        }

        // Verify driver exists and has driver role
        const driver = await User.findById(driver_id);
        if (!driver) {
            return res.status(404).json({ msg: 'Driver not found' });
        }
        if (driver.role !== 'driver') {
            return res.status(400).json({ msg: 'User is not a driver' });
        }
        if (driver.approval_status !== 'APPROVED') {
            return res.status(400).json({ msg: 'Driver is not approved' });
        }

        // Assign driver to order
        order.assigned_driver = driver_id;
        order.driver_assigned_at = new Date();
        
        // Update order status to "Out for Delivery" when driver is assigned
        if (order.order_status === 'Shipped') {
            order.order_status = 'Out for Delivery';
        }

        await order.save();

        res.json({
            msg: 'Driver assigned successfully',
            order
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Get all pending deliveries (Admin)
exports.getPendingDeliveries = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied. Admin only.' });
        }

        const deliveries = await Order.find({
            delivery_method: 'delivery',
            order_status: { $in: ['Shipped', 'Out for Delivery'] }
        })
        .populate('assigned_driver', 'fullName phone')
        .populate('user_id', 'fullName email phone')
        .sort({ created_at: -1 });

        res.json(deliveries);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Get all drivers (Admin)
exports.getAllDrivers = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied. Admin only.' });
        }

        const drivers = await User.find({ role: 'driver' })
            .select('-passwordHash')
            .sort({ createdAt: -1 });

        res.json(drivers);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Get driver performance (Admin)
exports.getDriverPerformance = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied. Admin only.' });
        }

        const drivers = await User.find({ role: 'driver' })
            .select('fullName worker_rating approval_status');

        // Get delivery stats for each driver
        const driverStats = await Promise.all(drivers.map(async (driver) => {
            const totalAssigned = await Order.countDocuments({ assigned_driver: driver._id });
            const delivered = await Order.countDocuments({ 
                assigned_driver: driver._id,
                order_status: 'Delivered'
            });
            const failed = await Order.countDocuments({
                assigned_driver: driver._id,
                order_status: 'Cancelled'
            });

            return {
                driver: {
                    _id: driver._id,
                    fullName: driver.fullName,
                    approval_status: driver.approval_status,
                    worker_rating: driver.worker_rating
                },
                stats: {
                    totalAssigned,
                    delivered,
                    failed,
                    successRate: totalAssigned > 0 ? Math.round((delivered / totalAssigned) * 100) : 0
                }
            };
        }));

        res.json(driverStats);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// ======================
// DRIVER: DELIVERY MANAGEMENT
// ======================

// Get my assigned deliveries (Driver)
exports.getMyDeliveries = async (req, res) => {
    try {
        if (req.user.role !== 'driver') {
            return res.status(403).json({ msg: 'Access denied. Driver only.' });
        }

        const deliveries = await Order.find({
            assigned_driver: req.user.id,
            order_status: { $in: ['Preparing', 'Shipped', 'Out for Delivery'] }
        })
        .populate('user_id', 'fullName phone email')
        .sort({ created_at: -1 });

        res.json(deliveries);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Get delivery history (Driver)
exports.getMyDeliveryHistory = async (req, res) => {
    try {
        if (req.user.role !== 'driver') {
            return res.status(403).json({ msg: 'Access denied. Driver only.' });
        }

        const deliveries = await Order.find({
            assigned_driver: req.user.id,
            order_status: { $in: ['Delivered', 'Cancelled'] }
        })
        .populate('user_id', 'fullName phone')
        .sort({ updated_at: -1 });

        res.json(deliveries);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Update delivery status (Driver)
exports.updateDeliveryStatus = async (req, res) => {
    try {
        if (req.user.role !== 'driver') {
            return res.status(403).json({ msg: 'Access denied. Driver only.' });
        }

        const { status, notes, proof_image } = req.body;

        const order = await Order.findById(req.params.orderId);

        if (!order) {
            return res.status(404).json({ msg: 'Order not found' });
        }

        // Verify this driver is assigned to this order
        if (order.assigned_driver.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'This delivery is not assigned to you' });
        }

        // Update status based on driver action
        const statusMap = {
            'picked_up': 'Out for Delivery',
            'delivered': 'Delivered',
            'failed': 'Cancelled'
        };

        if (statusMap[status]) {
            order.order_status = statusMap[status];
        }

        if (notes) {
            order.admin_notes = notes;
        }

        if (status === 'picked_up') {
            order.picked_up_at = new Date();
        }

        if (status === 'delivered') {
            order.delivered_at = new Date();
            order.delivery_proof_image = proof_image;
            
            // Update driver rating (simple increment for now)
            const driver = await User.findById(req.user.id);
            if (driver) {
                driver.worker_rating = Math.min(5, driver.worker_rating + 0.1);
                await driver.save();
            }
        }

        await order.save();

        res.json({
            msg: 'Delivery status updated',
            order
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Get customer contact info for delivery (Driver)
exports.getCustomerContact = async (req, res) => {
    try {
        if (req.user.role !== 'driver') {
            return res.status(403).json({ msg: 'Access denied. Driver only.' });
        }

        const order = await Order.findById(req.params.orderId)
            .populate('user_id', 'fullName phone');

        if (!order) {
            return res.status(404).json({ msg: 'Order not found' });
        }

        if (order.assigned_driver.toString() !== req.user.id) {
            return res.status(403).json({ msg: 'This delivery is not assigned to you' });
        }

        res.json({
            customer_name: order.customer_info?.full_name || order.user_id?.fullName,
            phone: order.customer_info?.phone || order.user_id?.phone,
            address: order.customer_info?.address,
            delivery_notes: order.customer_notes
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Mark order as picked up (Driver)
exports.markPickedUp = async (req, res) => {
    try {
        if (req.user.role !== 'driver') {
            return res.status(403).json({ msg: 'Access denied. Driver only.' });
        }

        const order = await Order.findById(req.params.orderId);

        if (!order || order.assigned_driver.toString() !== req.user.id) {
            return res.status(404).json({ msg: 'Order not found or not assigned to you' });
        }

        order.order_status = 'Out for Delivery';
        order.picked_up_at = new Date();
        await order.save();

        res.json({ msg: 'Order marked as picked up', order });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Mark order as delivered (Driver)
exports.markDelivered = async (req, res) => {
    try {
        if (req.user.role !== 'driver') {
            return res.status(403).json({ msg: 'Access denied. Driver only.' });
        }

        const { proof_image, notes } = req.body;
        const order = await Order.findById(req.params.orderId);

        if (!order || order.assigned_driver.toString() !== req.user.id) {
            return res.status(404).json({ msg: 'Order not found or not assigned to you' });
        }

        order.order_status = 'Delivered';
        order.delivered_at = new Date();
        order.delivery_proof_image = proof_image;
        if (notes) order.admin_notes = notes;
        
        await order.save();

        // Update driver rating
        const driver = await User.findById(req.user.id);
        if (driver) {
            driver.worker_rating = Math.min(5, driver.worker_rating + 0.2);
            await driver.save();
        }

        res.json({ msg: 'Order marked as delivered', order });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Report failed delivery (Driver)
exports.reportFailedDelivery = async (req, res) => {
    try {
        if (req.user.role !== 'driver') {
            return res.status(403).json({ msg: 'Access denied. Driver only.' });
        }

        const { reason, notes } = req.body;
        const order = await Order.findById(req.params.orderId);

        if (!order || order.assigned_driver.toString() !== req.user.id) {
            return res.status(404).json({ msg: 'Order not found or not assigned to you' });
        }

        order.order_status = 'Cancelled';
        order.admin_notes = `Failed delivery. Reason: ${reason}. Notes: ${notes}`;
        
        await order.save();

        res.json({ msg: 'Failed delivery reported', order });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
