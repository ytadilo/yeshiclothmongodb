'use strict';

const mongoose = require('mongoose');

const UserDeviceSchema = new mongoose.Schema(
  {
    userId:      { type: String, required: true },
    deviceHash:  { type: String, required: true },
    userAgent:   { type: String, default: '' },
    lastSeenAt:  { type: Date },
    firstSeenAt: { type: Date, default: Date.now },
  },
  { collection: 'user_devices', timestamps: false }
);

UserDeviceSchema.index({ userId: 1, deviceHash: 1 }, { unique: true });

module.exports = mongoose.models.UserDevice || mongoose.model('UserDevice', UserDeviceSchema);
