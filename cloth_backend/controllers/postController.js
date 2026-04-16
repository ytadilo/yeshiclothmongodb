const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Post = require('../models/Post');
const Order = require('../models/Order');
const User = require('../models/User');
const Upload = require('../models/Upload');
const Notification = require('../models/Notification');
const { pushEvent } = require('../utils/realtime');

const ALLOWED_POST_CATEGORIES = ['Women', 'Men', 'Couple', 'Kids', 'Wedding', 'Accessories'];
const ALLOWED_MEASUREMENT_PROFILES = ['women', 'men_tshirt', 'men_trousers'];

function parseImageLinks(rawValue) {
    if (rawValue === undefined || rawValue === null) return [];
    const text = String(rawValue).trim();
    if (!text) return [];

    const parts = text
        .split(/[\n,]+/)
        .map((v) => String(v || '').trim())
        .filter(Boolean);

    const valid = [];
    for (const part of parts) {
        try {
            const u = new URL(part);
            if (u.protocol === 'http:' || u.protocol === 'https:') {
                valid.push(u.toString());
            }
        } catch (_) {
            // Ignore invalid URL entries.
        }
    }

    return Array.from(new Set(valid));
}

function parseVideoLinks(rawValue) {
    if (rawValue === undefined || rawValue === null) return [];
    const text = String(rawValue).trim();
    if (!text) return [];

    const parts = text
        .split(/[\n,]+/)
        .map((v) => String(v || '').trim())
        .filter(Boolean);

    const valid = [];
    for (const part of parts) {
        try {
            const u = new URL(part);
            if (u.protocol === 'http:' || u.protocol === 'https:') {
                valid.push(u.toString());
            }
        } catch (_) {
            // Ignore invalid URL entries.
        }
    }

    return Array.from(new Set(valid));
}

function parseCountryList(rawValue) {
    if (rawValue === undefined || rawValue === null) return [];
    const text = String(rawValue || '').trim();
    if (!text) return [];
    return Array.from(
        new Set(
            text
                .split(/[\n,]+/)
                .map((v) => String(v || '').trim())
                .filter(Boolean)
        )
    );
}

function parseStringList(rawValue) {
    if (rawValue === undefined || rawValue === null) return [];
    if (Array.isArray(rawValue)) {
        return Array.from(new Set(rawValue.map((row) => String(row || '').trim()).filter(Boolean)));
    }
    if (typeof rawValue === 'object') {
        return [];
    }

    const text = String(rawValue || '').trim();
    if (!text) return [];

    if (text.startsWith('[')) {
        try {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
                return Array.from(new Set(parsed.map((row) => String(row || '').trim()).filter(Boolean)));
            }
        } catch (_) {
            // fall through to delimiter parsing
        }
    }

    return Array.from(
        new Set(
            text
                .split(/[\n,]+/)
                .map((row) => String(row || '').trim())
                .filter(Boolean)
        )
    );
}

function parsePostCategories(rawCategory, rawCategories) {
    const selected = [
        ...parseStringList(rawCategories),
        ...parseStringList(rawCategory)
    ].filter((row) => ALLOWED_POST_CATEGORIES.includes(row));

    return Array.from(new Set(selected));
}

function buildCategoryLabel(categories) {
    const list = Array.isArray(categories) ? categories.map((row) => String(row || '').trim()).filter(Boolean) : [];
    return list.join(', ');
}

function parseMeasurementProfiles(rawValue) {
    return parseStringList(rawValue).filter((row) => ALLOWED_MEASUREMENT_PROFILES.includes(row));
}

function parseRemoveImageList(rawValue) {
    return parseStringList(rawValue);
}

function isModelQueryReady(model) {
    const readyState = model && model.db && typeof model.db.readyState === 'number'
        ? Number(model.db.readyState)
        : null;
    return readyState === null || readyState === 1;
}

function getRequestPostId(req) {
    const candidate = req?.params?.id
        || req?.body?.postId
        || req?.body?.post_id
        || req?.body?.id
        || req?.query?.postId
        || req?.query?.post_id
        || req?.query?.id;
    return String(candidate || '').trim();
}

