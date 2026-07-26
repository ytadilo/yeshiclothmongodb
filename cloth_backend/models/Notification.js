'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const NotificationSchema = new Schema(
  {
    user_id:      { type: ObjectId, ref: 'User', required: true },
    type:         { type: String, default: 'system' },
    title:        { type: String, default: '' },
    body:         { type: String, default: '' },
    reference_id: { type: String, default: '' },
    destination:  { type: Schema.Types.Mixed },
    is_read:      { type: Boolean, default: false },
    timestamp:    { type: Date, default: Date.now },
  },
  { collection: 'notifications', timestamps: false }
);

NotificationSchema.index({ user_id: 1, timestamp: -1 });

module.exports = mongoose.models.Notification || mongoose.model('Notification', NotificationSchema);
