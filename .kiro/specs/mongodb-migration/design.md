# Design Document: MongoDB Migration

## Overview

This document describes the technical design for migrating the Yeshi Clothe e-commerce backend (`cloth_backend/`) from Firebase Firestore to MongoDB Atlas. The migration is a drop-in replacement: all existing API endpoints, response shapes, authentication flows, and frontend behaviour remain unchanged. The only moving parts are the database driver layer and the model definitions.

The core strategy is:

1. Replace `utils/db.js` with a Mongoose-based connection module.
2. Replace every file in `models/` — currently thin re-exports of Firebase compatibility classes — with real Mongoose schemas and models.
3. Delete `utils/firebaseAuthModels.js` once all models are ported.
4. Retain `utils/firebase.js` for Firebase Auth SDK calls (ID-token verification) while removing any Firestore surface.
5. Keep `server.js` and all controllers untouched except where a one-line import path change is needed.


## Architecture

### Before Migration

```
Express server (server.js)
  └── controllers/ (orderController, authController, …)
        └── models/ (User.js, Order.js, …)
              └── utils/firebaseAuthModels.js   ← custom ORM shim
                    └── utils/firebase.js (getFirestore)
                          └── firebase-admin Firestore SDK
                                └── Google Firestore cloud
```

### After Migration

```
Express server (server.js)
  └── controllers/ (unchanged)
        └── models/ (User.js, Order.js, …)  ← real Mongoose models
              └── mongoose ODM
                    └── MongoDB Atlas cloud

  └── middleware/authCore.js
        └── utils/firebase.js (getFirebaseAdmin only, no getFirestore)
              └── firebase-admin Auth SDK  ← token verification only
```

The two database systems are fully orthogonal after migration: MongoDB stores all application data; Firebase Auth SDK verifies Google/Firebase ID tokens only and never reads or writes any documents.


### Key Design Decisions

**Decision 1 — Mongoose 8.x, not 7.x.**  
Mongoose 8 ships with improved TypeScript types, better `populate` performance, and built-in support for `$inc`/`$set` on mixed-type fields. The `^8.4.0` pin ensures a stable API surface across the team's environments.

**Decision 2 — `timestamps: false` + manual timestamp fields.**  
The controllers already read and write `createdAt`, `updatedAt`, `created_at`, `updated_at` explicitly. Letting Mongoose manage timestamps automatically risks doubling the fields or using wrong case. Every schema declares timestamp fields as plain `Date` types with explicit defaults.

**Decision 3 — Explicit `collection:` name on every schema.**  
Firebase used lowercase underscore collection names (`otp_codes`, `user_devices`, etc.). MongoDB would default to pluralising the model name differently. Setting `{ collection: 'otp_codes' }` ensures the same collection names are used if data is migrated and guarantees no name drift.

**Decision 4 — Duplicate-model guard pattern.**  
In test environments and hot-reload scenarios `mongoose.model()` throws `OverwriteModelError` when called twice for the same name. Every model file uses `mongoose.models.ModelName || mongoose.model('ModelName', schema)` to prevent this.

**Decision 5 — Firebase Auth retained for ID token verification only.**  
`authCore.js` accepts `Authorization: Bearer <firebase-id-token>` and calls `admin.auth().verifyIdToken()`. This path does not touch Firestore. The Firebase Admin SDK is initialised without a `databaseURL` or `storageBucket`, scoping it to Auth only.


## Components and Interfaces

### 1. `utils/db.js` — Database Connection Module

**Responsibilities:** Establish and surface the Mongoose connection; expose `getDatabaseProvider()`.

```js
// Public interface
module.exports = connectDB;          // async () => void
module.exports.getDatabaseProvider = getDatabaseProvider; // () => 'mongo' | 'firebase'
```

`connectDB` reads `process.env.MONGODB_URI`, throws if absent/empty, calls `mongoose.connect()`, logs result. No Firebase imports.

`getDatabaseProvider` returns `"firebase"` only when `process.env.DB_PROVIDER === 'firebase'`; returns `"mongo"` in all other cases (including when `DB_PROVIDER` is unset).

### 2. `utils/firebase.js` — Trimmed Firebase Module

