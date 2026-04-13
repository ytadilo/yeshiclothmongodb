const mongoose = require('mongoose');

const OTPCodeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    otp: { type: String, required: true },
    type: { type: String, enum: ['reset_password', 'admin_reset_password'], required: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('OTPCode', OTPCodeSchema);
