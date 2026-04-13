const { isFirebaseMode, FirebaseUpload } = require('../utils/firebaseAuthModels');

if (isFirebaseMode()) {
    module.exports = FirebaseUpload;
    return;
}

const mongoose = require('mongoose');

const UploadSchema = new mongoose.Schema({
    originalName: { type: String, default: '' },
    mimeType: { type: String, default: 'application/octet-stream' },
    size: { type: Number, default: 0 },
    data: { type: Buffer, required: true },

    // public: post images etc
    // private: order payment + reference images (owner/admin only)
    visibility: { type: String, enum: ['public', 'private'], default: 'public' },

    owner_user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    purpose: { type: String, default: '' },

    // Optional linking (useful for debugging/auditing)
    order_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    post_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },

    created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Upload', UploadSchema);
