const mongoose = require('mongoose');

const BlockedDeviceSchema = new mongoose.Schema({
    deviceHash: { type: String, required: true, unique: true },
    blocked: { type: Boolean, default: true },
    reason: { type: String, default: '' },
    createdByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('BlockedDevice', BlockedDeviceSchema);
