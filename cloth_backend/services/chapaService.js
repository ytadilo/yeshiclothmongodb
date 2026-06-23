/**
 * Chapa Payment Service
 * Uses the official chapa-nodejs SDK: https://github.com/Chapa-Et/chapa-nodejs
 */

const { Chapa } = require('chapa-nodejs');
const crypto = require('crypto');
const logger = require('../utils/logger');

class ChapaService {
    constructor() {
        this.secretKey = process.env.CHAPA_SECRET_KEY || '';
        this.baseReturnUrl = process.env.BASE_URL || 'https://myclothefullstackhaile.onrender.com';
        this.callbackUrl = process.env.CALLBACK_URL ||
            `${this.baseReturnUrl}/api/payments/chapa/webhook`;
        this.returnUrl = process.env.RETURN_URL ||
            'https://www.yeshiclothe.com.et/payment-result';

        if (!this.secretKey) {
            logger.warn('CHAPA_SECRET_KEY is not configured in environment variables');
        } else {
            // Instantiate official Chapa SDK
            this.chapa = new Chapa({
                secretKey: this.secretKey
            });
        }
    }

    /**
     * Generate a unique transaction reference
     */
    generateTxRef(userId = '') {
        const timestamp = Date.now();
        const random = crypto.randomBytes(8).toString('hex');
        const userPart = userId ? `_${String(userId).slice(-6)}` : '';
        return `TXREF_${timestamp}${userPart}_${random}`;
    }

    /**
     * Initialize payment checkout with Chapa using official SDK
     */
    async initializePayment(paymentData) {
        try {
            if (!this.chapa) {
                throw new Error('Chapa SDK not initialized — CHAPA_SECRET_KEY is missing');
            }

            // Build only the fields Chapa requires
            const initOptions = {
                amount: String(paymentData.amount),
                currency: paymentData.currency || 'ETB',
                email: paymentData.email,
                phone_number: paymentData.phone,
                first_name: paymentData.first_name,
                last_name: paymentData.last_name,
                tx_ref: paymentData.tx_ref,
                callback_url: this.callbackUrl,
                return_url: `${this.returnUrl}?tx_ref=${paymentData.tx_ref}`,
                customization: {
                    title: (paymentData.customization && paymentData.customization.title) || 'Yeshi Clothe',
                    description: (paymentData.customization && paymentData.customization.description) || 'Complete your purchase'
                }
            };

            logger.info('Initializing Chapa payment via SDK', {
                tx_ref: paymentData.tx_ref,
                amount: paymentData.amount,
                email: paymentData.email,
                phone: paymentData.phone
            });

            const response = await this.chapa.initialize(initOptions);

            logger.info('Chapa SDK raw response', {
                tx_ref: paymentData.tx_ref,
                status: response.status,
                data: response.data
            });

            if (response.status === 'success' && response.data && response.data.checkout_url) {
                return {
                    success: true,
                    data: {
                        checkout_url: response.data.checkout_url,
                        transaction_id: response.data.transaction_id || null,
                        tx_ref: paymentData.tx_ref
                    },
                    message: 'Payment initialized successfully'
                };
            }

            logger.error('Chapa SDK returned non-success', {
                tx_ref: paymentData.tx_ref,
                response
            });

            return {
                success: false,
                message: response.message || 'Payment initialization failed',
                data: null
            };

        } catch (error) {
            // Log the full Chapa error response for debugging
            const chapaError = error.response && error.response.data;
            logger.error('Chapa SDK initialization error', {
                tx_ref: paymentData.tx_ref,
                error: error.message,
                httpStatus: error.response && error.response.status,
                chapaResponse: chapaError,
                sentPayload: {
                    amount: paymentData.amount,
                    email: paymentData.email,
                    phone: paymentData.phone,
                    first_name: paymentData.first_name,
                    last_name: paymentData.last_name,
                    tx_ref: paymentData.tx_ref
                }
            });

            // Extract a clean string message from whatever Chapa returned
            let userMessage = error.message || 'Unknown error';
            if (chapaError) {
                if (typeof chapaError === 'string') {
                    userMessage = chapaError;
                } else if (chapaError.message && typeof chapaError.message === 'string') {
                    userMessage = chapaError.message;
                } else if (chapaError.msg && typeof chapaError.msg === 'string') {
                    userMessage = chapaError.msg;
                } else {
                    userMessage = JSON.stringify(chapaError);
                }
            }

            return {
                success: false,
                message: userMessage,
                data: null,
                error: error.message,
                details: chapaError
            };
        }
    }

    /**
     * Verify a payment transaction with Chapa SDK
     */
    async verifyPayment(txRef) {
        try {
            if (!this.chapa) {
                throw new Error('Chapa SDK not initialized — CHAPA_SECRET_KEY is missing');
            }

            if (!txRef) {
                throw new Error('Transaction reference is required');
            }

            logger.info('Verifying Chapa payment via SDK', { tx_ref: txRef });

            const response = await this.chapa.verify({ tx_ref: txRef });

            logger.info('Chapa verify raw response', {
                tx_ref: txRef,
                status: response.status,
                data: response.data
            });

            if (response.status === 'success') {
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
                message: response.message || 'Payment verification failed',
                data: response.data || null
            };

        } catch (error) {
            const chapaError = error.response && error.response.data;
            logger.error('Chapa SDK verification error', {
                tx_ref: txRef,
                error: error.message,
                httpStatus: error.response && error.response.status,
                chapaResponse: chapaError
            });

            return {
                success: false,
                message: `Payment verification failed: ${error.message}`,
                data: null,
                error: error.message
            };
        }
    }

    /**
     * Validate Chapa webhook signature
     */
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

    /**
     * Check if Chapa secret key is configured
     */
    isConfigured() {
        return !!this.secretKey;
    }
}

module.exports = new ChapaService();
