# Chapa Payment — Quick Testing Guide

**Frontend:** https://www.yeshiclothe.com.et  
**Backend:** https://myclothe.app.aletcloud.com

---

## Prerequisites

- [ ] Chapa account at https://chapa.co (free sandbox available)
- [ ] Test API keys from Chapa Dashboard → Settings → API Keys
- [ ] `.env` configured in `cloth_backend/`
- [ ] Backend running (`npm run dev` or deployed on Render)

---

## Step 1 — Configure `.env`

```bash
# Chapa test keys
CHAPA_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxx
CHAPA_PUBLIC_KEY=pk_test_xxxxxxxxxxxxxxxx
CHAPA_BASE_URL=https://api.chapa.co/v1

# Local testing
BASE_URL=http://localhost:5000
CALLBACK_URL=https://<ngrok-id>.ngrok.io/api/payments/chapa/webhook
RETURN_URL=http://localhost:5000/payment-result

NODE_ENV=development
```

> 💡 For production on Render, replace all URLs with the real domains above.

---

## Step 2 — Start Backend

```bash
cd cloth_backend
npm run dev
```

Expected output:
```
Email configured: yes/no
Server started on port 5000
```

---

## Step 3 — API Tests (curl / Postman)

### Get a JWT token first

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","password":"yourpassword"}'
# Copy the token from the response
```

### Initialize a payment

```bash
curl -X POST http://localhost:5000/api/payments/initialize \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <YOUR_TOKEN>" \
  -d '{
    "amount": 100,
    "currency": "ETB",
    "customer_name": "Abebe Bikila",
    "customer_email": "abebe@example.com",
    "customer_phone": "0911223344",
    "description": "Test payment"
  }'
```

Expected 200:
```json
{
  "success": true,
  "data": {
    "checkout_url": "https://checkout.chapa.co/...",
    "tx_ref": "TXREF_17..._...",
    "amount": 100,
    "currency": "ETB"
  }
}
```

### Simulate a webhook callback

```bash
TX_REF="TXREF_17..._..."   # from above

curl -X POST http://localhost:5000/api/payments/chapa/webhook \
  -H "Content-Type: application/json" \
  -d '{"status":"success","tx_ref":"'$TX_REF'","reference":"CHAPA-TEST-001"}'
```

Expected 200:
```json
{"success": true, "data": {"tx_ref": "...", "status": "success", "verified": true}}
```

> Note: In production, Chapa includes a `Chapa-Signature` header. The webhook will reject unsigned requests. In development it logs a warning but does not block.

### Verify a payment

```bash
curl http://localhost:5000/api/payments/verify/$TX_REF
```

### Get payment details

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:5000/api/payments/$TX_REF
```

### Get user payment history

```bash
curl -H "Authorization: Bearer <TOKEN>" \
  "http://localhost:5000/api/payments/user/<USER_ID>?page=1&limit=10"
```

---

## Step 4 — Full UI Flow

1. Open `http://localhost:5000/user/payment-checkout.html`
2. Fill in name, email, phone — amount is auto-filled
3. Check "I agree" → click **Proceed to Payment**
4. You'll be redirected to the Chapa-hosted checkout
5. Use a Chapa test payment method to complete
6. Chapa redirects you to `RETURN_URL?tx_ref=...`
7. Result page calls `/api/payments/verify/:tx_ref` and shows status

---

## Step 5 — Webhook Tunnelling (local only)

Chapa's webhook needs a public URL. Use [ngrok](https://ngrok.com):

```bash
# Terminal 1 — backend
cd cloth_backend && npm run dev

# Terminal 2 — tunnel
ngrok http 5000
# Copy the https:// URL, e.g. https://abc123.ngrok.io

# Update .env
CALLBACK_URL=https://abc123.ngrok.io/api/payments/chapa/webhook
# Restart backend
```

---

## Step 6 — Check the Database

```bash
mongosh
use myclothefullstack
db.payments.findOne({ tx_ref: "TXREF_..." })
```

Expected:
```json
{
  "tx_ref": "TXREF_...",
  "payment_status": "success",
  "verified": true,
  "webhook_processed_at": ISODate("..."),
  "completed_at": ISODate("...")
}
```

---

## Step 7 — Check Logs

```bash
tail -f cloth_backend/logs/app.log
```

Look for:
- `Payment record created`
- `Webhook received from Chapa`
- `Payment verified successfully`

---

## Test Scenarios

| Scenario | Webhook payload | Expected result |
|----------|----------------|----------------|
| ✅ Success | `"status":"success"` | `payment_status: success`, `verified: true` |
| ❌ Failed | `"status":"failed","error_message":"Insufficient funds"` | `payment_status: failed` |
| ⚠️ Cancelled | `"status":"cancelled"` | `payment_status: cancelled` |
| 🔄 Duplicate | Send same payload twice | First: processed. Second: returns `duplicate: true`, 200 |

---

## Production Checklist

- [ ] Live Chapa keys set on Render dashboard
- [ ] `CALLBACK_URL` = `https://myclothe.app.aletcloud.com/api/payments/chapa/webhook`
- [ ] `RETURN_URL` = `https://www.yeshiclothe.com.et/payment-result`
- [ ] `NODE_ENV=production` (enables strict webhook signature enforcement)
- [ ] `CORS_ORIGINS` includes `https://www.yeshiclothe.com.et`
- [ ] Test a real ETB 1 payment end-to-end after go-live

---

## Common Issues

| Error | Fix |
|-------|-----|
| `"Chapa not configured"` | `CHAPA_SECRET_KEY` not in `.env` or server not restarted |
| 404 on webhook | Route not registered — check `server.js` has `app.use('/api/payments', ...)` |
| Signature rejected | Only in production; ensure keys match what Chapa has |
| Payment status stays "pending" | Webhook not reached — check `CALLBACK_URL` is public |
| `Missing required fields` | Include `amount`, `customer_email`, `customer_phone`, `customer_name` |

---

## Reference

- Chapa API docs: https://chapa.co/docs/
- Backend health: https://myclothe.app.aletcloud.com/api/health
- Implementation guide: `CHAPA_INTEGRATION.md`
