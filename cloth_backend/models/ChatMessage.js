'use strict';

const mongoose = require('mongoose');

const ChatMessageSchema = new mongoose.Schema(
  {
    sender_id:   { type: String, required: true },
    receiver_id: { type: String, required: true },
    job_id:      { type: String, default: null },
    delivery_id: { type: String, default: null },
    message:     { type: String, default: '' },
    reply_to:    { type: String, default: null },
    timestamp:   { type: Date, default: Date.now },
    sent:        { type: Boolean, default: true },
    seen:        { type: Boolean, default: false },
    seen_at:     { type: Date, default: null },
  },
  { collection: 'chat_messages', timestamps: false }
);

ChatMessageSchema.index({ sender_id: 1 });
ChatMessageSchema.index({ receiver_id: 1 });
ChatMessageSchema.index({ timestamp: 1 });

module.exports = mongoose.models.ChatMessage || mongoose.model('ChatMessage', ChatMessageSchema);
