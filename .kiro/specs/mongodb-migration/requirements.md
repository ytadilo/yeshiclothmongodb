# Requirements Document

## Introduction

This document specifies the requirements for migrating the Yeshi Clothe e-commerce backend from Firebase Firestore to MongoDB Atlas. The backend is a Node.js/Express application that currently uses Firebase Firestore as its sole database, accessed through a custom compatibility layer (`firebaseAuthModels.js`) that mimics Mongoose-style APIs. The migration replaces this layer with real Mongoose schemas and MongoDB Atlas as the hosted database, while keeping all existing API endpoints, business logic, and the frontend UI unchanged.

### Project Summary

- **Frontend**: Static HTML/CSS/JS served from `cloth_frontend/frontend` (no framework — Vanilla JS). The admin panel is a separate static app in `cloth_admin/`.
- **Backend**: Node.js + Express 5 (`cloth_backend/`). Single API server on port 5000.
- **Current Database**: Firebase Firestore (Google), accessed via the `firebase-admin` SDK and a custom model layer in `utils/firebaseAuthModels.js`.
- **Target Database**: MongoDB Atlas (cloud-hosted MongoDB), accessed via Mongoose.
- **Authentication**: Dual-path — JWT cookies (`yeshi_token`) for local/Google login, plus Firebase ID tokens for browser-side Firebase Auth sessions. Both paths resolve to a local User document. JWT signing uses `JWT_SECRET`.
- **Payment**: Chapa payment gateway (Ethiopian), integrated via `chapaService.js`.
- **File Uploads**: Stored as binary `data` blobs in the database (`uploads` collection) plus optional `storage_path` on disk.
- **API Structure**: `/api/auth`, `/api/orders`, `/api/posts`, `/api/products`, `/api/payments`, `/api/analytics`, `/api/workflow`, `/api/uploads`, `/api/settings`, `/api/admin/users`, `/api/admin/devices`, `/api/admin/uploads`, `/api/exchange`, `/api/backup`.

---

## Glossary

- **MongoDB_Atlas**: The cloud-hosted MongoDB service at `mongodb.com/atlas`.
- **Mongoose**: The Node.js ODM (Object Document Mapper) library for MongoDB.
- **Schema**: A Mongoose schema that defines the shape and validation rules for a MongoDB collection.
- **Model**: A Mongoose model compiled from a Schema, used to create and query documents.
- **FirebaseAuthModels**: The file `cloth_backend/utils/firebaseAuthModels.js` — the custom compatibility layer to be replaced.
- **DB_Provider**: The environment variable `DB_PROVIDER` that currently forces `"firebase"`. After migration it will always be `"mongo"`.
- **MONGODB_URI**: The MongoDB Atlas connection string stored in `.env`.
- **JWT_SECRET**: Secret used to sign and verify JWT tokens.
- **ensureAdminUser**: The startup utility that seeds the admin account on first run.
- **connectDB**: The `cloth_backend/utils/db.js` function that establishes the database connection on startup.
- **Upload_Collection**: The MongoDB collection that stores file binary data and metadata.
- **System**: The `cloth_backend` Node.js/Express server.
- **Validator**: The Mongoose schema validation layer.
- **Migration_Script**: A one-time Node.js script that can optionally export existing data from Firestore and import it into MongoDB.

---

## Requirements

### Requirement 1: Install Mongoose and Update Dependencies

**User Story:** As a developer, I want Mongoose installed and Firebase-only dependencies removed from production usage, so that the backend connects to MongoDB instead of Firestore.

#### Acceptance Criteria

1. THE System SHALL add `mongoose` as a production dependency in `cloth_backend/package.json`.
2. IF `DB_PROVIDER=mongo`, THEN THE System SHALL start without loading `firebase-admin` or `google-auth-library` as part of the database initialization module graph.
3. WHEN `npm install` is run in `cloth_backend/`, THE System SHALL complete with exit code 0 and no dependency resolution errors in standard error output.
4. THE System SHALL pin `mongoose` to version `^8.4.0` in `cloth_backend/package.json` to ensure reproducible installs.

---

### Requirement 2: Database Connection Module

**User Story:** As a developer, I want a `connectDB` function that connects to MongoDB Atlas, so that the server has a live database connection on startup.

#### Acceptance Criteria

