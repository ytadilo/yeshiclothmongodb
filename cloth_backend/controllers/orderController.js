const Order = require('../models/Order');

const Upload = require('../models/Upload');
const Product = require('../models/Product');
const Post = require('../models/Post');
const User = require('../models/User');
const Notification = require('../models/Notification');
const SiteSettings = require('../models/SiteSettings');
const { getDatabaseProvider } = require('../utils/db');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function toNonNegativeNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function isValidInternationalPhone(value) {
    const v = String(value || '').trim().replace(/[\s\-().]/g, '');
    // Accept Ethiopian local format: 09XXXXXXXX or 07XXXXXXXX
    if (/^(09|07)\d{8}$/.test(v)) return true;
    // Accept short without leading zero: 9XXXXXXXX or 7XXXXXXXX
    if (/^(9|7)\d{8}$/.test(v)) return true;
    // Accept with country code: +2519XXXXXXXX, 2519XXXXXXXX etc
    if (/^(\+?251)(9|7)\d{8}$/.test(v)) return true;
    // Accept generic international: +[country][number]
    if (/^\+[1-9]\d{5,14}$/.test(v)) return true;
    return false;
}

function normalizeCountryName(value, fallback = 'Ethiopia') {
    const v = String(value || '').trim();
    return v || fallback;
}

function normalizeCountryCode(value, fallback = '+251') {
    const v = String(value || '').trim();
    if (!v) return fallback;
    if (/^\+[1-9]\d{0,3}$/.test(v)) return v;
    return fallback;
}

function isSupportedPostId(value) {
    const id = String(value || '').trim();
    return id.length > 0;
}

function isCountryAllowedByRule(country, ruleScope, ruleCountries) {
    const normalizedCountry = String(country || '').trim().toLowerCase();
    const scope = String(ruleScope || 'ethiopia_only').trim();
    const countries = Array.isArray(ruleCountries) ? ruleCountries : [];
    if (scope === 'all_countries') return true;
    if (scope === 'selected_countries') {
        return countries.some((c) => String(c || '').trim().toLowerCase() === normalizedCountry);
    }
    return normalizedCountry === 'ethiopia';
}

async function getGlobalDeliverySettings() {
    try {
        const doc = await SiteSettings.findOne({ key: 'default' }).select('delivery').lean();
        const d = doc && doc.delivery ? doc.delivery : {};
        const mode = String(d.default_mode || '').trim() === 'all_countries' ? 'all_countries' : 'ethiopia_only';
        return {
            default_mode: mode,
            default_country: normalizeCountryName(d.default_country, 'Ethiopia'),
            default_country_code: normalizeCountryCode(d.default_country_code, '+251'),
            allow_all_country_codes: d.allow_all_country_codes !== false
        };
    } catch (_) {
        return {
            default_mode: 'ethiopia_only',
            default_country: 'Ethiopia',
            default_country_code: '+251',
            allow_all_country_codes: true
        };
    }
}

function validateSimpleOrderPayload(body) {
    const errors = [];
    const customerInfo = body?.customerInfo && typeof body.customerInfo === 'object' ? body.customerInfo : {};
    const productName = String(body?.productName || body?.clothDetails?.category || 'Custom Cloth').trim();
    const fullName = String(customerInfo?.fullName || body?.customerName || '').trim();
    const phone = String(customerInfo?.phone || body?.phone || '').trim();
    const country = String(customerInfo?.country || body?.country || 'Ethiopia').trim();
    const region = String(customerInfo?.region || body?.region || '').trim();
    const city = String(customerInfo?.city || body?.city || '').trim();
    const zipCode = String(customerInfo?.zipCode || body?.zipCode || body?.zip_code || '').trim();
    const address = String(customerInfo?.address || body?.address || '').trim();

    if (!productName) errors.push('productName is required');
    if (!fullName) errors.push('customer full name is required');
    if (!phone) errors.push('customer phone is required');
    if (phone && !isValidInternationalPhone(phone)) errors.push('phone must be a valid number (e.g. 0911223344 or +251911223344)');
    if (!country) errors.push('country is required');
    if (!region) errors.push('region is required');
    if (!city) errors.push('city is required');
    if (!zipCode) errors.push('zip code is required');
    if (!address) errors.push('postal address is required');

    const quantity = Number(body?.quantity || 1);
    if (!Number.isFinite(quantity) || quantity < 1) {
        errors.push('quantity must be at least 1');
    }

    const productPrice = Number(body?.productPrice || 0);
    const shippingPrice = Number(body?.shippingPrice || 0);
    const totalPrice = Number(body?.totalPrice || (productPrice * quantity + shippingPrice));
    if (!Number.isFinite(productPrice) || productPrice < 0) errors.push('productPrice must be a valid number');
    if (!Number.isFinite(shippingPrice) || shippingPrice < 0) errors.push('shippingPrice must be a valid number');
    if (!Number.isFinite(totalPrice) || totalPrice < 0) errors.push('totalPrice must be a valid number');

    const category = String(body?.clothDetails?.category || '').trim();
    if (!category) errors.push('cloth category is required');

    const deliveryMethod = String(body?.deliveryPayment?.deliveryMethod || '').trim();
    if (!deliveryMethod) errors.push('delivery method is required');

    return errors;
}

async function notifyAdminsAboutOrder(order) {
    try {
        const admins = await User.find({ role: 'admin', status: { $ne: 'banned' }, isBanned: { $ne: true } })
            .select('_id')
            .lean();

        if (!Array.isArray(admins) || admins.length === 0) return;

        const customer = order?.customer_info || {};
        const cloth = order?.cloth_details || {};
        const itemLabel = cloth.post_title || cloth.design_type || cloth.category || 'Custom order';
        const summary = `${customer.full_name || 'Customer'} (${customer.phone || 'no phone'}) ordered ${itemLabel}`;

        await Notification.insertMany(
            admins.map((admin) => ({
                user_id: admin._id,
                type: 'status_update',
                reference_id: String(order._id || ''),
                title: 'New order received',
                body: summary,
                destination: {
                    path: '/admin/orders',
                    query: { highlight: String(order._id || '') }
                },
                is_read: false,
                timestamp: new Date()
            }))
        );

        // Send SMS only for important events to reduce SMS costs
        try {
            const { SmsEvents } = require('../services/smsService');
            await SmsEvents.newOrder(order);
        } catch (smsErr) {
            console.error('SMS notification failed:', smsErr.message || smsErr);
        }
    } catch (err) {
        // Do not block order creation if notification insertion fails.
        console.error('notifyAdminsAboutOrder error:', err.message || err);
    }
}

async function notifyOrderOwner(order, title, body) {
    try {
        if (!order || !order.user_id) return;
        await Notification.create({
            user_id: order.user_id,
            type: 'status_update',
            reference_id: String(order._id || ''),
            title: String(title || 'Order update'),
            body: String(body || ''),
            destination: {
                path: '/my-orders',
                query: { highlight: String(order._id || '') }
            },
            is_read: false,
            timestamp: new Date()
        });
    } catch (err) {
        console.error('notifyOrderOwner error:', err?.message || err);
    }
}

async function notifyAdminsAboutPaymentProof(order) {
    try {
        const admins = await User.find({ role: 'admin', status: { $ne: 'banned' }, isBanned: { $ne: true } })
            .select('_id')
            .lean();

        if (!Array.isArray(admins) || admins.length === 0) return;

        const customer = order?.customer_info || {};
        const label = `${customer.full_name || 'Customer'} uploaded payment proof.`;

        await Notification.insertMany(
            admins.map((admin) => ({
                user_id: admin._id,
                type: 'status_update',
                reference_id: String(order._id || ''),
                title: 'Payment proof uploaded',
                body: label,
                destination: {
                    path: '/admin/orders',
                    query: { highlight: String(order._id || '') }
                },
                is_read: false,
                timestamp: new Date()
            }))
        );

        // Send SMS notification
        try {
            const { SmsEvents } = require('../services/smsService');
            await SmsEvents.paymentSubmitted(order);
        } catch (smsErr) {
            console.error('SMS notification failed:', smsErr.message || smsErr);
        }
    } catch (err) {
        console.error('notifyAdminsAboutPaymentProof error:', err.message || err);
    }
}

