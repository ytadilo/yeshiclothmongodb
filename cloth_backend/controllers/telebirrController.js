const crypto = require('crypto');
const Order = require('../models/Order');

const TELEBIRR_BASE_URL = process.env.TELEBIRR_BASE_URL || 'https://telebirrappcube.ethiomobilemoney.et:38443/apiaccess/payment/gateway';
const FABRIC_APP_ID = process.env.FABRIC_APP_ID || '';
const APP_SECRET = process.env.APP_SECRET || '';
const MERCHANT_APP_ID = process.env.MERCHANT_APP_ID || '';
const MERCH_CODE = process.env.MERCH_CODE || process.env.SHORT_CODE || '101011';

function normalizePrivateKey(raw) {
    let key = String(raw || '').trim();
    if (!key) return '';
    key = key.replace(/\\n/g, '\n');
    if (!key.includes('BEGIN PRIVATE KEY')) {
        key = `-----BEGIN PRIVATE KEY-----\n${key}\n-----END PRIVATE KEY-----`;
    }
    return key;
}

const TELEBIRR_PRIVATE_KEY = normalizePrivateKey(process.env.PRIVATE_KEY);

function signRSAStrict(payloadMap) {
    if (!TELEBIRR_PRIVATE_KEY) return '';

    const keys = Object.keys(payloadMap || {}).sort();
    const stringToSign = keys
        .filter((key) => key !== 'sign' && key !== 'sign_type' && payloadMap[key] !== undefined && payloadMap[key] !== null && payloadMap[key] !== '')
        .map((key) => {
            const value = payloadMap[key];
            return `${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`;
        })
        .join('&');

    const signer = crypto.createSign('RSA-SHA256');
    signer.update(stringToSign, 'utf8');
    return signer.sign(TELEBIRR_PRIVATE_KEY, 'base64');
}

function parseJsonSafely(text, contextLabel, statusCode) {
    try {
        return JSON.parse(text);
    } catch (_) {
        throw new Error(`${contextLabel} returned invalid JSON (status ${statusCode}): ${String(text || '').slice(0, 220)}`);
    }
}

function normalizeBearerToken(token) {
    const raw = String(token || '').trim();
    if (!raw) return '';
    return /^Bearer\s+/i.test(raw) ? raw : `Bearer ${raw}`;
}

function resolveOrderAmount(order) {
    const candidates = [
        order && order.total,
        order && order.totalPrice,
        order && order.total_price,
        order && order.proposed_price_etb,
        order && order.productPrice,
        Number(order && order.cloth_details && order.cloth_details.post_price_etb || 0) + Number(order && order.delivery_fee || 0)
    ];

    for (const candidate of candidates) {
        const value = typeof candidate === 'number' ? candidate : Number.parseFloat(candidate);
        if (Number.isFinite(value) && value > 0) {
            return value;
        }
    }

    return 1;
}

function getOrderOwnerId(order) {
    const source = order && (order.user_id || order.userId || order.user);
    if (!source) return '';
    if (typeof source === 'object' && source._id) return String(source._id);
    return String(source);
}

function buildC2BCheckoutUrl(prepayId) {
    const map = {
        appid: MERCHANT_APP_ID,
        merch_code: MERCH_CODE,
        nonce_str: crypto.randomBytes(16).toString('hex'),
        prepay_id: String(prepayId || '').trim(),
        timestamp: Math.floor(Date.now() / 1000).toString()
    };

    const sign = signRSAStrict(map);
    const rawRequest = [
        `appid=${encodeURIComponent(map.appid)}`,
        `merch_code=${encodeURIComponent(map.merch_code)}`,
        `nonce_str=${encodeURIComponent(map.nonce_str)}`,
        `prepay_id=${encodeURIComponent(map.prepay_id)}`,
        `timestamp=${encodeURIComponent(map.timestamp)}`,
        `sign=${encodeURIComponent(sign)}`,
        'sign_type=SHA256WithRSA'
    ].join('&');

    const webBaseUrl = TELEBIRR_BASE_URL.replace('/apiaccess/payment/gateway', '/payment/web/paygate');
    return `${webBaseUrl}?${rawRequest}&version=1.0&trade_type=Checkout`;
}

