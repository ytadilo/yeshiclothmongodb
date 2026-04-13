const Notification = require('../models/Notification');
const User = require('../models/User');

// ==============================
// NOTIFICATION TYPES
// ==============================
const NotificationTypes = {
    ORDER: 'Order',
    DELIVERY: 'Delivery',
    SYSTEM: 'System',
    PAYMENT: 'Payment'
};

// ==============================
// EMAIL TEMPLATES
// ==============================
const EmailTemplates = {
    ORDER_CONFIRMED: {
        subject: 'Order Confirmed - Yeshi Traditional Clothes',
        getBody: (order) => `Your order #${order._id} has been confirmed and is being prepared.`
    },
    ORDER_PLACED: {
        subject: 'New Order Received - Yeshi',
        getBody: (order) => `New order #${order._id} received from ${order.customer_info?.full_name}`
    },
    ORDER_DELIVERED: {
        subject: 'Order Delivered - Yeshi',
        getBody: (order) => `Your order #${order._id} has been delivered. Thank you for shopping with us!`
    },
    PAYMENT_CONFIRMED: {
        subject: 'Payment Confirmed - Yeshi',
        getBody: (order) => `Payment for order #${order._id} has been confirmed.`
    },
    ACCOUNT_CREATED: {
        subject: 'Welcome to Yeshi Traditional Clothes',
        getBody: (user) => `Welcome ${user.fullName}! Your account has been created.`
    },
    PASSWORD_RESET: {
        subject: 'Password Reset - Yeshi',
        getBody: () => `You requested a password reset. Use the link provided to reset your password.`
    }
};

// ==============================
// NOTIFICATION SERVICE
// ==============================
class NotificationService {
    
    // ==============================
    // IN-APP NOTIFICATIONS
    // ==============================

    /**
     * Create an in-app notification
     */
    static async createNotification(userId, title, message, type = NotificationTypes.SYSTEM, metadata = {}) {
        try {
            const notification = new Notification({
                user_id: userId,
                title,
                message,
                type,
                metadata,
                is_read: false
            });
            
            await notification.save();
            return notification;
        } catch (err) {
            console.error('Error creating notification:', err.message);
            return null;
        }
    }

    /**
     * Get notifications for a user
     */
    static async getUserNotifications(userId, options = {}) {
        const { page = 1, limit = 20, unreadOnly = false } = options;
        
        const query = { user_id: userId };
        if (unreadOnly) {
            query.is_read = false;
        }

        const notifications = await Notification.find(query)
            .sort({ created_at: -1 })
            .skip((page - 1) * limit)
            .limit(limit);

        const total = await Notification.countDocuments(query);
        const unreadCount = await Notification.countDocuments({ user_id: userId, is_read: false });

        return {
            notifications,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            },
            unreadCount
        };
    }

    /**
     * Mark notification as read
     */
    static async markAsRead(notificationId, userId) {
        const notification = await Notification.findOneAndUpdate(
            { _id: notificationId, user_id: userId },
            { is_read: true },
            { new: true }
        );
        return notification;
    }

    /**
     * Mark all notifications as read for a user
     */
    static async markAllAsRead(userId) {
        await Notification.updateMany(
            { user_id: userId, is_read: false },
            { is_read: true }
        );
    }

    /**
     * Delete a notification
     */
    static async deleteNotification(notificationId, userId) {
        await Notification.findOneAndDelete({ _id: notificationId, user_id: userId });
    }

    /**
     * Get unread count for a user
     */
    static async getUnreadCount(userId) {
        return await Notification.countDocuments({ user_id: userId, is_read: false });
    }

    // ==============================
    // EMAIL + WHATSAPP NOTIFICATIONS
    // ==============================

    /**
     * Send WhatsApp message
     * Uses WhatsApp Business API (Twilio, Meta, ChatAPI, etc.)
     */
    static async sendWhatsApp(phone, message) {
        try {
            // WhatsApp configuration from environment
            const config = {
                apiUrl: process.env.WHATSAPP_API_URL,
                apiKey: process.env.WHATSAPP_API_KEY,
                phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID
            };
            
            // If WhatsApp not configured, log and skip
            if (!config.apiUrl || !config.apiKey) {
                console.log('WhatsApp not configured. Would send:', message);
                return false;
            }
            
            // Format phone number (Ethiopia: +251 -> 251)
            const formattedPhone = phone.replace(/\+/g, '').replace(/^251/, '251');
            
            const payload = {
                messaging_product: 'whatsapp',
                to: formattedPhone,
                type: 'text',
                text: { body: message }
            };
            
            const response = await fetch(`${config.apiUrl}/messages`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            return response.ok;
        } catch (err) {
            console.error('Error sending WhatsApp:', err.message);
            return false;
        }
    }

    /**
     * Send email notification
     */
    static async sendEmail(to, template, data) {
        try {
            const sendEmail = require('../utils/sendEmail');
            
            const emailTemplate = EmailTemplates[template];
            if (!emailTemplate) {
                console.error('Email template not found:', template);
                return false;
            }

            const subject = emailTemplate.subject;
            const body = emailTemplate.getBody(data);

            await sendEmail(to, subject, body);
            return true;
        } catch (err) {
            console.error('Error sending email:', err.message);
            return false;
        }
    }

    // ==============================
    // COMBINED NOTIFICATION (In-App + Email + WhatsApp)
    // ==============================

    /**
     * Send notification to user (in-app + email + WhatsApp)
     */
    static async notify(userId, title, message, type, data, options = {}) {
        const { 
            sendEmail: shouldSendEmail = false, 
            emailTemplate = null,
            sendWhatsApp: shouldSendWhatsApp = false,
            whatsappMessage = null
        } = options;

        // Always create in-app notification
        await this.createNotification(userId, title, message, type, data);

        // Get user info for external notifications
        const user = await User.findById(userId);

        // Send email if requested
        if (shouldSendEmail && emailTemplate && user?.email) {
            await this.sendEmail(user.email, emailTemplate, data);
        }

        // Send WhatsApp if requested
        if (shouldSendWhatsApp && user?.phone) {
            await this.sendWhatsApp(user.phone, whatsappMessage || message);
        }
    }

    // ==============================
    // BULK NOTIFICATIONS
    // ==============================

    /**
     * Notify multiple users
     */
    static async notifyMultiple(userIds, title, message, type, data) {
        const notifications = userIds.map(userId => ({
            user_id: userId,
            title,
            message,
            type,
            metadata: data,
            is_read: false
        }));

        await Notification.insertMany(notifications);
    }

    /**
     * Notify admin about system events
     */
    static async notifyAdmin(title, message, type, data) {
        const admins = await User.find({ role: 'admin' }).select('_id');
        const adminIds = admins.map(admin => admin._id);
        
        await this.notifyMultiple(adminIds, title, message, type, data);
    }
}

