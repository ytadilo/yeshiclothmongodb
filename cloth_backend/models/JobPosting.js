const mongoose = require('mongoose');

// Job Posting Schema - for admin to post job openings
const JobPostingSchema = new mongoose.Schema({
    // Job details
    title: { type: String, required: true },
    description: { type: String, required: true },
    requirements: { type: String },        // Job requirements
    responsibilities: { type: String },      // Key responsibilities
    
    // Job type and category
    job_type: { 
        type: String, 
        enum: ['full_time', 'part_time', 'contract', 'internship'],
        default: 'full_time'
    },
    category: { 
        type: String, 
        enum: [
            'store_worker',      // Store assistant
            'delivery_driver',   // Delivery personnel
            'photographer',       // Product photography
            'social_media',      // Social media manager
            'tailor',            // Sewing/tailoring
            'designer',          // Fashion designer
            'customer_service',  // Customer support
            'accounting',        // Finance/accounts
            'manager',           // Store/branch manager
            'other'              // Other positions
        ],
        default: 'other'
    },
    
    // Location
    location: {
        city: { type: String, required: true },      // e.g., Addis Ababa, Gondar
        sub_city: { type: String },                  // Sub-city
        address: { type: String }                    // Specific address
    },
    
    // Salary and benefits
    salary: {
        amount: Number,
        currency: { type: String, default: 'ETB' },
        period: { type: String, enum: ['monthly', 'hourly', 'negotiable'], default: 'monthly' }
    },
    benefits: [String],  // e.g., ['Transport', 'Lunch', 'Insurance']
    
    // Requirements
    required_experience: { type: String },  // e.g., '1-2 years'
    education_level: { type: String },      // e.g., 'High School', 'Degree'
    age_range: { type: String },           // e.g., '18-35'
    
    // Application deadline
    deadline: { type: Date },
    
    // Number of positions
    positions_available: { type: Number, default: 1 },
    current_applications: { type: Number, default: 0 },
    
    // Status
    status: { 
        type: String, 
        enum: ['draft', 'active', 'closed', 'archived'],
        default: 'active'
    },
    
    // Admin who posted
    posted_by: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true 
    },
    
    // Featured/urgent flag
    is_featured: { type: Boolean, default: false },
    is_urgent: { type: Boolean, default: false },
    
    // Timestamps
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    closed_at: Date
});

// Index for efficient queries
JobPostingSchema.index({ status: 1, created_at: -1 });
JobPostingSchema.index({ category: 1 });
JobPostingSchema.index({ 'location.city': 1 });
JobPostingSchema.index({ job_type: 1 });

// Pre-save middleware
JobPostingSchema.pre('save', function(next) {
    this.updated_at = new Date();
    next();
});

// Static method to get active jobs
JobPostingSchema.statics.getActiveJobs = function() {
    return this.find({ 
        status: 'active',
        $or: [
            { deadline: { $gte: new Date() } },
            { deadline: { $exists: false } }
        ]
    }).sort({ is_featured: -1, is_urgent: -1, created_at: -1 });
};

module.exports = mongoose.model('JobPosting', JobPostingSchema);
