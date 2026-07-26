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

function explodeCategoryValues(value) {
    if (Array.isArray(value)) {
        return value.map((row) => String(row || '').trim()).filter(Boolean);
    }
    const text = String(value || '').trim();
    if (!text) return [];
    return text.split(/\s*,\s*/).map((row) => String(row || '').trim()).filter(Boolean);
}

function getOrderAddress(order) {
    const customer = order && order.customer_info && typeof order.customer_info === 'object' ? order.customer_info : {};
    const address = customer.address && typeof customer.address === 'object' ? customer.address : {};
    return {
        country: String(address.country || customer.country || '').trim(),
        region: String(address.region || customer.region || '').trim(),
        city: String(address.city || customer.city || '').trim()
    };
}

function groupByCount(values, limit) {
    const map = new Map();
    values.forEach((value) => {
        const key = value === null || value === undefined || String(value).trim() === '' ? 'unknown' : String(value).trim();
        map.set(key, (map.get(key) || 0) + 1);
    });
    const rows = Array.from(map.entries())
        .map(([key, count]) => ({ _id: key, count }))
        .sort((a, b) => b.count - a.count);
    return Number.isFinite(limit) && limit > 0 ? rows.slice(0, limit) : rows;
}

function buildStatsPayload(orders, todayStart, todayEnd, last7Start) {
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

    const topCategories = groupByCount(
        allOrders.flatMap((o) => explodeCategoryValues(o && o.cloth_details && (o.cloth_details.categories || o.cloth_details.category))),
        8
    );
    const topCountries = groupByCount(allOrders.map((o) => getOrderAddress(o).country), 8);
    const topRegions = groupByCount(allOrders.map((o) => getOrderAddress(o).region), 8);
    const topCities = groupByCount(allOrders.map((o) => getOrderAddress(o).city), 8);
    const deviceLocationCaptured = allOrders.filter((o) => {
        const loc = o && o.device_location && typeof o.device_location === 'object' ? o.device_location : {};
        return Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude));
    }).length;

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

    return {
        totalOrders,
        ordersToday,
        uniqueCustomers: userIds.size,
        screenshotCount,
        deviceLocationCaptured,
        lastOrderAt: lastOrder ? (lastOrder.created_at || lastOrder.createdAt || null) : null,
        breakdown: {
            byStatus: groupByCount(allOrders.map((o) => o && o.order_status)),
            byPaymentStatus: groupByCount(allOrders.map((o) => o && o.payment_status)),
            byDeliveryMethod: groupByCount(allOrders.map((o) => o && o.delivery_method))
        },
        top: {
            categories: topCategories,
            regions: topRegions
        },
        locations: {
            countries: topCountries,
            regions: topRegions,
            cities: topCities
        },
        last7Days
    };
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
        const orders = await Order.find({}).sort({ created_at: -1 }).lean();

        res.json(buildStatsPayload(orders, todayStart, todayEnd, last7Start));
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
};
