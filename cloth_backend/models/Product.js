const { isFirebaseMode, FirebaseProduct } = require('../utils/firebaseAuthModels');

if (isFirebaseMode()) {
    module.exports = FirebaseProduct;
    return;
}

const mongoose = require('mongoose');

const ProductSchema = new mongoose.Schema({
    // Basic Information
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    slug: {
        type: String,
        unique: true,
        lowercase: true
    },
    description: {
        type: String,
        required: true
    },
    short_description: {
        type: String,
        maxlength: 500
    },
    
    // Pricing
    base_price: {
        type: Number,
        required: true,
        min: 0
    },
    sale_price: {
        type: Number,
        min: 0
    },
    discount_percentage: {
        type: Number,
        min: 0,
        max: 100,
        default: 0
    },
    currency: {
        type: String,
        default: 'ETB'
    },
    
    // Categorization
    category: {
        type: String,
        required: true,
        enum: ['women', 'men', 'kids', 'wedding', 'accessories', 'other']
    },
    sub_category: {
        type: String,
        trim: true
    },
    tags: [{
        type: String,
        trim: true
    }],
    
    // Product Images
    images: [{
        url: String,
        alt_text: String,
        is_primary: {
            type: Boolean,
            default: false
        }
    }],
    thumbnail: {
        type: String
    },
    
    // Inventory Management
    stock_quantity: {
        type: Number,
        default: 0,
        min: 0
    },
    track_inventory: {
        type: Boolean,
        default: true
    },
    allow_backorder: {
        type: Boolean,
        default: false
    },
    low_stock_threshold: {
        type: Number,
        default: 5
    },
    
    // Product Variations
    variations: [{
        name: String,
        type: {
            type: String,
            enum: ['color', 'size', 'material', 'custom']
        },
        options: [{
            value: String,
            price_adjustment: {
                type: Number,
                default: 0
            },
            stock_quantity: {
                type: Number,
                default: 0
            },
            sku: String,
            image_url: String
        }]
    }],
    
    // Sizing
    sizing_type: {
        type: String,
        enum: ['standard', 'custom', 'both'],
        default: 'standard'
    },
    size_guide: {
        type: String
    },
    available_sizes: [{
        type: String,
        enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'custom']
    }],
    
    // Custom Options
    customizable: {
        type: Boolean,
        default: false
    },
    custom_options: [{
        name: String,
        type: {
            type: String,
            enum: ['text', 'textarea', 'select', 'radio', 'checkbox', 'file']
        },
        required: {
            type: Boolean,
            default: false
        },
        options: [String],
        price_adjustment: {
            type: Number,
            default: 0
        }
    }],
    
    // Production Details
    production_time_days: {
        type: Number,
        default: 7,
        min: 1
    },
    materials_used: [{
        type: String
    }],
    origin: {
        type: String,
        default: 'Gondar, Ethiopia'
    },
    
    // Status & Visibility
    status: {
        type: String,
        enum: ['active', 'draft', 'archived'],
        default: 'active'
    },
    visibility: {
        type: String,
        enum: ['public', 'hidden'],
        default: 'public'
    },
    featured: {
        type: Boolean,
        default: false
    },
    
    // SEO
    meta_title: {
        type: String,
        maxlength: 70
    },
    meta_description: {
        type: String,
        maxlength: 160
    },
    meta_keywords: [String],
    
    // Rating & Reviews
    rating: {
        average: {
            type: Number,
            default: 0,
            min: 0,
            max: 5
        },
        count: {
            type: Number,
            default: 0
        }
    },
    
    // Order Statistics
    total_sold: {
        type: Number,
        default: 0
    },
    total_views: {
        type: Number,
        default: 0
    },
    
    // Timestamps
    created_at: {
        type: Date,
        default: Date.now
    },
    updated_at: {
        type: Date,
        default: Date.now
    },
    published_at: Date
});

// Index for efficient queries
ProductSchema.index({ category: 1, status: 1 });
ProductSchema.index({ featured: 1, status: 1 });
ProductSchema.index({ created_at: -1 });
ProductSchema.index({ name: 'text', description: 'text' });

// Virtual for discount amount
ProductSchema.virtual('discount_amount').get(function() {
    if (this.sale_price && this.base_price) {
        return this.base_price - this.sale_price;
    }
    return 0;
});

// Virtual for is on sale
ProductSchema.virtual('is_on_sale').get(function() {
    return this.sale_price && this.sale_price < this.base_price;
});

// Virtual for is in stock
ProductSchema.virtual('in_stock').get(function() {
    if (this.track_inventory) {
        return this.stock_quantity > 0;
    }
    return true;
});

// Pre-save middleware to update slug
ProductSchema.pre('save', function(next) {
    if (this.isModified('name') && !this.slug) {
        this.slug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');
    }
    this.updated_at = new Date();
    next();
});

// Method to increment view count
ProductSchema.methods.incrementViews = function() {
    this.total_views += 1;
    return this.save();
};

// Method to add rating
ProductSchema.methods.addRating = function(newRating) {
    const currentCount = this.rating.count;
    const currentAverage = this.rating.average;
    
    this.rating.average = ((currentAverage * currentCount) + newRating) / (currentCount + 1);
    this.rating.count += 1;
    
    return this.save();
};

// Static method to get featured products
ProductSchema.statics.getFeatured = function(limit = 10) {
    return this.find({ featured: true, status: 'active', visibility: 'public' })
        .sort({ created_at: -1 })
        .limit(limit);
};

// Static method to get products by category
ProductSchema.statics.getByCategory = function(category, options = {}) {
    const { limit = 20, page = 1, sort = '-created_at' } = options;
    
    return this.find({ category, status: 'active', visibility: 'public' })
        .sort(sort)
        .limit(limit)
        .skip((page - 1) * limit);
};

// Static method to search products
ProductSchema.statics.search = function(query, options = {}) {
    const { limit = 20, page = 1, category, minPrice, maxPrice, sort = '-created_at' } = options;
    
    const searchQuery = {
        status: 'active',
        visibility: 'public'
    };
    
    if (query) {
        searchQuery.$text = { $search: query };
    }
    
    if (category) {
        searchQuery.category = category;
    }
    
    if (minPrice || maxPrice) {
        searchQuery.base_price = {};
        if (minPrice) searchQuery.base_price.$gte = minPrice;
        if (maxPrice) searchQuery.base_price.$lte = maxPrice;
    }
    
    return this.find(searchQuery)
        .sort(sort)
        .limit(limit)
        .skip((page - 1) * limit);
};

module.exports = mongoose.model('Product', ProductSchema);
