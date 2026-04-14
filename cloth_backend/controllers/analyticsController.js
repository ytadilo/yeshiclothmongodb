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
  return String(req?.user?._id || req?.user?.id || '').trim() || null;
}

function sanitizeEventData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
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
    userSummary: {
      totalUsers: 0,
      activeLast24h: 0,
      activeLast7d: 0,
      activeLast24hPercent: 0,
      activeLast7dPercent: 0,
      newUsersPerDay: []
    },
    productSummary: {
      totalProducts: 0,
      totalTrackedViews: 0,
      totalTrackedClicks: 0,
      mostViewedProducts: [],
      mostClickedProducts: []
    },
    linkAnalytics: {
      totalClicks: 0,
      clicksPerProduct: [],
      clickTrendDaily: []
    },
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

function formatPeriodKey(dateInput, groupBy = 'day') {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  if (groupBy === 'year') return `${year}`;
  if (groupBy === 'month') return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

function normalizeDateRange(startDate, endDate) {
  const parsedStart = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const parsedEnd = endDate ? new Date(endDate) : new Date();
  return {
    start: Number.isNaN(parsedStart.getTime()) ? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) : parsedStart,
    end: Number.isNaN(parsedEnd.getTime()) ? new Date() : parsedEnd
  };
}

async function safeFindAll(model, query = {}, sort = null, select = '') {
  if (!model || typeof model.find !== 'function') return [];
  let runner = model.find(query || {});
  if (runner && select && typeof runner.select === 'function') runner = runner.select(select);
  if (runner && sort && typeof runner.sort === 'function') runner = runner.sort(sort);
  if (runner && typeof runner.lean === 'function') return await runner.lean();
  return await runner;
}

function sortMetricRows(map, labels = new Map()) {
  return Array.from(map.entries())
    .map(([key, count]) => ({
      _id: key,
      label: labels.get(key) || key,
      count: Number(count || 0)
    }))
    .sort((a, b) => b.count - a.count);
}

function extractPostIdFromLink(rawLink) {
  try {
    const link = String(rawLink || '').trim();
    if (!link) return '';
    const parsed = new URL(link, 'https://example.com');
    const path = String(parsed.pathname || '').toLowerCase();
    if (!(path.includes('/post') || path.includes('/user/post.html'))) return '';
    return String(parsed.searchParams.get('id') || '').trim();
  } catch (_) {
    return '';
  }
}

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
      const summaryFilter = { userId: userId || null, deviceId };
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
        { userId: 'guest', deviceHash: deviceId },
        { $set: { lastSeenAt: now }, $setOnInsert: { firstSeenAt: now, userAgent: '' } },
        { upsert: true, new: true }
      );
    }
  } catch (err) {
    logAnalyticsError('trackEvent.device', err);
  }

  return res.json({ success: true, accepted: true, stored, eventType });
};