After migration this file exports only:
- `getFirebaseAdmin()` — returns the initialised firebase-admin app (Auth only, no Firestore, no Storage).
- `initializeFirebase()` — idempotently initialises the admin app; skips and logs a warning if credentials are absent.

The `getFirestore()` export is removed entirely.

### 3. `models/` — Mongoose Models (15 files)

Each file follows the same pattern:

```js
const mongoose = require('mongoose');
const schema = new mongoose.Schema({ /* fields */ }, { collection: '<name>' });
// indexes defined on schema
module.exports = mongoose.models.ModelName || mongoose.model('ModelName', schema);
```

Files and their collection mappings:

| File | Collection | Notes |
|---|---|---|
| `User.js` | `users` | Core auth entity |
| `OTPCode.js` | `otp_codes` | TTL index on `expiresAt` |
| `UserDevice.js` | `user_devices` | Compound unique key `userId+deviceHash` |
| `BlockedDevice.js` | `blocked_devices` | `deviceHash` as natural key |
| `Order.js` | `orders` | Large nested sub-documents |
| `Post.js` | `posts` | Product listings |
| `Product.js` | `products` | Standalone products |
| `Payment.js` | `payments` | Chapa transaction records |
| `Upload.js` | `uploads` | Binary `Buffer` data field |
| `Notification.js` | `notifications` | User notifications |
| `SiteSettings.js` | `site_settings` | Singleton-ish, key=`"default"` |
| `Analytics.js` | `analytics` | Analytics events |
| `AnalyticsUserSummary.js` | `analytics_user_summaries` | Per-device/user summaries |
| `AuditLog.js` | `audit_logs` | Admin action log |
| `ChatMessage.js` | `chat_messages` | Support chat |


### 4. `utils/ensureAdminUser.js` — Admin Seeding

No interface changes. The function already calls `User.findOne`, `User.create`, and `user.save()` — all are native Mongoose operations once the `User` model exports a real Mongoose model.

### 5. Authentication Flow (unchanged externally)

Two resolution paths in `authCore.js`:

```
Request
  ├── Authorization: Bearer <token>  OR  x-firebase-token: <token>
  │     └── firebase.admin.auth().verifyIdToken(token)
  │           └── User.findOne({ firebaseUid }) → User.findOne({ email })
  │                 └── attach req.user
  │
  └── Cookie yeshi_token  OR  x-auth-token header  OR  ?token query
        └── jwt.verify(token, JWT_SECRET)
              └── User.findById(decoded.user.id)
                    └── attach req.user
```

Both paths ultimately resolve to a Mongoose `User` document. Neither path accesses Firestore.


## Data Models

### User

```js
{
  fullName: { type: String, default: '' },
  fatherName: { type: String, default: '' },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, default: '' },
  age: { type: Number, default: null },
  sex: { type: String, default: '' },
  profileImage: { type: String, default: '' },
  shipping_addresses: [ShippingAddressSubSchema],
  measurement_profiles: [MeasurementProfileSubSchema],
  default_shipping_address_id: { type: String, default: '' },
  default_measurement_profile_id: { type: String, default: '' },
  passwordHash: { type: String, default: '' },
  authProvider: { type: String, enum: ['local', 'google'], default: 'local' },
  googleSub: { type: String, default: '' },
  firebaseUid: { type: String, default: '' },
  emailVerified: { type: Boolean, default: false },
  pendingEmail: { type: String, default: '' },
  providerIds: [{ type: String }],
  role: { type: String, enum: ['admin', 'customer'], default: 'customer' },
  blocked_status: { type: Boolean, default: false },
  status: { type: String, enum: ['active', 'inactive', 'banned'], default: 'active' },
  isBanned: { type: Boolean, default: false },
  resetPasswordTokenHash: { type: String, default: '' },
  resetPasswordExpiresAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: null },
  updatedAt: { type: Date, default: Date.now }
}
// collection: 'users'
// indexes: unique on email
```

Sub-schemas are embedded (not referenced) to match the Firebase structure where shipping addresses and measurement profiles are nested arrays.

### Order

