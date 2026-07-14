/**
 * Chapa Payment Service
 * Uses the official chapa-nodejs SDK: https://github.com/Chapa-Et/chapa-nodejs
 *
 * The SDK throws HttpException(message: string, status: number) on errors.
 * HttpException extends Error, so error.message is always a plain string.
 */

const { Chapa } = require('chapa-nodejs');
const crypto = require('crypto');
const logger = require('../utils/logger');

// Extract a safe string message from any thrown value
function extractMessage(error) {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error;
    if (typeof error.message === 'string' && error.message) return error.message;
    try { return JSON.stringify(error); } catch (_) { return String(error); }
}

class ChapaService {
    constructor() {
        this.secretKey = process.env.CHAPA_SECRET_KEY || '';
        this.baseReturnUrl = process.env.BASE_URL || 'https://myclothe.app.aletcloud.com';
        this.callbackUrl = process.env.CALLBACK_URL ||
            `${this.baseReturnUrl}/api/payments/chapa/webhook`;
        this.returnUrl = process.env.RETURN_URL ||
            'https://www.yeshiclothe.com.et/success';

        if (!this.secretKey) {
            logger.warn('CHAPA_SECRET_KEY is not configured in environment variables');
        } else {
            this.chapa = new Chapa({ secretKey: this.secretKey });
        }
    }

    generateTxRef(userId = '') {
        const timestamp = Date.now();
        const random = crypto.randomBytes(8).toString('hex');
        const userPart = userId ? `_${String(userId).slice(-6)}` : '';
        return `TXREF_${timestamp}${userPart}_${random}`;
    }

    async initializePayment(paymentData) {
        try {
            if (!this.chapa) {
                return {
                    success: false,
                    message: 'Payment not configured — CHAPA_SECRET_KEY missing on server',
                    data: null
                };
            }

            const initOptions = {
                amount: String(paymentData.amount),
                currency: paymentData.currency || 'ETB',
                email: paymentData.email,
                phone_number: paymentData.phone,   // must be 09XXXXXXXX or 07XXXXXXXX
                first_name: paymentData.first_name,
                last_name: paymentData.last_name,
                tx_ref: paymentData.tx_ref,
                callback_url: this.callbackUrl,
                return_url: `${this.returnUrl}?tx_ref=${paymentData.tx_ref}`,
                customization: {
                    title: String((paymentData.customization && paymentData.customization.title) || 'Yeshi Clothe'),
                    description: String((paymentData.customization && paymentData.customization.description) || 'Complete your purchase')
                }
            };

            logger.info('Chapa initialize request', {
                tx_ref: paymentData.tx_ref,
                amount: initOptions.amount,
                email: initOptions.email,
                phone: initOptions.phone_number,
                keyPrefix: this.secretKey.substring(0, 7) + '...'
            });

            // SDK throws HttpException on failure — caught below
            const response = await this.chapa.initialize(initOptions);

            logger.info('Chapa initialize success', {
                tx_ref: paymentData.tx_ref,
                status: response && response.status,
                hasUrl: !!(response && response.data && response.data.checkout_url)
            });

            if (response && response.status === 'success' && response.data && response.data.checkout_url) {
                return {
                    success: true,
                    data: {
                        checkout_url: response.data.checkout_url,
                        transaction_id: (response.data && response.data.transaction_id) || null,
                        tx_ref: paymentData.tx_ref
                    },
                    message: 'Payment initialized successfully'
                };
            }

            const msg = extractMessage(response && response.message) || 'Chapa returned no checkout URL';
            logger.error('Chapa initialize non-success', { tx_ref: paymentData.tx_ref, msg, response });
            return { success: false, message: msg, data: null };

        } catch (error) {
            // SDK throws HttpException which extends Error — .message is always a string
            const msg = extractMessage(error);
            const status = error && error.status;
            logger.error('Chapa initialize error', {
                tx_ref: paymentData.tx_ref,
                message: msg,
                status,
                phone: paymentData.phone,
                keyPrefix: this.secretKey ? this.secretKey.substring(0, 7) + '...' : 'NOT SET'
            });
            return { success: false, message: msg, data: null, httpStatus: status };
        }
    }

    async verifyPayment(txRef) {
        try {
            if (!this.chapa) {
                return { success: false, message: 'Chapa not configured', data: null };
            }
            if (!txRef) {
                return { success: false, message: 'Transaction reference is required', data: null };
            }

            logger.info('Chapa verify request', { tx_ref: txRef });
            const response = await this.chapa.verify({ tx_ref: txRef });

            if (response && response.status === 'success') {
                const d = response.data || {};
                return {
                    success: true,
                    data: {
                        status: d.status,
                        amount: d.amount,
                        currency: d.currency,
                        reference: d.reference,
                        method: d.method,
                        type: d.type,
                        created_at: d.created_at
                    },
                    message: 'Payment verified successfully'
                };
            }

            return {
                success: false,
                message: extractMessage(response && response.message) || 'Verification failed',
                data: (response && response.data) || null
            };

        } catch (error) {
            const msg = extractMessage(error);
            logger.error('Chapa verify error', { tx_ref: txRef, message: msg });
            return { success: false, message: msg, data: null };
        }
    }

    validateWebhookSignature(rawBody, signature) {
        try {
            if (!signature || !rawBody) return false;
            const hash = crypto
                .createHmac('sha256', this.secretKey)
                .update(rawBody)
                .digest('hex');
            return crypto.timingSafeEqual(
                Buffer.from(hash, 'utf8'),
                Buffer.from(signature, 'utf8')
            );
        } catch (error) {
            logger.error('Webhook signature validation error', { error: error.message });
            return false;
        }
    }

    isConfigured() {
        return !!this.secretKey;
    }
}

module.exports = new ChapaService();
