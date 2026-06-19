# Chapa Payment Integration - Complete Implementation Guide

This document provides comprehensive setup and usage instructions for the Chapa payment integration in your My Clothe application.

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Configuration](#configuration)
4. [API Endpoints](#api-endpoints)
5. [Frontend Integration](#frontend-integration)
6. [Security Considerations](#security-considerations)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)
9. [Production Deployment](#production-deployment)

---

## Overview

This integration provides a complete, production-ready Chapa payment system for your application with:

- ✅ Secure server-side payment processing
- ✅ Comprehensive error handling and logging
- ✅ Webhook validation and duplicate prevention
- ✅ Payment verification before marking as successful
- ✅ Multiple payment status tracking
- ✅ User-friendly checkout and result pages
- ✅ Rate limiting and security measures

### Architecture

```
┌─────────────────┐
│   User/Browser  │
└────────┬────────┘
         │
    ┌────▼─────────────────────────┐
    │   Frontend (HTML/JS)         │
    │  - Checkout Form             │
    │  - Payment Result Display    │
    └────┬──────────────────────────┘
         │
    ┌────▼──────────────────────────────┐
    │   Backend (Express.js)           │
    │  - Payment Initialization        │
    │  - Webhook Processing            │
    │  - Verification                  │
    └────┬──────────────────────────────┘
         │
    ┌────▼──────────────────────────────┐
    │   Chapa API                      │
    │  - Checkout URL Generation       │
    │  - Payment Verification          │
    └──────────────────────────────────┘
```

---

## Getting Started

### 1. Get Chapa Credentials

1. Visit [Chapa Dashboard](https://chapa.co/dashboard)
2. Sign up or log in to your account
3. Navigate to **Settings → API Keys**
4. Copy your credentials:
   - **Secret Key**: Used for server-side operations (keep private!)
   - **Public Key**: Used for frontend (can be public)

### 2. Install Dependencies

The required packages should already be in your `package.json`:

```bash
npm install axios validator winston
```

If not, install them:

```bash
npm install axios@latest validator@latest winston@latest
```

### 3. Configure Environment Variables

Copy the provided `.env.example.chapa` and add to your `.env`:

```bash
# Chapa Configuration
CHAPA_SECRET_KEY=your_chapa_secret_key_here
CHAPA_PUBLIC_KEY=your_chapa_public_key_here
CHAPA_BASE_URL=https://api.chapa.co/v1

# Application URLs
BASE_URL=https://yourdomain.com
CALLBACK_URL=https://yourdomain.com/api/payments/chapa/webhook
RETURN_URL=https://yourdomain.com/payment-result
```

---

## Configuration

### Environment Variables Reference

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `CHAPA_SECRET_KEY` | ✅ Yes | `sk_live_...` | Chapa Secret Key (never expose) |
| `CHAPA_PUBLIC_KEY` | ✅ Yes | `pk_live_...` | Chapa Public Key |
| `CHAPA_BASE_URL` | ⚠️ Optional | `https://api.chapa.co/v1` | Chapa API endpoint (use as-is) |
| `BASE_URL` | ✅ Yes | `https://yourdomain.com` | Your application base URL |
| `CALLBACK_URL` | ✅ Yes | `https://yourdomain.com/api/payments/chapa/webhook` | Webhook endpoint |
| `RETURN_URL` | ✅ Yes | `https://yourdomain.com/payment-result` | User redirect after payment |

### Database

The Payment model is automatically created with MongoDB/Mongoose. No manual migration needed.

**Collections created:**
- `payments`: Stores all payment records

---

## API Endpoints

### 1. Initialize Payment

**Endpoint:** `POST /api/payments/initialize`

**Authentication:** Required (JWT)

**Request Body:**
```json
{
  "amount": 1000,
  "currency": "ETB",
  "customer_name": "John Doe",
  "customer_email": "john@example.com",
  "customer_phone": "+251911223344",
  "description": "Custom Dress",
  "order_id": "507f1f77bcf86cd799439011"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Payment initialized successfully",
  "data": {
    "checkout_url": "https://checkout.chapa.co/...",
    "tx_ref": "TXREF_1699564800000_abc123",
    "amount": 1000,
    "currency": "ETB"
  }
}
```

**Response (Error):**
```json
{
  "success": false,
  "message": "Missing required fields",
  "data": null
}
```

### 2. Chapa Webhook Callback

**Endpoint:** `POST /api/payments/chapa/webhook`

**Authentication:** None (webhook from Chapa)

**Webhook Payload (from Chapa):**
```json
{
  "status": "success",
  "tx_ref": "TXREF_1699564800000_abc123",
  "reference": "CHAPA-12345",
  "amount": 1000,
  "method": "CARD",
  "type": "charge",
  "error_message": null,
  "customization": {
    "title": "My Clothe Shop"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Webhook processed successfully",
  "data": {
    "tx_ref": "TXREF_1699564800000_abc123",
    "status": "success",
    "verified": true
  }
}
```

### 3. Verify Payment

**Endpoint:** `GET /api/payments/verify/:tx_ref`

**Authentication:** Optional

**Response (Success):**
```json
{
  "success": true,
  "message": "Payment verified successfully",
  "data": {
    "tx_ref": "TXREF_1699564800000_abc123",
    "status": "success",
    "amount": 1000,
    "currency": "ETB",
    "verified": true,
    "completed_at": "2024-01-15T10:30:00Z"
  }
}
```

### 4. Get Payment Details

**Endpoint:** `GET /api/payments/:tx_ref`

**Authentication:** Optional

**Response:**
```json
{
  "success": true,
  "message": "Payment details retrieved",
  "data": {
    "tx_ref": "TXREF_1699564800000_abc123",
    "status": "success",
    "amount": 1000,
    "currency": "ETB",
    "customer_name": "John Doe",
    "customer_email": "john@example.com",
    "verified": true,
    "created_at": "2024-01-15T10:00:00Z",
    "completed_at": "2024-01-15T10:30:00Z"
  }
}
```

### 5. Get User Payments

**Endpoint:** `GET /api/payments/user/:userId?page=1&limit=10`

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "message": "User payments retrieved",
  "data": {
    "payments": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 25,
      "pages": 3
    }
  }
}
```

### 6. Retry Payment

**Endpoint:** `POST /api/payments/:tx_ref/retry`

**Authentication:** Required

**Response:**
```json
{
  "success": true,
  "message": "Payment retry initiated",
  "data": {
    "checkout_url": "https://checkout.chapa.co/...",
    "new_tx_ref": "TXREF_1699564900000_def456",
    "amount": 1000
  }
}
```

---

## Frontend Integration

### 1. Checkout Page

**Location:** `/user/payment-checkout.html`

**Usage:**

```html
<!-- Initialize payment -->
<script>
  // Set order data before redirecting to checkout
  const orderData = {
    total: 1000,
    subtotal: 950,
    shipping: 50,
    items: [
      {
        name: "Custom Dress",
        price: 950,
        quantity: 1
      }
    ],
    customer_name: "John Doe",
    customer_email: "john@example.com",
    customer_phone: "+251911223344",
    description: "Custom Habesha dress"
  };

  // Save to localStorage before redirecting
  localStorage.setItem('checkout_order', JSON.stringify(orderData));
  
  // Redirect to checkout
  window.location.href = '/user/payment-checkout.html';
</script>
```

### 2. Payment Result Page

**Location:** `/user/payment-result.html`

Automatically displays payment status when user is redirected from Chapa.

**Result States:**
- ✅ **Success**: Payment verified and completed
- ❌ **Failed**: Payment rejected
- ⚠️ **Cancelled**: User cancelled payment
- ⏱️ **Pending**: Payment still processing
- ‼️ **Error**: System error occurred

### 3. Integration in Your Cart/Checkout

```javascript
// In your cart or checkout page
async function initiatePayment() {
  try {
    const response = await fetch('/api/payments/initialize', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await getAuthToken()}`
      },
      body: JSON.stringify({
        amount: cartTotal,
        currency: 'ETB',
        customer_name: currentUser.name,
        customer_email: currentUser.email,
        customer_phone: currentUser.phone,
        description: 'My Clothe Order',
        order_id: orderId
      })
    });

    const result = await response.json();
    
    if (result.success) {
      // Redirect to Chapa checkout
      window.location.href = result.data.checkout_url;
    } else {
      showError(result.message);
    }
  } catch (error) {
    console.error('Payment initialization failed:', error);
    showError('Failed to initialize payment');
  }
}
```

---

## Security Considerations

### 1. Secret Key Protection

⚠️ **CRITICAL**: Never expose `CHAPA_SECRET_KEY` to the frontend.

```javascript
// ❌ WRONG - Never do this
const secretKey = 'sk_live_...'; // EXPOSED!

// ✅ CORRECT - Server-side only
// In server.js or controller
const secretKey = process.env.CHAPA_SECRET_KEY;
```

### 2. Input Validation

All endpoints validate input:

```javascript
// Validated fields:
- Email format (RFC 5322)
- Phone number format (basic validation)
- Amount (positive number)
- Required fields presence
```

### 3. Duplicate Prevention

System prevents duplicate payments within 30 minutes:

```javascript
// If user tries to pay twice for same order
// within 30 minutes, receives error with
// reference to existing payment
```

### 4. Payment Verification

All payments are verified with Chapa before marking successful:

```javascript
// Webhook receives status
// System calls Chapa Verify API
// Only marks successful after verification
// Prevents replay attacks
```

### 5. HTTPS Required

In production, always use HTTPS:

```bash
# .env
NODE_ENV=production
```

This enables:
- Secure cookies
- HSTS headers
- Helmet security headers

### 6. Rate Limiting

Applied to all payment endpoints:

```javascript
// Global rate limit: 300 requests/15min
// Auth endpoints: 20 requests/15min
// Prevents brute force and spam
```

---

## Testing

### Test Credentials

Chapa provides test mode credentials. Use these for testing:

1. Use test secret and public keys from Chapa dashboard
2. Use test payment methods provided by Chapa
3. Payment will not be charged

### Manual Testing Flow

```bash
1. Fill checkout form with test data
2. Proceed to payment
3. Use test card/method from Chapa
4. Complete payment flow
5. Verify webhook was received
6. Check Payment record in database
```

### Testing Webhook Locally

To test webhooks locally, use a tunnel service:

```bash
# Install ngrok or use LocalTunnel
npm install -g ngrok

# Start your server
npm run dev

# In another terminal, create tunnel
ngrok http 3000

# Use the provided URL in CALLBACK_URL
CALLBACK_URL=https://abc123.ngrok.io/api/payments/chapa/webhook
```

### Automated Testing

```javascript
// In your test file
const testPaymentFlow = async () => {
  // 1. Initialize payment
  const initResult = await initializePayment({
    amount: 1000,
    customer_name: 'Test User',
    customer_email: 'test@example.com',
    customer_phone: '+251911223344'
  });

  // 2. Verify payment
  const verifyResult = await verifyPayment(initResult.data.tx_ref);

  // 3. Check database record
  const payment = await Payment.findOne({ 
    tx_ref: initResult.data.tx_ref 
  });

  return {
    initialized: !!initResult.data.checkout_url,
    verified: verifyResult.success,
    recorded: !!payment
  };
};
```

---

## Troubleshooting

### Issue: "Payment initialization failed"

**Solutions:**
1. Check `CHAPA_SECRET_KEY` is set correctly
2. Verify network connectivity
3. Check Chapa API status
4. Review error logs: `logs/error.log`

### Issue: Webhook not received

**Solutions:**
1. Check `CALLBACK_URL` is publicly accessible
2. Verify firewall allows POST requests
3. Check webhook logs: `logs/combined.log`
4. Test webhook manually with curl:

```bash
curl -X POST http://localhost:3000/api/payments/chapa/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "status": "success",
    "tx_ref": "TXREF_test",
    "reference": "CHAPA-test"
  }'
```

### Issue: Payment status shows "pending"

**Possible causes:**
1. Webhook not yet received
2. Verification not completed
3. Network delay

**Solution:**
- Click "Check Status" button on result page
- Or call verify endpoint manually

### Issue: "Duplicate payment" error

**This is expected behavior** - prevents accidental double charges.

**Solution:**
- Use existing payment reference
- Or wait 30+ minutes for cooldown

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] All environment variables configured
- [ ] HTTPS enabled
- [ ] Callback URL is public and correct
- [ ] Database backups configured
- [ ] Logging configured
- [ ] Rate limiting set appropriately
- [ ] Error handling reviewed
- [ ] Security headers enabled

### Deployment Steps

1. **Set environment variables:**

```bash
# On production server
export CHAPA_SECRET_KEY=sk_live_actual_key
export CHAPA_PUBLIC_KEY=pk_live_actual_key
export CALLBACK_URL=https://yourdomain.com/api/payments/chapa/webhook
export RETURN_URL=https://yourdomain.com/payment-result
export NODE_ENV=production
```

2. **Start application:**

```bash
npm run start
# or with PM2
pm2 start server.js --name "clothe-backend"
```

3. **Verify endpoints:**

```bash
curl https://yourdomain.com/api/health
curl https://yourdomain.com/api/payments/verify/test-ref
```

4. **Test payment flow:**

- Create test order
- Complete payment
- Verify webhook received
- Check Payment record

### Monitoring

Monitor logs for errors:

```bash
# Real-time logs
tail -f logs/combined.log

# Error logs only
tail -f logs/error.log

# Search for specific transaction
grep "tx_ref" logs/combined.log
```

---

## Support & Documentation

- **Chapa API Docs**: https://chapa.co/docs/
- **GitHub Issues**: Report bugs and request features
- **Email Support**: support@yourdomain.com

---

## Files Created

```
Backend:
├── models/Payment.js                    # Payment schema
├── services/chapaService.js             # Chapa API wrapper
├── controllers/paymentController.js     # Payment endpoints
├── routes/payments.js                   # Route definitions
└── utils/logger.js                      # Logging utility

Frontend:
├── user/payment-checkout.html           # Checkout form
├── user/payment-result.html             # Result page
├── js/payment-checkout.js               # Checkout logic
├── js/payment-result.js                 # Result logic
├── css/payment-checkout.css             # Checkout styles
└── css/payment-result.css               # Result styles

Configuration:
├── .env.example.chapa                   # Environment template
└── CHAPA_INTEGRATION.md                 # This file
```

---

## License

This integration is provided as part of the My Clothe application. All rights reserved.

---

**Last Updated:** January 2024  
**Version:** 1.0.0
