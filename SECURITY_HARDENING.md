# Security Hardening Steps

## Done In Code

- Backend auth middleware now resolves authenticated users from Firebase ID tokens when sent in `Authorization: Bearer ...`, with legacy app JWT fallback preserved for compatibility.
- Admin-only routes now enforce `adminOnly` at the router level.
- Firebase session endpoint now has a stricter rate limiter.
- Firestore deny-all rules were added for the current backend-only Firestore architecture.
- Admin page delivery now reuses the shared backend auth resolver.
- Frontend hosting configs now proxy `/admin` requests to Render instead of serving static admin HTML directly.
- Protected admin pages still perform an early backend role check on load as a UX layer.

## Your Tasks

1. Deploy Firestore rules.
   - Install Firebase CLI: `npm install -g firebase-tools`
   - Login: `firebase login`
   - From the repo root run: `firebase deploy --only firestore:rules`

2. Rotate secrets in Render.
   - Replace `JWT_SECRET`
   - Replace any Firebase private key if it was shared outside Render
   - Replace email provider secrets if they were shared

3. Verify Firebase public config is set in Render.
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL`
   - `FIREBASE_PRIVATE_KEY`
   - `FIREBASE_STORAGE_BUCKET`
   - `FIREBASE_AUTH_DOMAIN`
   - `FIREBASE_WEB_API_KEY`
   - `FIREBASE_WEB_APP_ID`
   - `FIREBASE_WEB_MESSAGING_SENDER_ID`

4. Redeploy backend on Render.
   - Trigger a new deploy after env updates.

5. Redeploy frontend hosting.
   - Trigger a new deploy on Vercel or Netlify so `/admin*` starts proxying to Render.
   - Confirm the frontend host is serving the updated routing config, not a cached build.

6. Test protected flows.
   - Open an admin page while logged out: Render should redirect to `/auth/login` before admin HTML is served.
   - Open an admin page as a non-admin user: Render should redirect to `/auth/login` before admin HTML is served.
   - Open an admin page as admin: it should load normally.
   - Place a user order and load user history.
   - Update order/payment status as admin.

7. Confirm deployment topology.
   - `https://www.yeshiclothe.com.et/admin` must be routed through the frontend host proxy to `https://myclothefullstackhaile.onrender.com/admin`.
   - The frontend host must no longer serve `/admin/orders.html`, `/admin/users.html`, or other admin HTML as direct public pages.

## Recommended Next Step

1. Add Cloudflare Turnstile or Firebase App Check once you have site keys.
2. Add bot protection such as Cloudflare Turnstile or Firebase App Check after the admin routing rollout is stable.