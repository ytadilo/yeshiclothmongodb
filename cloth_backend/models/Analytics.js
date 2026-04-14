// Analytics.js
// Model for tracking user activity and events

const { isFirebaseMode, FirebaseAnalyticsEvent } = require('../utils/firebaseAuthModels');

if (isFirebaseMode()) {
  module.exports = FirebaseAnalyticsEvent;
  return;
}

const mongoose = require('mongoose');

const EVENT_TYPES = [
  'page_view',
  'product_view',
  'add_to_cart',
  'click',
  'share',
  'like',
  'video_view',
  'image_download'
];

const AnalyticsEventSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false }, // null for guests
  deviceId: { type: String, required: false }, // for guest users
  deviceType: { type: String, enum: ['mobile', 'desktop', 'tablet'], required: false },
  eventType: { type: String, enum: EVENT_TYPES, required: true },
  eventData: { type: Object, default: {} }, // additional event data (productId, link, etc.)
  timestamp: { type: Date, default: Date.now },
  sessionId: { type: String, required: false },
});

AnalyticsEventSchema.index({ timestamp: -1 });
AnalyticsEventSchema.index({ eventType: 1, timestamp: -1 });
AnalyticsEventSchema.index({ userId: 1, timestamp: -1 });
AnalyticsEventSchema.index({ deviceId: 1, timestamp: -1 });
AnalyticsEventSchema.index({ sessionId: 1, timestamp: -1 });

module.exports = mongoose.model('AnalyticsEvent', AnalyticsEventSchema);