function deriveOrderStatus(paymentStatus, sewingStatus, fallbackStatus = 'Order Placed') {
    const p = String(paymentStatus || '').toLowerCase();
    const s = String(sewingStatus || '').toLowerCase();

    if (p === 'failed' || p === 'refunded') return 'Cancelled';
    if (p !== 'confirmed') return 'Order Placed';
    if (s === 'delivered') return 'Delivered';
    if (s === 'shipped') return 'Shipped';
    if (s === 'ready') return 'Preparing';
    if (s === 'sewing') return 'Payment Confirmed';
    return fallbackStatus || 'Payment Confirmed';
}

function normalizeDeliveryMethod(value) {
    const text = String(value || '').trim().toLowerCase();
    if (!text) return 'delivery';
    if (text === 'pickup' || text.includes('pickup')) return 'pickup';
    return 'delivery';
}

function normalizeDeviceLocation(value) {
    const src = value && typeof value === 'object' ? value : {};
    const latitude = Number(src.latitude);
    const longitude = Number(src.longitude);
    const accuracy = Number(src.accuracy);
    const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
    const capturedAtRaw = src.capturedAt || src.captured_at || null;
    const capturedAt = capturedAtRaw ? new Date(capturedAtRaw) : null;
    const safeCapturedAt = capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt : null;
    const normalized = {
        source: String(src.source || 'browser_geolocation').trim() || 'browser_geolocation',
        status: String(src.status || (hasCoords ? 'captured' : 'unavailable')).trim() || (hasCoords ? 'captured' : 'unavailable'),
        latitude: hasCoords ? latitude : null,
        longitude: hasCoords ? longitude : null,
        accuracy: Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null,
        label: String(src.label || '').trim(),
        map_url: '',
        timezone: String(src.timezone || '').trim(),
        language: String(src.language || '').trim(),
        captured_at: safeCapturedAt
    };

    if (hasCoords) {
        normalized.map_url = `https://www.google.com/maps?q=${latitude},${longitude}`;
        if (!normalized.label) {
            normalized.label = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
        }
    }

    return normalized;
}

function getOrderPaymentScreenshotUrl(order) {
    const paymentInfo = order && order.payment_info && typeof order.payment_info === 'object'
        ? order.payment_info
        : {};

    const candidates = [
        paymentInfo.screenshot_url,
        paymentInfo.screenshotUrl,
        order && order.payment_screenshot_url,
        order && order.paymentScreenshotUrl,
        order && order.screenshot_url
    ];

    const hit = candidates.find((value) => String(value || '').trim());
    return hit ? String(hit).trim() : '';
}

function getOrderPaymentComment(order) {
    const paymentInfo = order && order.payment_info && typeof order.payment_info === 'object'
        ? order.payment_info
        : {};

    const candidates = [
        paymentInfo.comment,
        order && order.payment_comment
    ];

    const hit = candidates.find((value) => String(value || '').trim());
    return hit ? String(hit).trim() : '';
}

function getOrderPaymentScreenshotMimeType(order) {
    const paymentInfo = order && order.payment_info && typeof order.payment_info === 'object'
        ? order.payment_info
        : {};

    const candidates = [
        paymentInfo.screenshot_mime_type,
        paymentInfo.screenshotMimeType,
        order && order.payment_screenshot_mime_type,
        order && order.paymentScreenshotMimeType
    ];

    const hit = candidates.find((value) => String(value || '').trim());
    return hit ? String(hit).trim() : '';
}

function markOrderPaymentInfoModified(order) {
    if (!order || typeof order.markModified !== 'function') return;
    order.markModified('payment_info');
    order.markModified('payment_screenshot_url');
    order.markModified('payment_comment');
}

async function savePrivateOrderUpload(file, ownerUserId, purpose, orderId) {
    if (!file || !file.buffer) return null;

    const uploadsDir = path.join(__dirname, '..', 'uploads', 'orders');
    await fs.promises.mkdir(uploadsDir, { recursive: true });

    const ext = path.extname(String(file.originalname || '')).slice(0, 16);
    const generatedName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
    const absoluteFilePath = path.join(uploadsDir, generatedName);
    const relativeStoragePath = path.posix.join('orders', generatedName);

    await fs.promises.writeFile(absoluteFilePath, file.buffer);

    return Upload.create({
        originalName: file.originalname || 'upload',
        mimeType: file.mimetype || 'application/octet-stream',
        size: Number(file.size || 0),
        storage_path: relativeStoragePath,
        visibility: 'private',
        owner_user_id: ownerUserId || undefined,
        purpose: String(purpose || '').trim(),
        order_id: orderId || undefined
    });
}

async function restorePostOrderStock(order) {
    const postId = String(order?.post_id || '').trim();
    const qty = Math.max(1, Math.floor(Number(order?.quantity || 1)));
    if (!postId || qty <= 0) return;

    try {
        await Post.updateOne({ _id: postId }, { $inc: { stock_quantity: qty } });
    } catch (stockErr) {
        console.error('restorePostOrderStock error:', stockErr?.message || stockErr);
    }
}

function resolveApproximatePaymentUploadUrl(order, uploads, usedUploadIds) {
    if (!order || !Array.isArray(uploads) || !uploads.length) return '';

    const orderUserId = String(order.user_id || '').trim();
    if (!orderUserId) return '';

    const orderCreatedAt = new Date(order.created_at || order.createdAt || 0).getTime();
    if (!Number.isFinite(orderCreatedAt) || orderCreatedAt <= 0) return '';

    const maxDistanceMs = 2 * 60 * 60 * 1000;
    let best = null;

    uploads.forEach((uploadDoc) => {
        const uploadId = String(uploadDoc && uploadDoc._id || '').trim();
        if (!uploadId || usedUploadIds.has(uploadId)) return;
        if (String(uploadDoc.owner_user_id || '').trim() !== orderUserId) return;

        const uploadCreatedAt = new Date(uploadDoc.created_at || 0).getTime();
        if (!Number.isFinite(uploadCreatedAt) || uploadCreatedAt <= 0) return;

        const distance = Math.abs(uploadCreatedAt - orderCreatedAt);
        if (distance > maxDistanceMs) return;

        if (!best || distance < best.distance) {
            best = { uploadId, distance };
        }
    });

    if (!best) return '';
    usedUploadIds.add(best.uploadId);
    return '/api/uploads/' + best.uploadId;
}

function stringifyAddressValue(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'object') {
        return String(
            value.specific_address ||
            value.address ||
            value.city ||
            value.region ||
            ''
        ).trim();
    }
    return String(value).trim();
}

function normalizeCustomerInfo(value, fallback = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const merged = {
        ...fallback,
        ...source
    };

    const fullName = merged.full_name || merged.fullName || '';
    const fatherName = merged.father_name || merged.fatherName || '';
    const phone = merged.phone || '';
    const country = merged.country || merged.country_name || '';
    const countryCode = merged.country_code || merged.countryCode || '';

    const addressSource = merged.address && typeof merged.address === 'object' ? merged.address : {};
    const address = {
        country: normalizeCountryName(addressSource.country || country || 'Ethiopia', 'Ethiopia'),
        country_code: normalizeCountryCode(addressSource.country_code || countryCode || '+251', '+251'),
        region: addressSource.region || merged.region || '',
        region_custom: addressSource.region_custom || merged.region_custom || merged.regionCustom || '',
        city: addressSource.city || merged.city || '',
        zip_code: String(addressSource.zip_code || merged.zip_code || merged.zipCode || '').trim(),
        sub_city: addressSource.sub_city || merged.sub_city || '',
        woreda: addressSource.woreda || merged.woreda || '',
        landmark: addressSource.landmark || merged.landmark || '',
        specific_address: stringifyAddressValue(
            addressSource.specific_address ||
            merged.specific_address ||
            merged.address ||
            ''
        )
    };

    return {
        full_name: String(fullName).trim(),
        father_name: String(fatherName).trim(),
        phone: String(phone).trim(),
        address
    };
}