exports.getUserActivity = async (req, res) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const { startDate, endDate, groupBy } = req.query;
    const normalizedGroupBy = String(groupBy || 'day').toLowerCase();
    const { start, end } = normalizeDateRange(startDate, endDate);

    const [events, users, orders, posts] = await Promise.all([
      safeFindAll(AnalyticsEvent, { timestamp: { $gte: start, $lte: end } }, { timestamp: 1 }),
      safeFindAll(User, {}, { createdAt: -1 }, '_id fullName email createdAt lastLoginAt'),
      safeFindAll(Order, { created_at: { $gte: start, $lte: end } }, { created_at: -1 }),
      safeFindAll(Post, {}, { created_at: -1 }, '_id title viewCount created_at bagCount shareCount likes')
    ]);

    const allUsers = Array.isArray(users) ? users : [];
    const allPosts = Array.isArray(posts) ? posts : [];
    const analyticsEvents = Array.isArray(events) ? events : [];
    const rangedOrders = Array.isArray(orders) ? orders : [];
    const postLabelMap = new Map(allPosts.map((post) => [String(post._id || post.id || ''), String(post.title || post.name || post._id || '')]));

    const activeSince24h = Date.now() - (24 * 60 * 60 * 1000);
    const activeSince7d = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const activeUserIds24h = new Set();
    const activeUserIds7d = new Set();
    const userActivityMap = new Map();
    const visitPeriodMap = new Map();
    const deviceUsageMap = new Map();
    const orderedMap = new Map();
    const addToCartMap = new Map();
    const likeMap = new Map();
    const shareMap = new Map();
    const clickMap = new Map();
    const clickProductMap = new Map();
    const clickTrendMap = new Map();
    const videoViewMap = new Map();
    const imageDownloadMap = new Map();

    analyticsEvents.forEach((event) => {
      const timestamp = new Date(event?.timestamp || event?.createdAt || event?.created_at || 0);
      const timeMs = timestamp.getTime();
      if (!Number.isFinite(timeMs)) return;

      const userId = String(event?.userId || '').trim();
      const deviceId = String(event?.deviceId || '').trim();
      const identityKey = userId || deviceId;
      const eventType = String(event?.eventType || '').trim();
      const deviceType = String(event?.deviceType || 'desktop').trim() || 'desktop';
      const sessionKey = String(event?.sessionId || identityKey || '').trim();
      const eventData = event?.eventData && typeof event.eventData === 'object' ? event.eventData : {};
      const productId = String(eventData.productId || extractPostIdFromLink(eventData.link) || '').trim();

      if (userId && timeMs >= activeSince24h) activeUserIds24h.add(userId);
      if (userId && timeMs >= activeSince7d) activeUserIds7d.add(userId);

      if (identityKey) {
        if (!userActivityMap.has(identityKey)) {
          userActivityMap.set(identityKey, {
            userId: userId || '',
            deviceId: deviceId || '',
            firstVisit: timestamp.toISOString(),
            lastActive: timestamp.toISOString(),
            sessionKeys: new Set(sessionKey ? [sessionKey] : []),
            deviceType,
            eventCount: 0
          });
        }
        const entry = userActivityMap.get(identityKey);
        if (timestamp < new Date(entry.firstVisit)) entry.firstVisit = timestamp.toISOString();
        if (timestamp > new Date(entry.lastActive)) entry.lastActive = timestamp.toISOString();
        if (sessionKey) entry.sessionKeys.add(sessionKey);
        entry.deviceType = deviceType || entry.deviceType;
        entry.eventCount += 1;
      }

      if (sessionKey) {
        const period = formatPeriodKey(timestamp, normalizedGroupBy);
        if (period) visitPeriodMap.set(`${period}::${sessionKey}`, true);
      }

      deviceUsageMap.set(deviceType, (deviceUsageMap.get(deviceType) || 0) + 1);
      if (eventType === 'add_to_cart' && productId) addToCartMap.set(productId, (addToCartMap.get(productId) || 0) + 1);
      if (eventType === 'like' && productId) likeMap.set(productId, (likeMap.get(productId) || 0) + 1);
      if (eventType === 'share' && productId) shareMap.set(productId, (shareMap.get(productId) || 0) + 1);
      if (eventType === 'image_download' && productId) imageDownloadMap.set(productId, (imageDownloadMap.get(productId) || 0) + 1);

      if (eventType === 'video_view') {
        const platform = String(eventData.platform || 'unknown').trim() || 'unknown';
        const key = `${platform}::${productId || 'N/A'}`;
        const current = videoViewMap.get(key) || { _id: { platform, productId: productId || 'N/A' }, count: 0 };
        current.count += 1;
        videoViewMap.set(key, current);
      }

      if (eventType === 'click') {
        const link = String(eventData.link || '').trim();
        if (!link) return;
        clickMap.set(link, (clickMap.get(link) || 0) + 1);
        const clickPeriod = formatPeriodKey(timestamp, 'day');
        if (clickPeriod) clickTrendMap.set(clickPeriod, (clickTrendMap.get(clickPeriod) || 0) + 1);
        if (productId) clickProductMap.set(productId, (clickProductMap.get(productId) || 0) + 1);
      }
    });

    const postViewMap = new Map(allPosts.map((post) => [String(post._id || post.id || ''), Number(post.viewCount || 0)]));
    allPosts.forEach((post) => {
      const postId = String(post?._id || post?.id || '').trim();
      if (!postId) return;

      const bagCount = Number(post?.bagCount || 0);
      const shareCount = Number(post?.shareCount || 0);
      const likesCount = Array.isArray(post?.likes) ? post.likes.length : Number(post?.likesCount || 0);

      if (bagCount > 0) {
        addToCartMap.set(postId, Math.max(addToCartMap.get(postId) || 0, bagCount));
      }
      if (shareCount > 0) {
        shareMap.set(postId, Math.max(shareMap.get(postId) || 0, shareCount));
      }
      if (likesCount > 0) {
        likeMap.set(postId, Math.max(likeMap.get(postId) || 0, likesCount));
      }
    });
    analyticsEvents.filter((event) => String(event?.eventType || '').trim() === 'product_view').forEach((event) => {
      const productId = String(event?.eventData?.productId || '').trim();
      if (!productId) return;
      postViewMap.set(productId, (postViewMap.get(productId) || 0) + 1);
    });

    rangedOrders.forEach((order) => {
      const productId = String(order?.productId || order?.post_id || order?.cloth_details?.post_id || '').trim();
      const productName = String(order?.productName || order?.cloth_details?.post_title || order?.cloth_details?.category || '').trim();
      const key = productId || productName;
      if (!key) return;
      orderedMap.set(key, (orderedMap.get(key) || 0) + Math.max(1, Number(order?.quantity || 1)));
      if (productId && productName && !postLabelMap.has(productId)) {
        postLabelMap.set(productId, productName);
      }
    });

    const userMap = new Map(allUsers.map((user) => [String(user._id || user.id || ''), user]));
    const userActivity = Array.from(userActivityMap.values()).map((row) => {
      const account = userMap.get(String(row.userId || '').trim()) || null;
      const firstVisit = new Date(row.firstVisit);
      const lastActive = new Date(row.lastActive);
      return {
        userId: row.userId,
        deviceId: row.deviceId,
        firstVisit: row.firstVisit,
        lastActive: row.lastActive,
        sessionCount: row.sessionKeys.size,
        totalTimeSpentSeconds: Math.max(0, Math.floor((lastActive.getTime() - firstVisit.getTime()) / 1000)),
        deviceType: row.deviceType,
        eventCount: row.eventCount,
        userName: account ? String(account.fullName || '') : '',
        userEmail: account ? String(account.email || '') : ''
      };
    }).sort((a, b) => Number(b.sessionCount || 0) - Number(a.sessionCount || 0));

    allUsers.forEach((user) => {
      const id = String(user._id || user.id || '').trim();
      const lastLoginAt = new Date(user?.lastLoginAt || 0).getTime();
      if (id && Number.isFinite(lastLoginAt) && lastLoginAt >= activeSince24h) activeUserIds24h.add(id);
      if (id && Number.isFinite(lastLoginAt) && lastLoginAt >= activeSince7d) activeUserIds7d.add(id);
    });

    const newUsersPerDayMap = new Map();
    allUsers.forEach((user) => {
      const createdAt = new Date(user?.createdAt || 0);
      if (Number.isNaN(createdAt.getTime()) || createdAt < start || createdAt > end) return;
      const key = formatPeriodKey(createdAt, 'day');
      newUsersPerDayMap.set(key, (newUsersPerDayMap.get(key) || 0) + 1);
    });

    const visitsOverTimeMap = Array.from(visitPeriodMap.keys()).reduce((acc, compositeKey) => {
      const period = compositeKey.split('::')[0];
      acc.set(period, (acc.get(period) || 0) + 1);
      return acc;
    }, new Map());

    const orderedProducts = sortMetricRows(orderedMap, postLabelMap);
    const productViews = sortMetricRows(postViewMap, postLabelMap);
    const addToCart = sortMetricRows(addToCartMap, postLabelMap);
    const likes = sortMetricRows(likeMap, postLabelMap);
    const shares = sortMetricRows(shareMap, postLabelMap);
    const clicks = Array.from(clickMap.entries()).map(([key, count]) => ({ _id: key, count })).sort((a, b) => b.count - a.count);
    const clicksPerProduct = sortMetricRows(clickProductMap, postLabelMap);
    const clicksEnriched = clicks.map((row) => {
      const link = String(row?._id || '').trim();
      const productId = extractPostIdFromLink(link);
      return {
        _id: link,
        label: productId ? (postLabelMap.get(productId) || productId) : link,
        link,
        productId: productId || null,
        count: Number(row?.count || 0)
      };
    });
    const videoViews = Array.from(videoViewMap.values()).sort((a, b) => b.count - a.count);
    const imageDownloads = sortMetricRows(imageDownloadMap, postLabelMap);
    const visitsOverTime = Array.from(visitsOverTimeMap.entries()).map(([key, count]) => ({ _id: key, count })).sort((a, b) => String(a._id).localeCompare(String(b._id)));
    const deviceUsage = Array.from(deviceUsageMap.entries()).map(([key, count]) => ({ _id: key, count })).sort((a, b) => b.count - a.count);

    const performanceMap = new Map();
    const mergeMetric = (rows, key) => {
      (rows || []).forEach((row) => {
        const id = String(row?._id || 'N/A');
        if (!performanceMap.has(id)) {
          performanceMap.set(id, { _id: id, views: 0, ordered: 0, addToCart: 0, likes: 0, shares: 0, score: 0 });
        }
        performanceMap.get(id)[key] += Number(row?.count || 0);
      });
    };
    mergeMetric(productViews, 'views');
    mergeMetric(orderedProducts, 'ordered');
    mergeMetric(addToCart, 'addToCart');
    mergeMetric(likes, 'likes');
    mergeMetric(shares, 'shares');

    const productPerformance = Array.from(performanceMap.values()).map((row) => ({
      ...row,
      score: row.views + (row.ordered * 3) + (row.addToCart * 2) + row.likes + row.shares
    })).sort((a, b) => b.score - a.score).slice(0, 12);

    const totalUsers = allUsers.length;
    const totalProducts = allPosts.length;
    const totalTrackedViews = productViews.reduce((sum, row) => sum + Number(row.count || 0), 0);
    const totalTrackedClicks = clicks.reduce((sum, row) => sum + Number(row.count || 0), 0);

    return res.json({
      success: true,
      userSummary: {
        totalUsers,
        activeLast24h: activeUserIds24h.size,
        activeLast7d: activeUserIds7d.size,
        activeLast24hPercent: totalUsers ? Number(((activeUserIds24h.size / totalUsers) * 100).toFixed(1)) : 0,
        activeLast7dPercent: totalUsers ? Number(((activeUserIds7d.size / totalUsers) * 100).toFixed(1)) : 0,
        newUsersPerDay: Array.from(newUsersPerDayMap.entries()).map(([key, count]) => ({ _id: key, count })).sort((a, b) => String(a._id).localeCompare(String(b._id)))
      },
      productSummary: {
        totalProducts,
        totalTrackedViews,
        totalTrackedClicks,
        mostViewedProducts: productViews.slice(0, 5),
        mostClickedProducts: clicksPerProduct.slice(0, 5)
      },
      linkAnalytics: {
        totalClicks: totalTrackedClicks,
        clicksPerProduct,
        clickTrendDaily: Array.from(clickTrendMap.entries()).map(([key, count]) => ({ _id: key, count })).sort((a, b) => String(a._id).localeCompare(String(b._id)))
      },
      userActivity,
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
