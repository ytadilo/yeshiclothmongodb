const { isFirebaseMode, FirebasePost } = require('../utils/firebaseAuthModels');

if (isFirebaseMode()) {
    module.exports = FirebasePost;
    return;
}

const mongoose = require('mongoose');

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
        enum: ['Women', 'Men', 'Couple', 'Kids', 'Wedding', 'Accessories'],
        required: true
    },
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

module.exports = mongoose.model('Post', PostSchema);