function buildCustomerInfoFromRequest(req, parsedCustomer, parsedAddress, currentUserId) {
    return normalizeCustomerInfo(parsedCustomer, {
        full_name: req.body.full_name || req.body.fullName || '',
        father_name: req.body.father_name || req.body.fatherName || '',
        phone: req.body.phone || '',
        country: req.body.country || req.body.country_name || 'Ethiopia',
        country_code: req.body.country_code || req.body.countryCode || '+251',
        region: req.body.region || '',
        region_custom: req.body.region_custom || req.body.regionCustom || '',
        city: parsedAddress?.city || req.body.city || '',
        zip_code: req.body.zip_code || req.body.zipCode || '',
        sub_city: req.body.sub_city || '',
        woreda: req.body.woreda || '',
        landmark: req.body.landmark || '',
        specific_address: parsedAddress?.specific_address || req.body.address || ''
    });
}

function buildClothDetailsFromRequest(req, parsedCloth) {
    const cloth = parsedCloth && typeof parsedCloth === 'object' ? { ...parsedCloth } : {};

    if (!cloth.category) cloth.category = req.body.category || req.body.clothCategory || '';
    if (!Array.isArray(cloth.categories)) {
        const rawCategories = req.body.categories;
        if (typeof rawCategories === 'string' && rawCategories.trim()) {
            try {
                const parsed = JSON.parse(rawCategories);
                if (Array.isArray(parsed)) {
                    cloth.categories = parsed.map((row) => String(row || '').trim()).filter(Boolean);
                }
            } catch (_) {
                cloth.categories = rawCategories.split(/[\n,]+/).map((row) => String(row || '').trim()).filter(Boolean);
            }
        }
    }
    if (!Array.isArray(cloth.measurement_profiles)) {
        const rawProfiles = req.body.measurement_profiles || req.body.measurementProfiles;
        if (typeof rawProfiles === 'string' && rawProfiles.trim()) {
            try {
                const parsed = JSON.parse(rawProfiles);
                if (Array.isArray(parsed)) {
                    cloth.measurement_profiles = parsed.map((row) => String(row || '').trim()).filter(Boolean);
                }
            } catch (_) {
                cloth.measurement_profiles = rawProfiles.split(/[\n,]+/).map((row) => String(row || '').trim()).filter(Boolean);
            }
        }
    }
    if (!cloth.color && req.body.color) cloth.color = req.body.color;
    if (!cloth.design_type && req.body.design_type) cloth.design_type = req.body.design_type;
    if (!cloth.event_type && req.body.event_type) cloth.event_type = req.body.event_type;
    if (!cloth.deadline_date && req.body.deadline_date) cloth.deadline_date = req.body.deadline_date;

    return cloth;
}

