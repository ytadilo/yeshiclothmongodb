const Product = require('../models/Product');
const Upload = require('../models/Upload');

// Get all products (public)
exports.getProducts = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            category,
            sort = '-created_at',
            min_price,
            max_price,
            featured,
            search,
            tag
        } = req.query;

        // Build query
        const query = {
            status: 'active',
            visibility: 'public'
        };

        if (category) {
            query.category = category;
        }

        if (featured === 'true') {
            query.featured = true;
        }

        if (tag) {
            query.tags = tag;
        }

        if (min_price || max_price) {
            query.base_price = {};
            if (min_price) query.base_price.$gte = Number(min_price);
            if (max_price) query.base_price.$lte = Number(max_price);
        }

        if (search) {
            query.$text = { $search: search };
        }

        // Execute query with pagination
        const products = await Product.find(query)
            .sort(sort)
            .limit(Number(limit))
            .skip((Number(page) - 1) * Number(limit));

        const total = await Product.countDocuments(query);

        res.json({
            success: true,
            data: products,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total,
                pages: Math.ceil(total / Number(limit))
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Get single product (public)
exports.getProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        
        if (!product) {
            return res.status(404).json({ msg: 'Product not found' });
        }

        // Check visibility
        if (product.visibility === 'hidden' && product.status !== 'active') {
            return res.status(404).json({ msg: 'Product not found' });
        }

        // Increment view count
        product.total_views += 1;
        await product.save();

        res.json({
            success: true,
            data: product
        });
    } catch (err) {
        console.error(err.message);
        if (err.kind === 'ObjectId') {
            return res.status(404).json({ msg: 'Product not found' });
        }
        res.status(500).send('Server Error');
    }
};

