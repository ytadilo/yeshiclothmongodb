const mongoose = require('mongoose');

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const OrderSchema = new Schema(
  {
    user_id:         { type: ObjectId, ref: 'User' },
    productId:       { type: ObjectId, ref: 'Post' },
    post_id:         { type: ObjectId, ref: 'Post' },
    productName:     { type: String, default: '' },
    customerName:    { type: String, default: '' },
    phone:           { type: String, default: '' },
    customer_info:   { type: Schema.Types.Mixed },
    cloth_details:   { type: Schema.Types.Mixed },
    payment_info:    { type: Schema.Types.Mixed },
    device_location: { type: Schema.Types.Mixed },
    quantity:        { type: Number, default: 0 },
    productPrice:    { type: Number, default: 0 },
    shippingPrice:   { type: Number, default: 0 },
    totalPrice:      { type: Number, default: 0 },
    proposed_price_etb: { type: Number, default: null },
    paymentStatus:   { type: String, default: '' },
    orderStatus:     { type: String, default: '' },
    created_at:      { type: Date },
    createdAt:       { type: Date },
    updated_at:      { type: Date },
    updatedAt:       { type: Date },
  },
  {
    collection: 'orders',
    timestamps: false,
  }
);

// Index on user_id for fast per-user order queries
OrderSchema.index({ user_id: 1 });

// Index on created_at for chronological/time-range queries
OrderSchema.index({ created_at: 1 });

module.exports = mongoose.models.Order || mongoose.model('Order', OrderSchema);
