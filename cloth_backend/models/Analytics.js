'use strict';

const mongoose = require('mongoose');

const AnalyticsSchema = new mongoose.Schema(
  {
    userId:     { type: String, default: null },
    deviceId:   { type: String, default: '' },
    deviceType: { type: String, default: 'desktop' },
    eventType:  { type: String, required: true },
    eventData:  { type: mongoose.Schema.Types.Mixed, default: {} },
    sessionId:  { type: String, default: '' },
    timestamp:  { type: Date, default: Date.now },
  },
  { collection: 'analytics', timestamps: false }
);

AnalyticsSchema.index({ userId: 1 });
AnalyticsSchema.index({ deviceId: 1 });
AnalyticsSchema.index({ timestamp: 1 });

module.exports = mongoose.models.Analytics || mongoose.model('Analytics', AnalyticsSchema);
