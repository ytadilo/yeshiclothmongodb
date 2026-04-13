const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
    actor_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true },
    entity_type: { type: String, required: true },
    entity_id: { type: String, default: '' },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now }
});

AuditLogSchema.index({ entity_type: 1, entity_id: 1, timestamp: -1 });
AuditLogSchema.index({ actor_id: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