1. THE `connectDB` function SHALL read the connection URI from `process.env.MONGODB_URI`.
2. IF `MONGODB_URI` is not set or is an empty string, THEN THE `connectDB` function SHALL throw an error and halt server startup without attempting a connection.
3. WHEN `MONGODB_URI` is set, THE `connectDB` function SHALL call `mongoose.connect()` with the URI.
4. WHEN the connection succeeds, THE `connectDB` function SHALL log `"MongoDB connected"` to the console.
5. WHEN the connection fails, THE `connectDB` function SHALL log the error message to the console.
6. WHEN the connection fails, THE `connectDB` function SHALL throw the error so that `startServer()` catches it and exits the process.
7. THE `getDatabaseProvider` export of `utils/db.js` SHALL return the string `"mongo"` when `DB_PROVIDER` is `"mongo"` or is not set, and SHALL return `"firebase"` when `DB_PROVIDER` is `"firebase"`.
8. THE `utils/db.js` file SHALL contain no Firebase Firestore imports.

---

### Requirement 3: Mongoose Schemas and Models

**User Story:** As a developer, I want Mongoose models that precisely match the data structures used by all controllers, so that existing controller code works without field-level changes.

#### Acceptance Criteria

1. THE Validator SHALL define a Mongoose Schema for each of the following collections: `users`, `otp_codes`, `user_devices`, `blocked_devices`, `analytics` (events), `analytics_user_summaries`, `audit_logs`, `chat_messages`, `uploads`, `orders`, `posts`, `products`, `notifications`, `site_settings`, `payments`.
2. WHEN a required field is missing during document creation, THE Validator SHALL return a Mongoose `ValidationError` with a descriptive message identifying the missing field.
3. THE `User` Schema SHALL include fields: `fullName`, `fatherName`, `email` (unique, lowercase, trimmed), `passwordHash`, `authProvider` (enum: `local`, `google`), `googleSub`, `firebaseUid`, `emailVerified` (Boolean), `pendingEmail`, `providerIds` (Array of String), `role` (enum: `admin`, `customer`, default `customer`), `status` (enum: `active`, `inactive`, `banned`, default `active`), `isBanned` (Boolean, default `false`), `phone`, `age`, `sex`, `profileImage`, `shipping_addresses` (Array of subdocument), `measurement_profiles` (Array of subdocument), `default_shipping_address_id`, `default_measurement_profile_id`, `resetPasswordTokenHash`, `resetPasswordExpiresAt`, `lastLoginAt`, `createdAt`, `updatedAt`.
4. THE `Order` Schema SHALL preserve all existing fields used by `orderController.js`, including: `user_id`, `productId`, `post_id`, `productName`, `customerName`, `phone`, `customer_info` (nested), `cloth_details` (nested), `payment_info` (nested), `device_location` (nested), `quantity`, `productPrice`, `shippingPrice`, `totalPrice`, `proposed_price_etb`, `paymentStatus`, `orderStatus`, `created_at`, `createdAt`, `updated_at`, `updatedAt`.
5. THE `Post` Schema SHALL preserve all existing fields used by `postController.js`, including: `title`, `description`, `category`, `categories` (Array), `measurement_profiles` (Array), `images` (Array), `videoUrl`, `videoUrls` (Array), `priceETB`, `oldPriceETB`, `shippingPriceETB`, `freeShipping`, `delivery_scope`, `delivery_countries` (Array), `stock_quantity`, `unlimited_stock`, `viewCount`, `shareCount`, `bagCount`, `orderCountVisible`, `likes` (Array), `comments` (Array of subdocument), `created_by`, `created_at`, `createdAt`, `updated_at`, `updatedAt`.
6. THE `Payment` Schema SHALL include: `user_id`, `order_id`, `tx_ref` (unique), `chapa_transaction_id`, `amount`, `currency`, `customer_name`, `customer_email`, `customer_phone`, `payment_method`, `payment_status`, `verified`, `created_at`, `updated_at`.
7. THE `Upload` Schema SHALL include: `originalName`, `mimeType`, `size`, `data` (Buffer), `storage_path`, `visibility`, `owner_user_id`, `purpose`, `order_id`, `post_id`, `created_at`.
8. THE `Notification` Schema SHALL include: `user_id`, `type`, `title`, `body`, `reference_id`, `destination` (nested), `is_read`, `timestamp`.
9. THE `SiteSettings` Schema SHALL include: `key` (unique, default `"default"`), `social` (nested), `content` (nested), `delivery` (nested), `updatedAt`.
10. EACH Schema SHALL explicitly declare the MongoDB collection name to match the Firebase collection name used for that model (e.g., `{ collection: 'users' }`, `{ collection: 'otp_codes' }`, `{ collection: 'user_devices' }`, etc.) so that queries target the correct collection.
11. ALL Schemas SHALL use `{ timestamps: false }` where timestamps are managed manually, OR `{ timestamps: true }` aliased to the correct field names to match the existing `createdAt`/`updatedAt` field names used by controllers.

