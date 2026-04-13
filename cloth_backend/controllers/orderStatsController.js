const Order = require('../models/Order');

function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function endOfDay(d) {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
}

// @desc    Admin: order statistics (counts / breakdowns)
// @route   GET /api/orders/stats
// @access  Private (admin)
exports.getOrderStats = async (req, res) => {
    if (req.user?.role !== 'admin') {
        return res.status(403).json({ msg: 'Access denied' });
    }

    try {
        const now = new Date();
        const todayStart = startOfDay(now);
        const todayEnd = endOfDay(now);
        const last7Start = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000));

        const [
            totalOrders,
            ordersToday,
            uniqueCustomers,
            screenshotCount,
            byStatus,
            byPaymentStatus,
            byDeliveryMethod,
            topCategories,
            topRegions,
            last7Days
        ] = await Promise.all([
            Order.countDocuments({}),
            Order.countDocuments({ created_at: { $gte: todayStart, $lte: todayEnd } }),
            Order.distinct('user_id').then((ids) => ids.length),
            Order.countDocuments({ 'payment_info.screenshot_url': { $exists: true, $ne: '' } }),
            Order.aggregate([
                { $group: { _id: '$order_status', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Order.aggregate([
                { $group: { _id: '$payment_status', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Order.aggregate([
                { $group: { _id: '$delivery_method', count: { $sum: 1 } } },
                { $sort: { count: -1 } }
            ]),
            Order.aggregate([
                { $group: { _id: '$cloth_details.category', count: { $sum: 1 } } },
                { $match: { _id: { $ne: null } } },
                { $sort: { count: -1 } },
                { $limit: 8 }
            ]),
            Order.aggregate([
                { $group: { _id: '$customer_info.region', count: { $sum: 1 } } },
                { $match: { _id: { $ne: null } } },
                { $sort: { count: -1 } },
                { $limit: 8 }
            ]),
            Order.aggregate([
                { $match: { created_at: { $gte: last7Start, $lte: todayEnd } } },
                {
                    $group: {
                        _id: {
                            $dateToString: { format: '%Y-%m-%d', date: '$created_at' }
                        },
                        count: { $sum: 1 }
                    }
                },
                { $sort: { _id: 1 } }
            ])
        ]);

        const lastOrder = await Order.findOne({}, { created_at: 1 }).sort({ created_at: -1 }).lean();

        res.json({
            totalOrders,
            ordersToday,
            uniqueCustomers,
            screenshotCount,
            lastOrderAt: lastOrder?.created_at || null,
            breakdown: {
                byStatus,
                byPaymentStatus,
                byDeliveryMethod
            },
            top: {
                categories: topCategories,
                regions: topRegions
            },
            last7Days
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
