/**
 * Payment Controller - Handles all payment-related endpoints
 * Manages Chapa payment initialization, webhook callbacks, and verification
 */

const Payment = require('../models/Payment');
const Order = require('../models/Order');
const User = require('../models/User');
const chapaService = require('../services/chapaService');
const logger = require('../utils/logger');
const validator = require('validator');

/**
 * POST /api/payments/initialize
 * Initialize a payment transaction with Chapa
 */
exports.initializePayment = async (req, res) => {
    try {
        // Validate Chapa is configured
        if (!chapaService.isConfigured()) {
            logger.error('Chapa not configured - secret key missing');
            return res.status(503).json({
                success: false,
                message: 'Payment system is not properly configured',
                data: null
            });
        }

        const { amount, currency = 'ETB', customer_email, customer_phone, customer_name, order_id, description } = req.body;
        const userId = req.user._id || req.user.id;

        // Validate input
        if (!amount || !customer_email || !customer_phone || !customer_name) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: amount, customer_email, customer_phone, customer_name',
                data: null
            });
        }

        // Validate amount
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Amount must be a positive number',
                data: null
            });
        }

        // Validate email
        if (!validator.isEmail(customer_email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email address',
                data: null
            });
        }

        // Normalize phone to local Ethiopian format (09XXXXXXXX or 07XXXXXXXX)
        // The chapa-nodejs SDK requires exactly this format — NOT E.164
        let finalPhone = String(customer_phone).trim().replace(/[\s\-().]/g, '');

        // Strip country code prefixes to get back to local 09/07 format
        if (/^\+2519\d{8}$/.test(finalPhone)) {
            finalPhone = '0' + finalPhone.slice(4);   // +2519XXXXXXXX -> 09XXXXXXXX
        } else if (/^\+2517\d{8}$/.test(finalPhone)) {
            finalPhone = '0' + finalPhone.slice(4);   // +2517XXXXXXXX -> 07XXXXXXXX
        } else if (/^2519\d{8}$/.test(finalPhone)) {
            finalPhone = '0' + finalPhone.slice(3);   // 2519XXXXXXXX  -> 09XXXXXXXX
        } else if (/^2517\d{8}$/.test(finalPhone)) {
            finalPhone = '0' + finalPhone.slice(3);   // 2517XXXXXXXX  -> 07XXXXXXXX
        } else if (/^9\d{8}$/.test(finalPhone)) {
            finalPhone = '0' + finalPhone;             // 9XXXXXXXX     -> 09XXXXXXXX
        } else if (/^7\d{8}$/.test(finalPhone)) {
            finalPhone = '0' + finalPhone;             // 7XXXXXXXX     -> 07XXXXXXXX
        }

        // If still not valid local format, use a safe fallback
        if (!/^(09|07)\d{8}$/.test(finalPhone)) {
            logger.warn('Phone not in Ethiopian local format, using fallback', { original: customer_phone, normalized: finalPhone });
            finalPhone = '0900000000'; // Chapa SDK accepts this as a valid fallback
        }

        // Split customer name
        const nameParts = String(customer_name).trim().split(/\s+/);
        const firstName = nameParts[0] || 'Customer';
        const lastName = nameParts.slice(1).join(' ') || 'User';

        // Check for duplicate pending payment
        const existingPayment = await Payment.findOne({
            user_id: userId,
            order_id: order_id || null,
            payment_status: 'pending',
            created_at: {
                $gt: new Date(Date.now() - 30 * 60 * 1000) // Last 30 minutes
            }
        });

        if (existingPayment) {
            logger.warn('Duplicate payment attempt prevented', {
                user_id: userId,
                order_id: order_id,
                existing_tx_ref: existingPayment.tx_ref
            });

            return res.status(409).json({
                success: false,
                message: 'You have a pending payment. Please complete or cancel it before initiating a new one.',
                data: {
                    existing_tx_ref: existingPayment.tx_ref
                }
            });
        }

        // Generate unique transaction reference
        const tx_ref = chapaService.generateTxRef(userId);

        // Create payment record in database
        const payment = new Payment({
            user_id: userId,
            order_id: order_id || null,
            tx_ref: tx_ref,
            amount: parsedAmount,
            currency: currency,
            customer_name: customer_name,
            customer_email: customer_email,
            customer_phone: finalPhone,
            payment_status: 'pending',
            description: description || '',
            metadata: {
                ip_address: req.ip,
                user_agent: req.get('user-agent')
            }
        });

        await payment.save();

        logger.info('Payment record created', {
            tx_ref: tx_ref,
            user_id: userId,
            amount: parsedAmount,
            order_id: order_id
        });

        // Initialize payment with Chapa
        const initializeResult = await chapaService.initializePayment({
            amount: parsedAmount,
            currency: currency,
            email: customer_email,
            phone: finalPhone,
            first_name: firstName,
            last_name: lastName,
            tx_ref: tx_ref,
            customization: {
                title: 'My Clothe Shop',
                description: description || 'Complete your purchase',
                logo: null
            },
            meta: {
                user_id: userId,
                order_id: order_id,
                payment_id: payment._id
            }
        });

        if (!initializeResult.success) {
            // Update payment record with error
            payment.payment_status = 'failed';
            payment.error_message = String(initializeResult.message || 'Chapa error');
            await payment.save();

            // Always convert message to a plain string — SDK can return objects
            const errMessage = typeof initializeResult.message === 'string'
                ? initializeResult.message
                : (initializeResult.message && typeof initializeResult.message === 'object')
                    ? (initializeResult.message.message || JSON.stringify(initializeResult.message))
                    : 'Payment initialization failed';

            logger.error('Chapa initialization failed', {
                tx_ref: tx_ref,
                message: errMessage,
                details: initializeResult.details,
                requestData: {
                    amount: parsedAmount,
                    email: customer_email,
                    phone: finalPhone,
                    firstName,
                    lastName
                }
            });

            return res.status(400).json({
                success: false,
                message: errMessage,
                data: null
            });
        }

        // Update payment with Chapa transaction ID
        payment.chapa_transaction_id = initializeResult.data.transaction_id;
        await payment.save();

        logger.info('Payment initialization successful', {
            tx_ref: tx_ref,
            checkout_url: initializeResult.data.checkout_url
        });

        res.status(200).json({
            success: true,
            message: 'Payment initialized successfully',
            data: {
                checkout_url: initializeResult.data.checkout_url,
                tx_ref: tx_ref,
                amount: parsedAmount,
                currency: currency
            }
        });
    } catch (error) {
        logger.error('Payment initialization error', {
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            message: 'Failed to initialize payment',
            error: error.message,
            data: null
        });
    }
};

