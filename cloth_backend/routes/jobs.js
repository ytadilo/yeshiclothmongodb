const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const {
    createJobPosting,
    getJobPostings,
    getJobPosting,
    updateJobPosting,
    deleteJobPosting,
    getJobPostingStats,
    applyForJob,
    getMyApplications,
    getJobApplications,
    getAllApplications,
    updateApplicationStatus,
    uploadApplicationDocuments
} = require('../controllers/jobController');

// ======================
// JOB POSTING ROUTES
// ======================

// Public route - get all active job postings
router.get('/', getJobPostings);

// Public route - get single job posting
router.get('/:id', getJobPosting);

// Admin routes - create, update, delete job postings
router.post('/', auth, createJobPosting);
router.put('/:id', auth, updateJobPosting);
router.delete('/:id', auth, deleteJobPosting);

// Admin route - get job statistics
router.get('/stats/admin', auth, getJobPostingStats);

// ======================
// JOB APPLICATION ROUTES
// ======================

// Apply for a job (requires auth)
router.post('/apply', auth, applyForJob);

// Get my applications (for job seekers)
router.get('/applications/my', auth, getMyApplications);

// Upload documents for application
router.post('/:jobId/documents', auth, uploadApplicationDocuments);

// Admin routes - manage applications
router.get('/applications/all', auth, getAllApplications);
router.get('/applications/job/:jobId', auth, getJobApplications);
router.put('/applications/:id/status', auth, updateApplicationStatus);

module.exports = router;
