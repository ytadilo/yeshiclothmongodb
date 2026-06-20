/**
 * Chapa Payment Service
 * Handles all interactions with Chapa API for secure payment processing
 * 
 * Official Chapa API Documentation: https://chapa.co/docs/
 */

const axios = require('axios');
const crypto = require('crypto');
const logger = require('../utils/logger');

class ChapaService {
    constructor() {
        // Load from environment variables
        this.secretKey = process.env.CHAPA_SECRET_KEY || '';
        this.publicKey = process.env.CHAPA_PUBLIC_KEY || '';
        this.baseUrl = process.env.CHAPA_BASE_URL || 'https://api.chapa.co/v1';
        // Default to production URLs so the service works without extra config on Render
        this.baseReturnUrl = process.env.BASE_URL || 'https://myclothefullstackhaile.onrender.com';
        this.callbackUrl = process.env.CALLBACK_URL ||
            `${this.baseReturnUrl}/api/payments/chapa/webhook`;
        this.returnUrl = process.env.RETURN_URL ||
            'https://www.yeshiclothe.com.et/payment-result';

        if (!this.secretKey) {
            logger.warn('CHAPA_SECRET_KEY is not configured in environment variables');
        }
    }

    /**
     * Generate a unique transaction reference
     * Format: TXREF_TIMESTAMP_RANDOM
     */
    generateTxRef(userId = '') {
        const timestamp = Date.now();
        const random = crypto.randomBytes(8).toString('hex');
        const userPart = userId ? `_${String(userId).slice(-6)}` : '';
        return `TXREF_${timestamp}${userPart}_${random}`;
    }

    /**
     * Initialize payment checkout with Chapa
     * 
     * @param {Object} paymentData
     * @param {string} paymentData.amount - Amount to charge
     * @param {string} paymentData.currency - Currency (ETB, USD)
     * @param {string} paymentData.email - Customer email
     * @param {string} paymentData.phone - Customer phone
     * @param {string} paymentData.first_name - Customer first name
     * @param {string} paymentData.last_name - Customer last name
     * @param {string} paymentData.tx_ref - Unique transaction reference
     * @param {Object} paymentData.customization - Customization options (title, description, image, etc.)
     * @param {Object} paymentData.meta - Metadata to pass through webhook
     * 
     * @returns {Promise<{success: boolean, data: Object, message: string}>}
     */
    async initializePayment(paymentData) {
        try {
            // Validate required fields
            this.validatePaymentData(paymentData);

            const payload = {
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
                    title: paymentData.customization?.title || 'Payment',
                    description: paymentData.customization?.description || 'Complete your payment',
                    logo: paymentData.customization?.logo || null
                },
                meta: {
                    user_id: paymentData.meta?.user_id,
                    order_id: paymentData.meta?.order_id,
                    ...paymentData.meta
                }
            };

            logger.info('Initializing Chapa payment', {
                tx_ref: paymentData.tx_ref,
                amount: paymentData.amount,
                email: paymentData.email
            });

            const response = await axios.post(
                `${this.baseUrl}/transaction/initialize`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            if (response.data?.status === 'success') {
                logger.info('Chapa payment initialized successfully', {
                    tx_ref: paymentData.tx_ref,
                    checkout_url: response.data.data?.checkout_url
                });

                return {
                    success: true,
                    data: {
                        checkout_url: response.data.data.checkout_url,
                        transaction_id: response.data.data.transaction_id,
                        tx_ref: paymentData.tx_ref
                    },
                    message: 'Payment initialized successfully'
                };
            } else {
                logger.error('Chapa payment initialization failed', {
                    tx_ref: paymentData.tx_ref,
                    response: response.data
                });

                return {
                    success: false,
                    message: response.data?.message || 'Payment initialization failed',
                    data: null
                };
            }
        } catch (error) {
            logger.error('Chapa payment initialization error', {
                error: error.message,
                tx_ref: paymentData.tx_ref
            });

            return {
                success: false,
                message: `Payment initialization failed: ${error.message}`,
                data: null,
                error: error.message
            };
        }
    }

    /**
     * Verify a payment transaction with Chapa
     * 
     * @param {string} txRef - The transaction reference
     * @returns {Promise<{success: boolean, data: Object, message: string}>}
     */
    async verifyPayment(txRef) {
        try {
            if (!txRef) {
                throw new Error('Transaction reference is required');
            }

            logger.info('Verifying Chapa payment', { tx_ref: txRef });

            const response = await axios.get(
                `${this.baseUrl}/transaction/verify/${txRef}`,
                {
                    headers: {
                        'Authorization': `Bearer ${this.secretKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            if (response.data?.status === 'success') {
                const transactionData = response.data.data;

                logger.info('Payment verified successfully', {
                    tx_ref: txRef,
                    status: transactionData.status,
                    amount: transactionData.amount
                });

                return {
                    success: true,
                    data: {
                        status: transactionData.status,
                        amount: transactionData.amount,
                        currency: transactionData.currency,
                        reference: transactionData.reference,
                        customization: transactionData.customization,
                        charge: transactionData.charge,
                        method: transactionData.method,
                        type: transactionData.type,
                        created_at: transactionData.created_at
                    },
                    message: 'Payment verified successfully'
                };
            } else {
                logger.warn('Payment verification returned non-success status', {
                    tx_ref: txRef,
                    response: response.data
                });

                return {
                    success: false,
                    message: response.data?.message || 'Payment verification failed',
                    data: response.data?.data || null
                };
            }
        } catch (error) {
            logger.error('Chapa payment verification error', {
                error: error.message,
                tx_ref: txRef,
                status: error.response?.status,
                statusData: error.response?.data
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
     * Validate Chapa webhook signature.
     *
     * Chapa sends a `Chapa-Signature` header that is an HMAC-SHA256 of the
     * raw request body, keyed with your CHAPA_SECRET_KEY.
     *
     * Usage in controller:
     *   const sig = req.headers['chapa-signature'];
     *   const rawBody = req.rawBody; // set by express.json({ verify: ... })
     *   const valid = chapaService.validateWebhookSignature(rawBody, sig);
     *
     * @param {string|Buffer} rawBody  - The raw (unparsed) request body
     * @param {string}        signature - Value of the Chapa-Signature header
     * @returns {boolean}
     */
    validateWebhookSignature(rawBody, signature) {
        try {
            if (!signature || !rawBody) return false;
            const hash = crypto
                .createHmac('sha256', this.secretKey)
                .update(rawBody)
                .digest('hex');
            // Constant-time comparison to prevent timing attacks
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
     * Validate payment data before sending to Chapa
     */
    validatePaymentData(data) {
        const required = ['amount', 'email', 'phone', 'first_name', 'last_name', 'tx_ref'];
        const missing = required.filter(field => !data[field]);

        if (missing.length > 0) {
            throw new Error(`Missing required fields: ${missing.join(', ')}`);
        }

        // Validate amount
        const amount = parseFloat(data.amount);
        if (isNaN(amount) || amount <= 0) {
            throw new Error('Invalid amount. Must be a positive number');
        }

        // Validate email
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) {
            throw new Error('Invalid email address');
        }

        // Validate phone (basic check)
        const phoneRegex = /^\+?[0-9\s\-()]{6,}$/;
        if (!phoneRegex.test(data.phone)) {
            throw new Error('Invalid phone number');
        }
    }

    /**
     * Check if secret key is configured
     */
    isConfigured() {
        return !!this.secretKey;
    }
}

module.exports = new ChapaService();
