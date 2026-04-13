# myclothefullstack

Firebase migration is in progress for backend and frontend integration.

## Active stack direction

- Backend API: `cloth_backend` (Node.js/Express + Firebase Admin)
- Frontend app: `cloth_frontend` (deployed on Vercel)
- Frontend URL: `https://myclothefullstack.vercel.app/`

## Firebase connection quick start

1. Set backend env `DB_PROVIDER=firebase`.
2. Add Firebase Admin service-account values:
	- `FIREBASE_PROJECT_ID`
	- `FIREBASE_CLIENT_EMAIL`
	- `FIREBASE_PRIVATE_KEY` (with `\n` newlines preserved)
3. Deploy backend API (Cloud Run or Firebase Functions).
4. Point frontend `/api/*` proxy to that deployed backend URL.

Detailed notes: `cloth_backend/FIREBASE_MIGRATION.md`.
