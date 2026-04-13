// analyticsController.js
// Handles user activity and event tracking endpoints

const AnalyticsEvent = require('../models/Analytics');
const AnalyticsUserSummary = require('../models/AnalyticsUserSummary');
const UserDevice = require('../models/UserDevice');
const User = require('../models/User');
const Order = require('../models/Order');
const Post = require('../models/Post');

const TRACKABLE_EVENT_TYPES = new Set([
  'page_view',
  'product_view',
  'add_to_cart',
  'click',
  'share',
  'like',
  'video_view',
  'image_download'
]);

const TRACKABLE_DEVICE_TYPES = new Set(['mobile', 'desktop', 'tablet']);

function parseGrouping(groupBy) {
  if (groupBy === 'month') return '%Y-%m';
  if (groupBy === 'year') return '%Y';
  return '%Y-%m-%d';
}

function isModelReady(model) {
  const readyState = model && model.db && typeof model.db.readyState === 'number'
    ? Number(model.db.readyState)
    : null;
  return readyState === null || readyState === 1;
}

function toSafeString(value, maxLength = 255) {
  return String(value || '').trim().slice(0, maxLength);
}

function toSafeUserId(req) {
  const raw = String(req?.user?._id || req?.user?.id || '').trim();
  return /^[a-f0-9]{24}$/i.test(raw) ? raw : null;
}

function sanitizeEventData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return {};
  }
}

function logAnalyticsError(context, error) {
  console.error(`analytics ${context}:`, error?.message || error);
}

function buildEmptyAnalyticsResponse() {
  return {
    success: true,
    userActivity: [],
    orderedProducts: [],
    productViews: [],
    addToCart: [],
    likes: [],
    shares: [],
    clicks: [],
    clicksEnriched: [],
    videoViews: [],
    imageDownloads: [],
    visitsOverTime: [],
    deviceUsage: [],
    productPerformance: []
  };
}