Key fields (all pre-existing, no new fields added):
```js
{
  user_id: { type: ObjectId, ref: 'User' },
  productId: { type: ObjectId, ref: 'Post' },
  post_id: { type: ObjectId, ref: 'Post' },
  productName: String,
  customerName: String,
  phone: String,
  customer_info: { type: mongoose.Schema.Types.Mixed },   // nested object
  cloth_details:  { type: mongoose.Schema.Types.Mixed },  // nested object
  payment_info:   { type: mongoose.Schema.Types.Mixed },  // nested object
  device_location:{ type: mongoose.Schema.Types.Mixed },  // nested object
  quantity: Number,
  productPrice: Number,
  shippingPrice: Number,
  totalPrice: Number,
  proposed_price_etb: Number,
  paymentStatus: String,
  orderStatus: String,
  created_at: Date,  createdAt: Date,
  updated_at: Date,  updatedAt: Date
}
// collection: 'orders'
// indexes: user_id, created_at
```

`customer_info`, `cloth_details`, `payment_info`, and `device_location` are declared as `Mixed` because their internal structure varies significantly across old and new order flows and controllers use `markModified()` to signal changes.


### Post

```js
{
  title: String,
  description: String,
  category: String,
  categories: [String],
  measurement_profiles: [String],
  images: [String],
  videoUrl: String,
  videoUrls: [String],
  priceETB: Number,
  oldPriceETB: Number,
  shippingPriceETB: Number,
  freeShipping: Boolean,
  delivery_scope: String,        // 'ethiopia_only' | 'all_countries' | 'selected_countries'
  delivery_countries: [String],
  stock_quantity: Number,
  unlimited_stock: Boolean,
  viewCount: Number,
  shareCount: Number,
  bagCount: Number,
  orderCountVisible: Boolean,
  likes: [{ type: ObjectId, ref: 'User' }],
  comments: [CommentSubSchema],
  created_by: { type: ObjectId, ref: 'User' },
  created_at: Date, createdAt: Date,
  updated_at: Date, updatedAt: Date
}
// collection: 'posts'
// indexes: created_at (desc), stock_quantity
```

### Payment

```js
{
  user_id:   { type: ObjectId, ref: 'User' },
  order_id:  { type: ObjectId, ref: 'Order' },
  tx_ref:    { type: String, required: true, unique: true },
  chapa_transaction_id: String,
  amount: Number,
  currency: { type: String, default: 'ETB' },
  customer_name: String,
  customer_email: String,
  customer_phone: String,
  payment_method: String,
  payment_status: { type: String, enum: ['pending','success','failed','cancelled'], default: 'pending' },
  description: String,
  verified: { type: Boolean, default: false },
  verification_attempts: { type: Number, default: 0 },
  last_verification_at: Date,
  completed_at: Date,
  webhook_received_at: Date,
  webhook_processed_at: Date,
  webhook_attempt_count: { type: Number, default: 0 },
  payment_reference: String,
  error_message: String,
  error_code: String,
  callback_response: mongoose.Schema.Types.Mixed,
  metadata: mongoose.Schema.Types.Mixed,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
}
// collection: 'payments'
// indexes: unique on tx_ref; user_id; order_id
```

### Upload

```js
{
  originalName: { type: String, default: '' },
  mimeType:     { type: String, default: 'application/octet-stream' },
  size:         { type: Number, default: 0 },
  data:         { type: Buffer },              // binary blob
  storage_path: { type: String, default: '' }, // filesystem path (preferred when present)
  visibility:   { type: String, default: 'public' },
  owner_user_id:{ type: ObjectId, ref: 'User' },
  purpose:      { type: String, default: '' },
  order_id:     { type: ObjectId, ref: 'Order' },
  post_id:      { type: ObjectId, ref: 'Post' },
  created_at:   { type: Date, default: Date.now }
}
// collection: 'uploads'
// indexes: owner_user_id, purpose
```

When `storage_path` is non-empty the upload endpoint streams from disk; when empty it reads `data` from MongoDB. This matches current behaviour exactly.


### OTPCode

```js
{
  userId:    { type: String, required: true },
  otp:       { type: String, required: true },
  type:      { type: String, required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
}
// collection: 'otp_codes'
// indexes: userId; TTL on expiresAt (expireAfterSeconds: 0)
```

### UserDevice

```js
{
  userId:       { type: String, required: true },
  deviceHash:   { type: String, required: true },
  userAgent:    { type: String, default: '' },
  lastSeenAt:   { type: Date },
  firstSeenAt:  { type: Date, default: Date.now }
}
// collection: 'user_devices'
// compound index: { userId, deviceHash } unique
```

