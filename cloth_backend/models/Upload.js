'use strict';

const mongoose = require('mongoose');
const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const UploadSchema = new Schema(
  {
    originalName:  { type: String, default: '' },
    mimeType:      { type: String, default: 'application/octet-stream' },
    size:          { type: Number, default: 0 },
    data:          { type: Buffer },
    storage_path:  { type: String, default: '' },
    visibility:    { type: String, default: 'public' },
    owner_user_id: { type: ObjectId, ref: 'User' },
    purpose:       { type: String, default: '' },
    order_id:      { type: ObjectId, ref: 'Order' },
    post_id:       { type: ObjectId, ref: 'Post' },
    created_at:    { type: Date, default: Date.now },
  },
  { collection: 'uploads', timestamps: false }
);

UploadSchema.index({ owner_user_id: 1 });
UploadSchema.index({ purpose: 1 });

module.exports = mongoose.models.Upload || mongoose.model('Upload', UploadSchema);