// ==============================
// EVENT HANDLERS (Trigger notifications based on system events)
// ==============================

/**
 * Handle order placed event
 */
NotificationService.onOrderPlaced = async (order) => {
    // Notify admin
    await NotificationService.notifyAdmin(
        'New Order Received',
        `Order #${order._id} from ${order.customer_info?.full_name}`,
        NotificationTypes.ORDER,
        { orderId: order._id }
    );

    // If user is logged in, notify them
    if (order.user_id) {
        await NotificationService.notify(
            order.user_id,
            'Order Placed',
            `Your order #${order._id} has been received.`,
            NotificationTypes.ORDER,
            { orderId: order._id },
            { sendEmail: true, emailTemplate: 'ORDER_CONFIRMED' }
        );
    }
};

/**
 * Handle payment confirmed event
 */
NotificationService.onPaymentConfirmed = async (order) => {
    // Notify customer
    if (order.user_id) {
        await NotificationService.notify(
            order.user_id,
            'Payment Confirmed',
            `Payment for order #${order._id} has been confirmed.`,
            NotificationTypes.PAYMENT,
            { orderId: order._id },
            { sendEmail: true, emailTemplate: 'PAYMENT_CONFIRMED' }
        );
    }
};

/**
 * Handle order shipped event
 */
NotificationService.onOrderShipped = async (order) => {
    // Notify customer
    if (order.user_id) {
        await NotificationService.notify(
            order.user_id,
            'Order Shipped',
            `Your order #${order._id} is on its way!`,
            NotificationTypes.DELIVERY,
            { orderId: order._id }
        );
    }
};

/**
 * Handle order delivered event
 */
NotificationService.onOrderDelivered = async (order) => {
    // Notify customer
    if (order.user_id) {
        await NotificationService.notify(
            order.user_id,
            'Order Delivered',
            `Your order #${order._id} has been delivered. Thank you!`,
            NotificationTypes.DELIVERY,
            { orderId: order._id },
            { sendEmail: true, emailTemplate: 'ORDER_DELIVERED' }
        );
    }
};

/**
 * Handle delivery failed
 */
NotificationService.onDeliveryFailed = async (order) => {
    // Notify admin
    await NotificationService.notifyAdmin(
        'Delivery Failed',
        `Delivery for order #${order._id} has failed.`,
        NotificationTypes.DELIVERY,
        { orderId: order._id }
    );
};

module.exports = NotificationService;
module.exports.NotificationTypes = NotificationTypes;