async function findPostByRequest(req) {
    const postId = getRequestPostId(req);
    if (!postId || !Post || typeof Post.findById !== 'function' || !isModelQueryReady(Post)) {
        return null;
    }

    try {
        return await Post.findById(postId);
    } catch (_) {
        return null;
    }
}

function ensureCanAccessPublicPosts(req, res) {
    return true;
}

async function savePublicPostImageUpload(file, ownerUserId, purpose, postId) {
    if (!file || !file.buffer) return null;

    const uploadsDir = path.join(__dirname, '..', 'uploads', 'posts');
    await fs.promises.mkdir(uploadsDir, { recursive: true });

    const ext = path.extname(String(file.originalname || '')).slice(0, 16);
    const generatedName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    const absoluteFilePath = path.join(uploadsDir, generatedName);
    const relativeStoragePath = path.posix.join('posts', generatedName);

    await fs.promises.writeFile(absoluteFilePath, file.buffer);

    return Upload.create({
        originalName: file.originalname || 'upload',
        mimeType: file.mimetype || 'application/octet-stream',
        size: Number(file.size || 0),
        storage_path: relativeStoragePath,
        visibility: 'public',
        owner_user_id: ownerUserId || undefined,
        purpose: String(purpose || '').trim(),
        post_id: postId || undefined
    });
}

async function notifyCustomersAboutNewPost(postDoc) {
    if (!postDoc || !postDoc._id) return;

    const customers = await User.find({
        role: 'customer',
        status: 'active',
        isBanned: { $ne: true }
    }).select('_id').lean();

    if (!customers.length) return;

    const itemName = String(postDoc.title || 'A new design').trim();
    const title = `${itemName} is now available`;
    const body = 'Tap to view this clothing item.';

    const docs = await Notification.insertMany(
        customers.map((u) => ({
            user_id: u._id,
            type: 'new_product',
            reference_id: String(postDoc._id),
            title,
            body,
            destination: {
                path: '/post',
                query: { id: String(postDoc._id) }
            },
            is_read: false
        }))
    );

    docs.forEach((doc) => {
        pushEvent(doc.user_id, 'notification', {
            _id: doc._id,
            type: doc.type,
            title: doc.title,
            body: doc.body,
            reference_id: doc.reference_id,
            destination: doc.destination || { path: '/post', query: { id: String(postDoc._id) } },
            is_read: doc.is_read,
            timestamp: doc.timestamp
        });
    });
}

async function getOrderCountMapByPostIds(postIds) {
    const ids = (Array.isArray(postIds) ? postIds : []).filter(Boolean);
    if (!ids.length) return new Map();

    const objectIdCtor = Post && Post.base && Post.base.Types && typeof Post.base.Types.ObjectId === 'function'
        ? Post.base.Types.ObjectId
        : null;
    if (!objectIdCtor || !Order || typeof Order.aggregate !== 'function' || !isModelQueryReady(Order)) {
        return new Map();
    }

    const toObjectId = (value) => {
        try {
            return new objectIdCtor(String(value));
        } catch (_) {
            return null;
        }
    };

    const objectIds = ids.map(toObjectId).filter(Boolean);
    if (!objectIds.length) return new Map();

    let productCounts = [];
    let customCounts = [];
    try {
        [productCounts, customCounts] = await Promise.all([
            Order.aggregate([
                { $match: { productId: { $in: objectIds } } },
                { $group: { _id: '$productId', count: { $sum: 1 } } }
            ]),
            Order.aggregate([
                { $match: { post_id: { $in: objectIds } } },
                { $group: { _id: '$post_id', count: { $sum: 1 } } }
            ])
        ]);
    } catch (error) {
        console.error('getOrderCountMapByPostIds error:', error?.message || error);
        return new Map();
    }

    const map = new Map();
    const addCount = (row) => {
        if (!row || !row._id) return;
        const key = String(row._id);
        map.set(key, Number(map.get(key) || 0) + Number(row.count || 0));
    };

    productCounts.forEach(addCount);
    customCounts.forEach(addCount);
    return map;
}

function attachOrderCount(postDoc, orderCountMap) {
    if (!postDoc) return postDoc;
    const plain = typeof postDoc.toObject === 'function' ? postDoc.toObject() : { ...postDoc };
    const id = String(plain._id || '');
    plain.orderCount = Number((orderCountMap && orderCountMap.get(id)) || 0);
    if (typeof plain.orderCountVisible !== 'boolean') {
        plain.orderCountVisible = true;
    }
    return plain;
}

