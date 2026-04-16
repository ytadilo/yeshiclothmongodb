const express = require('express');
const router = express.Router();
const { 
    register, 
    login, 
    me,
    updateMe,
    logout,
    firebaseConfig,
    firebaseSession,
    googleConfig,
    googleLogin,
    forgotPassword, 
    verifyOTP, 
    resetPassword, 
    forgotPasswordLink,
    resetPasswordLink,
    changePassword
} = require('../controllers/authController');
const auth = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

router.post(
    '/register',
    upload.fields([
        { name: 'legalDocument', maxCount: 1 },
        { name: 'nationalIdPhoto', maxCount: 1 },
        { name: 'profileImage', maxCount: 1 }
    ]),
    register
);
router.post('/login', login);
router.get('/me', auth, me);
router.put('/me', auth, upload.single('profileImage'), updateMe);
router.post('/logout', logout);
router.get('/firebase/config', firebaseConfig);
router.post('/firebase/session', firebaseSession);

// Google Sign-In
router.get('/google/config', googleConfig);
router.post('/google', googleLogin);

// Admin Routes (mapped to same controllers for now, logic inside handles roles/context if needed)
router.post('/admin/login', login);
router.post('/admin/forgot-password', forgotPassword);
router.post('/admin/verify-otp', verifyOTP);
router.post('/admin/reset-password', resetPassword);
router.put('/admin/change-password', auth, adminOnly, changePassword);

// User Recovery Routes
router.post('/forgot-password', forgotPassword);
router.post('/verify-otp', verifyOTP);
router.post('/reset-password', resetPassword);

// User Recovery (email link)
router.post('/forgot-password-link', forgotPasswordLink);
router.post('/reset-password-link', resetPasswordLink);

module.exports = router;