// Create order (supports both product and custom orders)
exports.createOrder = async (req, res) => {
    try {
        let orderData = {};
        const currentUserId = req.user && req.user.id ? req.user.id : null;
        const globalDeliverySettings = await getGlobalDeliverySettings();

        const isSimpleJsonFlow = req.is('application/json') && String(req.body?.customerName || '').trim();
        const hasNestedSimpleFlow = req.is('application/json')
            && req.body
            && typeof req.body === 'object'
            && req.body.customerInfo
            && req.body.measurements;
        const shouldUseSimpleJsonFlow = isSimpleJsonFlow || hasNestedSimpleFlow;
        if (shouldUseSimpleJsonFlow) {
            const errors = validateSimpleOrderPayload(req.body);
            if (errors.length) {
                return res.status(400).json({ msg: 'Validation failed', errors });
            }

            const quantity = Math.max(1, Number(req.body.quantity || 1));
            const productPrice = toNonNegativeNumber(req.body.productPrice);
            const shippingPrice = toNonNegativeNumber(req.body.shippingPrice);
            const totalPrice = toNonNegativeNumber(req.body.totalPrice, productPrice * quantity + shippingPrice);

            const customerInfo = req.body.customerInfo && typeof req.body.customerInfo === 'object'
                ? req.body.customerInfo
                : {};
            const deliveryPayment = req.body.deliveryPayment && typeof req.body.deliveryPayment === 'object'
                ? req.body.deliveryPayment
                : {};
            const clothDetails = req.body.clothDetails && typeof req.body.clothDetails === 'object'
                ? req.body.clothDetails
                : {};
            const measurements = req.body.measurements && typeof req.body.measurements === 'object'
                ? req.body.measurements
                : {};

            const fullName = String(customerInfo.fullName || req.body.customerName || '').trim();
            const fatherName = String(customerInfo.fatherName || req.body.fatherName || '').trim();
            const phone = String(customerInfo.phone || req.body.phone || '').trim();
            const country = normalizeCountryName(customerInfo.country || req.body.country || globalDeliverySettings.default_country, globalDeliverySettings.default_country);
            const countryCode = normalizeCountryCode(customerInfo.countryCode || customerInfo.country_code || req.body.countryCode || req.body.country_code || globalDeliverySettings.default_country_code, globalDeliverySettings.default_country_code);
            const region = String(customerInfo.region || req.body.region || '').trim();
            const regionCustom = String(customerInfo.regionCustom || customerInfo.region_custom || req.body.regionCustom || req.body.region_custom || '').trim();
            const city = String(customerInfo.city || req.body.city || '').trim();
            const zipCode = String(customerInfo.zipCode || customerInfo.zip_code || req.body.zipCode || req.body.zip_code || '').trim();
            const address = String(customerInfo.address || req.body.address || '').trim();
            const category = String(clothDetails.category || req.body.category || '').trim();
            const eventType = String(clothDetails.eventType || req.body.eventType || '').trim();
            const paymentMethod = String(deliveryPayment.paymentMethod || deliveryPayment.method || req.body.paymentMethod || req.body.payment_method || '').trim();
            const paymentComment = String(deliveryPayment.paymentComment || req.body.paymentComment || req.body.payment_comment || '').trim();
            const deliveryMethod = normalizeDeliveryMethod(deliveryPayment.deliveryMethod || req.body.deliveryMethod || 'delivery');
            const proposedPrice = toNonNegativeNumber(req.body.proposedPriceETB ?? req.body.proposed_price_etb, 0);
            const deviceLocation = normalizeDeviceLocation(req.body.deviceLocation || req.body.device_location || null);
            const rawProductId = String(req.body.productId || req.body.postId || req.body.post_id || '').trim();
            const hasValidPostId = isSupportedPostId(rawProductId);
            const isProductAsIsOrder = hasValidPostId;
            const safeQuantity = Math.max(1, Math.floor(Number(req.body.quantity || 1)));

            if (!isProductAsIsOrder) {
                return res.status(400).json({ msg: 'Reference image is required for custom orders.' });
            }

            if (isProductAsIsOrder && paymentMethod !== 'chapa') {
                return res.status(400).json({ msg: 'Payment method must be chapa.' });
            }

            let selectedPost = null;
            if (isProductAsIsOrder) {
                selectedPost = await Post.findById(rawProductId)
                    .select('priceETB shippingPriceETB freeShipping stock_quantity unlimited_stock title images categories measurement_profiles delivery_scope delivery_countries')
                    .lean();
                if (!selectedPost) {
                    return res.status(404).json({ msg: 'Selected product is not found' });
                }
                if (!selectedPost.unlimited_stock && Number(selectedPost.stock_quantity || 0) < safeQuantity) {
                    return res.status(400).json({ msg: 'Selected quantity is out of stock' });
                }

                const deliveryScope = String(selectedPost.delivery_scope || 'ethiopia_only');
                const deliveryCountries = Array.isArray(selectedPost.delivery_countries) ? selectedPost.delivery_countries : [];
                if (!isCountryAllowedByRule(country, deliveryScope, deliveryCountries)) {
                    return res.status(400).json({ msg: 'This product is not available for delivery to the selected country.' });
                }
            } else {
                const globalScope = globalDeliverySettings.default_mode;
                if (!isCountryAllowedByRule(country, globalScope, [])) {
                    return res.status(400).json({ msg: 'Orders are currently limited to Ethiopia by admin settings.' });
                }
            }

            const payload = {
                customerName: fullName,
                phone,
                address,
                productId: hasValidPostId ? rawProductId : undefined,
                productName: isProductAsIsOrder ? String(selectedPost?.title || req.body.productName || '').trim() : String(req.body.productName || '').trim(),
                productImage: isProductAsIsOrder
                    ? String((Array.isArray(selectedPost?.images) && selectedPost.images[0]) || req.body.productImage || '').trim()
                    : String(req.body.productImage || '').trim(),
                quantity: safeQuantity,
                customDetails: {
                    size: String(req.body.customDetails?.size || req.body.size || '').trim(),
                    color: String(req.body.customDetails?.color || req.body.color || '').trim(),
                    note: String(req.body.customDetails?.note || req.body.note || '').trim()
                },
                productPrice: isProductAsIsOrder ? toNonNegativeNumber(selectedPost?.priceETB, productPrice) : productPrice,
                shippingPrice: isProductAsIsOrder
                    ? (selectedPost?.freeShipping ? 0 : toNonNegativeNumber(selectedPost?.shippingPriceETB, shippingPrice))
                    : shippingPrice,
                totalPrice: isProductAsIsOrder
                    ? (toNonNegativeNumber(selectedPost?.priceETB, productPrice) * safeQuantity + (selectedPost?.freeShipping ? 0 : toNonNegativeNumber(selectedPost?.shippingPriceETB, shippingPrice)))
                    : totalPrice,
                proposed_price_etb: isProductAsIsOrder ? 0 : proposedPrice,
                paymentStatus: 'pending',
                orderStatus: 'pending',
                createdAt: new Date(),
                user_id: currentUserId || undefined,
                device_location: deviceLocation,

                // Keep legacy-compatible structures for existing admin pages.
                customer_info: {
                    full_name: fullName,
                    father_name: fatherName,
                    phone,
                    address: {
                        country,
                        country_code: countryCode,
                        region,
                        region_custom: regionCustom,
                        city,
                        zip_code: zipCode,
                        specific_address: address
                    }
                },
                cloth_details: {
                    category,
                    categories: Array.isArray(clothDetails.categories) ? clothDetails.categories : [],
                    measurement_profiles: Array.isArray(clothDetails.measurement_profiles) ? clothDetails.measurement_profiles : [],
                    color: String(req.body.customDetails?.color || req.body.color || '').trim(),
                    event_type: eventType,
                    design_type: isProductAsIsOrder ? String(req.body.productName || '').trim() : ''
                },
                measurements: Object.keys(measurements).length ? measurements : {
                    type: 'custom',
                    size: String(req.body.customDetails?.size || req.body.size || '').trim()
                },
                payment_status: 'Pending',
                order_status: 'Order Placed',
                order_type: isProductAsIsOrder ? 'product' : 'custom',
                delivery_method: deliveryMethod,
                payment_info: {
                    method: paymentMethod || '',
                    comment: paymentComment,
                    status: 'Pending'
                },
                payment_comment: paymentComment
            };

            if (hasValidPostId) {
                payload.post_id = rawProductId;
                payload.cloth_details = {
                    ...payload.cloth_details,
                    post_title: String(req.body.productName || '').trim(),
                    post_image: String(req.body.productImage || '').trim(),
                    post_price_etb: productPrice,
                    post_shipping_price_etb: shippingPrice
                };
            }

            const order = await Order.create(payload);

            if (isProductAsIsOrder && selectedPost && !selectedPost.unlimited_stock) {
                const stockUpdate = await Post.updateOne(
                    { _id: rawProductId, stock_quantity: { $gte: safeQuantity } },
                    { $inc: { stock_quantity: -safeQuantity } }
                );
                if (!stockUpdate || stockUpdate.modifiedCount !== 1) {
                    await Order.deleteOne({ _id: order._id });
                    return res.status(400).json({ msg: 'Selected quantity is out of stock' });
                }
            }

            await notifyAdminsAboutOrder(order);
            return res.status(201).json(order);
        }

        const parseMaybeJSON = (value) => {
            if (value === undefined || value === null) return null;
            if (typeof value === 'object') return value;
            if (typeof value !== 'string') return null;
            const trimmed = value.trim();
            if (!trimmed) return null;
            try {
                return JSON.parse(trimmed);
            } catch {
                return null;
            }
        };

        const parsedCustomer = parseMaybeJSON(req.body.customer_info);
        const parsedCloth = parseMaybeJSON(req.body.cloth_details);
        const parsedMeasurements = parseMaybeJSON(req.body.measurements);
        const parsedItems = parseMaybeJSON(req.body.items);
        const parsedAddress = parseMaybeJSON(req.body.address);
        const parsedDeviceLocation = normalizeDeviceLocation(parseMaybeJSON(req.body.device_location) || req.body.deviceLocation || req.body.device_location || null);

        // Determine order type. Default to custom when cloth data is present.
        const hasCustomPayload = !!(parsedCloth || req.body.post_id || req.body.clothCategory || req.body.category);
        const orderType = req.body.order_type || (hasCustomPayload ? 'custom' : 'product');
        orderData.order_type = orderType;
        orderData.order_status = 'Order Placed';
        orderData.sewing_status = 'Pending';
        orderData.device_location = parsedDeviceLocation;

        if (orderType === 'product') {
            // Product order (ready-made from shop)
            if (!parsedItems || !Array.isArray(parsedItems) || parsedItems.length === 0) {
                return res.status(400).json({ msg: 'No items in cart' });
            }

            // Validate and enrich product items
            const enrichedItems = [];
            for (const item of parsedItems) {
                const product = await Product.findById(item.product_id);
                if (!product) {
                    return res.status(400).json({ msg: `Product not found: ${item.product_id}` });
                }

                enrichedItems.push({
                    product_id: item.product_id,
                    name: product.name,
                    price: product.sale_price || product.base_price,
                    quantity: item.quantity || 1,
                    size: item.size,
                    color: item.color,
                    image: product.thumbnail || (product.images && product.images[0]?.url)
                });

                // Update stock
                if (product.track_inventory) {
                    product.stock_quantity = Math.max(0, product.stock_quantity - (item.quantity || 1));
                    await product.save();
                }
            }

            orderData.items = enrichedItems;
            orderData.subtotal = enrichedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            
            // Calculate delivery fee based on city
            const city = parsedAddress?.city || req.body.city || '';
            const deliveryFee = city.toLowerCase() === 'addis ababa' ? 100 : 
                               city.toLowerCase() === 'gondar' ? 50 : 150;
            orderData.delivery_fee = deliveryFee;
            orderData.total = orderData.subtotal + deliveryFee;

            // Ethiopian address
            orderData.customer_info = normalizeCustomerInfo(parsedCustomer, {
                full_name: req.body.full_name || req.body.fullName || '',
                phone: req.body.phone || '',
                region: req.body.region || '',
                city: city,
                sub_city: req.body.sub_city || '',
                woreda: req.body.woreda || '',
                landmark: req.body.landmark || '',
                specific_address: parsedAddress?.specific_address || req.body.address || ''
            });

            // Estimated delivery
            orderData.estimated_delivery = {
                city: city,
                days_min: city.toLowerCase() === 'addis ababa' ? 1 : city.toLowerCase() === 'gondar' ? 1 : 3,
                days_max: city.toLowerCase() === 'addis ababa' ? 2 : city.toLowerCase() === 'gondar' ? 2 : 5
            };

        } else {
            // Custom order (bespoke clothing)
            orderData.customer_info = buildCustomerInfoFromRequest(req, parsedCustomer, parsedAddress, currentUserId);

            orderData.cloth_details = buildClothDetailsFromRequest(req, parsedCloth);
            const incomingPostId = String(req.body.post_id || req.body.postId || '').trim();
            const hasPostOrder = isSupportedPostId(incomingPostId);
            const requestedQty = Math.max(1, Math.floor(Number(req.body.quantity || 1)));
            orderData.quantity = requestedQty;

            if (parsedMeasurements && typeof parsedMeasurements === 'object') {
                orderData.measurements = parsedMeasurements;
            } else {
                orderData.measurements = {
                    type: 'standard',
                    size: req.body.measurements || ''
                };
            }

            if (hasPostOrder) {
                orderData.post_id = incomingPostId;
                orderData.order_type = 'product';

                try {
                    const selectedPost = await Post.findById(incomingPostId)
                        .select('title category categories measurement_profiles description priceETB shippingPriceETB freeShipping images stock_quantity unlimited_stock delivery_scope delivery_countries')
                        .lean();

                    if (selectedPost) {
                        if (!selectedPost.unlimited_stock && Number(selectedPost.stock_quantity || 0) < requestedQty) {
                            return res.status(400).json({ msg: 'Selected quantity is out of stock' });
                        }

                        const selectedCountry = normalizeCountryName(orderData.customer_info?.address?.country || globalDeliverySettings.default_country, globalDeliverySettings.default_country);
                        const deliveryScope = String(selectedPost.delivery_scope || 'ethiopia_only');
                        const deliveryCountries = Array.isArray(selectedPost.delivery_countries) ? selectedPost.delivery_countries : [];
                        if (!isCountryAllowedByRule(selectedCountry, deliveryScope, deliveryCountries)) {
                            return res.status(400).json({ msg: 'This product is not available for delivery to the selected country.' });
                        }

                        const firstImage = Array.isArray(selectedPost.images) && selectedPost.images.length
                            ? selectedPost.images[0]
                            : '';

                        orderData.cloth_details = {
                            ...orderData.cloth_details,
                            category: selectedPost.category || orderData.cloth_details.category || '',
                            categories: Array.isArray(selectedPost.categories) ? selectedPost.categories : (Array.isArray(orderData.cloth_details.categories) ? orderData.cloth_details.categories : []),
                            measurement_profiles: Array.isArray(selectedPost.measurement_profiles) ? selectedPost.measurement_profiles : (Array.isArray(orderData.cloth_details.measurement_profiles) ? orderData.cloth_details.measurement_profiles : []),
                            design_type: orderData.cloth_details.design_type || selectedPost.title || '',
                            post_title: selectedPost.title || '',
                            post_image: firstImage || '',
                            post_description: selectedPost.description || '',
                            post_price_etb: Number.isFinite(Number(selectedPost.priceETB)) ? Number(selectedPost.priceETB) : undefined,
                            post_shipping_price_etb: Number.isFinite(Number(selectedPost.shippingPriceETB)) ? Number(selectedPost.shippingPriceETB) : undefined,
                            post_free_shipping: !!selectedPost.freeShipping,
                            delivery_scope: deliveryScope,
                            delivery_countries: deliveryCountries
                        };

                        if (!selectedPost.unlimited_stock) {
                            const stockUpdate = await Post.updateOne(
                                { _id: incomingPostId, stock_quantity: { $gte: requestedQty } },
                                { $inc: { stock_quantity: -requestedQty } }
                            );
                            if (!stockUpdate || stockUpdate.modifiedCount !== 1) {
                                return res.status(400).json({ msg: 'Selected quantity is out of stock' });
                            }
                        }
                    } else {
                        // If post is missing in current DB, keep request payload values instead of failing the order.
                        orderData.cloth_details = {
                            ...orderData.cloth_details,
                            category: orderData.cloth_details.category || req.body.category || req.body.clothCategory || '',
                            categories: Array.isArray(orderData.cloth_details.categories) ? orderData.cloth_details.categories : [],
                            measurement_profiles: Array.isArray(orderData.cloth_details.measurement_profiles) ? orderData.cloth_details.measurement_profiles : [],
                            post_title: orderData.cloth_details.post_title || req.body.post_title || req.body.title || '',
                            post_image: orderData.cloth_details.post_image || req.body.post_image || '',
                            post_description: orderData.cloth_details.post_description || req.body.post_description || '',
                            post_price_etb: Number.isFinite(Number(orderData.cloth_details.post_price_etb)) ? Number(orderData.cloth_details.post_price_etb) : undefined,
                            post_shipping_price_etb: Number.isFinite(Number(orderData.cloth_details.post_shipping_price_etb)) ? Number(orderData.cloth_details.post_shipping_price_etb) : undefined,
                            post_free_shipping: !!orderData.cloth_details.post_free_shipping
                        };
                    }
                } catch (postErr) {
                    console.error('post enrichment failed:', postErr.message || postErr);
                    // Keep order creation resilient when post enrichment fails.
                }

                // Product-linked orders should rely on selected post details only.
                delete orderData.cloth_details.event_type;
            }
            if (!hasPostOrder) {
                const selectedCountry = normalizeCountryName(orderData.customer_info?.address?.country || globalDeliverySettings.default_country, globalDeliverySettings.default_country);
                if (!isCountryAllowedByRule(selectedCountry, globalDeliverySettings.default_mode, [])) {
                    return res.status(400).json({ msg: 'Orders are currently limited to Ethiopia by admin settings.' });
                }
            }
        }

        orderData.delivery_method = normalizeDeliveryMethod(req.body.delivery_method || req.body.delivery || 'delivery');
        orderData.use_last_location = String(req.body.use_last_location || '').trim().toLowerCase() === 'true';
        orderData.proposed_price_etb = toNonNegativeNumber(req.body.proposed_price_etb ?? req.body.proposedPriceETB, 0);

        // Handle Payment - optional at creation for quote-first flow.
        const paymentMethod = String(req.body.payment_method || req.body.paymentMethod || '').trim();
        const paymentComment = String(req.body.payment_comment || req.body.paymentComment || '').trim();
        const paymentFile = req.files?.paymentScreenshot?.[0];

        let paymentInfo = {
            method: ['chapa'].includes(paymentMethod) ? paymentMethod : '',
            comment: paymentComment,
            status: 'Pending'
        };

        orderData.payment_info = paymentInfo;
        orderData.payment_comment = paymentComment;

        // Reference images are accepted only for non-product custom orders.
        const refFiles = [];
        if (!orderData.post_id) {
            const refList = req.files?.referenceImages || [];
            const legacyRef = req.files?.refImage || [];
            refFiles.push(...refList, ...legacyRef);
            if (!refFiles.length) {
                return res.status(400).json({ msg: 'Reference image is required for custom orders.' });
            }
        }

        // Remove fabric type from being received/saved
        if (orderData.cloth_details && typeof orderData.cloth_details === 'object') {
            delete orderData.cloth_details.fabric_type;
        }

        if (currentUserId) {
            orderData.user_id = currentUserId;
        }

        // Use last location if requested
        if (orderData.use_last_location && currentUserId) {
            const lastOrder = await Order.findOne({ user_id: currentUserId })
                .select('customer_info')
                .sort({ created_at: -1 })
                .lean();

            if (lastOrder && lastOrder.customer_info) {
                const current = orderData.customer_info || {};
                orderData.customer_info = {
                    ...current,
                    address: {
                        ...current.address,
                        region: lastOrder.customer_info.address?.region || current.address?.region || '',
                        city: lastOrder.customer_info.address?.city || current.address?.city || '',
                        specific_address: lastOrder.customer_info.address?.specific_address || current.address?.specific_address || ''
                    }
                };
            }
        }

        const customer = normalizeCustomerInfo(orderData.customer_info || {});
        orderData.customer_info = customer;
        const isGuest = !currentUserId;
        if (!customer.full_name || !customer.phone) {
            return res.status(400).json({ msg: 'Full name and phone are required' });
        }

        if (!isValidInternationalPhone(customer.phone)) {
            return res.status(400).json({ msg: 'Phone number must include country code (example: +251...)' });
        }

        if (!customer.address?.country || !customer.address?.region || !customer.address?.city || !customer.address?.zip_code) {
            return res.status(400).json({ msg: 'Shipping address must include country, region, city, and ZIP code.' });
        }

        if (orderData.post_id && paymentMethod !== 'chapa') {
            return res.status(400).json({ msg: 'Payment method must be chapa.' });
        }

        if (isGuest && (!customer.address?.city || !customer.address?.specific_address)) {
            return res.status(400).json({ msg: 'City and address are required for guest checkout' });
        }
        
        const newOrder = new Order(orderData);
        const order = await newOrder.save();

        // Persist uploaded files and fail product-linked orders if the required payment proof cannot be saved.
        if (paymentFile && paymentFile.buffer) {
            try {
                const up = await savePrivateOrderUpload(
                    paymentFile,
                    currentUserId || undefined,
                    'order_payment_screenshot',
                    order._id
                );
                order.payment_info = order.payment_info || {};
                order.payment_info.comment = paymentComment;
                order.payment_info.screenshot_url = '/api/uploads/' + up._id;
                order.payment_info.screenshot_mime_type = String(up?.mimeType || paymentFile?.mimetype || '').trim();
                order.payment_screenshot_url = order.payment_info.screenshot_url;
                order.payment_screenshot_mime_type = order.payment_info.screenshot_mime_type;
                order.payment_comment = paymentComment;
                order.payment_info.paid_at = new Date();
                if (!order.payment_info.status) {
                    order.payment_info.status = 'Pending';
                }
                markOrderPaymentInfoModified(order);
            } catch (uploadErr) {
                console.error('payment screenshot upload failed:', uploadErr.message || uploadErr);
                if (orderData.post_id) {
                    await Order.deleteOne({ _id: order._id });
                    await restorePostOrderStock(order);
                    return res.status(500).json({ msg: 'Saving payment proof failed. Please retry the order with the screenshot again.' });
                }
            }
        }

        if (refFiles.length) {
            try {
                const uploadDocs = await Upload.insertMany(
                    refFiles
                        .filter((f) => f && f.buffer)
                        .map((f) => ({
                            originalName: f.originalname,
                            mimeType: f.mimetype,
                            size: f.size,
                            data: f.buffer,
                            visibility: 'private',
                            owner_user_id: currentUserId || undefined,
                            purpose: 'order_reference_image',
                            order_id: order._id
                        }))
                );

                order.reference_images = uploadDocs.map((u) => '/api/uploads/' + u._id);
            } catch (uploadErr) {
                console.error('reference image upload failed:', uploadErr.message || uploadErr);
            }
        }

        try {
            await order.save();
        } catch (postSaveErr) {
            console.error('post order-save enrichment failed:', postSaveErr.message || postSaveErr);
        }

        try {
            await notifyAdminsAboutOrder(order);
        } catch (notifyErr) {
            console.error('notify admin failed:', notifyErr.message || notifyErr);
        }

        res.json(order);
    } catch (err) {
        console.error('createOrder error:', err?.message || err, {
            hasUser: !!(req.user && req.user.id),
            orderType: req.body?.order_type,
            hasPostId: !!req.body?.post_id,
            hasPaymentScreenshot: !!(req.files?.paymentScreenshot?.[0]),
            hasReferenceImages: Array.isArray(req.files?.referenceImages) ? req.files.referenceImages.length : 0
        });
        if (String(err?.message || '').toLowerCase().includes('next is not a function')) {
            return res.status(500).json({ msg: 'Order processing failed. Please retry once.' });
        }
        if (err && err.name === 'ValidationError') {
            return res.status(400).json({ msg: err.message || 'Invalid order data' });
        }
        if (err && err.name === 'CastError') {
            return res.status(400).json({ msg: `Invalid ${err.path || 'field'} value` });
        }
        return res.status(500).json({ msg: err?.message || 'Server Error' });
    }
};

