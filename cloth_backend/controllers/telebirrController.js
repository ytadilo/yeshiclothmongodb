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

        let total = order.total_price || ((order.post_price_etb || 0) + (order.shipping_cost || 0));
        if (total <= 0) total = 1; // Fallback to avoid 0 amount

        order.payment_method = 'telebirr_api';
        await order.save();

        if (!FABRIC_APP_ID || !APP_SECRET || !TELEBIRR_PRIVATE_KEY) {
            console.error('Telebirr credentials missing on server.');
            return res.status(500).json({ msg: 'Telebirr credentials missing on server.' });
        }

        // 1. Authenticate with Telebirr token API
        const tokenUrl = `${TELEBIRR_BASE_URL.replace('/api/v1', '')}/access/token`;
        const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ appId: FABRIC_APP_ID, appSecret: APP_SECRET })
        });
        
        let tokenData;
        const responseText = await tokenRes.text();
        try {
            tokenData = JSON.parse(responseText);
        } catch (e) {
            console.error('Telebirr Token HTTP Response:', responseText);
            throw new Error(`Telebirr token API returned invalid JSON (Status: ${tokenRes.status}). Response: ${responseText.substring(0, 100)}`);
        }
        const token = tokenData.data ? tokenData.data.token : tokenData.token;

        if (!token) throw new Error('Failed to retrieve authentication token from Telebirr.');

        // 2. Prepare encrypted request body
        const bizContentObj = {
            merchantAppId: MERCHANT_APP_ID,
            fabricToken: token,
            title: `Yeshi Clothe Order ${orderId}`,
            tradeType: 'Checkout',
            outTradeNo: orderId.toString(),
            totalAmount: total.toString(),
            returnUrl: `https://www.yeshiclothe.com.et/my-orders`,
            notifyUrl: `https://myclothefullstackhaile.onrender.com/api/telebirr/webhook`
        };
        const bizContent = JSON.stringify(bizContentObj);
        
        const payloadString = `appid=${FABRIC_APP_ID}&bizContent=${bizContent}`;
        const signature = signRSA(payloadString);

        // 3. Initiate checkout payment request
        const checkoutUrlReq = `${TELEBIRR_BASE_URL.replace('/api/v1', '')}/checkout/requestOrder`;
        const checkoutRes = await fetch(checkoutUrlReq, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                appid: FABRIC_APP_ID,
                sign: signature,
                bizContent: bizContent
            })
        });
        
        let checkoutData;
        const checkoutResponseText = await checkoutRes.text();
        try {
            checkoutData = JSON.parse(checkoutResponseText);
        } catch (e) {
            console.error('Telebirr Checkout HTTP Response:', checkoutResponseText);
            throw new Error(`Telebirr checkout API returned invalid JSON (Status: ${checkoutRes.status}). Response: ${checkoutResponseText.substring(0, 100)}`);
        }

        // 4. Return checkout URL to frontend
        if (checkoutData.code === '0' || checkoutData.code === 200) {
            const checkoutUrl = checkoutData.data ? (checkoutData.data.toPayUrl || checkoutData.data.rawPaymentUrl) : checkoutData.toPayUrl;
            return res.json({ checkoutUrl });
        } else {
            console.error('Telebirr error:', checkoutData);
            return res.status(400).json({ msg: 'Telebirr checkout failed', details: checkoutData });
        }
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
