const { isFirebaseMode, FirebasePost } = require('../utils/firebaseAuthModels');

if (isFirebaseMode()) {
    module.exports = FirebasePost;
    return;
}

const mongoose = require('mongoose');

const ALLOWED_POST_CATEGORIES = ['Women', 'Men', 'Couple', 'Kids', 'Wedding', 'Accessories'];
const ALLOWED_MEASUREMENT_PROFILES = ['women', 'men_tshirt', 'men_trousers'];

const PostSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    categories: [
        {
            type: String,
            enum: ALLOWED_POST_CATEGORIES
        }
    ],
    measurement_profiles: [
        {
            type: String,
            enum: ALLOWED_MEASUREMENT_PROFILES
        }
    ],
    images: [
        {
            type: String // URL/Path to image
        }
    ],
    videoUrl: {
        type: String,
        default: ''
    },
    videoUrls: [
        {
            type: String
        }
    ],
    priceETB: {
        type: Number,
        default: null
    },
    oldPriceETB: {
        type: Number,
        default: null
    },
    shippingPriceETB: {
        type: Number,
        default: null
    },
    freeShipping: {
        type: Boolean,
        default: false
    },
    delivery_scope: {
        type: String,
        enum: ['ethiopia_only', 'selected_countries', 'all_countries'],
        default: 'ethiopia_only'
    },
    delivery_countries: [
        {
            type: String,
            trim: true
        }
    ],
    stock_quantity: {
        type: Number,
        default: 0,
        min: 0
    },
    unlimited_stock: {
        type: Boolean,
        default: true
    },
    viewCount: {
        type: Number,
        default: 0
    },
    shareCount: {
        type: Number,
        default: 0
    },
    bagCount: {
        type: Number,
        default: 0
    },
    orderCountVisible: {
        type: Boolean,
        default: true
    },
    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    likes: [
        {
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            }
        }
    ],
    comments: [
        {
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            name: String,
            text: {
                type: String,
                default: ''
            },
            image_url: {
                type: String,
                default: ''
            },
            rating: {
                type: Number,
                min: 1,
                max: 5,
                default: 5
            },
            likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
            favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
            replies: [
                {
                    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
                    name: String,
                    text: String,
                    image_url: {
                        type: String,
                        default: ''
                    },
                    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
                    date: { type: Date, default: Date.now }
                }
            ],
            date: {
                type: Date,
                default: Date.now
            }
        }
    ],
    created_at: {
        type: Date,
        default: Date.now
    }
});

PostSchema.pre('validate', function syncPostCategoryMetadata(next) {
    const categories = Array.isArray(this.categories)
        ? Array.from(new Set(this.categories.map((row) => String(row || '').trim()).filter((row) => ALLOWED_POST_CATEGORIES.includes(row))))
        : [];

    if (categories.length) {
        this.categories = categories;
        this.category = categories.join(', ');
    } else {
        const fallback = String(this.category || '').trim();
        this.categories = fallback && ALLOWED_POST_CATEGORIES.includes(fallback) ? [fallback] : [];
        if (this.categories.length) {
            this.category = this.categories.join(', ');
        }
    }

    const measurementProfiles = Array.isArray(this.measurement_profiles)
        ? Array.from(new Set(this.measurement_profiles.map((row) => String(row || '').trim()).filter((row) => ALLOWED_MEASUREMENT_PROFILES.includes(row))))
        : [];
    this.measurement_profiles = measurementProfiles;
    next();
});

module.exports = mongoose.model('Post', PostSchema);