// @desc    Create a post
// @route   POST /api/posts
// @access  Admin
exports.createPost = async (req, res) => {
    try {
        const {
            title,
            description,
            category,
            categories,
            measurementProfiles,
            measurement_profiles,
            videoUrl,
            videoUrls,
            priceETB,
            oldPriceETB,
            imageLink,
            imageLinks,
            shippingPriceETB,
            freeShipping,
            stockQuantity,
            unlimitedStock,
            deliveryScope,
            deliveryCountries
        } = req.body;

        const parsedPriceETB = Number(priceETB);
        if (!Number.isFinite(parsedPriceETB) || parsedPriceETB <= 0) {
            return res.status(400).json({ msg: 'Price is required (ETB)' });
        }

        let parsedOldPriceETB = null;
        if (oldPriceETB !== undefined && String(oldPriceETB).trim() !== '') {
            parsedOldPriceETB = Number(oldPriceETB);
            if (!Number.isFinite(parsedOldPriceETB) || parsedOldPriceETB <= 0) {
                return res.status(400).json({ msg: 'Invalid old price (ETB)' });
            }
            if (!(parsedPriceETB < parsedOldPriceETB)) {
                return res.status(400).json({ msg: 'New price must be less than old price' });
            }
        }

        const isFreeShipping = String(freeShipping).toLowerCase() === 'true' || String(freeShipping) === '1' || freeShipping === true;
        const isUnlimitedStock = String(unlimitedStock).toLowerCase() === 'true' || String(unlimitedStock) === '1' || unlimitedStock === true;
        let parsedStockQuantity = 0;
        if (!isUnlimitedStock) {
            parsedStockQuantity = Number(stockQuantity);
            if (!Number.isFinite(parsedStockQuantity) || parsedStockQuantity < 0) {
                return res.status(400).json({ msg: 'Invalid stock quantity' });
            }
            parsedStockQuantity = Math.floor(parsedStockQuantity);
        }

        let parsedShippingPriceETB = null;
        if (!isFreeShipping && shippingPriceETB !== undefined && String(shippingPriceETB).trim() !== '') {
            parsedShippingPriceETB = Number(shippingPriceETB);
            if (!Number.isFinite(parsedShippingPriceETB) || parsedShippingPriceETB < 0) {
                return res.status(400).json({ msg: 'Invalid shipping price (ETB)' });
            }
        }

        const parsedVideoUrls = Array.from(new Set([
            ...parseVideoLinks(videoUrls),
            ...parseVideoLinks(videoUrl)
        ]));

        const normalizedDeliveryScope = ['ethiopia_only', 'selected_countries', 'all_countries'].includes(String(deliveryScope || '').trim())
            ? String(deliveryScope || '').trim()
            : 'ethiopia_only';
        const normalizedDeliveryCountries = normalizedDeliveryScope === 'selected_countries'
            ? parseCountryList(deliveryCountries)
            : [];
        if (normalizedDeliveryScope === 'selected_countries' && normalizedDeliveryCountries.length < 1) {
            return res.status(400).json({ msg: 'Please select at least one allowed delivery country.' });
        }

        const selectedCategories = parsePostCategories(category, categories);
        if (!selectedCategories.length) {
            return res.status(400).json({ msg: 'Please select at least one category.' });
        }

        const selectedMeasurementProfiles = Array.from(new Set([
            ...parseMeasurementProfiles(measurementProfiles),
            ...parseMeasurementProfiles(measurement_profiles)
        ]));

        const newPost = new Post({
            title,
            description,
            category: buildCategoryLabel(selectedCategories),
            categories: selectedCategories,
            measurement_profiles: selectedMeasurementProfiles,
            images: [],
            videoUrl: parsedVideoUrls[0] || '',
            videoUrls: parsedVideoUrls,
            priceETB: parsedPriceETB,
            oldPriceETB: parsedOldPriceETB,
            shippingPriceETB: isFreeShipping ? null : parsedShippingPriceETB,
            freeShipping: isFreeShipping,
            delivery_scope: normalizedDeliveryScope,
            delivery_countries: normalizedDeliveryCountries,
            stock_quantity: isUnlimitedStock ? 0 : parsedStockQuantity,
            unlimited_stock: isUnlimitedStock,
            created_by: req.user.id
        });

        const post = await newPost.save();

        const linkedImages = [
            ...parseImageLinks(imageLink),
            ...parseImageLinks(imageLinks)
        ];
        if (linkedImages.length) {
            post.images = Array.from(new Set(linkedImages));
        }

        // Store uploaded images into MongoDB and save URLs on the post
        if (Array.isArray(req.files) && req.files.length) {
            const uploadDocs = await Upload.insertMany(
                req.files
                    .filter((f) => f && f.buffer)
                    .map((f) => ({
                        originalName: f.originalname,
                        mimeType: f.mimetype,
                        size: f.size,
                        data: f.buffer,
                        visibility: 'public',
                        owner_user_id: req.user.id,
                        purpose: 'post_image',
                        post_id: post._id
                    }))
            );

            const uploadedImages = uploadDocs.map((u) => '/api/uploads/' + u._id);
                    post.images = Array.from(new Set([...uploadedImages, ...(post.images || [])]));
        }

        await post.save();

        try {
            await notifyCustomersAboutNewPost(post);
        } catch (_) {
            // Do not fail post creation if notification fanout fails.
        }

        res.json(post);
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: 'Server error' });
    }
};