exports.initiatePayment = async (req, res) => {
    try {
        const orderId = String(req.params.id || '').trim();
        const order = await Order.findById(orderId);

        if (!order) return res.status(404).json({ msg: 'Order not found' });

        const currentUserId = req.user && (req.user.id || req.user._id) ? String(req.user.id || req.user._id) : '';
        const ownerId = getOrderOwnerId(order);
        if (ownerId && currentUserId && ownerId !== currentUserId) {
            return res.status(403).json({ msg: 'Unauthorized' });
        }

        if (!FABRIC_APP_ID || !APP_SECRET || !MERCHANT_APP_ID || !TELEBIRR_PRIVATE_KEY) {
            throw new Error('Telebirr credentials missing on server');
        }

        const amount = resolveOrderAmount(order);
        order.payment_method = 'telebirr_api';
        await order.save();

        const tokenUrl = `${TELEBIRR_BASE_URL}/payment/v1/token`;
        const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-APP-Key': FABRIC_APP_ID
            },
            body: JSON.stringify({ appSecret: APP_SECRET })
        });

        const tokenData = parseJsonSafely(await tokenRes.text(), 'Telebirr token API', tokenRes.status);
        const token = tokenData.token || (tokenData.data && tokenData.data.token);
        if (!token) {
            throw new Error(`Token request failed: ${JSON.stringify(tokenData)}`);
        }

        const bizContent = {
            notify_url: process.env.TELEBIRR_NOTIFY_URL || 'https://myclothefullstackhaile.onrender.com/api/telebirr/webhook',
            redirect_url: process.env.TELEBIRR_REDIRECT_URL || 'https://www.yeshiclothe.com.et/my-orders',
            appid: MERCHANT_APP_ID,
            merch_code: MERCH_CODE,
            merch_order_id: orderId,
            trade_type: 'Checkout',
            title: `Yeshi Clothe Order ${orderId}`,
            total_amount: String(amount),
            trans_currency: 'ETB',
            timeout_express: '120m',
            business_type: 'BuyGoods',
            payee_identifier: MERCH_CODE,
            payee_identifier_type: '04'
        };

        const payload = {
            timestamp: Math.floor(Date.now() / 1000).toString(),
            nonce_str: crypto.randomBytes(16).toString('hex'),
            method: 'payment.preorder',
            sign_type: 'SHA256WithRSA',
            version: '1.0',
            biz_content: bizContent
        };

        const signatureMap = { ...payload, ...bizContent };
        payload.sign = signRSAStrict(signatureMap);

        const preOrderUrl = `${TELEBIRR_BASE_URL}/payment/v1/merchant/preOrder`;
        const preOrderRes = await fetch(preOrderUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-APP-Key': FABRIC_APP_ID,
                Authorization: normalizeBearerToken(token)
            },
            body: JSON.stringify(payload)
        });

        const preOrderData = parseJsonSafely(await preOrderRes.text(), 'Telebirr preOrder API', preOrderRes.status);
        const biz = typeof preOrderData.biz_content === 'string'
            ? parseJsonSafely(preOrderData.biz_content, 'Telebirr biz_content', preOrderRes.status)
            : (preOrderData.biz_content || {});

        if (String(preOrderData.code) !== '0') {
            throw new Error(`Preorder failed: ${JSON.stringify(preOrderData)}`);
        }

        const directUrl = biz.toPayUrl || biz.rawPaymentUrl || preOrderData.toPayUrl;
        if (directUrl) {
            return res.json({ checkoutUrl: directUrl });
        }

        if (biz.prepay_id) {
            return res.json({
                checkoutUrl: buildC2BCheckoutUrl(biz.prepay_id),
                prepay_id: biz.prepay_id
            });
        }

        throw new Error(`No checkout URL or prepay_id returned: ${JSON.stringify(preOrderData)}`);
    } catch (err) {
        console.error('Telebirr Payment Error:', err);
        return res.status(500).json({ msg: 'telebirr_error', error: err.message });
    }
};

exports.telebirrWebhook = async (req, res) => {
    try {
        const payload = req.body || {};

        const parsedBiz = typeof payload.bizContent === 'string'
            ? parseJsonSafely(payload.bizContent, 'Webhook bizContent', 200)
            : (typeof payload.biz_content === 'string'
                ? parseJsonSafely(payload.biz_content, 'Webhook biz_content', 200)
                : (payload.biz_content || payload.bizContent || payload));

        const outTradeNo = parsedBiz.outTradeNo || parsedBiz.merch_order_id || payload.outTradeNo || payload.merch_order_id;
        const tradeStatus = String(parsedBiz.tradeStatus || parsedBiz.trade_status || payload.tradeStatus || payload.trade_status || '');

        if (!outTradeNo) {
            return res.status(200).send('success');
        }

        if (['Completed', 'SUCCESS', '1', '2'].includes(tradeStatus)) {
            const order = await Order.findById(String(outTradeNo));
            if (order) {
                order.payment_status = 'Confirmed';
                order.order_status = 'Payment Confirmed';
                if (!order.payment_info) order.payment_info = {};
                order.payment_info.status = 'Confirmed';
                order.payment_info.method = 'telebirr_api';
                order.payment_info.transactionId = parsedBiz.tradeNo || parsedBiz.trade_no || payload.tradeNo || payload.trade_no || '';
                await order.save();
            }
        } else if (['Failed', 'FAILED', '3', 'Cancel'].includes(tradeStatus)) {
            const order = await Order.findById(String(outTradeNo));
            if (order && order.payment_status !== 'Confirmed') {
                order.payment_status = 'Failed';
                if (!order.payment_info) order.payment_info = {};
                order.payment_info.status = 'Failed';
                order.payment_info.method = 'telebirr_api';
                await order.save();
            }
        }

        return res.status(200).send('success');
    } catch (err) {
        console.error('Telebirr Webhook Processing Error:', err);
        return res.status(500).send('fail');
    }
};