// Track an event (page_view, product_view, etc.)
exports.trackEvent = async (req, res) => {
  const rawEventType = toSafeString(req.body?.eventType, 64).toLowerCase();
  const eventType = TRACKABLE_EVENT_TYPES.has(rawEventType) ? rawEventType : 'page_view';
  const eventData = sanitizeEventData(req.body?.eventData);
  const deviceId = toSafeString(req.body?.deviceId, 128);
  const rawDeviceType = toSafeString(req.body?.deviceType, 32).toLowerCase();
  const deviceType = TRACKABLE_DEVICE_TYPES.has(rawDeviceType) ? rawDeviceType : 'desktop';
  const sessionId = toSafeString(req.body?.sessionId, 128);
  const userId = toSafeUserId(req);
  const now = new Date();
  let stored = false;

  try {
    if (AnalyticsEvent && typeof AnalyticsEvent.create === 'function' && isModelReady(AnalyticsEvent)) {
      await AnalyticsEvent.create({
        userId,
        deviceId,
        deviceType,
        eventType,
        eventData,
        sessionId,
        timestamp: now
      });
      stored = true;
    }
  } catch (err) {
    logAnalyticsError('trackEvent.save', err);
  }

  try {
    if (
      AnalyticsUserSummary &&
      typeof AnalyticsUserSummary.findOne === 'function' &&
      typeof AnalyticsUserSummary.findOneAndUpdate === 'function' &&
      isModelReady(AnalyticsUserSummary) &&
      (userId || deviceId)
    ) {
      const summaryFilter = {
        userId: userId || null,
        deviceId
      };

      const existingSummary = await AnalyticsUserSummary.findOne(summaryFilter).lean();
      const lastActiveAt = existingSummary?.lastActiveAt ? new Date(existingSummary.lastActiveAt) : now;
      const deltaSeconds = Math.max(0, Math.min(1800, Math.floor((now.getTime() - lastActiveAt.getTime()) / 1000)));
      const hadSession = sessionId && Array.isArray(existingSummary?.sessionIds) && existingSummary.sessionIds.includes(sessionId);

      await AnalyticsUserSummary.findOneAndUpdate(
        summaryFilter,
        {
          $setOnInsert: {
            firstVisitAt: now,
            userId: userId || null,
            deviceId
          },
          $set: {
            lastActiveAt: now,
            updatedAt: now,
            deviceType
          },
          $inc: {
            totalTimeSpentSeconds: existingSummary ? deltaSeconds : 0,
            sessionCount: sessionId && !hadSession ? 1 : 0
          },
          ...(sessionId ? { $addToSet: { sessionIds: sessionId } } : {})
        },
        { upsert: true, new: true }
      );
    }
  } catch (err) {
    logAnalyticsError('trackEvent.summary', err);
  }

  try {
    if (!userId && deviceId && UserDevice && typeof UserDevice.findOneAndUpdate === 'function' && isModelReady(UserDevice)) {
      await UserDevice.findOneAndUpdate(
        { deviceHash: deviceId },
        { lastSeenAt: now },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }
  } catch (err) {
    logAnalyticsError('trackEvent.device', err);
  }

  return res.json({
    success: true,
    accepted: true,
    stored,
    eventType
  });
};


// Get user activity summary (for analytics)
exports.getUserActivity = async (req, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    // Date filtering
    const { startDate, endDate, groupBy } = req.query;
    const parsedStart = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const parsedEnd = endDate ? new Date(endDate) : new Date();
    const start = Number.isNaN(parsedStart.getTime()) ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) : parsedStart;
    const end = Number.isNaN(parsedEnd.getTime()) ? new Date() : parsedEnd;
    const groupDateFormat = parseGrouping(String(groupBy || 'day').toLowerCase());

    if (!AnalyticsEvent || typeof AnalyticsEvent.aggregate !== 'function' || !isModelReady(AnalyticsEvent)) {
      return res.json(buildEmptyAnalyticsResponse());
    }

    // User Activity Aggregation
    const userActivity = await AnalyticsEvent.aggregate([
      { $match: { timestamp: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { userId: "$userId", deviceId: "$deviceId" },
          firstVisit: { $min: "$timestamp" },
          lastActive: { $max: "$timestamp" },
          sessionCount: { $addToSet: "$sessionId" },
          deviceType: { $first: "$deviceType" },
          eventCount: { $sum: 1 }
        }
      },
      {
        $project: {
          userId: "$_id.userId",
          deviceId: "$_id.deviceId",
          firstVisit: 1,
          lastActive: 1,
          sessionCount: { $size: "$sessionCount" },
          totalTimeSpentSeconds: {
            $max: [
              0,
              {
                $divide: [
                  { $subtract: ["$lastActive", "$firstVisit"] },
                  1000
                ]
              }
            ]
          },
          deviceType: 1,
          eventCount: 1
        }
      }
    ]);

    const userIds = Array.from(
      new Set(
        userActivity
          .map((u) => String(u?.userId || '').trim())
          .filter((id) => /^[a-f0-9]{24}$/i.test(id))
      )
    );

    let userMap = new Map();
    if (userIds.length > 0) {
      const users = await User.find({ _id: { $in: userIds } }).select('_id fullName email').lean();
      userMap = new Map(
        users.map((u) => [String(u._id), {
          fullName: String(u.fullName || ''),
          email: String(u.email || '')
        }])
      );
    }

    const userActivityEnriched = userActivity.map((row) => {
      const id = String(row?.userId || '').trim();
      const account = userMap.get(id) || null;
      return {
        ...row,
        userName: account ? account.fullName : '',
        userEmail: account ? account.email : ''
      };
    });

    const visitsOverTime = await AnalyticsEvent.aggregate([
      { $match: { timestamp: { $gte: start, $lte: end } } },
      {
        $project: {
          period: { $dateToString: { format: groupDateFormat, date: '$timestamp' } },
          sessionKey: {
            $ifNull: [
              '$sessionId',
              {
                $ifNull: [
                  { $toString: '$userId' },
                  '$deviceId'
                ]
              }
            ]
          }
        }
      },
      { $match: { sessionKey: { $ne: null } } },
      { $group: { _id: { period: '$period', sessionKey: '$sessionKey' } } },
      {
        $group: {
          _id: '$_id.period',
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const deviceUsage = await AnalyticsEvent.aggregate([
      { $match: { timestamp: { $gte: start, $lte: end }, deviceType: { $in: ['mobile', 'desktop', 'tablet'] } } },
      { $group: { _id: '$deviceType', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Product Analytics
    const orderedProductsFromItems = await Order.aggregate([
      { $match: { created_at: { $gte: start, $lte: end } } },
      { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
      {
        $group: {
          _id: {
            productId: '$items.product_id',
            productName: '$items.name'
          },
          count: { $sum: { $ifNull: ['$items.quantity', 1] } }
        }
      }
    ]);

    const orderedProductsSimple = await Order.aggregate([
      {
        $match: {
          created_at: { $gte: start, $lte: end },
          $or: [
            { productId: { $ne: null } },
            { productName: { $exists: true, $ne: '' } }
          ]
        }
      },
      {
        $group: {
          _id: {
            productId: '$productId',
            productName: '$productName'
          },
          count: { $sum: { $ifNull: ['$quantity', 1] } }
        }
      }
    ]);

    const orderedMap = new Map();
    [...orderedProductsFromItems, ...orderedProductsSimple].forEach((row) => {
      const id = String(row?._id?.productId || row?._id?.productName || 'N/A');
      const name = String(row?._id?.productName || row?._id?.productId || 'N/A');
      const count = Number(row?.count || 0);
      if (!orderedMap.has(id)) {
        orderedMap.set(id, { _id: name, count });
      } else {
        orderedMap.get(id).count += count;
      }
    });
    const orderedProducts = Array.from(orderedMap.values()).sort((a, b) => b.count - a.count);

    const productViews = await AnalyticsEvent.aggregate([
      { $match: { eventType: "product_view", timestamp: { $gte: start, $lte: end } } },
      { $group: { _id: "$eventData.productId", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const addToCart = await AnalyticsEvent.aggregate([
      { $match: { eventType: "add_to_cart", timestamp: { $gte: start, $lte: end } } },
      { $group: { _id: "$eventData.productId", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const likes = await AnalyticsEvent.aggregate([
      { $match: { eventType: "like", timestamp: { $gte: start, $lte: end } } },
      { $group: { _id: "$eventData.productId", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const shares = await AnalyticsEvent.aggregate([
      { $match: { eventType: "share", timestamp: { $gte: start, $lte: end } } },
      { $group: { _id: "$eventData.productId", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const clicks = await AnalyticsEvent.aggregate([
      { $match: { eventType: "click", timestamp: { $gte: start, $lte: end } } },
      { $group: { _id: "$eventData.link", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const extractPostIdFromLink = (rawLink) => {
      try {
        const link = String(rawLink || '').trim();
        if (!link) return '';
        const parsed = new URL(link, 'https://example.com');
        const p = String(parsed.pathname || '').toLowerCase();
        if (!(p.includes('/post') || p.includes('/user/post.html'))) return '';
        const id = String(parsed.searchParams.get('id') || '').trim();
        return /^[a-f0-9]{24}$/i.test(id) ? id : '';
      } catch (_) {
        return '';
      }
    };

    const clickPostIds = Array.from(new Set(clicks.map((r) => extractPostIdFromLink(r?._id)).filter(Boolean)));
    let postNameById = new Map();
    if (clickPostIds.length > 0) {
      const postDocs = await Post.find({ _id: { $in: clickPostIds } }).select('_id title').lean();
      postNameById = new Map(postDocs.map((p) => [String(p._id), String(p.title || p._id)]));
    }

    const clicksEnriched = clicks.map((row) => {
      const link = String(row?._id || '');
      const postId = extractPostIdFromLink(link);
      const label = postId ? (postNameById.get(postId) || postId) : link;
      return {
        _id: link,
        label,
        link,
        productId: postId || null,
        count: Number(row?.count || 0)
      };
    });

    const videoViews = await AnalyticsEvent.aggregate([
      { $match: { eventType: "video_view", timestamp: { $gte: start, $lte: end } } },
      { $group: { _id: { productId: "$eventData.productId", platform: "$eventData.platform" }, count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    const imageDownloads = await AnalyticsEvent.aggregate([
      { $match: { eventType: "image_download", timestamp: { $gte: start, $lte: end } } },
      { $group: { _id: "$eventData.productId", count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    // Fallback-oriented product performance summary for charts
    const productPerformanceMap = new Map();
    const mergeMetric = (rows, key) => {
      (rows || []).forEach((row) => {
        const id = String(row?._id || 'N/A');
        if (!productPerformanceMap.has(id)) {
          productPerformanceMap.set(id, {
            _id: id,
            views: 0,
            ordered: 0,
            addToCart: 0,
            likes: 0,
            shares: 0,
            score: 0
          });
        }
        const entry = productPerformanceMap.get(id);
        const count = Number(row?.count || 0);
        entry[key] += count;
      });
    };

    mergeMetric(productViews, 'views');
    mergeMetric(orderedProducts, 'ordered');
    mergeMetric(addToCart, 'addToCart');
    mergeMetric(likes, 'likes');
    mergeMetric(shares, 'shares');

    const productPerformance = Array.from(productPerformanceMap.values())
      .map((row) => ({
        ...row,
        score: row.views + (row.ordered * 3) + (row.addToCart * 2) + row.likes + row.shares
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    res.json({
      success: true,
      userActivity: userActivityEnriched,
      orderedProducts,
      productViews,
      addToCart,
      likes,
      shares,
      clicks,
      clicksEnriched,
      videoViews,
      imageDownloads,
      visitsOverTime,
      deviceUsage,
      productPerformance
    });
  } catch (err) {
    logAnalyticsError('getUserActivity', err);
    return res.json(buildEmptyAnalyticsResponse());
  }
};
