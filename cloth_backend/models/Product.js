'use strict';

const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema(
  {
    name:        { type: String, default: '' },
    description: { type: String, default: '' },
    price:       { type: Number, default: 0 },
    category:    { type: String, default: '' },
    images:      [{ type: String }],
    stock:       { type: Number, default: 0 },
    createdAt:   { type: Date, default: Date.now },
    updatedAt:   { type: Date, default: Date.now },
  },
  { collection: 'products', timestamps: false }
);

module.exports = mongoose.models.Product || mongoose.model('Product', ProductSchema);
