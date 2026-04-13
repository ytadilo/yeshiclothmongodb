const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const productController = require('../controllers/productController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed'));
    }
});

// Public Routes

// GET /api/products - Get all products
router.get('/', productController.getProducts);

// GET /api/products/featured - Get featured products
router.get('/featured', productController.getFeaturedProducts);

// GET /api/products/categories - Get product categories
router.get('/categories', productController.getCategories);

// GET /api/products/stats - Get product statistics (for admin dashboard)
router.get('/stats', protect, adminOnly, productController.getProductStats);

// GET /api/products/:id - Get single product
router.get('/:id', productController.getProduct);

// GET /api/products/slug/:slug - Get product by slug
router.get('/slug/:slug', productController.getProductBySlug);

// Admin Routes

// POST /api/products - Create product
router.post('/',
    protect,
    adminOnly,
    upload.fields([
        { name: 'images', maxCount: 10 },
        { name: 'thumbnail', maxCount: 1 }
    ]),
    productController.createProduct
);

// PUT /api/products/:id - Update product
router.put('/:id',
    protect,
    adminOnly,
    upload.fields([
        { name: 'images', maxCount: 10 },
        { name: 'thumbnail', maxCount: 1 }
    ]),
    productController.updateProduct
);

// DELETE /api/products/:id - Delete (archive) product
router.delete('/:id', protect, adminOnly, productController.deleteProduct);

// POST /api/products/:id/review - Add product review
router.post('/:id/review', protect, productController.addReview);

// POST /api/products/bulk - Bulk update products
router.post('/bulk', protect, adminOnly, productController.bulkUpdateProducts);

module.exports = router;
