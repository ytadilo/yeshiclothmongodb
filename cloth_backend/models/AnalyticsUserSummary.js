'use strict';

const mongoose = require('mongoose');

const AnalyticsUserSummarySchema = new mongoose.Schema(
  {
    userId:                { type: String, default: null },
    deviceId:              { type: String, default: '' },
    deviceType:            { type: String, default: 'desktop' },
    firstVisitAt:          { type: Date },
    lastActiveAt:          { type: Date },
    totalTimeSpentSeconds: { type: Number, default: 0 },
    sessionCount:          { type: Number, default: 0 },
    sessionIds:            [{ type: String }],
    updatedAt:             { type: Date },
  },
  { collection: 'analytics_user_summaries', timestamps: false }
);

AnalyticsUserSummarySchema.index({ userId: 1, deviceId: 1 });

module.exports = mongoose.models.AnalyticsUserSummary || mongoose.model('AnalyticsUserSummary', AnalyticsUserSummarySchema);