/**
 * POST /api/payments/chapa/webhook
 * Handle webhook callbacks from Chapa
 */
exports.chapaWebhook = async (req, res) => {
    const startTime = Date.now();

    try {
        // --- Signature validation (enforce in production) ---
        const chapaSignature = req.headers['chapa-signature'];
        if (process.env.NODE_ENV === 'production') {
            if (!chapaSignature) {
                logger.warn('Webhook rejected - missing Chapa-Signature header');
                return res.status(401).json({
                    success: false,
                    message: 'Missing webhook signature'
                });
            }
            const isValid = chapaService.validateWebhookSignature(req.rawBody, chapaSignature);
            if (!isValid) {
                logger.warn('Webhook rejected - invalid Chapa-Signature', {
                    signature: chapaSignature
                });
                return res.status(401).json({
                    success: false,
                    message: 'Invalid webhook signature'
                });
            }
        } else if (chapaSignature) {
            // In development, validate if header is present but don't block if missing
            const isValid = chapaService.validateWebhookSignature(req.rawBody, chapaSignature);
            if (!isValid) {
                logger.warn('DEV: Webhook signature mismatch (not blocking in dev)', {
                    signature: chapaSignature
                });
            }
        }

        const payload = req.body;

        logger.info('Webhook received from Chapa', {
            tx_ref: payload?.tx_ref,
            status: payload?.status,
            timestamp: new Date().toISOString()
        });

        // Validate webhook payload
        if (!payload || !payload.tx_ref) {
            logger.warn('Invalid webhook payload - missing tx_ref');
            return res.status(400).json({
                success: false,
                message: 'Invalid webhook payload'
            });
        }

        const { tx_ref, status } = payload;

        // Find payment record
        let payment = await Payment.findOne({ tx_ref: tx_ref });

        if (!payment) {
            logger.warn('Webhook received for unknown transaction', { tx_ref: tx_ref });
            return res.status(404).json({
                success: false,
                message: 'Payment record not found'
            });
        }

        // Update webhook tracking
        payment.webhook_attempt_count += 1;
        if (!payment.webhook_received_at) {
            payment.webhook_received_at = new Date();
        }

        // Check for duplicate webhook (prevent replay attacks)
        if (payment.verified && payment.webhook_processed_at) {
            logger.warn('Duplicate webhook ignored', {
                tx_ref: tx_ref,
                previous_status: payment.payment_status,
                processing_time: Date.now() - startTime
            });

            // Still return 200 to acknowledge receipt
            return res.status(200).json({
                success: true,
                message: 'Webhook processed (already verified)',
                duplicate: true
            });
        }

        // Store full webhook payload
        payment.callback_response = payload;

        // Update payment status based on webhook
        if (status === 'success') {
            // Verify payment with Chapa before marking as success
            const verificationResult = await chapaService.verifyPayment(tx_ref);

            if (verificationResult.success && verificationResult.data?.status === 'completed') {
                payment.payment_status = 'success';
                payment.payment_reference = payload.reference || payload.transaction_id;
                payment.payment_method = payload.method || null;
                payment.verified = true;
                payment.verification_attempts = 1;
                payment.completed_at = new Date();

                logger.info('Payment verified successfully', {
                    tx_ref: tx_ref,
                    amount: payment.amount,
                    verification_time: Date.now() - startTime
                });

                // Update associated order if exists
                if (payment.order_id) {
                    const orderDoc = await Order.findByIdAndUpdate(
                        payment.order_id,
                        {
                            payment_info: {
                                method: 'chapa',
                                status: 'Confirmed',
                                transaction_id: payment.chapa_transaction_id,
                                paid_at: new Date()
                            },
                            paymentStatus: 'confirmed'
                        },
                        { new: true }
                    );

                    logger.info('Order updated with payment confirmation', {
                        order_id: payment.order_id,
                        tx_ref: tx_ref
                    });

                    if (orderDoc) {
                        try {
                            const { SmsEvents } = require('../services/smsService');
                            await SmsEvents.paymentApproved(orderDoc);
                        } catch (smsErr) {
                            logger.error('SMS notification failed on webhook', { error: smsErr.message });
                        }
                    }
                }
            } else {
                // Verification failed
                payment.payment_status = 'failed';
                payment.error_message = 'Payment verification failed with Chapa';
                payment.verified = false;
                payment.verification_attempts = 1;

                logger.warn('Payment verification failed', {
                    tx_ref: tx_ref,
                    verification_error: verificationResult.message
                });
            }
        } else if (status === 'failed') {
            payment.payment_status = 'failed';
            payment.error_message = payload.error_message || 'Payment failed';
            payment.error_code = payload.error_code || null;

            logger.warn('Payment failed', {
                tx_ref: tx_ref,
                error_message: payload.error_message
            });
        } else if (status === 'cancelled') {
            payment.payment_status = 'cancelled';

            logger.info('Payment cancelled by user', { tx_ref: tx_ref });
        } else if (status === 'pending') {
            payment.payment_status = 'pending';

            logger.info('Payment still pending', { tx_ref: tx_ref });
        }

        // Update webhook processing timestamp
        payment.webhook_processed_at = new Date();
        await payment.save();

        logger.info('Webhook processed successfully', {
            tx_ref: tx_ref,
            status: payment.payment_status,
            verified: payment.verified,
            processing_time: Date.now() - startTime
        });

        // Return success response
        res.status(200).json({
            success: true,
            message: 'Webhook processed successfully',
            data: {
                tx_ref: tx_ref,
                status: payment.payment_status,
                verified: payment.verified
            }
        });
    } catch (error) {
        logger.error('Webhook processing error', {
            error: error.message,
            stack: error.stack,
            processing_time: Date.now() - startTime
        });

        // Still return 200 to prevent Chapa from retrying
        res.status(200).json({
            success: false,
            message: 'Webhook processing failed but received',
            error: error.message
        });
    }
};

