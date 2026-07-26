const mongoose = require('mongoose');

const { Schema } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const PaymentSchema = new Schema(
  {
    user_id: { type: ObjectId, ref: 'User' },
    order_id: { type: ObjectId, ref: 'Order' },
    tx_ref: { type: String, required: true, unique: true },
    chapa_transaction_id: { type: String, default: '' },
    amount: { type: Number, default: null },
    currency: { type: String, default: 'ETB' },
    customer_name: { type: String, default: '' },
    customer_email: { type: String, default: '' },
    customer_phone: { type: String, default: '' },
    payment_method: { type: String, default: '' },
    payment_status: {
      type: String,
      enum: ['pending', 'success', 'failed', 'cancelled'],
      default: 'pending',
    },
    description: { type: String, default: '' },
    verified: { type: Boolean, default: false },
    verification_attempts: { type: Number, default: 0 },
    last_verification_at: { type: Date, default: null },
    completed_at: { type: Date, default: null },
    webhook_received_at: { type: Date, default: null },
    webhook_processed_at: { type: Date, default: null },
    webhook_attempt_count: { type: Number, default: 0 },
    payment_reference: { type: String, default: '' },
    error_message: { type: String, default: '' },
    error_code: { type: String, default: '' },
    callback_response: { type: Schema.Types.Mixed, default: null },
    metadata: { type: Schema.Types.Mixed, default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  },
  {
    collection: 'payments',
    timestamps: false,
  }
);

// Indexes on user_id and order_id for query performance
PaymentSchema.index({ user_id: 1 });
PaymentSchema.index({ order_id: 1 });

// Duplicate-model guard — prevents OverwriteModelError in test/hot-reload scenarios
module.exports = mongoose.models.Payment || mongoose.model('Payment', PaymentSchema);
