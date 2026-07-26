# Implementation Plan: MongoDB Migration

## Overview

Migrate `cloth_backend/` from Firebase Firestore to MongoDB Atlas using Mongoose ^8.4.0.
The migration is a drop-in replacement: all API endpoints, response shapes, and authentication
flows remain unchanged. Work proceeds in six phases: infrastructure setup, database connection,
Mongoose models (core then supporting), middleware/auth updates, integration wiring, and the
test suite.

## Tasks

- [x] 1. Install dependencies and update environment configuration
  - [x] 1.1 Add mongoose ^8.4.0 to cloth_backend/package.json dependencies and install
    - Run `npm install mongoose@^8.4.0` inside `cloth_backend/`
    - Verify `package.json` lists `"mongoose": "^8.4.0"` under `dependencies`
    - Install dev dependencies: `npm install --save-dev jest mongodb-memory-server fast-check`
    - Add `"test": "jest --runInBand"` script to `package.json`
    - _Requirements: 1.1, 1.3, 1.4_

  - [x] 1.2 Update cloth_backend/.env.example with all required MongoDB and service keys
    - Replace or overwrite `.env.example` with `MONGODB_URI`, `DB_PROVIDER=mongo`,
      `JWT_SECRET`, `JWT_EXPIRE`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PORT`, `NODE_ENV`,
      `BASE_URL`, `FRONTEND_URL`, `CORS_ORIGINS`, `CHAPA_SECRET_KEY`, `CHAPA_PUBLIC_KEY`,
      `CHAPA_BASE_URL`, `CALLBACK_URL`, `RETURN_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
      `SMTP_PASS`, `RATE_LIMIT_MAX`, `MAX_UPLOAD_SIZE`, and all seven `FIREBASE_WEB_*` keys
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 2. Replace utils/db.js with Mongoose connection module
  - [x] 2.1 Rewrite cloth_backend/utils/db.js as a Mongoose connectDB module
    - Remove all Firebase/Firestore imports from the file
    - Export `connectDB` as an async function that reads `MONGODB_URI` from `process.env`,
      throws with a clear message if missing/empty, calls `mongoose.connect(uri)`,
      logs `"MongoDB connected"` on success, and rethrows on failure
    - Export `getDatabaseProvider` that returns `"firebase"` only when
      `process.env.DB_PROVIDER` trimmed-lowercased equals `"firebase"`, else `"mongo"`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [ ]* 2.2 Write property tests for connectDB and getDatabaseProvider (P1, P2)
    - Create `cloth_backend/__tests__/db.test.js`
    - **Property 1: connectDB throws on missing URI** — use `fc.oneof(fc.constant(''), fc.constant(undefined), fc.string())` (filtered to whitespace-only) to assert `connectDB()` throws before any `mongoose.connect` call; mock mongoose.connect with jest.spyOn
    - **Property 2: getDatabaseProvider returns correct value for all inputs** — use `fc.string()` as arbitrary `DB_PROVIDER` to assert it returns `"firebase"` iff value trimmed-lowercased is exactly `"firebase"`, else `"mongo"`
    - **Validates: Requirements 2.1, 2.2, 2.7**
    - _Requirements: 2.1, 2.2, 2.7_