// Get product by slug (public)
exports.getProductBySlug = async (req, res) => {
    try {
        const product = await Product.findOne({ slug: req.params.slug });
        
        if (!product) {
            return res.status(404).json({ msg: 'Product not found' });
        }

        // Check visibility
        if (product.visibility === 'hidden' && product.status !== 'active') {
            return res.status(404).json({ msg: 'Product not found' });
        }

        // Increment view count
        product.total_views += 1;
        await product.save();

        res.json({
            success: true,
            data: product
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Get featured products (public)
exports.getFeaturedProducts = async (req, res) => {
    try {
        const { limit = 10 } = req.query;
        
        const products = await Product.getFeatured(Number(limit));

        res.json({
            success: true,
            data: products
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Get product categories (public)
exports.getCategories = async (req, res) => {
    try {
        const categories = await Product.aggregate([
            { $match: { status: 'active', visibility: 'public' } },
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            success: true,
            data: categories.map(c => ({
                name: c._id,
                count: c.count
            }))
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Create product (admin only)
exports.createProduct = async (req, res) => {
    try {
        const {
            name,
            description,
            short_description,
            base_price,
            sale_price,
            discount_percentage,
            category,
            sub_category,
            tags,
            stock_quantity,
            track_inventory,
            allow_backorder,
            low_stock_threshold,
            variations,
            sizing_type,
            size_guide,
            available_sizes,
            customizable,
            custom_options,
            production_time_days,
            materials_used,
            origin,
            status,
            visibility,
            featured,
            meta_title,
            meta_description,
            meta_keywords
        } = req.body;

        // Handle image uploads
        const images = [];
        if (req.files && req.files.images) {
            for (let i = 0; i < req.files.images.length; i++) {
                const file = req.files.images[i];
                const upload = await Upload.create({
                    originalName: file.originalname,
                    mimeType: file.mimetype,
                    size: file.size,
                    data: file.buffer,
                    visibility: 'public',
                    purpose: 'product_image'
                });
                
                images.push({
                    url: '/api/uploads/' + upload._id,
                    alt_text: name,
                    is_primary: i === 0
                });
            }
        }

        // Handle thumbnail
        let thumbnail = '';
        if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
            const file = req.files.thumbnail[0];
            const upload = await Upload.create({
                originalName: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
                data: file.buffer,
                visibility: 'public',
                purpose: 'product_thumbnail'
            });
            thumbnail = '/api/uploads/' + upload._id;
        }

        // Generate slug
        const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '');

        const product = new Product({
            name,
            slug,
            description,
            short_description,
            base_price,
            sale_price,
            discount_percentage,
            category,
            sub_category,
            tags: tags ? (Array.isArray(tags) ? tags : [tags]) : [],
            images: images.length > 0 ? images : undefined,
            thumbnail,
            stock_quantity,
            track_inventory,
            allow_backorder,
            low_stock_threshold,
            variations,
            sizing_type,
            size_guide,
            available_sizes,
            customizable,
            custom_options,
            production_time_days,
            materials_used,
            origin,
            status: status || 'active',
            visibility: visibility || 'public',
            featured: featured || false,
            meta_title,
            meta_description,
            meta_keywords,
            published_at: status === 'active' ? new Date() : undefined
        });

        await product.save();

        res.status(201).json({
            success: true,
            data: product
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Update product (admin only)
exports.updateProduct = async (req, res) => {
    try {
        let product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ msg: 'Product not found' });
        }

        const {
            name,
            description,
            short_description,
            base_price,
            sale_price,
            discount_percentage,
            category,
            sub_category,
            tags,
            stock_quantity,
            track_inventory,
            allow_backorder,
            low_stock_threshold,
            variations,
            sizing_type,
            size_guide,
            available_sizes,
            customizable,
            custom_options,
            production_time_days,
            materials_used,
            origin,
            status,
            visibility,
            featured,
            meta_title,
            meta_description,
            meta_keywords
        } = req.body;

        // Handle new image uploads
        let images = [...(product.images || [])];
        if (req.files && req.files.images) {
            for (let i = 0; i < req.files.images.length; i++) {
                const file = req.files.images[i];
                const upload = await Upload.create({
                    originalName: file.originalname,
                    mimeType: file.mimetype,
                    size: file.size,
                    data: file.buffer,
                    visibility: 'public',
                    purpose: 'product_image'
                });
                
                images.push({
                    url: '/api/uploads/' + upload._id,
                    alt_text: name || product.name,
                    is_primary: images.length === 0 && i === 0
                });
            }
        }

        // Handle thumbnail
        let thumbnail = product.thumbnail;
        if (req.files && req.files.thumbnail && req.files.thumbnail[0]) {
            const file = req.files.thumbnail[0];
            const upload = await Upload.create({
                originalName: file.originalname,
                mimeType: file.mimetype,
                size: file.size,
                data: file.buffer,
                visibility: 'public',
                purpose: 'product_thumbnail'
            });
            thumbnail = '/api/uploads/' + upload._id;
        }

        // Update fields
        const updateData = {
            name: name || product.name,
            description: description || product.description,
            short_description: short_description || product.short_description,
            base_price: base_price || product.base_price,
            sale_price: sale_price !== undefined ? sale_price : product.sale_price,
            discount_percentage: discount_percentage !== undefined ? discount_percentage : product.discount_percentage,
            category: category || product.category,
            sub_category: sub_category || product.sub_category,
            tags: tags ? (Array.isArray(tags) ? tags : [tags]) : product.tags,
            images,
            thumbnail,
            stock_quantity: stock_quantity !== undefined ? stock_quantity : product.stock_quantity,
            track_inventory: track_inventory !== undefined ? track_inventory : product.track_inventory,
            allow_backorder: allow_backorder !== undefined ? allow_backorder : product.allow_backorder,
            low_stock_threshold: low_stock_threshold || product.low_stock_threshold,
            variations: variations || product.variations,
            sizing_type: sizing_type || product.sizing_type,
            size_guide: size_guide || product.size_guide,
            available_sizes: available_sizes || product.available_sizes,
            customizable: customizable !== undefined ? customizable : product.customizable,
            custom_options: custom_options || product.custom_options,
            production_time_days: production_time_days || product.production_time_days,
            materials_used: materials_used || product.materials_used,
            origin: origin || product.origin,
            status: status || product.status,
            visibility: visibility || product.visibility,
            featured: featured !== undefined ? featured : product.featured,
            meta_title: meta_title || product.meta_title,
            meta_description: meta_description || product.meta_description,
            meta_keywords: meta_keywords || product.meta_keywords
        };

        // Update slug if name changed
        if (name && name !== product.name) {
            updateData.slug = name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/(^-|-$)/g, '');
        }

        // Set published_at if activating
        if (status === 'active' && product.status !== 'active') {
            updateData.published_at = new Date();
        }

        product = await Product.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            data: product
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Delete product (admin only)
exports.deleteProduct = async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ msg: 'Product not found' });
        }

        // Instead of hard delete, archive the product
        product.status = 'archived';
        product.visibility = 'hidden';
        await product.save();

        res.json({
            success: true,
            msg: 'Product archived successfully'
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Get product stats (admin only)
exports.getProductStats = async (req, res) => {
    try {
        const stats = await Product.aggregate([
            { $match: { status: { $ne: 'archived' } } },
            {
                $group: {
                    _id: null,
                    total_products: { $sum: 1 },
                    total_views: { $sum: '$total_views' },
                    total_sold: { $sum: '$total_sold' },
                    avg_price: { $avg: '$base_price' },
                    categories: { $addToSet: '$category' }
                }
            }
        ]);

        const categoryStats = await Product.aggregate([
            { $match: { status: { $ne: 'archived' } } },
            {
                $group: {
                    _id: '$category',
                    count: { $sum: 1 },
                    avg_price: { $avg: '$base_price' },
                    total_sold: { $sum: '$total_sold' }
                }
            },
            { $sort: { count: -1 } }
        ]);

        const lowStockProducts = await Product.find({
            status: 'active',
            track_inventory: true,
            $expr: { $lte: ['$stock_quantity', '$low_stock_threshold'] }
        }).select('name stock_quantity category');

        res.json({
            success: true,
            data: {
                overview: stats[0] || {
                    total_products: 0,
                    total_views: 0,
                    total_sold: 0,
                    avg_price: 0,
                    categories: []
                },
                by_category: categoryStats,
                low_stock: lowStockProducts
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Add product review/rating
exports.addReview = async (req, res) => {
    try {
        const { rating, review_text } = req.body;
        
        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ msg: 'Rating must be between 1 and 5' });
        }

        const product = await Product.findById(req.params.id);

        if (!product) {
            return res.status(404).json({ msg: 'Product not found' });
        }

        // Add rating
        await product.addRating(rating);

        // In a real implementation, you'd also save the review text to a separate Review model
        
        res.json({
            success: true,
            msg: 'Review added successfully',
            data: {
                rating: product.rating
            }
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

// Bulk update products (admin only)
exports.bulkUpdateProducts = async (req, res) => {
    try {
        const { product_ids, action, data } = req.body;

        if (!product_ids || !Array.isArray(product_ids)) {
            return res.status(400).json({ msg: 'Product IDs array is required' });
        }

        let result;

        switch (action) {
            case 'activate':
                result = await Product.updateMany(
                    { _id: { $in: product_ids } },
                    { $set: { status: 'active', visibility: 'public' } }
                );
                break;
            case 'deactivate':
                result = await Product.updateMany(
                    { _id: { $in: product_ids } },
                    { $set: { status: 'draft', visibility: 'hidden' } }
                );
                break;
            case 'feature':
                result = await Product.updateMany(
                    { _id: { $in: product_ids } },
                    { $set: { featured: true } }
                );
                break;
            case 'unfeature':
                result = await Product.updateMany(
                    { _id: { $in: product_ids } },
                    { $set: { featured: false } }
                );
                break;
            case 'delete':
                result = await Product.updateMany(
                    { _id: { $in: product_ids } },
                    { $set: { status: 'archived', visibility: 'hidden' } }
                );
                break;
            case 'update_category':
                if (!data.category) {
                    return res.status(400).json({ msg: 'Category is required for this action' });
                }
                result = await Product.updateMany(
                    { _id: { $in: product_ids } },
                    { $set: { category: data.category } }
                );
                break;
            default:
                return res.status(400).json({ msg: 'Invalid action' });
        }

        res.json({
            success: true,
            msg: `${result.modifiedCount} products updated`,
            modified: result.modifiedCount
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};
