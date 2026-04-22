const crypto = require('crypto');
const Order = require('../models/Order');

const TELEBIRR_BASE_URL = process.env.TELEBIRR_BASE_URL || 'https://app.ethiomobilemoney.et:2121/extgate/e-commerce/api/v1';
const FABRIC_APP_ID = process.env.FABRIC_APP_ID || '';
const APP_SECRET = process.env.APP_SECRET || '';
const MERCHANT_APP_ID = process.env.MERCHANT_APP_ID || '';
const TELEBIRR_PRIVATE_KEY = process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY.replace(/\\n/g, '\n') : '';

// Helper to sign the Telebirr AppId + BizContent using RSA-SHA256
function signRSA(payload) {
    if (!TELEBIRR_PRIVATE_KEY) return '';
    let privateKey = TELEBIRR_PRIVATE_KEY;
    if (!privateKey.includes('BEGIN PRIVATE KEY')) {
        privateKey = "-----BEGIN PRIVATE KEY-----\n" + privateKey + "\n-----END PRIVATE KEY-----";
    }
    const sign = crypto.createSign('RSA-SHA256');
    sign.update(payload);
    return sign.sign(privateKey, 'base64');
}

exports.initiatePayment = async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await Order.findById(orderId);
        
        if (!order) return res.status(404).json({ msg: 'Order not found' });
        
        // Ensure the current user owns it (we assume req.user is set by auth middleware)
        const currentUserId = req.user && req.user.id ? req.user.id : (req.user && req.user._id ? req.user._id : null);
        if (order.user_id && currentUserId && order.user_id.toString() !== currentUserId.toString()) {
            return res.status(403).json({ msg: 'Unauthorized' });
        }

        let total = order.total || order.total_price || ((order.post_price_etb || 0) + (order.shipping_cost || 0));
        let amount = typeof total === 'number' ? total : parseFloat(total);
        if (isNaN(amount) || amount <= 0) amount = 1; // Fallback to avoid 0 amount

        order.payment_method = 'telebirr_api';
        await order.save();

        if (!FABRIC_APP_ID || !APP_SECRET || !TELEBIRR_PRIVATE_KEY) {
            console.error('Telebirr credentials missing on server.');
            return res.status(500).json({ msg: 'Telebirr credentials missing on server.' });
        }

        // STEP 1: Process FABRIC APP TOKEN 
        const tokenUrl = `${TELEBIRR_BASE_URL.replace('/api/v1', '')}/access/token`;
        const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-APP-Key': FABRIC_APP_ID
            },
            body: JSON.stringify({ appSecret: APP_SECRET })
        });
        
        let tokenData;
        const responseText = await tokenRes.text();
        try {
            tokenData = JSON.parse(responseText);
        } catch (e) {
            throw new Error(`Telebirr token API returned invalid JSON (Status: ${tokenRes.status}). Response: ${responseText.substring(0, 100)}`);
        }
        
        // New Telebirr system maps this strictly to result.token or data.token
        const token = tokenData.token || (tokenData.data ? tokenData.data.token : null);

        if (!token) throw new Error('Failed to retrieve authentication token from Telebirr.');

        // STEP 2: PREPARE AND FLATTEN PREORDER BIZ_CONTENT 
        const bizContentObj = {
            appid: MERCHANT_APP_ID,
            merch_code: process.env.MERCH_CODE || process.env.SHORT_CODE || '101011',
            merch_order_id: orderId.toString(),
            title: `Yeshi Clothe Order ${orderId}`,
            total_amount: amount.toString(),
            trans_currency: 'ETB',
            trade_type: 'Checkout',
            business_type: 'BuyGoods',
            timeout_express: '120m',
            return_url: `https://www.yeshiclothe.com.et/my-orders`,
            notify_url: `https://myclothefullstackhaile.onrender.com/api/telebirr/webhook`
        };

        const payload = {
            timestamp: Math.floor(Date.now()).toString(),
            nonce_str: crypto.randomBytes(16).toString('hex'),
            method: 'payment.preorder',
            version: '1.0',
            sign_type: 'SHA256WithRSA',
            biz_content: bizContentObj
        };

        // Flatten dictionary for strict signing.
        const signatureMap = { ...payload };
        for (const [k, v] of Object.entries(bizContentObj)) {
            signatureMap[k] = v;
        }
        
        const keys = Object.keys(signatureMap).sort();
        const stringToSign = keys
            .filter(key => key !== 'sign' && key !== 'sign_type' && signatureMap[key] !== undefined && signatureMap[key] !== null && signatureMap[key] !== '')
            .map(key => {
                let val = signatureMap[key];
                if (typeof val === 'object') {
                    val = JSON.stringify(val);
                }
                return `${key}=${val}`;
            })
            .join('&');

        const signCipher = crypto.createSign('RSA-SHA256');
        signCipher.update(stringToSign, 'utf8');
        payload.sign = signCipher.sign(TELEBIRR_PRIVATE_KEY, 'base64');
        
        // Ensure stringified nested content as required by the spec
        payload.biz_content = bizContentObj;

        // STEP 3: PERFORM PRE-ORDER POST 
        const checkoutUrlReq = `${TELEBIRR_BASE_URL.replace('/api/v1', '')}/checkout/requestOrder`;
        const checkoutRes = await fetch(checkoutUrlReq, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-APP-Key': FABRIC_APP_ID,
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        
        let checkoutData;
        const checkoutResponseText = await checkoutRes.text();
        try {
            checkoutData = JSON.parse(checkoutResponseText);
        } catch (e) {
            throw new Error(`Telebirr checkout API returned invalid JSON (Status: ${checkoutRes.status}). Response: ${checkoutResponseText.substring(0, 100)}`);
        }

        // STEP 4: REDIRECT URL OR GENERATE PREPAY ID FALLBACK
        if (checkoutData.code === '0' || checkoutData.code === 200) {
            const biz = typeof checkoutData.biz_content === 'string' ? JSON.parse(checkoutData.biz_content) : (checkoutData.biz_content || checkoutData);
            let checkoutUrl = biz.toPayUrl || biz.rawPaymentUrl || checkoutData.toPayUrl;
            
            if (!checkoutUrl && biz.prepay_id) {
                // Generate C2B Web Checkout URL using prepay_id
                const prepayMap = {
                    appid: MERCHANT_APP_ID,
                    merch_code: process.env.MERCH_CODE || process.env.SHORT_CODE || '101011',
                    nonce_str: crypto.randomBytes(16).toString('hex'),
                    prepay_id: biz.prepay_id,
                    timestamp: Math.floor(Date.now()).toString()
                };

                const pKeys = Object.keys(prepayMap).sort();
                const pStringToSign = pKeys
                    .filter(key => key !== 'sign' && key !== 'sign_type' && prepayMap[key] !== undefined && prepayMap[key] !== null && prepayMap[key] !== '')
                    .map(key => `${key}=${prepayMap[key]}`)
                    .join('&');

                const prepaySignCipher = crypto.createSign('RSA-SHA256');
                prepaySignCipher.update(pStringToSign, 'utf8');
                const prepaySign = prepaySignCipher.sign(TELEBIRR_PRIVATE_KEY, 'base64');
                
                // Keep URL encoding safe parameters
                const rawRequestString = [
                    `appid=${prepayMap.appid}`,
                    `merch_code=${prepayMap.merch_code}`,
                    `nonce_str=${prepayMap.nonce_str}`,
                    `prepay_id=${prepayMap.prepay_id}`,
                    `timestamp=${prepayMap.timestamp}`,
                    `sign=${encodeURIComponent(prepaySign)}`,
                    `sign_type=SHA256WithRSA`
                ].join('&');

                const webBaseUrl = TELEBIRR_BASE_URL.replace('/apiaccess/payment/gateway', '/payment/web/paygate');
                checkoutUrl = `${webBaseUrl}?${rawRequestString}&version=1.0&trade_type=Checkout`;
            }

            if (checkoutUrl) {
                return res.json({ checkoutUrl });
            } else if (biz.prepay_id) {
                return res.json({ checkoutUrl: '', rawRequest: biz.prepay_id });
            }
        } 

        throw new Error(`Preorder failed: ${JSON.stringify(checkoutData)}`);
        
    } catch (err) {
        console.error('Telebirr Initiate Payment error:', err);
        return res.status(500).json({ msg: 'Server Error initializing Telebirr Checkout', error: err.message, stack: err.stack });
    }
};