// @desc    Update a post
// @route   PUT /api/posts/:id
// @access  Admin
exports.updatePost = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ msg: 'Post not found' });

        const {
            title,
            description,
            category,
            categories,
            measurementProfiles,
            measurement_profiles,
            videoUrl,
            videoUrls,
            priceETB,
            oldPriceETB,
            imageLink,
            imageLinks,
            originalPrimaryImage,
            replacePrimaryImage,
            removeImages,
            shippingPriceETB,
            freeShipping,
            stockQuantity,
            unlimitedStock,
            deliveryScope,
            deliveryCountries
        } = req.body;
        if (typeof title === 'string' && title.trim()) post.title = title.trim();
        if (typeof description === 'string' && description.trim()) post.description = description.trim();
        if (category !== undefined || categories !== undefined) {
            const selectedCategories = parsePostCategories(category, categories);
            if (!selectedCategories.length) {
                return res.status(400).json({ msg: 'Please select at least one category.' });
            }
            post.categories = selectedCategories;
            post.category = buildCategoryLabel(selectedCategories);
        }
        if (measurementProfiles !== undefined || measurement_profiles !== undefined) {
            post.measurement_profiles = Array.from(new Set([
                ...parseMeasurementProfiles(measurementProfiles),
                ...parseMeasurementProfiles(measurement_profiles)
            ]));
        }
        if (videoUrls !== undefined || videoUrl !== undefined) {
            const parsedVideoUrls = Array.from(new Set([
                ...parseVideoLinks(videoUrls),
                ...parseVideoLinks(videoUrl)
            ]));
            post.videoUrls = parsedVideoUrls;
            post.videoUrl = parsedVideoUrls[0] || '';
        }

        if (priceETB !== undefined) {
            const parsedPriceETB = Number(priceETB);
            if (!Number.isFinite(parsedPriceETB) || parsedPriceETB <= 0) {
                return res.status(400).json({ msg: 'Invalid price (ETB)' });
            }
            post.priceETB = parsedPriceETB;
        }

        if (oldPriceETB !== undefined) {
            const text = String(oldPriceETB).trim();
            if (!text) {
                post.oldPriceETB = null;
            } else {
                const parsedOldPriceETB = Number(text);
                if (!Number.isFinite(parsedOldPriceETB) || parsedOldPriceETB <= 0) {
                    return res.status(400).json({ msg: 'Invalid old price (ETB)' });
                }
                post.oldPriceETB = parsedOldPriceETB;
            }
        }

        if (Number.isFinite(Number(post.oldPriceETB)) && Number(post.oldPriceETB) > 0) {
            if (!(Number(post.priceETB) < Number(post.oldPriceETB))) {
                return res.status(400).json({ msg: 'New price must be less than old price' });
            }
        }

        if (freeShipping !== undefined) {
            const isFreeShipping = String(freeShipping).toLowerCase() === 'true' || String(freeShipping) === '1' || freeShipping === true;
            post.freeShipping = isFreeShipping;
            if (isFreeShipping) {
                post.shippingPriceETB = null;
            }
        }

        if (shippingPriceETB !== undefined) {
            const text = String(shippingPriceETB).trim();
            if (!text) {
                if (!post.freeShipping) {
                    post.shippingPriceETB = null;
                }
            } else {
                const parsedShippingPriceETB = Number(text);
                if (!Number.isFinite(parsedShippingPriceETB) || parsedShippingPriceETB < 0) {
                    return res.status(400).json({ msg: 'Invalid shipping price (ETB)' });
                }
                if (!post.freeShipping) {
                    post.shippingPriceETB = parsedShippingPriceETB;
                }
            }
        }

        if (unlimitedStock !== undefined) {
            const isUnlimited = String(unlimitedStock).toLowerCase() === 'true' || String(unlimitedStock) === '1' || unlimitedStock === true;
            post.unlimited_stock = isUnlimited;
            if (isUnlimited) {
                post.stock_quantity = 0;
            }
        }

        if (stockQuantity !== undefined) {
            const parsed = Number(stockQuantity);
            if (!Number.isFinite(parsed) || parsed < 0) {
                return res.status(400).json({ msg: 'Invalid stock quantity' });
            }
            post.stock_quantity = Math.floor(parsed);
        }

        if (deliveryScope !== undefined) {
            const normalizedDeliveryScope = ['ethiopia_only', 'selected_countries', 'all_countries'].includes(String(deliveryScope || '').trim())
                ? String(deliveryScope || '').trim()
                : 'ethiopia_only';
            post.delivery_scope = normalizedDeliveryScope;
            if (normalizedDeliveryScope !== 'selected_countries') {
                post.delivery_countries = [];
            }
        }

        if (deliveryCountries !== undefined || String(post.delivery_scope || '') === 'selected_countries') {
            const countries = parseCountryList(deliveryCountries);
            if (String(post.delivery_scope || '') === 'selected_countries' && countries.length < 1) {
                return res.status(400).json({ msg: 'Please select at least one allowed delivery country.' });
            }
            post.delivery_countries = countries;
        }

        const primaryLinkedImages = parseImageLinks(imageLink);
        const primaryLinkedImage = primaryLinkedImages[0] || '';
        const extraLinkedImages = parseImageLinks(imageLinks);
        const imagesToRemove = parseRemoveImageList(removeImages);
        let nextImages = Array.isArray(post.images) ? post.images.filter(Boolean) : [];

        if (imagesToRemove.length) {
            const removeSet = new Set(imagesToRemove);
            nextImages = nextImages.filter((src) => !removeSet.has(String(src || '').trim()));
        }

        let uploadedImages = [];
        if (Array.isArray(req.files) && req.files.length) {
            const uploadDocs = await Upload.insertMany(
                req.files
                    .filter((f) => f && f.buffer)
                    .map((f) => ({
                        originalName: f.originalname,
                        mimeType: f.mimetype,
                        size: f.size,
                        data: f.buffer,
                        visibility: 'public',
                        owner_user_id: req.user.id,
                        purpose: 'post_image',
                        post_id: post._id
                    }))
            );
            uploadedImages = uploadDocs.map((u) => '/api/uploads/' + u._id);
        }

        const shouldReplacePrimaryImage = String(replacePrimaryImage || '').toLowerCase() === 'true' || replacePrimaryImage === true;
        const oldPrimaryImage = String(originalPrimaryImage || '').trim();

        if (shouldReplacePrimaryImage && oldPrimaryImage) {
            nextImages = nextImages.filter((src) => String(src || '').trim() !== oldPrimaryImage);
        }

        if (primaryLinkedImage) {
            nextImages = nextImages.filter((src) => String(src || '').trim() !== primaryLinkedImage);
            nextImages.unshift(primaryLinkedImage);
        }

        if (uploadedImages.length) {
            nextImages = [...uploadedImages, ...nextImages];
        }

        if (extraLinkedImages.length) {
            nextImages = [...nextImages, ...extraLinkedImages];
        }

        post.images = Array.from(new Set(nextImages.map((src) => String(src || '').trim()).filter(Boolean)));

        await post.save();
        res.json(post);
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: 'Server error' });
    }
};

