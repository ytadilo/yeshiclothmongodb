# Render Environment Setup (clotheyeshi)

Use this file to configure the backend service on Render.

## Render Service Settings

- Service URL: https://myclothefullstackhaile.onrender.com/
- Branch: main
- Root Directory: cloth_backend
- Build Command: npm install
- Start Command: npm start

## Required Environment Variables

Set these in Render -> Environment.

### Firebase + App

- DB_PROVIDER=firebase
- FIREBASE_PROJECT_ID=clotheyeshi
- FIREBASE_CLIENT_EMAIL=firebase-adminsdk-fbsvc@clotheyeshi.iam.gserviceaccount.com
- FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
- FIREBASE_STORAGE_BUCKET=clotheyeshi.firebasestorage.app
- FIREBASE_AUTH_DOMAIN=clotheyeshi.firebaseapp.com
- FIREBASE_WEB_API_KEY=<firebase web api key>
- FIREBASE_WEB_APP_ID=<firebase web app id>
- FIREBASE_WEB_MESSAGING_SENDER_ID=<firebase sender id>
- FIREBASE_WEB_MEASUREMENT_ID=<optional analytics id>
- JWT_SECRET=0f9c3b8d7e2a41b6c5d9f1a8e7b3c2d4a6f9e1b7c8d2a3f5e6b1c9d4a7f2e8c1
- PUBLIC_BASE_URL=https://www.yeshiclothe.com.et
- CORS_ORIGINS=https://www.yeshiclothe.com.et
- NODE_ENV=production

## Notes

- FIREBASE_PRIVATE_KEY can be pasted as a single line with \n separators.
- The backend already converts \n to real line breaks.
- The frontend Firebase Auth flow now reads its public web config from the backend `/api/auth/firebase/config` endpoint, so the `FIREBASE_WEB_*` values must also be set.
- After saving variables, trigger a manual deploy.

## Security

- Rotate any secret shared in chat (Firebase private key, SMTP app password, JWT secret).
- Update Render variables immediately after rotation.