exports.updateOrderPayment = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(401).json({ msg: 'Not authorized' });
    }

    try {
        const status = String(req.body?.paymentStatus || '').trim().toLowerCase();
        if (!['pending', 'confirmed'].includes(status)) {
            return res.status(400).json({ msg: 'paymentStatus must be pending or confirmed' });
        }

        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ msg: 'Order not found' });

        order.paymentStatus = status;
        order.payment_status = status === 'confirmed' ? 'Confirmed' : 'Pending';
        if (!order.payment_info) order.payment_info = {};
        order.payment_info.status = order.payment_status;
        order.order_status = deriveOrderStatus(order.payment_status, order.sewing_status, order.order_status);

        await order.save();

        await notifyOrderOwner(
            order,
            'Payment status updated',
            `Your payment status is now ${order.payment_status}.`
        );

        // Send SMS notifications
        try {
            const { SmsEvents } = require('../services/smsService');
            if (order.payment_status === 'Confirmed') {
                await SmsEvents.paymentApproved(order);
            } else {
                await SmsEvents.paymentRejected(order);
            }
        } catch (smsErr) {
            console.error('SMS notification failed:', smsErr.message || smsErr);
        }

        return res.json({ msg: 'Payment status updated', order });
    } catch (err) {
        console.error('updateOrderPayment error:', err?.message || err);
        return res.status(500).json({ msg: 'Server Error' });
    }
};