// @desc    Get all posts
// @route   GET /api/posts
// @access  Public
exports.getPosts = async (req, res) => {
    try {
        if (!ensureCanAccessPublicPosts(req, res)) return;
        if (!Post || typeof Post.find !== 'function' || !isModelQueryReady(Post)) {
            return res.json([]);
        }
        const isAdmin = req.user && req.user.role === 'admin';
        const query = isAdmin
            ? {}
            : {
                $or: [
                    { unlimited_stock: true },
                    { unlimited_stock: { $exists: false } },
                    { stock_quantity: { $gt: 0 } }
                ]
            };
        const posts = await Post.find(query).sort({ created_at: -1 });
        const safePosts = Array.isArray(posts) ? posts : [];
        const orderCountMap = await getOrderCountMapByPostIds(safePosts.map((post) => post && post._id));
        return res.json(safePosts.map((post) => attachOrderCount(post, orderCountMap)));
    } catch (err) {
        console.error('getPosts error:', err?.message || err);
        return res.json([]);
    }
};

// @desc    Get post by ID
// @route   GET /api/posts/:id
// @access  Public
exports.getPostById = async (req, res) => {
    try {
        if (!ensureCanAccessPublicPosts(req, res)) return;
        if (!Post || typeof Post.findById !== 'function' || !isModelQueryReady(Post)) {
            return res.status(404).json({ msg: 'Post not found' });
        }
        const post = await Post.findById(req.params.id);
        if (!post) {
            return res.status(404).json({ msg: 'Post not found' });
        }
        const orderCountMap = await getOrderCountMapByPostIds([post._id]);
        res.json(attachOrderCount(post, orderCountMap));
    } catch (err) {
        if(err.kind === 'ObjectId') {
             return res.status(404).json({ msg: 'Post not found' });
        }
        console.error('getPostById error:', err?.message || err);
        return res.status(404).json({ msg: 'Post not found' });
    }
};

