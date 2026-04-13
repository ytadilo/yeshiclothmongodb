# Firebase Backend Connection Checklist

Use this checklist to fully connect backend + frontend to Firebase.

## What you should give me

1. Backend deploy target URL (one of):
   - Cloud Run URL (recommended): https://<service>-<hash>-<region>.run.app
   - Firebase Functions URL: https://<region>-<project-id>.cloudfunctions.net/<function-name>
2. Confirmation of where backend is hosted now (if already deployed).
3. Firebase service-account values configured in backend environment:
   - FIREBASE_PROJECT_ID
   - FIREBASE_CLIENT_EMAIL
   - FIREBASE_PRIVATE_KEY
4. Allowed frontend origin configured in backend CORS:
   - https://www.yeshiclothe.com.et

## What you should do now

1. In backend env, set:
   - DB_PROVIDER=firebase
   - FIREBASE_PROJECT_ID=clotheyeshi
   - FIREBASE_CLIENT_EMAIL=<from service account>
   - FIREBASE_PRIVATE_KEY=<from service account private key>
   - PUBLIC_BASE_URL=https://www.yeshiclothe.com.et
   - CORS_ORIGINS=https://www.yeshiclothe.com.et
   - JWT_SECRET=<strong-random-secret>
2. Deploy backend.
3. Update frontend proxy target:
   - cloth_frontend/vercel.json -> replace REPLACE_WITH_BACKEND_URL
   - cloth_frontend/frontend/_redirects -> replace REPLACE_WITH_BACKEND_URL (for Netlify fallback)
4. Redeploy frontend on Vercel.

## Important note about Firebase config snippet

The web config values (apiKey/authDomain/databaseURL/etc.) are for browser SDK use.
Backend server-to-server access requires Firebase Admin credentials (service account).

## Realtime Database vs Firestore

Current backend migration code uses Firestore via Firebase Admin.
If you want strict Realtime Database only, we must rewrite wrappers from Firestore API to RTDB API.