exports.updateOrderStatusStep = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(401).json({ msg: 'Not authorized' });
    }

    try {
        const nextStatus = String(req.body?.orderStatus || '').trim().toLowerCase();
        const allowed = ['pending', 'sewing_started', 'sewing_finished', 'delivery_started', 'completed'];
        if (!allowed.includes(nextStatus)) {
            return res.status(400).json({ msg: 'Invalid orderStatus value' });
        }

        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ msg: 'Order not found' });

        order.orderStatus = nextStatus;

        const legacyMap = {
            pending: 'Order Placed',
            sewing_started: 'Sewing',
            sewing_finished: 'Ready',
            delivery_started: 'Out for Delivery',
            completed: 'Delivered'
        };

        order.sewing_status = legacyMap[nextStatus] === 'Sewing' ? 'Sewing' : (legacyMap[nextStatus] === 'Ready' ? 'Ready' : order.sewing_status);
        order.order_status = legacyMap[nextStatus] || order.order_status;

        await order.save();

        await notifyOrderOwner(
            order,
            'Order status updated',
            `Your order status is now ${order.order_status}.`
        );

        // Send SMS notifications
        try {
            if (nextStatus === 'delivery_started') {
                const { SmsEvents } = require('../services/smsService');
                await SmsEvents.orderShipped(order);
            }
        } catch (smsErr) {
            console.error('SMS notification failed:', smsErr.message || smsErr);
        }

        return res.json({ msg: 'Order status updated', order });
    } catch (err) {
        console.error('updateOrderStatusStep error:', err?.message || err);
        return res.status(500).json({ msg: 'Server Error' });
    }
};

exports.getLastDeliveryLocation = async (req, res) => {
    try {
        const lastOrder = await Order.findOne({ user_id: req.user.id })
            .select('customer_info created_at')
            .sort({ created_at: -1 })
            .lean();

        if (!lastOrder || !lastOrder.customer_info) {
            return res.json({ hasLocation: false, location: null });
        }

        return res.json({
            hasLocation: true,
            location: {
                region: lastOrder.customer_info.region || '',
                city: lastOrder.customer_info.city || '',
                address: lastOrder.customer_info.address || ''
            },
            updatedAt: lastOrder.created_at || null
        });
    } catch (err) {
        console.error(err.message);
        return res.status(500).send('Server Error');
    }
};

