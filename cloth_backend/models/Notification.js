const { isFirebaseMode, FirebaseNotification } = require('../utils/firebaseAuthModels');

if (isFirebaseMode()) {
    module.exports = FirebaseNotification;
    return;
}

const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['message', 'status_update'], required: true },
    reference_id: { type: String, default: '' },
    title: { type: String, default: '' },
    body: { type: String, default: '' },
    is_read: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now }
});

NotificationSchema.index({ user_id: 1, is_read: 1, timestamp: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