// @desc    Increment view count
// @route   POST /api/posts/:id/view
// @access  Public
exports.incrementView = async (req, res) => {
    try {
        if (!ensureCanAccessPublicPosts(req, res)) return;
        const post = await findPostByRequest(req);
        if (!post) return res.json({ viewCount: 0 });

        post.viewCount = Number(post.viewCount || 0) + 1;
        await post.save();
        res.json({ viewCount: post.viewCount });
    } catch (err) {
        console.error('incrementView error:', err?.message || err);
        return res.json({ viewCount: 0 });
    }
};

// @desc    Increment share count
// @route   POST /api/posts/:id/share
// @access  Public
exports.incrementShare = async (req, res) => {
    try {
        if (!ensureCanAccessPublicPosts(req, res)) return;
        const post = await findPostByRequest(req);
        if (!post) return res.json({ shareCount: 0 });

        post.shareCount = Number(post.shareCount || 0) + 1;
        await post.save();
        res.json({ shareCount: post.shareCount });
    } catch (err) {
        console.error('incrementShare error:', err?.message || err);
        return res.json({ shareCount: 0 });
    }
};

// @desc    Increment bag count
// @route   POST /api/posts/:id/bag
// @access  Public
exports.incrementBag = async (req, res) => {
    try {
        if (!ensureCanAccessPublicPosts(req, res)) return;
        const post = await findPostByRequest(req);
        if (!post) return res.json({ bagCount: 0 });

        post.bagCount = Number(post.bagCount || 0) + 1;
        await post.save();
        res.json({ bagCount: post.bagCount });
    } catch (err) {
        console.error('incrementBag error:', err?.message || err);
        return res.json({ bagCount: 0 });
    }
};

// @desc    Set one post order-count visibility
// @route   PUT /api/posts/:id/order-count-visibility
// @access  Admin
exports.updateOrderCountVisibility = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }
        const visible = req.body && req.body.visible;
        const isVisible = visible === true || String(visible).toLowerCase() === 'true' || String(visible) === '1';

        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ msg: 'Post not found' });

        post.orderCountVisible = isVisible;
        await post.save();

        res.json({ msg: 'Updated', postId: String(post._id), orderCountVisible: post.orderCountVisible });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: 'Server error' });
    }
};

