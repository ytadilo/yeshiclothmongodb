const mongoose = require('mongoose');

const UserDeviceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    deviceHash: { type: String, required: true, index: true },
    userAgent: { type: String, default: '' },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now }
});

UserDeviceSchema.index({ userId: 1, deviceHash: 1 }, { unique: true });

module.exports = mongoose.model('UserDevice', UserDeviceSchema);
