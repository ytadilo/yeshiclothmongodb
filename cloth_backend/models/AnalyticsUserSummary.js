const mongoose = require('mongoose');

const AnalyticsUserSummarySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  deviceId: { type: String, default: '', index: true },
  deviceType: { type: String, enum: ['mobile', 'desktop', 'tablet'], default: 'desktop' },
  firstVisitAt: { type: Date, default: Date.now },
  lastActiveAt: { type: Date, default: Date.now },
  totalTimeSpentSeconds: { type: Number, default: 0 },
  sessionCount: { type: Number, default: 0 },
  sessionIds: { type: [String], default: [] },
  updatedAt: { type: Date, default: Date.now }
});

AnalyticsUserSummarySchema.index({ userId: 1, deviceId: 1 }, { unique: true });

module.exports = mongoose.model('AnalyticsUserSummary', AnalyticsUserSummarySchema);
