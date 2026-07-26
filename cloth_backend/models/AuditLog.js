'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const AuditLogSchema = new Schema(
  {
    actor_id:    { type: ObjectId, ref: 'User' },
    actor_email: { type: String, default: '' },
    action:      { type: String, required: true },
    target_type: { type: String, default: '' },
    target_id:   { type: String, default: '' },
    metadata:    { type: Schema.Types.Mixed },
    ip:          { type: String, default: '' },
    createdAt:   { type: Date, default: Date.now },
  },
  { collection: 'audit_logs', timestamps: false }
);

AuditLogSchema.index({ actor_id: 1 });
AuditLogSchema.index({ createdAt: 1 });

module.exports = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
