const express = require('express');
const router = express.Router();
const {
    register,
    login,
    me,
    updateMe,
    logout,
    googleSession,
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

// ── Registration & login ────────────────────────────────────────────────────
router.post(
    '/register',
    upload.fields([
        { name: 'legalDocument',  maxCount: 1 },
        { name: 'nationalIdPhoto', maxCount: 1 },
        { name: 'profileImage',   maxCount: 1 }
    ]),
    register
);
router.post('/login', login);
router.get('/me',  auth, me);
router.put('/me',  auth, upload.single('profileImage'), updateMe);
router.post('/logout', logout);

// ── Google Sign-In (NextAuth / Google Console ID token → JWT) ───────────────
// Frontend sends:  POST /api/auth/google/session  { idToken: '<google-id-token>' }
// Backend verifies with Google OAuth2 tokeninfo, upserts MongoDB user, returns JWT.
router.post('/google/session', googleSession);

// ── Admin routes ────────────────────────────────────────────────────────────
router.post('/admin/login',           login);
router.post('/admin/forgot-password', forgotPassword);
router.post('/admin/verify-otp',      verifyOTP);
router.post('/admin/reset-password',  resetPassword);
router.put( '/admin/change-password', auth, adminOnly, changePassword);

// ── User password recovery ──────────────────────────────────────────────────
router.post('/forgot-password',      forgotPassword);
router.post('/verify-otp',           verifyOTP);
router.post('/reset-password',       resetPassword);
router.post('/forgot-password-link', forgotPasswordLink);
router.post('/reset-password-link',  resetPasswordLink);

module.exports = router;