// Secure Backend Webhook for auto-confirming payment
exports.telebirrWebhook = async (req, res) => {
    try {
        const payload = req.body;
        console.log('Telebirr Webhook Payload:', payload);
        
        const parsedBiz = (typeof payload.bizContent === 'string') 
            ? JSON.parse(payload.bizContent) 
            : (payload.bizContent || payload);

        const outTradeNo = parsedBiz.outTradeNo || payload.outTradeNo;
        const tradeStatus = parsedBiz.tradeStatus || payload.tradeStatus;

        if (tradeStatus === 'Completed' || tradeStatus === 'SUCCESS' || tradeStatus === '1' || tradeStatus === '2') {
            const order = await Order.findById(outTradeNo);
            if (order) {
                order.payment_status = 'Confirmed';
                order.order_status = 'Payment Confirmed';
                if (!order.payment_info) order.payment_info = {};
                order.payment_info.status = 'Confirmed';
                order.payment_info.method = 'telebirr_api';
                order.payment_info.transactionId = parsedBiz.tradeNo || payload.tradeNo;
                
                await order.save();
                console.log(`Order ${outTradeNo} marked correctly as Paid through Telebirr!`);
            }
        } else if (tradeStatus === 'Failed' || tradeStatus === 'FAILED' || tradeStatus === '3' || tradeStatus === 'Cancel') {
            const order = await Order.findById(outTradeNo);
            if (order && order.payment_status !== 'Confirmed') { // Only mark failed if not already confirmed
                order.payment_status = 'Failed';
                if (!order.payment_info) order.payment_info = {};
                order.payment_info.status = 'Failed';
                order.payment_info.method = 'telebirr_api';
                
                await order.save();
                console.log(`Order ${outTradeNo} marked as Failed through Telebirr webhook!`);
            }
        }
        res.status(200).send('success');
    } catch (err) {
        console.error('Telebirr Webhook Processing Error:', err);
        res.status(500).send('fail');
    }
};
