const { isFirebaseMode, FirebasePayment } = require('../utils/firebaseAuthModels');

if (isFirebaseMode()) {
    module.exports = FirebasePayment;
    return;
}

const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
    // Basic Payment Information
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    order_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        index: true
    },

    // Chapa Transaction Reference
    tx_ref: {
        type: String,
        required: true,
        unique: true,
        index: true,
        description: 'Unique transaction reference for this payment'
    },
    chapa_transaction_id: {
        type: String,
        index: true,
        description: 'Chapa transaction ID returned from checkout initialization'
    },

    // Payment Amount
    amount: {
        type: Number,
        required: true,
        min: 0,
        description: 'Payment amount in the specified currency'
    },
    currency: {
        type: String,
        default: 'ETB',
        enum: ['ETB', 'USD'],
        description: 'Currency of the transaction'
    },

    // Customer Information
    customer_name: {
        type: String,
        required: true,
        trim: true
    },
    customer_email: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },
    customer_phone: {
        type: String,
        required: true,
        trim: true
    },

    // Payment Details
    payment_method: {
        type: String,
        default: null,
        description: 'Payment method used (CARD, TELEBIRR, BANK_TRANSFER, etc.)'
    },
    payment_status: {
        type: String,
        enum: ['pending', 'success', 'failed', 'cancelled', 'expired', 'refunded'],
        default: 'pending',
        index: true
    },
    payment_reference: {
        type: String,
        description: 'Reference returned from Chapa after payment'
    },

    // Callback Information
    callback_response: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
        description: 'Full JSON response from Chapa webhook callback'
    },
    verified: {
        type: Boolean,
        default: false,
        index: true,
        description: 'Whether the payment has been verified with Chapa API'
    },
    verification_attempts: {
        type: Number,
        default: 0,
        description: 'Number of times we attempted to verify this payment'
    },
    last_verification_at: {
        type: Date,
        description: 'Timestamp of last verification attempt'
    },

    // Webhook Processing
    webhook_received_at: {
        type: Date,
        description: 'Timestamp when webhook was first received'
    },
    webhook_processed_at: {
        type: Date,
        description: 'Timestamp when webhook was successfully processed'
    },
    webhook_attempt_count: {
        type: Number,
        default: 0,
        description: 'Number of webhook processing attempts'
    },

    // Metadata
    description: {
        type: String,
        default: '',
        trim: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {},
        description: 'Additional metadata for the payment'
    },

    // Error Tracking
    error_message: {
        type: String,
        default: null,
        description: 'Error message if payment failed'
    },
    error_code: {
        type: String,
        default: null,
        description: 'Error code from Chapa or internal processing'
    },

    // Timestamps
    created_at: {
        type: Date,
        default: Date.now,
        index: true
    },
    updated_at: {
        type: Date,
        default: Date.now,
        index: true
    },
    completed_at: {
        type: Date,
        description: 'Timestamp when payment was successfully completed'
    }
});

// Index for efficient queries
PaymentSchema.index({ user_id: 1, created_at: -1 });
PaymentSchema.index({ order_id: 1, created_at: -1 });
PaymentSchema.index({ payment_status: 1, created_at: -1 });
PaymentSchema.index({ tx_ref: 1, created_at: -1 });

// Update timestamp before saving
PaymentSchema.pre('save', function (next) {
    this.updated_at = Date.now();
    next();
});

// Method to check if payment is successful
PaymentSchema.methods.isSuccessful = function () {
    return this.payment_status === 'success' && this.verified === true;
};

// Method to check if payment processing is still pending
PaymentSchema.methods.isPending = function () {
    return this.payment_status === 'pending';
};

// Method to check if payment can be retried
PaymentSchema.methods.canRetry = function () {
    return ['failed', 'expired', 'cancelled'].includes(this.payment_status);
};

module.exports = mongoose.model('Payment', PaymentSchema);
