const Order = require('../models/Order');
const { getDatabaseProvider } = require('../utils/db');

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
        const provider = getDatabaseProvider();

        if (provider === 'firebase') {
            const orders = await Order.find({}).lean();
            const allOrders = Array.isArray(orders) ? orders : [];

            const totalOrders = allOrders.length;
            const ordersToday = allOrders.filter((o) => {
                const t = new Date(o && (o.created_at || o.createdAt || 0)).getTime();
                return Number.isFinite(t) && t >= todayStart.getTime() && t <= todayEnd.getTime();
            }).length;

            const userIds = new Set(
                allOrders
                    .map((o) => String(o && o.user_id ? o.user_id : '').trim())
                    .filter(Boolean)
            );

            const screenshotCount = allOrders.filter((o) => {
                const url = o && o.payment_info ? o.payment_info.screenshot_url : '';
                return !!String(url || '').trim();
            }).length;

            const groupByCount = (values) => {
                const map = new Map();
                values.forEach((v) => {
                    const key = v === null || v === undefined || String(v).trim() === '' ? 'unknown' : String(v);
                    map.set(key, (map.get(key) || 0) + 1);
                });
                return Array.from(map.entries())
                    .map(([k, c]) => ({ _id: k, count: c }))
                    .sort((a, b) => b.count - a.count);
            };

            const byStatus = groupByCount(allOrders.map((o) => o && o.order_status));
            const byPaymentStatus = groupByCount(allOrders.map((o) => o && o.payment_status));
            const byDeliveryMethod = groupByCount(allOrders.map((o) => o && o.delivery_method));
            const topCategories = groupByCount(allOrders.map((o) => o && o.cloth_details && o.cloth_details.category)).slice(0, 8);
            const topRegions = groupByCount(allOrders.map((o) => o && o.customer_info && o.customer_info.region)).slice(0, 8);

            const last7Map = new Map();
            allOrders.forEach((o) => {
                const t = new Date(o && (o.created_at || o.createdAt || 0));
                const time = t.getTime();
                if (!(Number.isFinite(time) && time >= last7Start.getTime() && time <= todayEnd.getTime())) return;
                const key = t.toISOString().slice(0, 10);
                last7Map.set(key, (last7Map.get(key) || 0) + 1);
            });
            const last7Days = Array.from(last7Map.entries())
                .map(([k, c]) => ({ _id: k, count: c }))
                .sort((a, b) => String(a._id).localeCompare(String(b._id)));

            const sorted = [...allOrders].sort((a, b) => {
                const at = new Date(a && (a.created_at || a.createdAt || 0)).getTime();
                const bt = new Date(b && (b.created_at || b.createdAt || 0)).getTime();
                return bt - at;
            });
            const lastOrder = sorted.length ? sorted[0] : null;

            return res.json({
                totalOrders,
                ordersToday,
                uniqueCustomers: userIds.size,
                screenshotCount,
                lastOrderAt: lastOrder ? (lastOrder.created_at || lastOrder.createdAt || null) : null,
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
        }

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