---

### Requirement 4: Replace the Firebase Compatibility Layer

**User Story:** As a developer, I want all model files to export Mongoose models instead of Firebase classes, so that controllers continue to work with the same import paths.

#### Acceptance Criteria

1. THE `models/User.js` file SHALL export a Mongoose model compiled from the User Schema, and SHALL NOT import from `utils/firebaseAuthModels.js` or any Firebase library.
2. THE `models/Order.js` file SHALL export a Mongoose model compiled from the Order Schema, and SHALL NOT import from `utils/firebaseAuthModels.js` or any Firebase library.
3. THE `models/Post.js` file SHALL export a Mongoose model compiled from the Post Schema, and SHALL NOT import from `utils/firebaseAuthModels.js` or any Firebase library.
4. THE `models/Payment.js` file SHALL export a Mongoose model compiled from the Payment Schema, and SHALL NOT import from `utils/firebaseAuthModels.js` or any Firebase library.
5. THE `models/Upload.js` file SHALL export a Mongoose model compiled from the Upload Schema, and SHALL NOT import from `utils/firebaseAuthModels.js` or any Firebase library.
6. THE `models/Notification.js` file SHALL export a Mongoose model compiled from the Notification Schema, and SHALL NOT import from `utils/firebaseAuthModels.js` or any Firebase library.
7. THE `models/SiteSettings.js` file SHALL export a Mongoose model compiled from the SiteSettings Schema, and SHALL NOT import from `utils/firebaseAuthModels.js` or any Firebase library.
8. THE `models/OTPCode.js` file SHALL export a Mongoose model compiled from the OTPCode Schema, and SHALL NOT import from `utils/firebaseAuthModels.js` or any Firebase library.
9. THE `models/UserDevice.js` file SHALL export a Mongoose model compiled from the UserDevice Schema, and SHALL NOT import from `utils/firebaseAuthModels.js` or any Firebase library.
10. THE `models/BlockedDevice.js` file SHALL export a Mongoose model compiled from the BlockedDevice Schema, and SHALL NOT import from `utils/firebaseAuthModels.js` or any Firebase library.
11. THE `models/Analytics.js` file SHALL export a Mongoose model compiled from the Analytics (event) Schema, and SHALL NOT import from `utils/firebaseAuthModels.js` or any Firebase library.
12. THE `models/AnalyticsUserSummary.js` file SHALL export a Mongoose model compiled from the AnalyticsUserSummary Schema, and SHALL NOT import from `utils/firebaseAuthModels.js` or any Firebase library.
13. THE `models/AuditLog.js` file SHALL export a Mongoose model compiled from the AuditLog Schema, and SHALL NOT import from `utils/firebaseAuthModels.js` or any Firebase library.
14. THE `models/ChatMessage.js` file SHALL export a Mongoose model compiled from the ChatMessage Schema, and SHALL NOT import from `utils/firebaseAuthModels.js` or any Firebase library.
15. THE `models/Product.js` file SHALL export a Mongoose model compiled from the Product Schema, and SHALL NOT import from `utils/firebaseAuthModels.js` or any Firebase library.
16. WHEN any model file is required multiple times (e.g., in tests or hot-reload), THE System SHALL NOT throw an `OverwriteModelError` — every model file SHALL guard against duplicate model registration.

---

### Requirement 5: Environment Variable Configuration

**User Story:** As a developer, I want a clear `.env.example` with all required MongoDB configuration values, so that setting up a local or production environment is straightforward.

#### Acceptance Criteria

