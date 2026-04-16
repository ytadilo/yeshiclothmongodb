const express = require('express');
const multer = require('multer');
const router = express.Router();
const { 
    createPost, 
    updatePost,
    getPosts, 
    getPostById, 
    incrementView,
    incrementShare,
    incrementBag,
    updateOrderCountVisibility,
    updateAllOrderCountVisibility,
    likePost, 
    commentPost, 
    likeComment,
    favoriteComment,
    replyComment,
    deletePost,
    deleteComment,
    editComment
} = require('../controllers/postController');
const auth = require('../middleware/authMiddleware');
const { adminOnly } = require('../middleware/authMiddleware');
const optionalAuth = require('../middleware/optionalAuth');
const upload = require('../middleware/upload');

function resolveLegacyPostId(req, _res, next) {
    const candidate = req.params?.id
        || req.body?.postId
        || req.body?.post_id
        || req.body?.id
        || req.query?.postId
        || req.query?.post_id
        || req.query?.id;
    req.params = req.params || {};
    req.params.id = String(candidate || '').trim();
    return next();
}

// Public routes
router.get('/', optionalAuth, getPosts);
router.get('/:id', optionalAuth, getPostById);
router.post('/:id/view', optionalAuth, incrementView);
router.post('/:id/share', optionalAuth, incrementShare);
router.post('/:id/bag', optionalAuth, incrementBag);
router.post('/view', optionalAuth, resolveLegacyPostId, incrementView);
router.post('/share', optionalAuth, resolveLegacyPostId, incrementShare);
router.post('/bag', optionalAuth, resolveLegacyPostId, incrementBag);
router.put('/order-count-visibility-all', auth, adminOnly, updateAllOrderCountVisibility);
router.put('/:id/order-count-visibility', auth, adminOnly, updateOrderCountVisibility);

// Protected routes
router.post('/like/:id', auth, likePost);
router.post('/like', auth, resolveLegacyPostId, likePost);
router.post('/comment/:id', auth, upload.single('image'), commentPost);
router.post('/comment/like/:id/:comment_id', auth, likeComment);
router.post('/comment/favorite/:id/:comment_id', auth, favoriteComment);
router.post('/comment/reply/:id/:comment_id', auth, upload.single('image'), replyComment);

// Spec-aligned aliases
router.post('/:id/comment', auth, upload.single('image'), commentPost);
router.post('/:id/comment/:commentId/reply', auth, upload.single('image'), (req, res, next) => {
    req.params.comment_id = req.params.commentId;
    next();
}, replyComment);
router.post('/:id/comment/:commentId/like', auth, (req, res, next) => {
    req.params.comment_id = req.params.commentId;
    next();
}, likeComment);
router.post('/:id/comment/:commentId/favorite', auth, (req, res, next) => {
    req.params.comment_id = req.params.commentId;
    next();
}, favoriteComment);

// Admin routes
// Notice: 'image' is the key expected in form-data for the file
router.post('/', auth, adminOnly, upload.array('images', 5), createPost);

router.put('/:id', auth, adminOnly, upload.array('images', 5), updatePost);
router.delete('/:id', auth, adminOnly, deletePost);

// Admin comment moderation
router.delete('/:id/comment/:commentId', auth, adminOnly, deleteComment);
router.put('/:id/comment/:commentId', auth, adminOnly, upload.single('image'), editComment);

router.use((err, _req, res, _next) => {
    if (!err) {
        return res.status(500).json({ msg: 'Unknown upload error' });
    }

    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ msg: 'Uploaded file is too large. Max allowed size is 12MB.' });
        }
        return res.status(400).json({ msg: err.message || 'Upload failed' });
    }

    if (typeof err.message === 'string' && err.message.toLowerCase().includes('only image or pdf')) {
        return res.status(400).json({ msg: err.message });
    }

    return res.status(500).json({ msg: err.message || 'Server error' });
});

module.exports = router;
