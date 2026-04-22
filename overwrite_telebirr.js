const fs = require('fs');

const content = `const crypto = require('crypto');
const Order = require('../models/Order');

const TELEBIRR_BASE_URL = process.env.TELEBIRR_BASE_URL || 'https://telebirrappcube.ethiomobilemoney.et:38443/apiaccess/payment/gateway';
const FABRIC_APP_ID = process.env.FABRIC_APP_ID || '';
const APP_SECRET = process.env.APP_SECRET || '';
const MERCHANT_APP_ID = process.env.MERCHANT_APP_ID || '';
const MERCH_CODE = process.env.MERCH_CODE || process.env.SHORT_CODE || '101011'; // Default shortcode
let TELEBIRR_PRIVATE_KEY = process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY.replace(/\\\\n/g, '\\n') : '';

if (TELEBIRR_PRIVATE_KEY && !TELEBIRR_PRIVATE_KEY.includes('BEGIN PRIVATE KEY')) {
    TELEBIRR_PRIVATE_KEY = "-----BEGIN PRIVATE KEY-----\\n" + TELEBIRR_PRIVATE_KEY + "\\n-----END PRIVATE KEY-----";
}

// 1. Strict signature algorithm as per H5 SuperApp docs
function signRSAStrict(payloadMap) {
    if (!TELEBIRR_PRIVATE_KEY) return '';
    
    // Sort keys alphabetically
    const keys = Object.keys(payloadMap).sort();
    
    // Flatten keys to string and exclude empty / sign values
    const stringToSign = keys
        .filter(key => key !== 'sign' && key !== 'sign_type' && payloadMap[key] !== undefined && payloadMap[key] !== null && payloadMap[key] !== '')
        .map(key => {
            let val = payloadMap[key];
            if (typeof val === 'object') {
                val = JSON.stringify(val); // Strict stringification of biz_content
            }
            return \`\${key}=\${val}\`;
        })
        .join('&');

    const sign = crypto.createSign('RSA-SHA256');
    sign.update(stringToSign, 'utf8');
    return sign.sign(TELEBIRR_PRIVATE_KEY, 'base64');
}

exports.initiatePayment = async (req, res) => {
    try {
        const orderId = req.params.id;
        const order = await Order.findById(orderId);
        
        if (!order) return res.status(404).json({ msg: 'Order not found' });
        
        const currentUserId = req.user && req.user.id ? req.user.id : (req.user && req.user._id ? req.user._id : null);
        if (order.user_id && currentUserId && order.user_id.toString() !== currentUserId.toString()) {
            return res.status(403).json({ msg: 'Unauthorized' });
        }

        let total = order.total || order.total_price || ((order.post_price_etb || 0) + (order.shipping_cost || 0));
        let amount = typeof total === 'number' ? total : parseFloat(total);
        if (isNaN(amount) || amount <= 0) amount = 1;

        order.payment_method = 'telebirr_api';
        await order.save();

        if (!FABRIC_APP_ID || !APP_SECRET || !TELEBIRR_PRIVATE_KEY) {
            throw new Error('Telebirr credentials missing on server.');
        }

        // STEP 1: Get Token
        const tokenUrl = \`\${TELEBIRR_BASE_URL}/payment/v1/token\`;
        const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-APP-Key': FABRIC_APP_ID
            },
            body: JSON.stringify({ appSecret: APP_SECRET })
        });
        
        let tokenData;
        const tokenText = await tokenRes.text();
        try {
            tokenData = JSON.parse(tokenText);
        } catch (e) {
            throw new Error(\`Token API parse failed (Status: \${tokenRes.status}): \${tokenText.substring(0, 100)}\`);
        }
        
        // In the new API token is found at tokenData.token string instead of data.token
        const token = tokenData.token || (tokenData.data ? tokenData.data.token : null);

        if (!token) throw new Error(\`Token failed: \${JSON.stringify(tokenData)}\`);

        // STEP 2: PreOrder
        const bizContentObj = {
            appid: MERCHANT_APP_ID,
            merch_code: MERCH_CODE,
            merch_order_id: orderId.toString(),
            title: \`Yeshi Clothe Order \${orderId}\`,
            total_amount: amount.toString(),
            trans_currency: 'ETB',
            trade_type: 'Checkout', // Web checkout
            business_type: 'BuyGoods',
            timeout_express: '120m',
            return_url: \`https://www.yeshiclothe.com.et/my-orders\`,
            notify_url: \`https://myclothefullstackhaile.onrender.com/api/telebirr/webhook\`
        };

        const payload = {
            timestamp: Math.floor(Date.now()).toString(),
            nonce_str: crypto.randomBytes(16).toString('hex'),
            method: 'payment.preorder',
            version: '1.0',
            sign_type: 'SHA256WithRSA',
            biz_content: bizContentObj
        };

        // Inject biz_content keys directly into the payload map for flattened signing natively
        const signatureMap = { ...payload };
        for (const [k, v] of Object.entries(bizContentObj)) {
            signatureMap[k] = v;
        }

        payload.sign = signRSAStrict(signatureMap);

        const checkoutUrlReq = \`\${TELEBIRR_BASE_URL}/payment/v1/merchant/preOrder\`;
        const checkoutRes = await fetch(checkoutUrlReq, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-APP-Key': FABRIC_APP_ID,
                'Authorization': \`Bearer \${token}\`
            },
            body: JSON.stringify(payload)
        });
        
        let checkoutData;
        const checkoutRespText = await checkoutRes.text();
        try {
            checkoutData = JSON.parse(checkoutRespText);
        } catch (e) {
            throw new Error(\`PreOrder API parse failed (Status: \${checkoutRes.status}): \${checkoutRespText.substring(0, 100)}\`);
        }

        if (checkoutData.code === '0' || checkoutData.code === 200) {
            // Depending on pure WebCheckout vs H5, it may return toPayUrl or rawPaymentUrl inside biz_content
            const biz = typeof checkoutData.biz_content === 'string' ? JSON.parse(checkoutData.biz_content) : (checkoutData.biz_content || checkoutData);
            const checkoutUrl = biz.toPayUrl || biz.rawPaymentUrl || checkoutData.toPayUrl;
            
            if (checkoutUrl) {
                return res.json({ checkoutUrl });
            } else if (biz.prepay_id) {
                // If it only yields prepay_id, we send the rawRequest up to the frontend for js_fun_start_pay
                // but since frontend expects a url, let's gracefully fall back
                return res.json({ checkoutUrl: '', rawRequest: biz.prepay_id });
            }
        } 

        throw new Error(\`Preorder failed: \${JSON.stringify(checkoutData)}\`);
        
    } catch (err) {
        console.error('Telebirr Payment Error:', err);
        return res.status(500).json({ msg: 'telebirr_error', error: err.message });
    }
};

exports.telebirrWebhook = async (req, res) => {
    try {
        const payload = req.body;
        console.log('Telebirr Webhook Payload:', payload);
        
        const parsedBiz = (typeof payload.bizContent === 'string') 
            ? JSON.parse(payload.bizContent) 
            : (typeof payload.biz_content === 'string' ? JSON.parse(payload.biz_content) : (payload.biz_content || payload.bizContent || payload));

        const outTradeNo = parsedBiz.outTradeNo || parsedBiz.merch_order_id || payload.outTradeNo;
        const tradeStatus = parsedBiz.tradeStatus || parsedBiz.trade_status || payload.tradeStatus;

        if (tradeStatus === 'Completed' || tradeStatus === 'SUCCESS' || tradeStatus === '1' || tradeStatus === '2') {
            const order = await Order.findById(outTradeNo);
            if (order) {
                order.payment_status = 'Confirmed';
                order.order_status = 'Payment Confirmed';
                if (!order.payment_info) order.payment_info = {};
                order.payment_info.status = 'Confirmed';
                order.payment_info.method = 'telebirr_api';
                order.payment_info.transactionId = parsedBiz.tradeNo || parsedBiz.trade_no || payload.tradeNo;
                
                await order.save();
                console.log(\`Order \${outTradeNo} marked correctly as Paid through Telebirr!\`);
            }
        } else if (tradeStatus === 'Failed' || tradeStatus === 'FAILED' || tradeStatus === '3' || tradeStatus === 'Cancel') {
            const order = await Order.findById(outTradeNo);
            if (order && order.payment_status !== 'Confirmed') {
                order.payment_status = 'Failed';
                if (!order.payment_info) order.payment_info = {};
                order.payment_info.status = 'Failed';
                order.payment_info.method = 'telebirr_api';
                
                await order.save();
                console.log(\`Order \${outTradeNo} marked as Failed through Telebirr webhook!\`);
            }
        }
        res.status(200).send('success');
    } catch (err) {
        console.error('Telebirr Webhook Processing Error:', err);
        res.status(500).send('fail');
    }
};
`;

fs.writeFileSync('cloth_backend/controllers/telebirrController.js', content);
