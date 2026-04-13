const JobPosting = require('../models/JobPosting');
const JobApplication = require('../models/JobApplication');
const User = require('../models/User');

// ======================
// JOB POSTING CONTROLLER (Admin posts jobs)
// ======================

// Create a new job posting (Admin only)
exports.createJobPosting = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied. Admin only.' });
        }

        const jobData = {
            ...req.body,
            posted_by: req.user.id
        };

        const jobPosting = new JobPosting(jobData);
        await jobPosting.save();

        res.status(201).json(jobPosting);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Get all job postings (Public - for job seekers)
exports.getJobPostings = async (req, res) => {
    try {
        const { status, category, city, job_type } = req.query;
        
        let query = {};
        
        // Public can only see active jobs
        if (req.user?.role === 'admin') {
            if (status) query.status = status;
        } else {
            query.status = 'active';
            // Also filter by deadline
            query.$or = [
                { deadline: { $gte: new Date() } },
                { deadline: { $exists: false } }
            ];
        }
        
        if (category) query.category = category;
        if (city) query['location.city'] = city;
        if (job_type) query.job_type = job_type;

        const jobPostings = await JobPosting.find(query)
            .populate('posted_by', 'fullName')
            .sort({ is_featured: -1, is_urgent: -1, created_at: -1 });

        res.json(jobPostings);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Get single job posting
exports.getJobPosting = async (req, res) => {
    try {
        const jobPosting = await JobPosting.findById(req.params.id)
            .populate('posted_by', 'fullName');

        if (!jobPosting) {
            return res.status(404).json({ msg: 'Job posting not found' });
        }

        res.json(jobPosting);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Update job posting (Admin only)
exports.updateJobPosting = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied. Admin only.' });
        }

        let jobPosting = await JobPosting.findById(req.params.id);

        if (!jobPosting) {
            return res.status(404).json({ msg: 'Job posting not found' });
        }

        // Update fields
        const allowedUpdates = [
            'title', 'description', 'requirements', 'responsibilities',
            'job_type', 'category', 'location', 'salary', 'benefits',
            'required_experience', 'education_level', 'age_range',
            'deadline', 'positions_available', 'status', 'is_featured', 'is_urgent'
        ];

        allowedUpdates.forEach(field => {
            if (req.body[field] !== undefined) {
                jobPosting[field] = req.body[field];
            }
        });

        if (req.body.status === 'closed') {
            jobPosting.closed_at = new Date();
        }

        await jobPosting.save();
        res.json(jobPosting);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Delete job posting (Admin only)
exports.deleteJobPosting = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied. Admin only.' });
        }

        const jobPosting = await JobPosting.findById(req.params.id);

        if (!jobPosting) {
            return res.status(404).json({ msg: 'Job posting not found' });
        }

        // Delete all applications for this job
        await JobApplication.deleteMany({ job_id: req.params.id });

        await jobPosting.deleteOne();
        res.json({ msg: 'Job posting deleted successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Get job posting statistics (Admin)
exports.getJobPostingStats = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied. Admin only.' });
        }

        const totalJobs = await JobPosting.countDocuments();
        const activeJobs = await JobPosting.countDocuments({ status: 'active' });
        const closedJobs = await JobPosting.countDocuments({ status: 'closed' });
        
        const totalApplications = await JobApplication.countDocuments();
        const pendingApplications = await JobApplication.countDocuments({ status: 'Submitted' });
        const underReview = await JobApplication.countDocuments({ status: 'Under Review' });
        const approvedApplications = await JobApplication.countDocuments({ status: 'Approved' });
        const rejectedApplications = await JobApplication.countDocuments({ status: 'Rejected' });

        res.json({
            jobs: { total: totalJobs, active: activeJobs, closed: closedJobs },
            applications: {
                total: totalApplications,
                pending: pendingApplications,
                underReview,
                approved: approvedApplications,
                rejected: rejectedApplications
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// ======================
// JOB APPLICATION CONTROLLER (Job seekers apply)
// ======================

// Apply for a job
exports.applyForJob = async (req, res) => {
    try {
        const { job_id, full_name, email, phone, cover_letter } = req.body;
        
        // Verify job exists and is active
        const jobPosting = await JobPosting.findById(job_id);
        if (!jobPosting) {
            return res.status(404).json({ msg: 'Job posting not found' });
        }
        if (jobPosting.status !== 'active') {
            return res.status(400).json({ msg: 'This job is no longer accepting applications' });
        }
        if (jobPosting.deadline && new Date(jobPosting.deadline) < new Date()) {
            return res.status(400).json({ msg: 'Application deadline has passed' });
        }

        // Check if user already applied
        const existingApplication = await JobApplication.findOne({
            job_id,
            applicant_id: req.user.id
        });
        
        if (existingApplication) {
            return res.status(400).json({ msg: 'You have already applied for this job' });
        }

        // Create application
        const application = new JobApplication({
            job_id,
            applicant_id: req.user.id,
            full_name: full_name || req.user.fullName,
            email: email || req.user.email,
            phone: phone || req.user.phone,
            cover_letter
        });

        await application.save();

        // Increment application count on job
        await JobPosting.findByIdAndUpdate(job_id, {
            $inc: { current_applications: 1 }
        });

        res.status(201).json(application);
    } catch (err) {
        console.error(err.message);
        if (err.code === 11000) {
            return res.status(400).json({ msg: 'You have already applied for this job' });
        }
        res.status(500).send('Server Error');
    }
};

// Get my applications (for job seeker)
exports.getMyApplications = async (req, res) => {
    try {
        const applications = await JobApplication.find({ applicant_id: req.user.id })
            .populate({
                path: 'job_id',
                select: 'title category location salary status'
            })
            .sort({ created_at: -1 });

        res.json(applications);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Get applications for a specific job (Admin)
exports.getJobApplications = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied. Admin only.' });
        }

        const applications = await JobApplication.find({ job_id: req.params.jobId })
            .populate('applicant_id', 'fullName email phone approval_status')
            .sort({ created_at: -1 });

        res.json(applications);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Get all applications (Admin)
exports.getAllApplications = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied. Admin only.' });
        }

        const { status, job_id } = req.query;
        
        let query = {};
        if (status) query.status = status;
        if (job_id) query.job_id = job_id;

        const applications = await JobApplication.find(query)
            .populate('applicant_id', 'fullName email phone approval_status')
            .populate({
                path: 'job_id',
                select: 'title category location'
            })
            .sort({ created_at: -1 });

        res.json(applications);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Update application status (Admin)
exports.updateApplicationStatus = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied. Admin only.' });
        }

        const { status, admin_notes, interview_date, interview_location } = req.body;

        let application = await JobApplication.findById(req.params.id);

        if (!application) {
            return res.status(404).json({ msg: 'Application not found' });
        }

        application.status = status || application.status;
        application.admin_notes = admin_notes || application.admin_notes;
        application.reviewed_by = req.user.id;
        application.reviewed_at = new Date();

        if (interview_date) application.interview_date = interview_date;
        if (interview_location) application.interview_location = interview_location;

        await application.save();
        res.json(application);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Upload application documents (CV, ID)
exports.uploadApplicationDocuments = async (req, res) => {
    try {
        const { cv_url, id_copy_url } = req.body;

        const application = await JobApplication.findOne({
            job_id: req.params.jobId,
            applicant_id: req.user.id
        });

        if (!application) {
            return res.status(404).json({ msg: 'Application not found' });
        }

        if (cv_url) application.cv_url = cv_url;
        if (id_copy_url) application.id_copy_url = id_copy_url;

        await application.save();
        res.json(application);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
