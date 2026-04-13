# Firebase Migration Guide (Backend)

This backend currently uses Mongoose models in controllers.
A full move to Firebase Firestore requires replacing model queries in controllers and services.

## What is already done

- Added Firebase Admin SDK dependency in `package.json`.
- Added Firebase bootstrap helper in `utils/firebase.js`.
- Updated `utils/db.js` to support provider switch:
  - `mongo` (default)
  - `firebase`
- Updated startup flow in `server.js` to skip Mongo-only admin bootstrap when Firebase mode is enabled.
- Added Firebase-backed auth model wrappers in `utils/firebaseAuthModels.js` and wired these models for Firebase mode:
  - `models/User.js`
  - `models/OTPCode.js`
  - `models/UserDevice.js`
  - `models/BlockedDevice.js`
  - `models/Upload.js`
- Updated `routes/uploads.js` to allow Firestore-style document ids in Firebase mode.

## Environment variables for Firebase mode

Set these on your backend host (Firebase Functions / Cloud Run / other):

- `DB_PROVIDER=firebase`
- `FIREBASE_PROJECT_ID=your-project-id`
- `FIREBASE_CLIENT_EMAIL=service-account-email`
- `FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"`

Optional:

- `FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com`

Alternative single-variable credentials:

- `FIREBASE_SERVICE_ACCOUNT={...full service account JSON...}`

## Current limitation

Most controllers still call Mongoose directly (`find`, `findById`, `aggregate`, `save`, etc.).
So enabling `DB_PROVIDER=firebase` now initializes Firebase successfully, but routes that still use Mongoose need migration before production use.

## Recommended migration order

1. Auth and users
2. Orders
3. Products and posts
4. Workflow/chat/notifications
5. Analytics and backup

For each module, replace:

- Mongoose model imports
- ObjectId validation logic
- Aggregation pipelines
- Populate/lean/select usage

with Firestore query patterns.

## Deployment note

If you deploy backend to Firebase Functions, keep frontend API base URL pointing to the deployed function URL and keep CORS origins updated.
