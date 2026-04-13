const mongoose = require('mongoose');

// Job Application Schema - for employees applying to jobs posted by admin
const JobApplicationSchema = new mongoose.Schema({
    // Job reference (admin posts job, employees apply)
    job_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Job',
        required: true
    },
    
    // Applicant info
    applicant_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User',
        required: true
    },
    
    // Application details
    full_name: { type: String, required: true },
    email: { type: String },
    phone: { type: String, required: true },
    
    // Application documents
    cv_url: { type: String },         // URL to uploaded CV
    id_copy_url: { type: String },    // ID copy
    
    // Cover letter / motivation
    cover_letter: { type: String },
    
    // Application status - AliExpress style tracking
    status: { 
        type: String, 
        enum: [
            'Submitted',       // Initial application submitted
            'Under Review',   // Being reviewed by admin
            'Approved',       // Application accepted
            'Rejected',       // Application rejected
            'Interview'       // Called for interview
        ], 
        default: 'Submitted' 
    },
    
    // Admin notes
    admin_notes: { type: String },
    reviewed_by: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    },
    reviewed_at: Date,
    
    // Interview scheduling
    interview_date: Date,
    interview_location: String,
    
    // Timestamps
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now }
});

// Index for efficient queries
JobApplicationSchema.index({ job_id: 1 });
JobApplicationSchema.index({ applicant_id: 1 });
JobApplicationSchema.index({ status: 1 });
JobApplicationSchema.index({ created_at: -1 });

// Prevent duplicate applications
JobApplicationSchema.index({ job_id: 1, applicant_id: 1 }, { unique: true });

// Pre-save middleware
JobApplicationSchema.pre('save', function(next) {
    this.updated_at = new Date();
    next();
});

module.exports = mongoose.model('JobApplication', JobApplicationSchema);
