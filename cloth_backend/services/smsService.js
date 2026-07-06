/**
 * smsService.js
 * ─────────────────────────────────────────────────────────────
 * Modular AfroMessage SMS integration for Ethiopia.
 *
 * Required environment variables:
 *   AFROMESSAGE_API_TOKEN  – Your AfroMessage API token
 *   AFROMESSAGE_IDENTIFIER – Your app identifier ID (from account-apps page)
 *   AFROMESSAGE_SENDER     – Your verified sender name (e.g. "myclothe")
 *   ADMIN_PHONE            – Admin phone number for critical alerts (e.g. +251933797981)
 *
 * API reference: https://api.afromessage.com/api/send
 * ─────────────────────────────────────────────────────────────
 */

const AFROMESSAGE_BASE_URL = 'https://api.afromessage.com/api';

/**
 * Read and validate AfroMessage config from environment.
 * Returns null if not configured (SMS will be silently skipped).
 */
function getConfig() {
    const token      = String(process.env.AFROMESSAGE_API_TOKEN  || '').trim();
    const identifier = String(process.env.AFROMESSAGE_IDENTIFIER || '').trim();
    const sender     = String(process.env.AFROMESSAGE_SENDER     || '').trim();

    if (!token) return null;
    return { token, identifier, sender };
}

/**
 * Normalise an Ethiopian phone number to international format.
 * Accepts:  09XXXXXXXX, 07XXXXXXXX, +251XXXXXXXXX, 251XXXXXXXXX
 * Returns:  +251XXXXXXXXX  or the original value if already international
 */
function normalisePhone(raw) {
    const v = String(raw || '').trim().replace(/[\s\-().]/g, '');

    // Local Ethiopian format: 09... or 07...
    if (/^(09|07)\d{8}$/.test(v)) {
        return '+251' + v.slice(1);
    }
    // Without leading zero: 9... or 7...
    if (/^(9|7)\d{8}$/.test(v)) {
        return '+251' + v;
    }
    // Already has 251 prefix (no +)
    if (/^251(9|7)\d{8}$/.test(v)) {
        return '+' + v;
    }
    // Already international
    return v;
}

/**
 * Send an SMS via AfroMessage.
 *
 * @param {string} to      – Recipient phone number (any Ethiopian format or international)
 * @param {string} message – Plain-text message body (max ~160 chars per SMS segment)
 * @returns {Promise<{ok: boolean, data?: object, error?: string}>}
 */
async function sendSMS(to, message) {
    const config = getConfig();

    if (!config) {
        console.log('[SMS] AfroMessage not configured — skipping. Would send to', to, ':', message);
        return { ok: false, error: 'SMS not configured' };
    }

    const phone = normalisePhone(to);

    // Build query params
    const params = new URLSearchParams();
    if (config.identifier) params.set('from', config.identifier);
    if (config.sender)     params.set('sender', config.sender);
    params.set('to',      phone);
    params.set('message', message);

    const url = `${AFROMESSAGE_BASE_URL}/send?${params.toString()}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${config.token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data?.acknowledge === 'error') {
            const errMsg = data?.response || data?.message || `HTTP ${response.status}`;
            console.error('[SMS] AfroMessage error:', errMsg);
            return { ok: false, error: errMsg };
        }

        console.log('[SMS] Sent to', phone, '— acknowledge:', data?.acknowledge);
        return { ok: true, data };
    } catch (err) {
        console.error('[SMS] AfroMessage request failed:', err?.message || err);
        return { ok: false, error: err?.message || 'Unknown error' };
    }
}

/**
 * Send an SMS to the configured admin phone number.
 * Admin phone defaults to ADMIN_PHONE env var.
 *
 * @param {string} message – Message text
 */
async function sendAdminSMS(message) {
    const adminPhone = String(process.env.ADMIN_PHONE || '+251933797981').trim();
    return sendSMS(adminPhone, message);
}

// ─────────────────────────────────────────────────────────────
// Convenience helpers for common events
// (call these instead of sendSMS directly for consistency)
// ─────────────────────────────────────────────────────────────

const SmsEvents = {
    /** Admin alert: new order received */
    newOrder: (order) =>
        sendAdminSMS(
            `🛍️ New Order!\nOrder #${String(order._id || order.id || '').slice(-8).toUpperCase()}\nCustomer: ${order.customer_info?.full_name || 'Guest'}\nAmount: ${order.total_price || order.totalPrice || 0} ETB`
        ),

    /** Admin alert: customer submitted payment proof */
    paymentSubmitted: (order) =>
        sendAdminSMS(
            `💳 Payment Proof Submitted\nOrder #${String(order._id || order.id || '').slice(-8).toUpperCase()}\nCustomer: ${order.customer_info?.full_name || 'Guest'}\nPlease review the payment proof.`
        ),

    /** Admin alert: payment approved */
    paymentApproved: (order) =>
        sendAdminSMS(
            `✅ Payment Approved\nOrder #${String(order._id || order.id || '').slice(-8).toUpperCase()}\nCustomer: ${order.customer_info?.full_name || 'Guest'}`
        ),

    /** Admin alert: payment rejected */
    paymentRejected: (order) =>
        sendAdminSMS(
            `❌ Payment Rejected\nOrder #${String(order._id || order.id || '').slice(-8).toUpperCase()}\nCustomer: ${order.customer_info?.full_name || 'Guest'}`
        ),

    /** Admin alert: order shipped */
    orderShipped: (order) =>
        sendAdminSMS(
            `🚚 Order Shipped\nOrder #${String(order._id || order.id || '').slice(-8).toUpperCase()}\nCustomer: ${order.customer_info?.full_name || 'Guest'}`
        )
};

module.exports = {
    sendSMS,
    sendAdminSMS,
    SmsEvents,
    normalisePhone
};