- [x] 3. Trim utils/firebase.js to Auth-only and rewrite utils/firebaseAuthModels.js removal prep
  - [x] 3.1 Rewrite cloth_backend/utils/firebase.js to export only Auth-scoped helpers
    - Remove the `getFirestore()` export and any `firebase-admin/firestore` import
    - Keep `initializeFirebase()` (idempotent, guard against missing credentials — log warning and return without throwing if `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, or `FIREBASE_PRIVATE_KEY` are absent)
    - Keep `getFirebaseAdmin()` returning the initialized app or null when credentials absent
    - Initialize the admin app without `databaseURL` or `storageBucket`
    - _Requirements: 7.2, 7.5, 7.6, 15.2, 15.3_

- [x] 4. Implement core Mongoose models — User, Order, Post, Payment
  - [x] 4.1 Create cloth_backend/models/User.js as a Mongoose model
    - Define `ShippingAddressSubSchema` and `MeasurementProfileSubSchema` as nested schemas
    - Define `UserSchema` with all fields from the design (fullName, fatherName, email unique+lowercase+trim, passwordHash, authProvider enum, googleSub, firebaseUid, emailVerified, pendingEmail, providerIds, role enum, status enum, isBanned, blocked_status, phone, age, sex, profileImage, shipping_addresses, measurement_profiles, default_shipping_address_id, default_measurement_profile_id, resetPasswordTokenHash, resetPasswordExpiresAt, lastLoginAt, createdAt, updatedAt)
    - Set `{ collection: 'users', timestamps: false }`; add unique index on `email`
    - Export using `mongoose.models.User || mongoose.model('User', UserSchema)`
    - Remove any import from `utils/firebaseAuthModels.js`
    - _Requirements: 3.1, 3.3, 4.1, 9.1, 12.1, 15.5_

  - [x] 4.2 Create cloth_backend/models/Order.js as a Mongoose model
    - Define `OrderSchema` with all fields: `user_id` (ObjectId ref User), `productId` and `post_id` (ObjectId ref Post), `productName`, `customerName`, `phone`, `customer_info` (Mixed), `cloth_details` (Mixed), `payment_info` (Mixed), `device_location` (Mixed), `quantity`, `productPrice`, `shippingPrice`, `totalPrice`, `proposed_price_etb`, `paymentStatus`, `orderStatus`, `created_at`, `createdAt`, `updated_at`, `updatedAt`
    - Set `{ collection: 'orders', timestamps: false }`; add index on `user_id` and separate index on `created_at`
    - Export with duplicate-model guard
    - _Requirements: 3.1, 3.4, 4.2, 9.2, 12.1, 12.2, 15.5_

  - [x] 4.3 Create cloth_backend/models/Post.js as a Mongoose model
    - Define `CommentSubSchema` as nested schema
    - Define `PostSchema` with all fields: `title`, `description`, `category`, `categories` (Array String), `measurement_profiles` (Array String), `images` (Array String), `videoUrl`, `videoUrls` (Array String), `priceETB`, `oldPriceETB`, `shippingPriceETB`, `freeShipping`, `delivery_scope`, `delivery_countries` (Array String), `stock_quantity`, `unlimited_stock`, `viewCount`, `shareCount`, `bagCount`, `orderCountVisible`, `likes` (Array ObjectId ref User), `comments` (Array CommentSubSchema), `created_by` (ObjectId ref User), `created_at`, `createdAt`, `updated_at`, `updatedAt`
    - Set `{ collection: 'posts', timestamps: false }`; add descending index on `created_at`, separate index on `stock_quantity`
    - Export with duplicate-model guard
    - _Requirements: 3.1, 3.5, 4.3, 9.3, 15.5_

  - [x] 4.4 Create cloth_backend/models/Payment.js as a Mongoose model
    - Define `PaymentSchema` with all fields from the design: `user_id` (ObjectId ref User), `order_id` (ObjectId ref Order), `tx_ref` (String required unique), `chapa_transaction_id`, `amount`, `currency`, `customer_name`, `customer_email`, `customer_phone`, `payment_method`, `payment_status` (enum: pending/success/failed/cancelled), `verified`, `verification_attempts`, `last_verification_at`, `completed_at`, `webhook_received_at`, `webhook_processed_at`, `webhook_attempt_count`, `payment_reference`, `error_message`, `error_code`, `callback_response` (Mixed), `metadata` (Mixed), `created_at`, `updated_at`
    - Set `{ collection: 'payments', timestamps: false }`; unique index on `tx_ref`; indexes on `user_id`, `order_id`
    - Export with duplicate-model guard
    - _Requirements: 3.1, 3.6, 4.4, 9.4, 12.3, 12.4, 15.5_

  - [ ]* 4.5 Write property tests for core models — schema round-trip and required-field validation (P3, P4)
    - Create `cloth_backend/__tests__/properties/roundtrip.property.test.js`
    - Use `mongodb-memory-server` to spin up an in-process MongoDB; connect with mongoose before all tests and disconnect after
    - **Property 3: Schema round-trip preserves document data** — for each of User, Order, Post, Payment: generate arbitrary valid document objects with `fc.record(...)`, save, read back by `_id`, assert all non-auto fields deeply equal the originals
    - **Property 4: Required-field validation rejects incomplete documents** — for each schema with required fields (User.email, OTPCode.userId/otp/type/expiresAt, Payment.tx_ref, etc.): generate valid docs, remove one required field, assert `ValidationError` thrown and no document written
    - **Validates: Requirements 3.1, 3.2, 3.3–3.9, 8.5**
    - _Requirements: 3.1, 3.2_

  - [ ]* 4.6 Write property tests for uniqueness constraints (P5, P6)
    - Create `cloth_backend/__tests__/properties/uniqueness.property.test.js`
    - **Property 5: User email uniqueness** — generate arbitrary email string with `fc.emailAddress()`, insert first User successfully, attempt second User with same email, assert MongoServerError code 11000 and second doc not persisted
    - **Property 6: Payment tx_ref uniqueness** — generate arbitrary `tx_ref` string, insert first Payment, attempt second with same `tx_ref`, assert duplicate key error
    - **Validates: Requirements 9.1, 9.4**
    - _Requirements: 9.1, 9.4_

- [x] 5. Implement supporting Mongoose models — Upload, Notification, SiteSettings, OTPCode, UserDevice, BlockedDevice
  - [x] 5.1 Create cloth_backend/models/Upload.js as a Mongoose model
    - Define `UploadSchema` with: `originalName` (String), `mimeType` (String default 'application/octet-stream'), `size` (Number), `data` (Buffer), `storage_path` (String), `visibility` (String default 'public'), `owner_user_id` (ObjectId ref User), `purpose` (String), `order_id` (ObjectId ref Order), `post_id` (ObjectId ref Post), `created_at` (Date default Date.now)
    - Set `{ collection: 'uploads', timestamps: false }`; indexes on `owner_user_id` and `purpose`
    - Export with duplicate-model guard
    - _Requirements: 3.1, 3.7, 4.5, 9.8, 12.6, 15.5_

  - [ ]* 5.2 Write property test for Upload Buffer round-trip (P7)
    - Create `cloth_backend/__tests__/properties/buffer.property.test.js`
    - **Property 7: Upload Buffer round-trip** — generate arbitrary `Uint8Array` with `fc.uint8Array()`, convert to `Buffer`, create Upload doc, read back, assert `doc.data` is Buffer with byte-for-byte identical content using `Buffer.compare`
    - **Validates: Requirements 11.1, 11.2**
    - _Requirements: 11.1, 11.2_

  - [x] 5.3 Create cloth_backend/models/Notification.js as a Mongoose model
    - Define `NotificationSchema`: `user_id` (ObjectId ref User required), `type`, `title`, `body`, `reference_id`, `destination` (Mixed), `is_read` (Boolean default false), `timestamp` (Date default Date.now)
    - Set `{ collection: 'notifications', timestamps: false }`; compound index `{ user_id: 1, timestamp: -1 }`
    - Export with duplicate-model guard
    - _Requirements: 3.1, 3.8, 4.6, 9.5, 12.5, 15.5_

  - [x] 5.4 Create cloth_backend/models/SiteSettings.js as a Mongoose model
    - Define `SiteSettingsSchema`: `key` (String default 'default' unique), `social` (Mixed default {}), `content` (Mixed default {}), `delivery` (Mixed default {}), `updatedAt` (Date default Date.now)
    - Set `{ collection: 'site_settings', timestamps: false }`
    - Export with duplicate-model guard
    - _Requirements: 3.1, 3.9, 4.7, 15.5_

  - [x] 5.5 Create cloth_backend/models/OTPCode.js as a Mongoose model
    - Define `OTPCodeSchema`: `userId` (String required), `otp` (String required), `type` (String required), `expiresAt` (Date required), `createdAt` (Date default Date.now)
    - Set `{ collection: 'otp_codes', timestamps: false }`; index on `userId`; TTL index on `expiresAt` with `expireAfterSeconds: 0`
    - Export with duplicate-model guard
    - _Requirements: 3.1, 4.8, 9.6, 15.5_

  - [x] 5.6 Create cloth_backend/models/UserDevice.js and models/BlockedDevice.js as Mongoose models
    - `UserDeviceSchema`: `userId` (String required), `deviceHash` (String required), `userAgent`, `lastSeenAt` (Date), `firstSeenAt` (Date default Date.now); `{ collection: 'user_devices' }`; compound unique index `{ userId: 1, deviceHash: 1 }`
    - `BlockedDeviceSchema`: `deviceHash` (String required unique), `blocked` (Boolean default true), `reason`, `blockedAt` (Date default Date.now), `blockedBy`; `{ collection: 'blocked_devices' }`
    - Both export with duplicate-model guard
    - _Requirements: 3.1, 4.9, 4.10, 15.5_

- [x] 6. Implement analytics, audit, and chat Mongoose models
  - [x] 6.1 Create cloth_backend/models/Analytics.js and models/AnalyticsUserSummary.js
    - `AnalyticsSchema`: `userId` (String default null), `deviceId` (String), `deviceType` (String default 'desktop'), `eventType` (String required), `eventData` (Mixed default {}), `sessionId`, `timestamp` (Date default Date.now); `{ collection: 'analytics' }`; indexes on `userId`, `deviceId`, `timestamp`
    - `AnalyticsUserSummarySchema`: `userId` (String default null), `deviceId` (String), `deviceType`, `firstVisitAt` (Date), `lastActiveAt` (Date), `totalTimeSpentSeconds` (Number default 0), `sessionCount` (Number default 0), `sessionIds` (Array String), `updatedAt` (Date); `{ collection: 'analytics_user_summaries' }`; compound index `{ userId: 1, deviceId: 1 }`
    - Both export with duplicate-model guard
    - _Requirements: 3.1, 4.11, 4.12, 9.7, 15.5_

  - [x] 6.2 Create cloth_backend/models/AuditLog.js and models/ChatMessage.js
    - `AuditLogSchema`: `actor_id` (ObjectId ref User), `actor_email`, `action` (String required), `target_type`, `target_id`, `metadata` (Mixed), `ip`, `createdAt` (Date default Date.now); `{ collection: 'audit_logs' }`; indexes on `actor_id`, `createdAt`
    - `ChatMessageSchema`: `sender_id` (String required), `receiver_id` (String required), `job_id` (String default null), `delivery_id` (String default null), `message`, `reply_to` (String default null), `timestamp` (Date default Date.now), `sent` (Boolean default true), `seen` (Boolean default false), `seen_at` (Date default null); `{ collection: 'chat_messages' }`; indexes on `sender_id`, `receiver_id`, `timestamp`
    - Both export with duplicate-model guard
    - _Requirements: 3.1, 4.13, 4.14, 15.5_

  - [x] 6.3 Create cloth_backend/models/Product.js as a Mongoose model
    - `ProductSchema`: `name`, `description`, `price` (Number default 0), `category`, `images` (Array String), `stock` (Number default 0), `createdAt` (Date default Date.now), `updatedAt` (Date default Date.now)
    - Set `{ collection: 'products', timestamps: false }`
    - Export with duplicate-model guard
    - _Requirements: 3.1, 4.15, 15.5_

- [x] 7. Checkpoint — Verify all models load without errors
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Update middleware and authentication layer
  - [x] 8.1 Rewrite cloth_backend/middleware/authCore.js to query MongoDB instead of Firestore
    - In the Firebase token resolution path: call `getFirebaseAdmin()` from `utils/firebase.js`; if null, skip Firebase path gracefully; otherwise call `admin.auth().verifyIdToken(token)`
    - On successful verification, call `User.findOne({ firebaseUid: decoded.uid })` first; only if null, call `User.findOne({ email: decoded.email.toLowerCase() })`
    - Attach resolved user to `req.user`; return 401 if no matching user found in either lookup
    - In the JWT path, call `User.findById(decoded.user.id)` using the Mongoose User model
    - Guard against null admin and null user at every step
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ]* 8.2 Write property test for Firebase token resolution order (P8)
    - Create `cloth_backend/__tests__/auth/authCore.test.js`
    - **Property 8: Firebase token resolution follows uid-first, email-second order** — use `fc.record({ uid: fc.hexaString({ minLength: 1 }), email: fc.emailAddress() })` as arbitrary decoded tokens; mock `User.findOne` with jest.spyOn; assert `findOne({ firebaseUid })` is called before `findOne({ email })`; assert `findOne({ email })` is only called when first returns null
    - **Validates: Requirements 7.1, 7.3**
    - _Requirements: 7.1, 7.3_

  - [x] 8.3 Update cloth_backend/utils/ensureAdminUser.js to work with Mongoose User model
    - Ensure the function calls `User.findOne({ email: adminEmail })` (Mongoose query)
    - On not-found: call `User.create({...})` with hashed password
    - On found: update fields and call `user.save()`
    - Guard for missing `ADMIN_EMAIL` / `ADMIN_PASSWORD` — log warning and return
    - Propagate database errors to caller (do not swallow)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [x] 9. Update server.js startup sequence
  - [x] 9.1 Modify cloth_backend/server.js to use the new connectDB and startup order
    - Import `connectDB` from `utils/db.js` (no Firebase DB import)
    - In `startServer()`: call `await connectDB()` before `app.listen()`
    - After successful connect: call `await ensureAdminUser()` inside try/catch — log error but do not exit if it throws
    - If `connectDB()` throws: log error and call `process.exit(1)`
    - Log `"Server started on port <PORT>"` after `app.listen()` resolves
    - Skip any Firebase-specific initialization when `getDatabaseProvider()` returns `"mongo"`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

- [x] 10. Delete utils/firebaseAuthModels.js and validate model imports
  - [x] 10.1 Delete cloth_backend/utils/firebaseAuthModels.js and verify no remaining references
    - Delete the file `cloth_backend/utils/firebaseAuthModels.js`
    - Search entire `cloth_backend/` for any remaining `require` of `firebaseAuthModels`, `getFirestore`, or `firebase-admin/firestore` — remove or replace each occurrence
    - Verify `utils/db.js` contains no Firebase imports
    - _Requirements: 15.1, 15.2, 15.4, 15.6, 15.7_

- [x] 11. Checkpoint — Verify server starts and connects to MongoDB
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Write integration tests for Mongoose models and API layer
  - [ ] 12.1 Create cloth_backend/__tests__/models/ integration test suite for core models
    - Create `user.test.js`, `order.test.js`, `post.test.js`, `payment.test.js` in `__tests__/models/`
    - For each: spin up `mongodb-memory-server`, connect, test CRUD (create, findById, updateOne with `{ new: true }`, deleteOne), chained query `find().select().sort().lean()`, `findOneAndUpdate` with `{ upsert: true, new: true }`
    - Test `Order.aggregate([{ $match: {...} }, { $group: {...} }])` pipeline
    - Test `Notification.insertMany(array)` inserts all documents
    - Test `OTPCode.countDocuments()` and `OTPCode.deleteMany()`
    - Test `model.markModified('customer_info')` + `save()` persists Mixed field changes on Order
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [ ]* 12.2 Write property test for valid ObjectId strings (P9)
    - Create `cloth_backend/__tests__/properties/objectid.property.test.js`
    - **Property 9: Valid ObjectId strings do not cause CastError** — generate 24-char hex strings with `fc.hexaString({ minLength: 24, maxLength: 24 })`; call `User.findById(id)` and `Order.findOne({ user_id: id })` on each; assert resolves without throwing CastError
    - **Validates: Requirements 12.7**
    - _Requirements: 12.7_

  - [ ]* 12.3 Write property test for Order _id and id in serialised response (P10)
    - Create `cloth_backend/__tests__/properties/orderid.property.test.js`
    - **Property 10: Order creation response contains both _id and id** — generate arbitrary valid Order data with `fc.record(...)`; save to in-memory MongoDB; call `JSON.stringify(doc.toObject())` or `doc.toJSON()`; assert parsed result contains both `_id` (non-empty string) and `id` (non-empty string) representing the same ObjectId value
    - **Validates: Requirements 13.2, 13.7**
    - _Requirements: 13.2, 13.7_

  - [ ] 12.4 Create cloth_backend/__tests__/models/upload.test.js integration tests
    - Test Buffer storage and retrieval (raw integration complement to P7 property test)
    - Test serving from `storage_path` vs from `data` field to ensure upload controller compatibility
    - Test `Upload.insertMany(items)` persists all items
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [x] 13. Final checkpoint — Ensure full test suite passes
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Property tests run a minimum of 100 iterations each via fast-check
- All integration tests use `mongodb-memory-server` — no external connection required for tests
- Each model uses `mongoose.models.ModelName || mongoose.model(...)` to prevent OverwriteModelError
- All schemas use `{ timestamps: false }` — timestamp fields are managed manually to preserve field-name compatibility with existing controllers
- Collection names are explicitly set on every schema to match Firebase collection names
- Tasks 4 and 5 can be worked in parallel per model file once Task 3 is complete

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "4.1", "4.2", "4.3", "4.4"] },
    { "id": 3, "tasks": ["4.5", "4.6", "5.1", "5.3", "5.4", "5.5", "5.6"] },
    { "id": 4, "tasks": ["5.2", "6.1", "6.2", "6.3"] },
    { "id": 5, "tasks": ["8.1", "8.3"] },
    { "id": 6, "tasks": ["8.2", "9.1"] },
    { "id": 7, "tasks": ["10.1"] },
    { "id": 8, "tasks": ["12.1", "12.4"] },
    { "id": 9, "tasks": ["12.2", "12.3"] }
  ]
}
```
