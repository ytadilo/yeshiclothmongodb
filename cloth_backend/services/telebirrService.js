const crypto = require('crypto');
const https = require('https');

const TELEBIRR_BASE_URL = 'https://developerportal.ethiotelebirr.et:38443/apiaccess/payment/gateway';

function getTelebirrConfig() {
    const privateKey = String(process.env.TELEBIRR_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
    const config = {
        baseUrl: String(process.env.TELEBIRR_BASE_URL || TELEBIRR_BASE_URL).trim(),
        fabricAppId: String(process.env.TELEBIRR_FABRIC_APP_ID || '').trim(),
        merchantAppId: String(process.env.TELEBIRR_MERCHANT_APP_ID || '').trim(),
        shortCode: String(process.env.TELEBIRR_SHORT_CODE || '').trim(),
        appSecret: String(process.env.TELEBIRR_APP_SECRET || '').trim(),
        privateKey,
        tradeType: String(process.env.TELEBIRR_TRADE_TYPE || 'InApp').trim() || 'InApp'
    };

    const missing = Object.entries(config)
        .filter(([key, value]) => key !== 'baseUrl' && key !== 'tradeType' && !value)
        .map(([key]) => key);

    if (missing.length) {
        throw new Error(`Telebirr configuration is incomplete: ${missing.join(', ')}`);
    }

    return config;
}

function createNonceStr() {
    return crypto.randomBytes(16).toString('hex').toUpperCase();
}

function createTimeStamp() {
    return Math.floor(Date.now() / 1000).toString();
}

function toAmountString(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Telebirr amount must be greater than zero');
    }
    return amount.toFixed(2).replace(/\.00$/, '');
}

function signString(text, privateKey) {
    return crypto.sign('sha256', Buffer.from(String(text || ''), 'utf8'), {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
        saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST
    }).toString('base64');
}

function signRequestObject(requestObject, privateKey) {
    const excludeFields = new Set(['sign', 'sign_type', 'header', 'refund_info', 'openType', 'raw_request', 'biz_content']);
    const fields = [];
    const fieldMap = {};

    Object.keys(requestObject || {}).forEach((key) => {
        if (excludeFields.has(key)) return;
        fields.push(key);
        fieldMap[key] = requestObject[key];
    });

    const bizContent = requestObject && requestObject.biz_content && typeof requestObject.biz_content === 'object'
        ? requestObject.biz_content
        : null;
    if (bizContent) {
        Object.keys(bizContent).forEach((key) => {
            if (excludeFields.has(key)) return;
            if (bizContent[key] && typeof bizContent[key] === 'object') return;
            fields.push(key);
            fieldMap[key] = bizContent[key];
        });
    }

    fields.sort();
    const signOrigin = fields.map((key) => `${key}=${fieldMap[key]}`).join('&');
    return signString(signOrigin, privateKey);
}

function requestJson(url, { method = 'GET', headers = {}, body } = {}) {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const req = https.request({
            protocol: target.protocol,
            hostname: target.hostname,
            port: target.port || 443,
            path: `${target.pathname}${target.search}`,
            method,
            headers
        }, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let parsed = null;
                try {
                    parsed = raw ? JSON.parse(raw) : null;
                } catch (_) {
                    parsed = raw;
                }

                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve(parsed);
                    return;
                }

                const message = parsed && typeof parsed === 'object'
                    ? (parsed.msg || parsed.message || parsed.error || raw)
                    : String(parsed || raw || `HTTP ${res.statusCode}`);
                reject(new Error(message));
            });
        });

        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function applyFabricToken(config) {
    const response = await requestJson(`${config.baseUrl}/payment/v1/token`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-APP-Key': config.fabricAppId
        },
        body: JSON.stringify({ appSecret: config.appSecret })
    });

    const token = response && typeof response === 'object'
        ? String(response.token || response.access_token || '').trim()
        : '';
    if (!token) {
        throw new Error('Telebirr Fabric token was not returned');
    }
    return token;
}

function buildSignedPreOrderRequest({ config, merchantOrderId, title, amount, notifyUrl, redirectUrl }) {
    const requestObject = {
        timestamp: createTimeStamp(),
        nonce_str: createNonceStr(),
        method: 'payment.preorder',
        version: '1.0'
    };

    requestObject.biz_content = {
        notify_url: notifyUrl,
        redirect_url: redirectUrl,
        trade_type: config.tradeType,
        appid: config.merchantAppId,
        merch_code: config.shortCode,
        merch_order_id: merchantOrderId,
        title,
        total_amount: toAmountString(amount),
        trans_currency: 'ETB',
        timeout_express: '120m',
        payee_identifier: config.shortCode,
        payee_identifier_type: '04',
        payee_type: '5000'
    };
    requestObject.sign = signRequestObject(requestObject, config.privateKey);
    requestObject.sign_type = 'SHA256WithRSA';
    return requestObject;
}

async function createPreOrder({ config, title, amount, merchantOrderId, notifyUrl, redirectUrl }) {
    const fabricToken = await applyFabricToken(config);
    const requestObject = buildSignedPreOrderRequest({ config, merchantOrderId, title, amount, notifyUrl, redirectUrl });
    const response = await requestJson(`${config.baseUrl}/payment/v1/merchant/preOrder`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-APP-Key': config.fabricAppId,
            Authorization: fabricToken
        },
        body: JSON.stringify(requestObject)
    });

    const bizContent = response && response.biz_content && typeof response.biz_content === 'object'
        ? response.biz_content
        : {};
    const prepayId = String(bizContent.prepay_id || response?.prepay_id || '').trim();
    if (!prepayId) {
        throw new Error('Telebirr prepay_id was not returned');
    }

    return { prepayId };
}

function buildRawRequest({ config, prepayId }) {
    const base = {
        appid: config.merchantAppId,
        merch_code: config.shortCode,
        nonce_str: createNonceStr(),
        prepay_id: prepayId,
        timestamp: createTimeStamp()
    };
    const sign = signRequestObject(base, config.privateKey);
    return [
        `appid=${base.appid}`,
        `merch_code=${base.merch_code}`,
        `nonce_str=${base.nonce_str}`,
        `prepay_id=${base.prepay_id}`,
        `timestamp=${base.timestamp}`,
        `sign=${sign}`,
        'sign_type=SHA256WithRSA'
    ].join('&');
}

function generateMerchantOrderId(orderId) {
    const cleanId = String(orderId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'ORDER';
    return `YESHI-${cleanId}-${Date.now()}`;
}

async function createCheckoutSession({ orderId, title, amount, notifyUrl, redirectUrl }) {
    const config = getTelebirrConfig();
    const merchantOrderId = generateMerchantOrderId(orderId);
    const { prepayId } = await createPreOrder({
        config,
        title,
        amount,
        merchantOrderId,
        notifyUrl,
        redirectUrl
    });

    return {
        merchantOrderId,
        prepayId,
        rawRequest: buildRawRequest({ config, prepayId }),
        checkoutToken: crypto.randomBytes(18).toString('hex'),
        tradeType: config.tradeType,
        shortCode: config.shortCode
    };
}

module.exports = {
    createCheckoutSession,
    getTelebirrConfig
};