1. THE `cloth_backend/.env.example` file SHALL include `MONGODB_URI` with a placeholder value `mongodb+srv://<user>:<password>@cluster.mongodb.net/<dbname>?retryWrites=true&w=majority`.
2. THE `cloth_backend/.env.example` file SHALL include `DB_PROVIDER=mongo`.
3. THE `cloth_backend/.env.example` file SHALL include the following keys with representative placeholder values: `JWT_SECRET`, `JWT_EXPIRE`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PORT`, `NODE_ENV`, `BASE_URL`, `FRONTEND_URL`, `CORS_ORIGINS`, `CHAPA_SECRET_KEY`, `CHAPA_PUBLIC_KEY`, `CHAPA_BASE_URL`, `CALLBACK_URL`, `RETURN_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `RATE_LIMIT_MAX`, `MAX_UPLOAD_SIZE`.
4. THE `cloth_backend/.env.example` file SHALL include the following Firebase Web SDK keys required for browser-side Firebase Auth: `FIREBASE_WEB_API_KEY`, `FIREBASE_WEB_AUTH_DOMAIN`, `FIREBASE_WEB_PROJECT_ID`, `FIREBASE_WEB_STORAGE_BUCKET`, `FIREBASE_WEB_MESSAGING_SENDER_ID`, `FIREBASE_WEB_APP_ID`, `FIREBASE_WEB_MEASUREMENT_ID`.
5. WHEN the server process starts and `JWT_SECRET` is absent or empty, THE System SHALL emit a warning message to the console output indicating that JWT_SECRET is not configured.

---

### Requirement 6: Backend Startup Sequence

**User Story:** As a developer, I want the server startup to connect to MongoDB before accepting requests, so that API calls never hit an uninitialized database.

#### Acceptance Criteria

1. WHEN the server starts, THE System SHALL call `connectDB()` before calling `app.listen()`.
2. WHEN `connectDB()` resolves successfully and `DB_PROVIDER` is `"mongo"`, THE System SHALL call `ensureAdminUser()` to seed the admin account.
3. WHEN `ensureAdminUser()` throws an error, THE System SHALL log the error but SHALL continue startup so that the server is not blocked by a non-fatal seeding failure.
4. IF `connectDB()` throws an error, THEN THE System SHALL log the error and call `process.exit(1)`.
5. WHILE the database connection is being established, THE System SHALL NOT expose the HTTP server on the configured port.
6. WHEN `DB_PROVIDER` is `"mongo"`, THE `getDatabaseProvider()` function SHALL return `"mongo"` and THE `server.js` startup logic SHALL skip any Firebase-specific initialization.

---

### Requirement 7: Firebase Authentication Compatibility

**User Story:** As a developer, I want the Firebase ID token verification path to continue working after migration, so that users who authenticate via Google/Firebase can still log in.

#### Acceptance Criteria

