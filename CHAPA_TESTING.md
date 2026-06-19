# Chapa Payment Integration - Quick Start Testing Guide

## Prerequisites

Before testing, ensure you have:

1. ✅ Chapa account (https://chapa.co)
2. ✅ Test API keys from Chapa Dashboard
3. ✅ All environment variables configured in `.env`
4. ✅ MongoDB running
5. ✅ Backend server running (`npm run dev`)

## Step 1: Configure Environment Variables

Add these to your `.env` file (replace with actual test keys):

```bash
# Get these from https://chapa.co/dashboard → Settings → API Keys
CHAPA_SECRET_KEY=sk_test_your_test_secret_key
CHAPA_PUBLIC_KEY=pk_test_your_test_public_key
CHAPA_BASE_URL=https://api.chapa.co/v1

# URLs (use localhost for local testing)
BASE_URL=http://localhost:3000
CALLBACK_URL=http://localhost:3000/api/payments/chapa/webhook
RETURN_URL=http://localhost:3000/payment-result

# Make sure these are also set
MONGODB_URI=mongodb://localhost:27017/myclothefullstack
NODE_ENV=development
```

## Step 2: Start the Backend Server

```bash
cd cloth_backend
npm run dev
```

You should see:
```
Email configured: yes/no
Server running on port 3000
```

## Step 3: Test API Endpoint (Postman/cURL)

### Test 1: Payment Initialization

```bash
curl -X POST http://localhost:3000/api/payments/initialize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "amount": 100,
    "currency": "ETB",
    "customer_name": "Test User",
    "customer_email": "test@example.com",
    "customer_phone": "+251911223344",
    "description": "Test Payment"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Payment initialized successfully",
  "data": {
    "checkout_url": "https://checkout.chapa.co/...",
    "tx_ref": "TXREF_1699564800000_...",
    "amount": 100,
    "currency": "ETB"
  }
}
```

### Test 2: Verify Payment (before payment)

```bash
curl http://localhost:3000/api/payments/verify/TXREF_1699564800000_...
```

**Expected Response:**
```json
{
  "success": false,
  "message": "Payment verification failed"
}
```

### Test 3: Get Payment Details

```bash
curl http://localhost:3000/api/payments/TXREF_1699564800000_...
```

**Expected Response:**
```json
{
  "success": true,
  "data": {
    "tx_ref": "TXREF_1699564800000_...",
    "status": "pending",
    "amount": 100,
    "currency": "ETB"
  }
}
```

## Step 4: Simulate Full Payment Flow

### Local Testing (without Chapa UI)

#### Option A: Manual Webhook Simulation

```bash
# 1. Get a tx_ref from initialization
TX_REF="TXREF_1699564800000_..."

# 2. Simulate successful payment webhook
curl -X POST http://localhost:3000/api/payments/chapa/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "status": "success",
    "tx_ref": "'$TX_REF'",
    "reference": "CHAPA-12345",
    "amount": 100,
    "method": "CARD",
    "type": "charge"
  }'
```

**Expected Response:**
```json
{
  "success": true,
  "message": "Webhook processed successfully",
  "data": {
    "tx_ref": "TXREF_...",
    "status": "success",
    "verified": true
  }
}
```

#### Option B: Complete UI Flow (with Chapa Test)

1. Open browser to: `http://localhost:3000/user/payment-checkout.html`

2. Fill form with test data:
   ```
   Full Name: Test User
   Email: test@example.com
   Phone: +251911223344
   Amount: 100 (auto-filled)
   ```

3. Click "Proceed to Payment"

4. You'll be redirected to Chapa checkout

5. Use test payment method from Chapa docs to complete

6. You'll be redirected to: `http://localhost:3000/payment-result?tx_ref=...`

7. Status should show as **Success** after verification

## Step 5: Verify in Database

Check MongoDB to see if payment was recorded:

```bash
# Connect to MongoDB
mongosh

# Switch to database
use myclothefullstack

# Find payment
db.payments.findOne({ tx_ref: "TXREF_..." })
```

**Expected Output:**
```json
{
  "_id": ObjectId("..."),
  "tx_ref": "TXREF_...",
  "amount": 100,
  "currency": "ETB",
  "payment_status": "success",
  "verified": true,
  "customer_name": "Test User",
  "customer_email": "test@example.com",
  "webhook_processed_at": ISODate("..."),
  "completed_at": ISODate("...")
}
```

## Step 6: Check Logs

```bash
# View recent logs
tail -f cloth_backend/logs/combined.log

# Look for:
# - "Payment record created"
# - "Payment initialized successfully"
# - "Webhook received from Chapa"
# - "Payment verified successfully"
```

## Test Scenarios

### Scenario 1: Successful Payment ✅

```javascript
{
  "status": "success",
  "tx_ref": "TXREF_xxx",
  "reference": "CHAPA-xxx"
}
```

**Expected:** Payment marked as `success` and `verified: true`

### Scenario 2: Failed Payment ❌

```javascript
{
  "status": "failed",
  "tx_ref": "TXREF_xxx",
  "error_message": "Insufficient funds"
}
```

**Expected:** Payment marked as `failed`, user can retry

### Scenario 3: Cancelled Payment ⚠️

```javascript
{
  "status": "cancelled",
  "tx_ref": "TXREF_xxx"
}
```

**Expected:** Payment marked as `cancelled`, user notified

### Scenario 4: Duplicate Webhook 🔄

Send same webhook twice:

```bash
# Send same payload twice
curl -X POST http://localhost:3000/api/payments/chapa/webhook ...
curl -X POST http://localhost:3000/api/payments/chapa/webhook ... (same)
```

**Expected:** 
- First: `verified: true`
- Second: Returns 200 but doesn't double-process (shows `duplicate: true`)

## Troubleshooting

### Issue: "Cannot find module 'axios'"

```bash
cd cloth_backend
npm install axios validator winston
```

### Issue: Webhook returns 404

Check that route is registered in `server.js`:

```javascript
app.use('/api/payments', require('./routes/payments'));
```

### Issue: JWT token error

Get a valid token first:

```bash
# Login via API
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "password": "password"
  }'

# Extract token from response and use in headers
```

### Issue: "Chapa not configured"

Verify environment variables:

```bash
# In Node
echo $CHAPA_SECRET_KEY
echo $CHAPA_PUBLIC_KEY
```

If empty, reload server after adding to `.env`:

```bash
# Stop server (Ctrl+C)
# Update .env
# Restart: npm run dev
```

## Success Checklist

- [ ] Environment variables configured
- [ ] Backend server running without errors
- [ ] Payment initialization endpoint returns checkout URL
- [ ] Can access payment checkout page
- [ ] Webhook successfully processes test callback
- [ ] Payment status updates in database
- [ ] Payment result page displays correctly
- [ ] Logs show all transaction steps

## Next Steps

Once testing is complete:

1. **Update cart/checkout pages** to integrate payment button
2. **Set up email notifications** for payment confirmations
3. **Configure production keys** from Chapa
4. **Deploy** to production environment
5. **Monitor** payment flow in production

## Documentation Files

- `CHAPA_INTEGRATION.md` - Complete implementation guide
- `CHAPA_TESTING.md` - This file
- Environment variables: `.env.example.chapa`

## Support

If you encounter issues:

1. Check `logs/error.log` for error details
2. Review `CHAPA_INTEGRATION.md` troubleshooting section
3. Test with simpler data (round amounts, test emails)
4. Check Chapa API status: https://chapa.co/status

---

**Happy testing! 🎉**
