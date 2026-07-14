# Chapa Payment Integration — Implementation Guide

**Frontend:** https://www.yeshiclothe.com.et  
**Backend (API):** https://myclothe.app.aletcloud.com  
**Last Updated:** June 2026 | **Version:** 1.2.0

---

## Table of Contents

1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Configuration](#configuration)
4. [API Endpoints](#api-endpoints)
5. [Frontend Integration](#frontend-integration)
6. [Security](#security)
7. [Testing](#testing)
8. [Troubleshooting](#troubleshooting)
9. [Production Deployment](#production-deployment)

---

## Overview

Complete, production-ready Chapa payment integration for Yeshi Clothe:

- ✅ Secure server-side payment processing (secret key never exposed)
- ✅ Webhook signature validation via `Chapa-Signature` header (enforced in production)
- ✅ Duplicate payment prevention (30-minute window)
- ✅ Chapa verification API called before marking payment successful
- ✅ Order status updated on successful payment
- ✅ Retry flow for failed/cancelled payments
- ✅ Rate limiting and security headers

### Architecture

```
User (Browser / yeshiclothe.com.et)
        │
        ▼
Frontend (HTML + JS)
  payment-checkout.html → POST /api/payments/initialize
        │
        ▼
Backend (Render → myclothe.app.aletcloud.com)
  paymentController.js → chapaService.js
        │
        ▼
Chapa API (api.chapa.co/v1)
  • /transaction/initialize  → returns checkout_url
  • /transaction/verify/:ref → confirms payment
        │
        ├── redirect user back to yeshiclothe.com.et/payment-result?tx_ref=...
        └── POST webhook → /api/payments/chapa/webhook
```

---

## Getting Started

### 1. Get Chapa Credentials

1. Sign in to [Chapa Dashboard](https://chapa.co/dashboard)
2. Go to **Settings → API Keys**
3. Copy **Secret Key** (`sk_live_...`) and **Public Key** (`pk_live_...`)

### 2. Install Dependencies

Already in `package.json`:

```bash
cd cloth_backend
npm install
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
# Chapa
CHAPA_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxx
CHAPA_PUBLIC_KEY=pk_live_xxxxxxxxxxxxxxxxxxxx
CHAPA_BASE_URL=https://api.chapa.co/v1

# URLs
BASE_URL=https://myclothe.app.aletcloud.com
CALLBACK_URL=https://myclothe.app.aletcloud.com/api/payments/chapa/webhook
RETURN_URL=https://www.yeshiclothe.com.et/payment-result
```

---

## Configuration

### Environment Variables Reference

| Variable | Required | Value (Production) |
|----------|----------|--------------------|
| `CHAPA_SECRET_KEY` | ✅ | `sk_live_...` — never expose to frontend |
| `CHAPA_PUBLIC_KEY` | ✅ | `pk_live_...` |
| `CHAPA_BASE_URL` | optional | `https://api.chapa.co/v1` |
| `BASE_URL` | ✅ | `https://myclothe.app.aletcloud.com` |
| `CALLBACK_URL` | ✅ | `https://myclothe.app.aletcloud.com/api/payments/chapa/webhook` |
| `RETURN_URL` | ✅ | `https://www.yeshiclothe.com.et/payment-result` |

> ℹ️ If `CALLBACK_URL` or `RETURN_URL` are not set, the service falls back to the production defaults above automatically.

---

## API Endpoints

Base URL: `https://myclothe.app.aletcloud.com`

### POST `/api/payments/initialize`
**Auth:** Required (JWT)

```json
// Request
{
  "amount": 1000,
  "currency": "ETB",
  "customer_name": "Abebe Bikila",
  "customer_email": "abebe@example.com",
  "customer_phone": "0911223344",
  "description": "Custom Habesha dress",
  "order_id": "507f1f77bcf86cd799439011"
}

// Response 200
{
  "success": true,
  "message": "Payment initialized successfully",
  "data": {
    "checkout_url": "https://checkout.chapa.co/...",
    "tx_ref": "TXREF_1718000000000_abc123abc456",
    "amount": 1000,
    "currency": "ETB"
  }
}
```

### POST `/api/payments/chapa/webhook`
**Auth:** None — Chapa posts here. Validated with `Chapa-Signature` header in production.

### GET `/api/payments/verify/:tx_ref`
**Auth:** Optional — polls Chapa and updates DB status.

### GET `/api/payments/:tx_ref`
**Auth:** Optional — returns stored payment details.

### GET `/api/payments/user/:userId?page=1&limit=10`
**Auth:** Required — returns paginated payment history.

### POST `/api/payments/:tx_ref/retry`
**Auth:** Required — creates a new checkout for a failed/cancelled payment.

---

## Frontend Integration

### From Cart/Order Page

```javascript
async function initiatePayment(order) {
  // 1. Save order context for the checkout page
  localStorage.setItem('checkout_order', JSON.stringify({
    total: order.total,
    subtotal: order.subtotal,
    shipping: order.shipping,
    items: order.items,
    order_id: order._id,
    customer_name: currentUser.displayName,
    customer_email: currentUser.email,
    customer_phone: currentUser.phone,
    description: 'Yeshi Clothe Order'
  }));

  // 2. Redirect to the hosted checkout page
  window.location.href = '/user/payment-checkout.html';
}
```

### Checkout Page
`/user/payment-checkout.html` auto-fills customer info from `localStorage` and Firebase auth, validates the form, calls `/api/payments/initialize`, then redirects to the Chapa-hosted checkout UI.

### Result Page
`/user/payment-result.html` reads `?tx_ref=` from the URL (Chapa appends it), calls `/api/payments/verify/:tx_ref`, and displays the appropriate state:

| Status | Display |
|--------|---------|
| `success` | ✅ Payment confirmed, shows transaction details |
| `failed` | ❌ Reason + retry button |
| `cancelled` | ⚠️ Try again link |
| `pending` | ⏱ Check again button |
| error | ‼️ Support contact |

---

## Security

| Measure | Implementation |
|---------|---------------|
| Secret key | Server-side only via `process.env.CHAPA_SECRET_KEY` |
| Webhook signature | `Chapa-Signature` HMAC-SHA256 header, enforced in production |
| Duplicate prevention | 30-minute pending window per user/order |
| Payment verification | Chapa verify API called before marking success |
| Rate limiting | 300 req/15 min global, 20 req/15 min on auth |
| Input sanitisation | `validator` library on all fields |
| Phone normalisation | Ethiopian numbers normalised to E.164 before sending to Chapa |

---

## Testing

### Test Credentials

Use test keys from Chapa dashboard (`sk_test_...` / `pk_test_...`).

Set in `.env`:
```bash
CHAPA_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxx
CHAPA_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxx
NODE_ENV=development
CALLBACK_URL=https://<your-ngrok-url>/api/payments/chapa/webhook
RETURN_URL=http://localhost:3000/payment-result
```

### Simulating a Webhook Locally

```bash
# Get a tx_ref first by calling /api/payments/initialize
TX_REF="TXREF_1718000000000_abc123"

# Simulate Chapa success callback
curl -X POST http://localhost:5000/api/payments/chapa/webhook \
  -H "Content-Type: application/json" \
  -d '{"status":"success","tx_ref":"'$TX_REF'","reference":"CHAPA-TEST-001"}'
```

### Full Flow Test

1. `npm run dev` in `cloth_backend/`
2. Open `http://localhost:5000/user/payment-checkout.html`
3. Fill form → "Proceed to Payment" → Chapa test UI
4. Complete with a test method
5. Chapa redirects to `RETURN_URL?tx_ref=...`
6. Page auto-verifies and shows success state

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `"Payment system not configured"` | Set `CHAPA_SECRET_KEY` in `.env`, restart server |
| Webhook 404 | Confirm `app.use('/api/payments', ...)` is in `server.js` |
| Payment stuck on "pending" | Webhook URL not reachable — use ngrok locally, verify `CALLBACK_URL` on Render |
| `"Duplicate payment"` error | Expected — user has a pending payment in last 30 min |
| Webhook signature failure | Make sure `CHAPA_SECRET_KEY` matches what Chapa has on file |
| `Cannot find module 'axios'` | `cd cloth_backend && npm install` |

---

## Production Deployment (Render)

### Required Environment Variables on Render

```
CHAPA_SECRET_KEY=sk_live_xxxxxxxxxx
CHAPA_PUBLIC_KEY=pk_live_xxxxxxxxxx
CALLBACK_URL=https://myclothe.app.aletcloud.com/api/payments/chapa/webhook
RETURN_URL=https://www.yeshiclothe.com.et/payment-result
BASE_URL=https://myclothe.app.aletcloud.com
NODE_ENV=production
```

### Verify Deployment

```bash
# Health check
curl https://myclothe.app.aletcloud.com/api/health

# Check payment endpoint is alive
curl -X POST https://myclothe.app.aletcloud.com/api/payments/initialize \
  -H "Content-Type: application/json" \
  -d '{"amount":10}' 
# Expects: 401 (no auth) or 400 (missing fields) — not 404
```

---

## Files

```
cloth_backend/
├── controllers/paymentController.js   # Endpoint handlers + webhook signature validation
├── services/chapaService.js           # Chapa API wrapper + HMAC validation
├── routes/payments.js                 # Route definitions (order matters!)
├── models/Payment.js                  # Payment schema
└── utils/logger.js                    # Winston logger

cloth_frontend/frontend/
├── user/payment-checkout.html         # Checkout form
├── user/payment-result.html           # Post-payment status page
├── js/payment-checkout.js             # Form logic + API call
├── js/payment-result.js               # Status display + retry
├── css/payment-checkout.css           # Checkout styles
└── css/payment-result.css             # Result styles

Root:
├── .env.example.chapa                 # Full environment variable template
└── cloth_backend/.env.example         # Backend-specific template
```
