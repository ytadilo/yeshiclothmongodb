const express = require('express');
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
const optionalAuth = require('../middleware/optionalAuth');
const upload = require('../middleware/upload');

// Public routes
router.get('/', optionalAuth, getPosts);
router.get('/:id', optionalAuth, getPostById);
router.post('/:id/view', optionalAuth, incrementView);
router.post('/:id/share', optionalAuth, incrementShare);
router.post('/:id/bag', optionalAuth, incrementBag);
router.put('/order-count-visibility-all', auth, updateAllOrderCountVisibility);
router.put('/:id/order-count-visibility', auth, updateOrderCountVisibility);

// Protected routes
router.post('/like/:id', auth, likePost);
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
router.post('/', [auth, upload.array('images', 5)], (req, res, next) => {
    // Middleware to check admin role inline or inside controller
    if(req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    next();
}, createPost);

router.put('/:id', [auth, upload.array('images', 5)], (req, res, next) => {
    if(req.user.role !== 'admin') return res.status(403).json({ msg: 'Access denied' });
    next();
}, updatePost);
router.delete('/:id', auth, deletePost);

// Admin comment moderation
router.delete('/:id/comment/:commentId', auth, deleteComment);
router.put('/:id/comment/:commentId', auth, upload.single('image'), editComment);

module.exports = router;
