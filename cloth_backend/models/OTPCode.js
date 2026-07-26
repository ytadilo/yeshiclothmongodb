'use strict';

const mongoose = require('mongoose');

const OTPCodeSchema = new mongoose.Schema(
  {
    userId:    { type: String, required: true },
    otp:       { type: String, required: true },
    type:      { type: String, required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: 'otp_codes', timestamps: false }
);

OTPCodeSchema.index({ userId: 1 });
OTPCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

module.exports = mongoose.models.OTPCode || mongoose.model('OTPCode', OTPCodeSchema);
