'use strict';

const mongoose = require('mongoose');

// ---------------------------------------------------------------------------
// Sub-schemas
// ---------------------------------------------------------------------------

const CommentSubSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    text: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

// ---------------------------------------------------------------------------
// Main Post schema
// ---------------------------------------------------------------------------

const PostSchema = new mongoose.Schema(
  {
    title: { type: String, default: '' },
    description: { type: String, default: '' },

    // category is a human-readable label built from the categories array
    category: { type: String, default: '' },
    categories: [{ type: String }],

    measurement_profiles: [{ type: String }],

    images: [{ type: String }],
    videoUrl: { type: String, default: '' },
    videoUrls: [{ type: String }],

    priceETB: { type: Number, default: 0 },
    oldPriceETB: { type: Number, default: null },
    shippingPriceETB: { type: Number, default: null },
    freeShipping: { type: Boolean, default: false },

    // 'ethiopia_only' | 'selected_countries' | 'all_countries'
    delivery_scope: { type: String, default: 'ethiopia_only' },
    delivery_countries: [{ type: String }],

    stock_quantity: { type: Number, default: 0 },
    unlimited_stock: { type: Boolean, default: false },

    viewCount: { type: Number, default: 0 },
    shareCount: { type: Number, default: 0 },
    bagCount: { type: Number, default: 0 },
    orderCountVisible: { type: Boolean, default: true },

    // Interaction arrays
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [CommentSubSchema],

    // Ownership
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    // Manual timestamps — both snake_case (used by some controllers) and
    // camelCase variants are stored explicitly so existing queries work.
    created_at: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  {
    collection: 'posts',
    timestamps: false,
  }
);

// ---------------------------------------------------------------------------
// Indexes  (Requirement 9.3)
// ---------------------------------------------------------------------------

// Descending index on created_at — supports the default sort in getPosts
PostSchema.index({ created_at: -1 });

// Index on stock_quantity — supports stock-filtering queries
PostSchema.index({ stock_quantity: 1 });

// ---------------------------------------------------------------------------
// Duplicate-model guard (prevents OverwriteModelError in tests / hot-reload)
// ---------------------------------------------------------------------------

module.exports = mongoose.models.Post || mongoose.model('Post', PostSchema);