// @desc    Set all posts order-count visibility
// @route   PUT /api/posts/order-count-visibility-all
// @access  Admin
exports.updateAllOrderCountVisibility = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }
        const visible = req.body && req.body.visible;
        const isVisible = visible === true || String(visible).toLowerCase() === 'true' || String(visible) === '1';

        const result = await Post.updateMany({}, { $set: { orderCountVisible: isVisible } });
        res.json({
            msg: 'Updated',
            orderCountVisible: isVisible,
            modifiedCount: Number(result && (result.modifiedCount || result.nModified) || 0)
        });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: 'Server error' });
    }
};

// @desc    Like a post
// @route   POST /api/posts/:id/like
// @access  Private
exports.likePost = async (req, res) => {
    try {
        const post = await findPostByRequest(req);
        if (!post) return res.json([]);

        const likes = Array.isArray(post.likes) ? post.likes : [];
        const currentUserId = String(req?.user?.id || '').trim();
        if (!currentUserId) return res.json(likes);

        const normalizedLikeUserIds = likes.map((like) => String((like && like.user) || like || ''));
        const existingIndex = normalizedLikeUserIds.indexOf(currentUserId);
        if (existingIndex >= 0) {
            likes.splice(existingIndex, 1);
        } else {
            const hasObjectShape = likes.some((like) => like && typeof like === 'object' && Object.prototype.hasOwnProperty.call(like, 'user'));
            likes.unshift(hasObjectShape ? { user: currentUserId } : currentUserId);
        }

        post.likes = likes;
        await post.save();
        res.json(Array.isArray(post.likes) ? post.likes : []);
    } catch (err) {
        console.error('likePost error:', err?.message || err);
        return res.json([]);
    }
};

// @desc    Comment on a post
// @route   POST /api/posts/:id/comment
// @access  Private
exports.commentPost = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-passwordHash');
        const post = await Post.findById(req.params.id);

        if (!post) return res.status(404).json({ msg: 'Post not found' });

        const parsedRating = Number(req.body.rating);
        if (!Number.isFinite(parsedRating) || parsedRating < 1 || parsedRating > 5) {
            return res.status(400).json({ msg: 'Rating is required (1-5)' });
        }

        const text = String(req.body.text || '').trim();
        const imageFile = req.file && req.file.buffer ? req.file : null;
        if (!text && !imageFile) {
            return res.status(400).json({ msg: 'Comment text or image is required' });
        }

        let imageUrl = '';
        if (imageFile) {
            const up = await savePublicPostImageUpload(
                imageFile,
                req.user && req.user.id ? req.user.id : undefined,
                'post_comment_image',
                post._id
            );
            imageUrl = '/api/uploads/' + up._id;
        }

        const commenterName = String(
            (user && (user.fullName || user.name || user.email))
            || req.user.fullName
            || req.user.name
            || 'Customer'
        ).trim();

        const newComment = {
            text,
            image_url: imageUrl,
            rating: Math.round(parsedRating),
            name: commenterName,
            user: req.user.id,
            likes: [],
            favorites: [],
            replies: []
        };

        post.comments.unshift(newComment);
        await post.save();
        res.json(post.comments);
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: 'Server error' });
    }
};

// @desc    Like a Comment
// @route   POST /api/posts/comment/like/:id/:comment_id
exports.likeComment = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ msg: 'Post not found' });

        const comment = post.comments.find(c => c.id === req.params.comment_id);
        if (!comment) return res.status(404).json({ msg: 'Comment not found' });

        if (comment.likes.includes(req.user.id)) {
            // Unlike
            comment.likes = comment.likes.filter(id => id.toString() !== req.user.id);
        } else {
            // Like
            comment.likes.push(req.user.id);
        }

        await post.save();
        res.json(post.comments);
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: 'Server error' });
    }
};

