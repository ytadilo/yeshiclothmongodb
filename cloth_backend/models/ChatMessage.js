const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema({
    sender_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiver_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    job_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },
    delivery_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', default: null },
    message: { type: String, required: true },
    reply_to: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatMessage', default: null },
    timestamp: { type: Date, default: Date.now },
    sent: { type: Boolean, default: true },
    seen: { type: Boolean, default: false },
    seen_at: { type: Date, default: null }
});

ChatMessageSchema.index({ job_id: 1, timestamp: -1 });
ChatMessageSchema.index({ delivery_id: 1, timestamp: -1 });

module.exports = mongoose.model('ChatMessage', ChatMessageSchema);