exports.getOrders = async (req, res) => {
    try {
        let orders;
        if (req.user.role === 'admin') {
            orders = await Order.find().sort({ created_at: -1 }).lean();
        } else {
            orders = await Order.find({ user_id: req.user.id }).sort({ created_at: -1 }).lean();
        }

        // Backfill screenshot URL for legacy orders where payment_info exists but screenshot_url was not persisted.
        const orderIds = (Array.isArray(orders) ? orders : [])
            .map((o) => o && o._id)
            .filter(Boolean);

        if (orderIds.length) {
            try {
                const uploads = await Upload.find({
                    order_id: { $in: orderIds },
                    purpose: 'order_payment_screenshot'
                })
                    .select('_id order_id owner_user_id created_at mimeType')
                    .sort({ created_at: -1 })
                    .lean();

                const latestByOrder = new Map();
                const usedUploadIds = new Set();
                uploads.forEach((u) => {
                    const key = String(u && u.order_id || '').trim();
                    if (!key || latestByOrder.has(key)) return;
                    const uploadId = String(u && u._id || '').trim();
                    if (!uploadId) return;
                    latestByOrder.set(key, {
                        url: '/api/uploads/' + uploadId,
                        mimeType: String(u && u.mimeType || '').trim()
                    });
                    usedUploadIds.add(uploadId);
                });

                orders = orders.map((order) => {
                    try {
                        const key = String(order && order._id || '').trim();
                        const paymentInfo = (order && order.payment_info && typeof order.payment_info === 'object')
                            ? order.payment_info
                            : {};

                        const fallback = latestByOrder.get(key) || null;
                        const fallbackUrl = fallback && fallback.url
                            ? fallback.url
                            : (resolveApproximatePaymentUploadUrl(order, uploads, usedUploadIds) || '');
                        const resolvedScreenshotUrl = getOrderPaymentScreenshotUrl(order) || fallbackUrl;
                        const resolvedScreenshotMimeType = getOrderPaymentScreenshotMimeType(order)
                            || String(fallback && fallback.mimeType || '').trim();
                        const resolvedComment = getOrderPaymentComment(order);
                        if (!resolvedScreenshotUrl) return order;

                        return {
                            ...order,
                            payment_info: {
                                ...paymentInfo,
                                screenshot_url: resolvedScreenshotUrl,
                                screenshot_mime_type: resolvedScreenshotMimeType,
                                comment: resolvedComment
                            },
                            payment_screenshot_url: resolvedScreenshotUrl,
                            payment_screenshot_mime_type: resolvedScreenshotMimeType,
                            payment_comment: resolvedComment
                        };
                    } catch (orderAugmentErr) {
                        console.error('getOrders payment augmentation error:', orderAugmentErr?.message || orderAugmentErr);
                        return order;
                    }
                });

                const refUploads = await Upload.find({
                    order_id: { $in: orderIds },
                    purpose: 'order_reference_image'
                })
                    .select('_id order_id created_at')
                    .sort({ created_at: -1 })
                    .lean();

                const refsByOrder = new Map();
                refUploads.forEach((u) => {
                    const key = String(u && u.order_id || '').trim();
                    if (!key) return;
                    const nextId = String(u && u._id || '').trim();
                    if (!nextId) return;
                    const next = '/api/uploads/' + nextId;
                    const existing = refsByOrder.get(key) || [];
                    if (existing.length < 6) {
                        existing.push(next);
                        refsByOrder.set(key, existing);
                    }
                });

                orders = orders.map((order) => {
                    const key = String(order && order._id || '').trim();
                    if (!key) return order;
                    const existingRefs = Array.isArray(order.reference_images) ? order.reference_images.filter(Boolean) : [];
                    if (existingRefs.length) return order;
                    const fallbackRefs = refsByOrder.get(key) || [];
                    if (!fallbackRefs.length) return order;
                    return {
                        ...order,
                        reference_images: fallbackRefs
                    };
                });
            } catch (uploadLookupErr) {
                console.error('getOrders upload lookup failed:', uploadLookupErr?.message || uploadLookupErr);
            }
        }

        if (req.user.role === 'admin' && Array.isArray(orders) && orders.length) {
            const userIds = Array.from(new Set(
                orders
                    .map((o) => String(o?.user_id || '').trim())
                    .filter((id) => /^[a-f\d]{24}$/i.test(id))
            ));

            let profileByUserId = new Map();
            if (userIds.length) {
                const users = await User.find({ _id: { $in: userIds } })
                    .select('fullName fatherName email phone age sex profileImage role status')
                    .lean();
                profileByUserId = new Map(
                    users.map((u) => [String(u._id), {
                        fullName: u.fullName || '',
                        fatherName: u.fatherName || '',
                        email: u.email || '',
                        phone: u.phone || '',
                        age: u.age ?? null,
                        sex: u.sex || '',
                        profileImage: u.profileImage || '',
                        role: u.role || 'customer',
                        status: u.status || 'active'
                    }])
                );
            }

            orders = orders.map((order) => {
                const profile = profileByUserId.get(String(order?.user_id || '').trim()) || null;
                return {
                    ...order,
                    user_profile: profile
                };
            });
        }

        res.json(orders);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
};

exports.updateOrder = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(401).json({ msg: 'Not authorized' });
    }
    try {
        let order = await Order.findById(req.params.id);
        if (!order) {
            console.error(`[updateOrder] Order not found: id=${req.params.id}`);
            return res.status(404).json({ msg: 'Order not found' });
        }

        const prevPaymentStatus = String(order.payment_status || '').toLowerCase();
        const prevOrderStatus = String(order.order_status || '').toLowerCase();

        // Log incoming request body for debugging
        console.log(`[updateOrder] Incoming body:`, JSON.stringify(req.body));

        // Update fields provided in body
        if (req.body.order_status) order.order_status = req.body.order_status;
        if (req.body.status) order.order_status = req.body.status;

        if (req.body.sewing_status) order.sewing_status = req.body.sewing_status;
        if (req.body.sewingStatus) order.sewing_status = req.body.sewingStatus;

        if (req.body.payment_status) {
            order.payment_status = req.body.payment_status;
            // Keep legacy nested status aligned for UIs that read payment_info.status
            if (!order.payment_info) order.payment_info = {};
            order.payment_info.status = req.body.payment_status;
        }

        order.order_status = deriveOrderStatus(order.payment_status, order.sewing_status, order.order_status);

        // Handle estimated delivery
        if (req.body.estimated_delivery) {
            order.estimated_delivery = req.body.estimated_delivery;
        }

        // Handle admin notes
        if (req.body.admin_notes) {
            order.admin_notes = req.body.admin_notes;
        }

        if (req.body.payment_comment !== undefined || req.body.paymentComment !== undefined) {
            const paymentComment = String(req.body.payment_comment ?? req.body.paymentComment ?? '').trim();
            if (!order.payment_info) order.payment_info = {};
            order.payment_info.comment = paymentComment;
            order.payment_comment = paymentComment;
        }

        // Update payment info
        if (req.body.payment_method) {
            if (!order.payment_info) order.payment_info = {};
            order.payment_info.method = req.body.payment_method;
        }

        if (req.body.cloth_details && typeof req.body.cloth_details === 'object') {
            const currentCloth = order.cloth_details && typeof order.cloth_details === 'object'
                ? order.cloth_details.toObject ? order.cloth_details.toObject() : order.cloth_details
                : {};
            const incomingCloth = req.body.cloth_details;
            order.cloth_details = {
                ...currentCloth,
                ...incomingCloth
            };
        }

        if (req.body.proposed_price_etb !== undefined || req.body.proposedPriceETB !== undefined) {
            const proposed = toNonNegativeNumber(req.body.proposed_price_etb ?? req.body.proposedPriceETB, order.proposed_price_etb || 0);
            order.proposed_price_etb = proposed;
        }

        if (req.body.negotiation_message) {
            const msg = String(req.body.negotiation_message || '').trim();
            if (msg) {
                const sender = req.body.negotiation_sender === 'user' ? 'user' : 'admin';
                order.negotiation_messages = Array.isArray(order.negotiation_messages) ? order.negotiation_messages : [];
                order.negotiation_messages.push({
                    sender_role: sender,
                    message: msg,
                    timestamp: new Date()
                });
            }
        }

        order.updated_at = Date.now();

        await order.save();

        // Send SMS notifications if status changed
        try {
            const currentPaymentStatus = String(order.payment_status || '').toLowerCase();
            const currentOrderStatus = String(order.order_status || '').toLowerCase();

            if (currentPaymentStatus !== prevPaymentStatus) {
                const { SmsEvents } = require('../services/smsService');
                if (currentPaymentStatus === 'confirmed') {
                    await SmsEvents.paymentApproved(order);
                } else if (['rejected', 'failed'].includes(currentPaymentStatus)) {
                    await SmsEvents.paymentRejected(order);
                }
            }

            if (currentOrderStatus !== prevOrderStatus) {
                const { SmsEvents } = require('../services/smsService');
                if (currentOrderStatus === 'shipped' || order.sewing_status === 'shipped' || order.orderStatus === 'delivery_started') {
                    await SmsEvents.orderShipped(order);
                }
            }
        } catch (smsErr) {
            console.error('SMS notification failed:', smsErr.message || smsErr);
        }

        if (req.body.price_update) {
            const clothPrice = Number(order?.cloth_details?.post_price_etb);
            const shippingPrice = Number(order?.cloth_details?.post_shipping_price_etb);
            const clothText = Number.isFinite(clothPrice) ? `${clothPrice.toLocaleString()} ETB` : 'TBD';
            const shipText = Number.isFinite(shippingPrice) ? `${shippingPrice.toLocaleString()} ETB` : 'TBD';
            await notifyOrderOwner(
                order,
                'Order price set',
                `Your order price is updated. Cloth: ${clothText}, Shipping: ${shipText}. Please complete payment.`
            );
        } else if (req.body.negotiation_message) {
            await notifyOrderOwner(
                order,
                'New order message',
                String(req.body.negotiation_message || 'You have a new message about your order.').slice(0, 220)
            );
        } else {
            const statusSummary = [
                `Order: ${order.order_status || 'Updated'}`,
                `Payment: ${order.payment_status || 'Pending'}`,
                `Sewing: ${order.sewing_status || 'Pending'}`
            ].join(' | ');
            await notifyOrderOwner(order, 'Order updated', statusSummary);
        }

        res.json(order);
    } catch (err) {
        console.error(`[updateOrder] Error:`, err);
        res.status(500).send('Server Error');
    }
};