1. THE `authCore.js` middleware SHALL accept Firebase ID tokens presented via the `Authorization: Bearer <token>` header or the `x-firebase-token` header, and SHALL attempt Firebase token verification before falling back to legacy JWT verification.
2. WHEN a valid Firebase ID token is received, THE System SHALL verify it using the `firebase-admin` Auth SDK by calling `auth().verifyIdToken()`, without accessing Firestore.
3. WHEN a Firebase ID token is successfully verified, THE System SHALL query MongoDB for a matching user record by `firebaseUid` first, then by normalized email if no `firebaseUid` match is found, and SHALL attach the resolved user to the request context including the `firebaseUid` and decoded token.
4. IF a Firebase ID token is successfully verified but no matching user record exists in MongoDB for either the `firebaseUid` or the normalized email, THEN THE System SHALL reject the request with an authentication failure response indicating the user was not found.
5. IF `DB_PROVIDER=mongo`, THEN THE `firebase-admin` SDK SHALL be initialized with credentials scoped to Auth verification only, without initializing a Firestore connection.
6. WHEN the application starts and `DB_PROVIDER=mongo` and none of `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, or `FIREBASE_PRIVATE_KEY` are set, THE System SHALL emit a warning log indicating Firebase Auth is not configured and token-based Firebase login will be unavailable, and SHALL continue startup without halting.
7. WHEN a request is received at `GET /api/auth/firebase/config` and all required Firebase Web SDK configuration values (`apiKey`, `authDomain`, `projectId`, `appId`) are present, THE System SHALL respond with the Firebase Web SDK configuration object so that the browser-side Firebase Auth UI can initialize.
8. IF a request is received at `GET /api/auth/firebase/config` and one or more required Firebase Web SDK configuration values are absent, THEN THE System SHALL respond with a service unavailable error indicating which required fields are missing.

---

### Requirement 8: Controller Compatibility — No Breaking Changes

**User Story:** As a developer, I want all existing controllers to work without rewriting their query logic, so that the migration does not introduce regressions.

#### Acceptance Criteria

1. THE Mongoose models SHALL support the `findOne(query)`, `findById(id)`, `find(query)`, `create(data)`, `insertMany(data)`, `updateOne(filter, update)`, `updateMany(filter, update)`, `countDocuments(query)`, `deleteOne(filter)`, `deleteMany(filter)`, `distinct(field)`, and `aggregate(pipeline)` methods as used by existing controllers.
2. WHEN a controller calls `model.find(query).select(fields).sort(obj).lean()`, THE Mongoose model SHALL support this chained query syntax natively without throwing a TypeError.
3. WHEN a controller calls `model.findOneAndUpdate(filter, update, { upsert: true, new: true })`, THE Mongoose model SHALL return the updated (or newly created) document.
4. WHEN `Order.aggregate([...])` is called with a valid aggregation pipeline, THE System SHALL execute the pipeline against the `orders` collection and return the result array.
5. WHEN a controller saves a document using `instance.save()`, THE Mongoose model SHALL persist all field changes to MongoDB.
6. WHEN a controller calls `instance.markModified('field')`, THE Mongoose model SHALL mark that field as dirty so Mongoose saves it correctly for mixed-type fields.

---

### Requirement 9: Index and Query Performance

**User Story:** As a developer, I want database indexes on high-frequency query fields, so that API responses remain fast under normal load.

#### Acceptance Criteria

1. THE `User` Schema SHALL define a unique index on the `email` field such that attempting to insert a second document with the same email returns a duplicate key error.
2. THE `Order` Schema SHALL define a separate index on `user_id` and a separate index on `created_at`.
3. THE `Post` Schema SHALL define an index on `created_at` (descending) and a separate index on `stock_quantity`.
4. THE `Payment` Schema SHALL define a unique index on `tx_ref` such that inserting a second document with the same `tx_ref` returns a duplicate key error.
5. THE `Notification` Schema SHALL define a compound index on `{ user_id: 1, timestamp: -1 }`.
6. THE `OTPCode` Schema SHALL define an index on `userId` and a TTL index on `expiresAt` with an expiry window of 0 seconds (expire at the exact `expiresAt` datetime).
7. THE `Analytics` (events) Schema SHALL define separate indexes on `userId`, `deviceId`, and `timestamp`.
8. THE `Upload` Schema SHALL define a separate index on `owner_user_id` and a separate index on `purpose`.

---

### Requirement 10: ensureAdminUser Compatibility

**User Story:** As a developer, I want the admin seeding logic to work with MongoDB so that a fresh installation always has an admin account ready.

#### Acceptance Criteria

1. WHEN `ensureAdminUser()` is called and no user document with a matching `ADMIN_EMAIL` exists in MongoDB, THE System SHALL create a new admin user document in the `users` collection.
2. IF a user document with a matching `ADMIN_EMAIL` already exists, THEN THE System SHALL update that document's `fullName`, `passwordHash`, `role`, `authProvider`, `status`, and `isBanned` fields and persist the changes.
3. THE System SHALL hash `ADMIN_PASSWORD` using bcrypt with a salt of 10 rounds before storing it as `passwordHash`.
4. IF `ADMIN_EMAIL` or `ADMIN_PASSWORD` is absent or contains only whitespace, THEN THE System SHALL log a warning message and return without creating or modifying any user document.
5. WHEN a database error occurs during `ensureAdminUser()`, THE System SHALL propagate the error to the caller so that the startup sequence can handle it appropriately.

---

### Requirement 11: File Upload Compatibility

**User Story:** As a developer, I want the Upload model to store file binary data in MongoDB so that existing upload and retrieval endpoints continue to work.

#### Acceptance Criteria

1. THE `Upload` Schema SHALL declare the `data` field with Mongoose type `Buffer` so that binary file content is stored and retrieved without transformation.
2. WHEN an upload document is created with a `data` field containing a `Buffer` value, THE Upload model SHALL persist that buffer to MongoDB such that reading the document back returns a `Buffer` with identical byte content.
3. WHEN `GET /api/uploads/:id` is called with a valid upload ID, THE System SHALL retrieve the Upload document by `_id`, set the `Content-Type` response header to the stored `mimeType` value, and send the `data` buffer as the response body.
4. WHEN `GET /api/uploads/:id` is called and the retrieved Upload document has a non-empty `storage_path` field, THE System SHALL serve the file from the filesystem path stored in `storage_path` instead of from the `data` field.
5. WHEN `Upload.insertMany(items)` is called with an array of upload objects, THE System SHALL persist all items to the `uploads` collection in a single operation.

---

### Requirement 12: Data Relationships and Referential Integrity

**User Story:** As a developer, I want cross-collection references to use MongoDB ObjectIds, so that relationships between documents are consistent and queryable.

#### Acceptance Criteria

1. THE `Order` Schema's `user_id` field SHALL be declared as `mongoose.Schema.Types.ObjectId` with `ref: 'User'`.
2. THE `Order` Schema's `productId` and `post_id` fields SHALL be declared as `mongoose.Schema.Types.ObjectId` with `ref: 'Post'`.
3. THE `Payment` Schema's `user_id` field SHALL be declared as `mongoose.Schema.Types.ObjectId` with `ref: 'User'`.
4. THE `Payment` Schema's `order_id` field SHALL be declared as `mongoose.Schema.Types.ObjectId` with `ref: 'Order'`.
5. THE `Notification` Schema's `user_id` field SHALL be declared as `mongoose.Schema.Types.ObjectId` with `ref: 'User'`.
6. THE `Upload` Schema's `owner_user_id`, `order_id`, and `post_id` fields SHALL be declared as `mongoose.Schema.Types.ObjectId` with the appropriate `ref` values.
7. WHEN a controller calls `Model.findById(id)` or `Model.findOne({ field: id })` with a valid 24-character hex string, THE System SHALL resolve the query without throwing a CastError.

---

### Requirement 13: API Endpoint Integrity After Migration

**User Story:** As a developer, I want all API endpoints to return the same response shapes after migration, so that the frontend works without any changes.

#### Acceptance Criteria

1. WHEN `GET /api/posts` is called, THE System SHALL return a JSON array of post documents where each document contains at minimum the fields present in the pre-migration response.
2. WHEN `POST /api/orders` is called with valid order data, THE System SHALL create an order document in MongoDB and return a response containing both `_id` and `id` fields.
3. WHEN `POST /api/auth/login` is called with valid credentials, THE System SHALL return a response containing a JWT token and a user object with the same top-level fields as the pre-migration response.
4. WHEN `GET /api/settings` is called, THE System SHALL return a JSON object representing the site settings document with the same field names as the pre-migration response.
5. WHEN `GET /api/payments/:tx_ref` is called with a valid `tx_ref`, THE System SHALL return the matching payment document from MongoDB.
6. WHEN any previously functional API endpoint is called after migration, THE System SHALL NOT return an HTTP 500 response caused by a database driver error or model incompatibility.
7. WHEN any document is serialized to JSON in an API response, THE `_id` field SHALL be present as a string representation of the MongoDB ObjectId.

---

### Requirement 14: Local Development Environment Setup

**User Story:** As a developer, I want clear instructions and a correct `.env` file to run the project locally against MongoDB Atlas, so that development and testing are straightforward.

#### Acceptance Criteria

1. THE `cloth_backend/.env` file (not committed to git) SHALL contain a `MONGODB_URI` key whose value is a valid MongoDB Atlas connection string pointing to a real cluster.
2. THE `cloth_backend/.env` file SHALL contain `DB_PROVIDER=mongo`.
3. THE `cloth_backend/.env` file SHALL contain `JWT_SECRET` set to a non-empty string of at least 32 characters.
4. WHEN `node server.js` is run in `cloth_backend/` with a correctly populated `.env` file, THE System SHALL log both `"MongoDB connected"` and `"Server started on port 5000"` to the console before accepting any requests.
5. THE `cloth_backend/.gitignore` file SHALL include an entry for `.env` so that the secrets file is not committed to version control.

---

### Requirement 15: Code Cleanup

**User Story:** As a developer, I want the Firebase-specific compatibility code removed after migration, so that the codebase is clean and easier to maintain.

#### Acceptance Criteria

1. WHEN migration is complete, THE `utils/firebaseAuthModels.js` file SHALL be deleted from the repository.
2. WHEN migration is complete, THE `utils/firebase.js` file SHALL export only `getFirebaseAdmin` and `initializeFirebase`, and SHALL NOT export or call `getFirestore()`.
3. IF Firebase credentials (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) are absent at startup, THEN THE `utils/firebase.js` module SHALL skip `firebase-admin` initialization and log a warning rather than throwing.
4. THE `utils/db.js` file SHALL contain no imports of or calls to Firebase Firestore APIs.
5. ALL model files in `cloth_backend/models/` SHALL each export exactly one `mongoose.model()` call and SHALL contain no Firebase imports.
6. WHEN migration is complete, no file in `cloth_backend/models/` SHALL contain a `require` referencing `firebaseAuthModels`, `firebase-admin/firestore`, or `getFirestore`.
7. WHEN the server starts after migration is complete with all required environment variables set, THE System SHALL NOT throw a `MODULE_NOT_FOUND` error for any required module.
