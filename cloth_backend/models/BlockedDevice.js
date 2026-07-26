'use strict';

const mongoose = require('mongoose');

const BlockedDeviceSchema = new mongoose.Schema(
  {
    deviceHash: { type: String, required: true, unique: true },
    blocked:    { type: Boolean, default: true },
    reason:     { type: String, default: '' },
    blockedAt:  { type: Date, default: Date.now },
    blockedBy:  { type: String, default: '' },
  },
  { collection: 'blocked_devices', timestamps: false }
);

module.exports = mongoose.models.BlockedDevice || mongoose.model('BlockedDevice', BlockedDeviceSchema);