exports.addNegotiationMessage = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ msg: 'Order not found' });

        const isProductAsIsOrder =
            String(order?.order_type || '').toLowerCase() === 'product'
            || !!(order.post_id || order.productId);
        if (isProductAsIsOrder) {
            return res.status(400).json({ msg: 'Negotiation is only available for custom reference-image orders.' });
        }

        const isAdmin = req.user && req.user.role === 'admin';
        const isOwner = order.user_id && String(order.user_id) === String(req.user && req.user.id);
        if (!isAdmin && !isOwner) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        const message = String(req.body?.message || '').trim();
        const imageFile = req.file && req.file.buffer ? req.file : null;
        if (!message && !imageFile) {
            return res.status(400).json({ msg: 'Message text or image is required' });
        }

        let imageUrl = '';
        if (imageFile) {
            const up = await Upload.create({
                originalName: imageFile.originalname,
                mimeType: imageFile.mimetype,
                size: imageFile.size,
                data: imageFile.buffer,
                visibility: 'private',
                owner_user_id: req.user && req.user.id ? req.user.id : undefined,
                purpose: 'chat_attachment',
                order_id: order._id
            });
            imageUrl = '/api/uploads/' + up._id;
        }

        const senderRole = isAdmin ? 'admin' : 'user';
        order.negotiation_messages = Array.isArray(order.negotiation_messages) ? order.negotiation_messages : [];
        order.negotiation_messages.push({
            sender_role: senderRole,
            message,
            image_url: imageUrl,
            timestamp: new Date()
        });

        await order.save();

        if (isAdmin) {
            await notifyOrderOwner(order, 'New order message', (message || 'Admin sent an attachment').slice(0, 220));
        }

        return res.json({ msg: 'Message sent', order });
    } catch (err) {
        console.error('addNegotiationMessage error:', err?.message || err);
        return res.status(500).json({ msg: 'Server Error' });
    }
};

exports.uploadOrderPaymentProof = async (req, res) => {
    try {
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ msg: 'Order not found' });

        const isProductAsIsOrder =
            String(order?.order_type || '').toLowerCase() === 'product'
            || !!(order.post_id || order.productId);
        if (isProductAsIsOrder) {
            return res.status(400).json({ msg: 'This endpoint is only for custom quote-first orders.' });
        }

        const isAdmin = req.user && req.user.role === 'admin';
        const isOwner = order.user_id && String(order.user_id) === String(req.user && req.user.id);
        if (!isAdmin && !isOwner) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        return res.status(400).json({ msg: 'Manual payment screenshot upload is not supported. Please pay securely online using Chapa.' });

        const up = await savePrivateOrderUpload(
            file,
            req.user && req.user.id ? req.user.id : undefined,
            'order_payment_screenshot',
            order._id
        );

        order.payment_info = order.payment_info || {};
        order.payment_info.method = paymentMethod;
        order.payment_info.comment = paymentComment;
        order.payment_info.status = 'Pending';
        order.payment_info.screenshot_url = '/api/uploads/' + up._id;
        order.payment_info.screenshot_mime_type = String(up?.mimeType || file?.mimetype || '').trim();
        order.payment_screenshot_url = order.payment_info.screenshot_url;
        order.payment_screenshot_mime_type = order.payment_info.screenshot_mime_type;
        order.payment_comment = paymentComment;
        order.payment_info.paid_at = new Date();
        markOrderPaymentInfoModified(order);
        order.payment_status = 'Pending';
        order.order_status = deriveOrderStatus(order.payment_status, order.sewing_status, order.order_status);

        await order.save();

        await notifyAdminsAboutPaymentProof(order);

        return res.json({ msg: 'Payment proof uploaded', order });
    } catch (err) {
        console.error('uploadOrderPaymentProof error:', err?.message || err);
        return res.status(500).json({ msg: 'Server Error' });
    }
};

/**
 * DELETE /api/orders/:id/cancel
 * Allow a user to cancel (remove) their own order if payment is still pending
 */
exports.cancelOrder = async (req, res) => {
    try {
        const orderId = String(req.params.id || '').trim();
        if (!orderId) {
            return res.status(400).json({ msg: 'Invalid order ID' });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ msg: 'Order not found' });
        }

        // Only the owner or admin can cancel
        const isAdmin = req.user && (req.user.role === 'admin' || req.user.isAdmin);
        const isOwner = order.user_id && String(order.user_id) === String(req.user && (req.user._id || req.user.id));
        if (!isAdmin && !isOwner) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        // Prevent cancellation if payment is already confirmed / completed
        // Covers: 'Confirmed', 'confirmed', 'Completed', 'completed', 'success' (Chapa webhook value)
        const paymentStatus = String(
            order.payment_status ||
            order.payment_info?.status ||
            order.paymentStatus ||
            'Pending'
        ).toLowerCase().trim();

        const orderStatus = String(order.order_status || order.status || '').toLowerCase().trim();

        const isPaid =
            paymentStatus === 'confirmed' ||
            paymentStatus === 'completed' ||
            paymentStatus === 'success' ||
            orderStatus === 'payment confirmed' ||
            orderStatus === 'delivered' ||
            orderStatus === 'shipped';

        if (isPaid) {
            return res.status(400).json({ msg: 'Cannot cancel an order that has already been paid or is in progress.' });
        }

        // Use deleteOne instead of findByIdAndDelete for Firestore compatibility
        await Order.deleteOne({ _id: orderId });

        return res.json({ msg: 'Order cancelled and removed successfully.' });
    } catch (err) {
        console.error('cancelOrder error:', err?.message || err);
        return res.status(500).json({ msg: 'Server Error' });
    }
};