### BlockedDevice

```js
{
  deviceHash: { type: String, required: true, unique: true },
  blocked:    { type: Boolean, default: true },
  reason:     { type: String, default: '' },
  blockedAt:  { type: Date, default: Date.now },
  blockedBy:  { type: String, default: '' }
}
// collection: 'blocked_devices'
```

### Notification

```js
{
  user_id:      { type: ObjectId, ref: 'User', required: true },
  type:         { type: String, default: 'system' },
  title:        { type: String, default: '' },
  body:         { type: String, default: '' },
  reference_id: { type: String, default: '' },
  destination:  { type: mongoose.Schema.Types.Mixed },
  is_read:      { type: Boolean, default: false },
  timestamp:    { type: Date, default: Date.now }
}
// collection: 'notifications'
// compound index: { user_id: 1, timestamp: -1 }
```

### SiteSettings

```js
{
  key:      { type: String, default: 'default', unique: true },
  social:   { type: mongoose.Schema.Types.Mixed, default: {} },
  content:  { type: mongoose.Schema.Types.Mixed, default: {} },
  delivery: { type: mongoose.Schema.Types.Mixed, default: {} },
  updatedAt:{ type: Date, default: Date.now }
}
// collection: 'site_settings'
```

### Analytics (AnalyticsEvent)

```js
{
  userId:     { type: String, default: null },
  deviceId:   { type: String, default: '' },
  deviceType: { type: String, default: 'desktop' },
  eventType:  { type: String, required: true },
  eventData:  { type: mongoose.Schema.Types.Mixed, default: {} },
  sessionId:  { type: String, default: '' },
  timestamp:  { type: Date, default: Date.now }
}
// collection: 'analytics'
// indexes: userId, deviceId, timestamp
```

### AnalyticsUserSummary

```js
{
  userId:              { type: String, default: null },
  deviceId:            { type: String, default: '' },
  deviceType:          { type: String, default: 'desktop' },
  firstVisitAt:        { type: Date },
  lastActiveAt:        { type: Date },
  totalTimeSpentSeconds:{ type: Number, default: 0 },
  sessionCount:        { type: Number, default: 0 },
  sessionIds:          [{ type: String }],
  updatedAt:           { type: Date }
}
// collection: 'analytics_user_summaries'
// compound index: { userId, deviceId }
```

### AuditLog

```js
{
  actor_id:    { type: ObjectId, ref: 'User' },
  actor_email: { type: String, default: '' },
  action:      { type: String, required: true },
  target_type: { type: String, default: '' },
  target_id:   { type: String, default: '' },
  metadata:    { type: mongoose.Schema.Types.Mixed },
  ip:          { type: String, default: '' },
  createdAt:   { type: Date, default: Date.now }
}
// collection: 'audit_logs'
// indexes: actor_id, createdAt
```

### ChatMessage

```js
{
  sender_id:   { type: String, required: true },
  receiver_id: { type: String, required: true },
  job_id:      { type: String, default: null },
  delivery_id: { type: String, default: null },
  message:     { type: String, default: '' },
  reply_to:    { type: String, default: null },
  timestamp:   { type: Date, default: Date.now },
  sent:        { type: Boolean, default: true },
  seen:        { type: Boolean, default: false },
  seen_at:     { type: Date, default: null }
}
// collection: 'chat_messages'
// indexes: sender_id, receiver_id, timestamp
```

### Product