/**
 * GET /api/payments/verify/:tx_ref
 * Verify a payment transaction
 */
exports.verifyPayment = async (req, res) => {
    try {
        const { tx_ref } = req.params;

        if (!tx_ref) {
            return res.status(400).json({
                success: false,
                message: 'Transaction reference is required',
                data: null
            });
        }

        // Find payment in database
        const payment = await Payment.findOne({ tx_ref: tx_ref });

        if (!payment) {
            logger.warn('Verification requested for unknown transaction', { tx_ref: tx_ref });
            return res.status(404).json({
                success: false,
                message: 'Payment not found',
                data: null
            });
        }

        // Check if already verified
        if (payment.verified) {
            return res.status(200).json({
                success: true,
                message: 'Payment already verified',
                data: {
                    tx_ref: payment.tx_ref,
                    status: payment.payment_status,
                    amount: payment.amount,
                    currency: payment.currency,
                    verified: payment.verified,
                    completed_at: payment.completed_at
                }
            });
        }

        // Verify with Chapa
        const verificationResult = await chapaService.verifyPayment(tx_ref);

        if (verificationResult.success && verificationResult.data?.status === 'completed') {
            // Update payment record
            payment.payment_status = 'success';
            payment.verified = true;
            payment.verification_attempts = (payment.verification_attempts || 0) + 1;
            payment.last_verification_at = new Date();
            payment.completed_at = new Date();
            payment.payment_reference = verificationResult.data.reference || payment.payment_reference;

            await payment.save();

            logger.info('Payment verified via API', {
                tx_ref: tx_ref,
                verification_attempts: payment.verification_attempts
            });

            return res.status(200).json({
                success: true,
                message: 'Payment verified successfully',
                data: {
                    tx_ref: payment.tx_ref,
                    status: payment.payment_status,
                    amount: payment.amount,
                    currency: payment.currency,
                    verified: payment.verified,
                    completed_at: payment.completed_at
                }
            });
        } else {
            // Update verification attempt
            payment.verification_attempts = (payment.verification_attempts || 0) + 1;
            payment.last_verification_at = new Date();
            await payment.save();

            return res.status(400).json({
                success: false,
                message: verificationResult.message || 'Payment verification failed',
                data: null
            });
        }
    } catch (error) {
        logger.error('Payment verification error', {
            error: error.message,
            tx_ref: req.params.tx_ref
        });

        res.status(500).json({
            success: false,
            message: 'Failed to verify payment',
            error: error.message,
            data: null
        });
    }
};

