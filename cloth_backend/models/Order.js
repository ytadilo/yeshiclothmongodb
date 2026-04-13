const { isFirebaseMode, FirebaseOrder } = require('../utils/firebaseAuthModels');

if (isFirebaseMode()) {
    module.exports = FirebaseOrder;
    return;
}

const mongoose = require('mongoose');

// Ethiopian Address Schema for weak address system support
const EthiopianAddressSchema = new mongoose.Schema({
    country: { type: String, default: 'Ethiopia' },
    country_code: { type: String, default: '+251' },
    region: { type: String, default: '' },
    region_custom: { type: String, default: '' },
    city: { type: String, default: '' },
    zip_code: { type: String, default: '' },
    sub_city: { type: String, default: '' }, // Ketema/Sub-city
    woreda: { type: String, default: '' },  // Woreda/Kebele
    landmark: { type: String, default: '' }, // Nearest landmark
    specific_address: { type: String, default: '' } // Detailed address
}, { _id: false });

const OrderSchema = new mongoose.Schema({
    // Simplified order fields (new flow)
    customerName: { type: String, default: '' },
    phone: { type: String, default: '' },
    address: { type: String, default: '' },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
    productName: { type: String, default: '' },
    productImage: { type: String, default: '' },
    quantity: { type: Number, default: 1, min: 1 },
    customDetails: {
        size: { type: String, default: '' },
        color: { type: String, default: '' },
        note: { type: String, default: '' }
    },
    productPrice: { type: Number, default: 0 },
    shippingPrice: { type: Number, default: 0 },
    totalPrice: { type: Number, default: 0 },
    paymentStatus: {
        type: String,
        enum: ['pending', 'confirmed'],
        default: 'pending'
    },
    orderStatus: {
        type: String,
        enum: ['pending', 'sewing_started', 'sewing_finished', 'delivery_started', 'completed'],
        default: 'pending'
    },
    createdAt: { type: Date, default: Date.now },

    // Order Type: 'product' (ready-made) or 'custom' (bespoke)
    order_type: { 
        type: String, 
        enum: ['product', 'custom'], 
        default: 'product' 
    },
    
    // For product orders - items from shop
    items: [{
        product_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        price: Number,
        quantity: Number,
        size: String,
        color: String,
        image: String
    }],
    
    // For custom orders - original cloth_details
    post_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' }, 
    customer_info: {
        full_name: String,
        father_name: String,
        phone: String,
        // Ethiopian address support
        address: EthiopianAddressSchema
    },
    cloth_details: {
        category: String,
        design_type: String,
        color: String,
        event_type: String,
        deadline_date: Date,
        post_title: String,
        post_image: String,
        post_description: String,
        post_price_etb: Number,
        post_shipping_price_etb: Number,
        post_free_shipping: { type: Boolean, default: false }
    },
    proposed_price_etb: { type: Number, default: 0 },
    negotiation_messages: [{
        sender_role: { type: String, enum: ['user', 'admin'], required: true },
        message: { type: String, default: '' },
        image_url: { type: String, default: '' },
        timestamp: { type: Date, default: Date.now }
    }],
    sewing_status: {
        type: String,
        enum: ['Pending', 'Sewing', 'Ready', 'Shipped', 'Delivered', 'Cancelled'],
        default: 'Pending'
    },
    measurements: {
        type: { type: String, default: 'standard' }, 
        size: String,
        height: Number,
        shoulder: Number,
        chest: Number,
        waist: Number,
        hip: Number,
        length: Number,
        sleeve: Number
    },
    reference_images: [String],
    
    // Pricing
    subtotal: { type: Number, default: 0 },
    delivery_fee: { type: Number, default: 0 },
    total: { type: Number, default: 0 },
    
    // Payment Info
    payment_info: {
        method: String,  // 'bank_transfer', 'telebirr', 'cbe', 'chapa', 'cod'
        screenshot_url: String,
        status: { type: String, default: 'Pending' },
        transaction_id: String,
        paid_at: Date
    },
    
    // Delivery Method
    delivery_method: { type: String, enum: ['pickup', 'delivery'], default: 'delivery' },
    
    // Payment Status
    payment_status: { 
        type: String, 
        enum: ['Pending', 'Confirmed', 'Failed', 'Refunded'], 
        default: 'Pending' 
    },
    
    // AliExpress-style Order Tracking Status
    order_status: { 
        type: String, 
        enum: [
            'Received',               // Legacy intake state
            'Sewing',                 // Garment is being sewn
            'Ready',                  // Ready for handoff
            'Order Placed',           // Order received, awaiting payment
            'Payment Confirmed',      // Payment verified
            'Preparing',              // Being prepared/packed
            'Shipped',                // Shipped to carrier
            'Out for Delivery',      // With driver
            'Delivered',              // Delivered to customer
            'Cancelled'               // Order cancelled
        ], 
        default: 'Order Placed' 
    },
    
    // Estimated delivery time (Ethiopia-focused)
    estimated_delivery: {
        city: String,  // e.g., 'Addis Ababa', 'Other cities'
        days_min: Number,
        days_max: Number
    },
    
    // Driver assignment for delivery
    assigned_driver: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    },
    driver_assigned_at: Date,
    picked_up_at: Date,
    delivered_at: Date,
    delivery_proof_image: String,
    
    // Customer notes
    customer_notes: String,
    admin_notes: String,
    
    // User reference (for logged in users)
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// Index for efficient queries
OrderSchema.index({ user_id: 1, created_at: -1 });
OrderSchema.index({ 'customer_info.phone': 1 });
OrderSchema.index({ order_status: 1 });
OrderSchema.index({ assigned_driver: 1 });
OrderSchema.index({ order_type: 1 });

// Pre-save middleware
OrderSchema.pre('save', function() {
    this.updated_at = new Date();
    
    // Calculate total if items exist
    if (this.items && this.items.length > 0) {
        this.subtotal = this.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        this.total = this.subtotal + this.delivery_fee;
    }
    
});

module.exports = mongoose.model('Order', OrderSchema);