// @desc    Reply to a Comment
// @route   POST /api/posts/comment/reply/:id/:comment_id
exports.replyComment = async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-passwordHash');
        const post = await Post.findById(req.params.id);
        
        if (!post) return res.status(404).json({ msg: 'Post not found' });

        const comment = post.comments.find(c => c.id === req.params.comment_id);
        if (!comment) return res.status(404).json({ msg: 'Comment not found' });

        const text = String(req.body.text || '').trim();
        const imageFile = req.file && req.file.buffer ? req.file : null;
        if (!text && !imageFile) {
            return res.status(400).json({ msg: 'Reply text or image is required' });
        }

        let imageUrl = '';
        if (imageFile) {
            const up = await savePublicPostImageUpload(
                imageFile,
                req.user && req.user.id ? req.user.id : undefined,
                'post_comment_reply_image',
                post._id
            );
            imageUrl = '/api/uploads/' + up._id;
        }

        const replierName = String(
            (user && (user.fullName || user.name || user.email))
            || req.user.fullName
            || req.user.name
            || 'Customer'
        ).trim();

        const newReply = {
            user: req.user.id,
            text,
            image_url: imageUrl,
            name: replierName,
            likes: []
        };

        if (!comment.replies) comment.replies = [];
        comment.replies.push(newReply);
        
        await post.save();
        res.json(post.comments);
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: 'Server error' });
    }
};

// @desc    Favorite a Comment (Toggle)
// @route   POST /api/posts/comment/favorite/:id/:comment_id
exports.favoriteComment = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ msg: 'Post not found' });

        const comment = post.comments.find(c => c.id === req.params.comment_id);
        if (!comment) return res.status(404).json({ msg: 'Comment not found' });

        if (!comment.favorites) comment.favorites = [];

        if (comment.favorites.includes(req.user.id)) {
            comment.favorites = comment.favorites.filter(id => id.toString() !== req.user.id);
        } else {
            comment.favorites.push(req.user.id);
        }

        await post.save();
        res.json(post.comments);
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: 'Server error' });
    }
};

// @desc    Delete a post
// @route   DELETE /api/posts/:id
// @access  Admin
exports.deletePost = async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ msg: 'Post not found' });

        // Check user
        if (req.user.role !== 'admin') {
            return res.status(401).json({ msg: 'User not authorized' });
        }

        await post.deleteOne();
        res.json({ msg: 'Post removed' });
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: 'Server error' });
    }
};

// @desc    Delete a specific comment (admin)
// @route   DELETE /api/posts/:id/comment/:commentId
// @access  Admin
exports.deleteComment = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ msg: 'Post not found' });

        const idx = post.comments.findIndex(c => c.id === req.params.commentId);
        if (idx === -1) return res.status(404).json({ msg: 'Comment not found' });

        post.comments.splice(idx, 1);
        await post.save();
        res.json(post.comments);
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: 'Server error' });
    }
};

// @desc    Edit a specific comment text (admin)
// @route   PUT /api/posts/:id/comment/:commentId
// @access  Admin
exports.editComment = async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Access denied' });
        }

        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ msg: 'Post not found' });

        const comment = post.comments.find(c => c.id === req.params.commentId);
        if (!comment) return res.status(404).json({ msg: 'Comment not found' });

        const text = (req.body.text || '').toString().trim();
        const hasText = Object.prototype.hasOwnProperty.call(req.body || {}, 'text');
        const removeImage = ['1', 'true', 'yes', 'on'].includes(String(req.body?.remove_image || '').toLowerCase());
        const imageFile = req.file && req.file.buffer ? req.file : null;

        if (!hasText && !removeImage && !imageFile) {
            return res.status(400).json({ msg: 'Nothing to update' });
        }

        if (hasText) {
            if (!text && !comment.image_url && !imageFile && !removeImage) {
                return res.status(400).json({ msg: 'Text is required' });
            }
            comment.text = text;
        }

        if (removeImage) {
            comment.image_url = '';
        }

        if (imageFile) {
            const up = await savePublicPostImageUpload(
                imageFile,
                req.user && req.user.id ? req.user.id : undefined,
                'post_comment_image',
                post._id
            );
            comment.image_url = '/api/uploads/' + up._id;
        }

        if (!String(comment.text || '').trim() && !String(comment.image_url || '').trim()) {
            return res.status(400).json({ msg: 'Comment cannot be empty' });
        }

        await post.save();
        res.json(post.comments);
    } catch (err) {
        console.error(err.message);
        return res.status(500).json({ msg: 'Server error' });
    }
};