/**
 * GET /api/payments/:tx_ref
 * Get payment details
 */
exports.getPaymentDetails = async (req, res) => {
    try {
        const { tx_ref } = req.params;

        if (!tx_ref) {
            return res.status(400).json({
                success: false,
                message: 'Transaction reference is required',
                data: null
            });
        }

        const payment = await Payment.findOne({ tx_ref: tx_ref });

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found',
                data: null
            });
        }

        // Check authorization - user can only view their own payments
        if (req.user && payment.user_id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized',
                data: null
            });
        }

        res.status(200).json({
            success: true,
            message: 'Payment details retrieved',
            data: {
                tx_ref: payment.tx_ref,
                status: payment.payment_status,
                amount: payment.amount,
                currency: payment.currency,
                customer_name: payment.customer_name,
                customer_email: payment.customer_email,
                verified: payment.verified,
                created_at: payment.created_at,
                completed_at: payment.completed_at
            }
        });
    } catch (error) {
        logger.error('Get payment details error', {
            error: error.message,
            tx_ref: req.params.tx_ref
        });

        res.status(500).json({
            success: false,
            message: 'Failed to retrieve payment details',
            data: null
        });
    }
};

/**
 * GET /api/payments/user/:userId
 * Get user's payment history
 */
exports.getUserPayments = async (req, res) => {
    try {
        const userId = req.params.userId || req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // Check authorization
        if (req.user && userId !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized',
                data: null
            });
        }

        const payments = await Payment.find({ user_id: userId })
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Payment.countDocuments({ user_id: userId });

        res.status(200).json({
            success: true,
            message: 'User payments retrieved',
            data: {
                payments: payments,
                pagination: {
                    page: page,
                    limit: limit,
                    total: total,
                    pages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        logger.error('Get user payments error', {
            error: error.message,
            userId: req.params.userId
        });

        res.status(500).json({
            success: false,
            message: 'Failed to retrieve user payments',
            data: null
        });
    }
};

/**
 * POST /api/payments/:tx_ref/retry
 * Retry a failed payment
 */
exports.retryPayment = async (req, res) => {
    try {
        const { tx_ref } = req.params;

        const payment = await Payment.findOne({ tx_ref: tx_ref });

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment not found',
                data: null
            });
        }

        // Check authorization
        if (req.user && payment.user_id.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized',
                data: null
            });
        }

        // Check if payment can be retried
        if (!payment.canRetry()) {
            return res.status(400).json({
                success: false,
                message: `Cannot retry payment with status: ${payment.payment_status}`,
                data: null
            });
        }

        // Generate new transaction reference
        const newTxRef = chapaService.generateTxRef(payment.user_id);

        // Initialize new payment
        const initializeResult = await chapaService.initializePayment({
            amount: payment.amount,
            currency: payment.currency,
            email: payment.customer_email,
            phone: payment.customer_phone,
            first_name: payment.customer_name.split(' ')[0],
            last_name: payment.customer_name.split(' ').slice(1).join(' ') || 'User',
            tx_ref: newTxRef,
            customization: {
                title: 'My Clothe Shop - Retry Payment',
                description: payment.description || 'Complete your purchase'
            },
            meta: {
                user_id: payment.user_id,
                order_id: payment.order_id,
                original_tx_ref: tx_ref
            }
        });

        if (!initializeResult.success) {
            return res.status(400).json({
                success: false,
                message: initializeResult.message,
                data: null
            });
        }

        // Create new payment record
        const newPayment = new Payment({
            user_id: payment.user_id,
            order_id: payment.order_id,
            tx_ref: newTxRef,
            amount: payment.amount,
            currency: payment.currency,
            customer_name: payment.customer_name,
            customer_email: payment.customer_email,
            customer_phone: payment.customer_phone,
            payment_status: 'pending',
            description: payment.description,
            metadata: {
                retry_of: tx_ref,
                ip_address: req.ip
            }
        });

        await newPayment.save();

        logger.info('Payment retry initiated', {
            original_tx_ref: tx_ref,
            new_tx_ref: newTxRef,
            user_id: payment.user_id
        });

        res.status(200).json({
            success: true,
            message: 'Payment retry initiated',
            data: {
                checkout_url: initializeResult.data.checkout_url,
                new_tx_ref: newTxRef,
                amount: payment.amount
            }
        });
    } catch (error) {
        logger.error('Payment retry error', {
            error: error.message,
            tx_ref: req.params.tx_ref
        });

        res.status(500).json({
            success: false,
            message: 'Failed to retry payment',
            data: null
        });
    }
};