```js
{
  name:        { type: String, default: '' },
  description: { type: String, default: '' },
  price:       { type: Number, default: 0 },
  category:    { type: String, default: '' },
  images:      [{ type: String }],
  stock:       { type: Number, default: 0 },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now }
}
// collection: 'products'
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: connectDB throws on missing URI

*For any* server startup attempt where `process.env.MONGODB_URI` is absent or is an empty/whitespace-only string, calling `connectDB()` SHALL throw an error before attempting any network call.

**Validates: Requirements 2.1, 2.2**

---

### Property 2: getDatabaseProvider returns correct value for all inputs

*For any* value of `process.env.DB_PROVIDER`, `getDatabaseProvider()` SHALL return `"firebase"` if and only if the trimmed, lowercased value is exactly `"firebase"`; it SHALL return `"mongo"` for all other values including unset.

**Validates: Requirements 2.7**

---

### Property 3: Schema round-trip preserves document data

*For any* valid document object conforming to a schema, saving it to MongoDB and reading it back by `_id` SHALL return a document whose field values are deeply equal to the original (for all non-auto-generated fields).

**Validates: Requirements 3.1, 3.3–3.9, 8.5**

---

### Property 4: Required-field validation rejects incomplete documents

*For any* schema that declares a field as required, attempting to save a document with that field absent or null SHALL throw a Mongoose `ValidationError` naming the missing field, and no document SHALL be written to the collection.

**Validates: Requirements 3.2**

---

### Property 5: User email uniqueness

*For any* email string, inserting a second `User` document with the same lowercased email as an existing document SHALL throw a duplicate-key error (`code 11000`), and the second document SHALL NOT be persisted.

**Validates: Requirements 9.1**

---

### Property 6: Payment tx_ref uniqueness

*For any* `tx_ref` string, inserting a second `Payment` document with the same `tx_ref` as an existing document SHALL throw a duplicate-key error (`code 11000`), and the second document SHALL NOT be persisted.

**Validates: Requirements 9.4**

---

### Property 7: Upload Buffer round-trip

*For any* `Buffer` value `buf`, creating an `Upload` document with `data: buf` and then reading it back SHALL return a document where `doc.data` is a `Buffer` with byte-for-byte identical content to `buf`.

**Validates: Requirements 11.1, 11.2**

---

### Property 8: Firebase token resolution follows uid-first, email-second order

*For any* decoded Firebase ID token, the auth middleware SHALL first attempt `User.findOne({ firebaseUid })` and only attempt `User.findOne({ email })` if the `firebaseUid` lookup returns null. It SHALL NEVER query MongoDB using an unverified or raw token field.

**Validates: Requirements 7.1, 7.3**

---

### Property 9: Valid ObjectId strings do not cause CastError

*For any* string that matches the 24-character hexadecimal ObjectId format, calling `Model.findById(id)` or `Model.findOne({ refField: id })` on any model with an `ObjectId` reference field SHALL resolve without throwing a `CastError`.

**Validates: Requirements 12.7**

---

### Property 10: Order creation response contains both _id and id

*For any* valid order document saved to MongoDB, the serialised JSON representation SHALL contain both an `_id` field and an `id` field, each being a non-empty string representation of the same MongoDB ObjectId.

**Validates: Requirements 13.2, 13.7**


## Error Handling

### Database Connection Errors

`connectDB()` propagates its error to `startServer()`. `startServer()` logs the error and calls `process.exit(1)`. The HTTP server is never started; no requests are accepted.

A missing `MONGODB_URI` is caught before `mongoose.connect()` is called, producing a clear human-readable message:
```
MongoDB connection string is missing. Set MONGODB_URI in your .env file.
```

### Validation Errors

Mongoose `ValidationError` is thrown synchronously when `.save()` or `.create()` is called with invalid data. Controllers already have `try/catch` blocks that catch these and return a 400 or 500 response. No controller changes are needed.

### Duplicate Key Errors

`MongoServerError` with `code: 11000` is thrown on unique-index violations (email, tx_ref, deviceHash). The existing controllers that enforce uniqueness at the application level (`User.findOne({email})` before `User.create`) are unaffected. The database-level uniqueness is an additional safeguard.

### CastError on Invalid ObjectIds

When a route passes a non-hex string to `Model.findById()`, Mongoose throws `CastError`. Controllers should catch these and return a 400 `{ msg: 'Invalid ID' }` response. Existing controllers wrap model calls in `try/catch`, so this is already handled.

### Firebase Auth Errors

`admin.auth().verifyIdToken()` throws on invalid/expired tokens. `authCore.js` already catches errors from this call and treats them as no-op (falls through to JWT resolution). If Firebase credentials are absent, `utils/firebase.js` logs a warning and `getFirebaseAdmin()` returns null; `resolveFromFirebaseToken` guards against a null admin and skips token verification gracefully.

### ensureAdminUser Errors

A database error during seeding is propagated to `startServer()`, which logs it but does NOT call `process.exit(1)`. The server continues to start, so a transient seeding failure (e.g., brief Atlas connectivity blip) does not take down the whole application.


## Testing Strategy

### Overview

This migration does not add new business logic, so the testing goal is **regression prevention** — verifying that every model and utility produces the same observable behaviour after the swap. The approach combines:

- **Unit tests**: pure logic functions (connectDB guard, getDatabaseProvider, schema validation).
- **Property-based tests**: universally quantified correctness properties using generated inputs.
- **Integration tests**: Mongoose operations against a real MongoDB instance (using `mongodb-memory-server` for local runs or a dedicated Atlas test cluster in CI).

### Property-Based Testing

PBT applies here because several requirements are universal ("for any document", "for any email", "for any Buffer"). The library is **fast-check** (works with plain Node.js/Jest, no framework lock-in).

Each property test runs a minimum of **100 iterations** and is tagged with the design property it validates.

```js
// Tag format comment at the top of each property test:
// Feature: mongodb-migration, Property 3: Schema round-trip preserves document data
```

**Properties to implement as fast-check tests:**

| Property | What is generated | What is asserted |
|---|---|---|
| P1 — connectDB throws on missing URI | arbitrary string / empty string / undefined as MONGODB_URI | connectDB throws before connect |
| P2 — getDatabaseProvider | arbitrary string as DB_PROVIDER | returns "mongo" unless value is "firebase" |
| P3 — Schema round-trip | arbitrary field values for each schema | findById returns identical fields |
| P4 — Required-field validation | valid doc with one required field removed | ValidationError thrown |
| P5 — User email uniqueness | arbitrary email string | second insert throws duplicate key |
| P6 — Payment tx_ref uniqueness | arbitrary tx_ref string | second insert throws duplicate key |
| P7 — Upload Buffer round-trip | arbitrary byte arrays | doc.data equals original Buffer |
| P8 — Firebase token resolution order | mock decoded token with uid / email | findOne called with uid first |
| P9 — Valid ObjectId no CastError | 24-char hex string | findById resolves without CastError |
| P10 — Order _id and id in response | arbitrary order data | serialised doc has _id and id strings |

### Unit Tests (Example-Based)

- `getDatabaseProvider()` with `DB_PROVIDER="mongo"`, `"firebase"`, unset.
- `connectDB()` calls `mongoose.connect()` with the exact `MONGODB_URI` value.
- `connectDB()` logs `"MongoDB connected"` on success.
- Model files do not throw `OverwriteModelError` when required twice.
- `firebase.js` logs a warning and skips init when credentials are absent.
- `ensureAdminUser()` creates an admin user when none exists.
- `ensureAdminUser()` updates an existing admin user.
- `GET /api/auth/firebase/config` returns 503 when required fields are missing.

### Integration Tests

Run against `mongodb-memory-server` (in-memory MongoDB):

- All 15 Mongoose models can create, read, update, delete documents.
- Chained query `.find(query).select(fields).sort(obj).lean()` works on User, Order, Post.
- `findOneAndUpdate` with `{ upsert: true, new: true }` returns the new/updated document.
- `aggregate()` on Order works with a `$match` + `$group` pipeline.
- `insertMany()` on Notification inserts all documents.
- `countDocuments()` and `deleteMany()` work on OTPCode.
- Upload with `storage_path` serves from filesystem; without it serves `data` buffer.

### Smoke Checks

These are manual or CI pipeline checks, not automated test suites:

- `package.json` contains `"mongoose": "^8.4.0"` in `dependencies`.
- `utils/db.js` contains no `require('firebase-admin')` or `getFirestore` reference.
- Every file in `models/` contains exactly one `mongoose.model()` call.
- `utils/firebaseAuthModels.js` does not exist after migration.
- `node server.js` (with valid `.env`) logs `"MongoDB connected"` and `"Server started on port 5000"`.

### Test Infrastructure

Install `mongodb-memory-server` and `fast-check` as dev dependencies:

```bash
npm install --save-dev mongodb-memory-server fast-check jest
```

Tests are co-located in `cloth_backend/__tests__/`:

```
cloth_backend/
  __tests__/
    db.test.js
    models/
      user.test.js
      order.test.js
      upload.test.js
      payment.test.js
      …
    auth/
      authCore.test.js
    properties/
      roundtrip.property.test.js
      uniqueness.property.test.js
      buffer.property.test.js
```

