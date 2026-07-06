# Bugfix Requirements Document

## Introduction

The admin panel is incorrectly embedded inside the customer frontend at `cloth_frontend/frontend/admin`. This architecture causes admin code to be co-located with customer-facing code, creating a maintenance hazard, security risk, and deployment coupling. The fix requires fully separating the admin application into its own standalone React project (`cloth_admin`), eliminating all admin code from `cloth_frontend`, and ensuring both applications independently communicate with the shared `cloth_backend` API.

A standalone `cloth_admin` React application already exists with a modern architecture (React + Vite + Firebase Auth). The fix involves: completing the `cloth_admin` app with all missing pages and features, removing all admin code from `cloth_frontend`, updating the `cloth_frontend` `vercel.json` to remove admin routing, and adding deployment configuration to `cloth_admin`.

---

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user visits `/admin/*` on the customer frontend (`yeshiclothe.com.et`) THEN the system serves admin pages from `cloth_frontend/frontend/admin/` — mixing admin and customer code in the same deployed application.

1.2 WHEN the `cloth_frontend` is deployed to Vercel THEN the system includes admin HTML files (`dashboard.html`, `orders.html`, `users.html`, `chat.html`, `posts.html`, `order-stats.html`, etc.) and admin JS files (`admin-common.js`, `admin-guard.js`) in the customer frontend bundle.

1.3 WHEN `cloth_frontend/frontend/vercel.json` is processed THEN the system contains rewrites that proxy `/admin/:path*` to the backend (`myclothefullstackhaile.onrender.com/admin/:path*`), incorrectly routing admin traffic through the customer frontend deployment.

1.4 WHEN the `cloth_frontend/frontend/css/admin-dashboard.css` stylesheet exists THEN the system ships admin-specific CSS as part of the customer frontend assets.

1.5 WHEN `cloth_admin/src/App.jsx` references pages `Inventory`, `Notifications`, `Settings`, and `Profile` via lazy imports THEN the system throws import errors because those page files do not exist in `cloth_admin/src/pages/`.

1.6 WHEN an admin authenticates through the old `cloth_frontend/frontend/admin/login.html` THEN the system redirects to `/auth/login?next=/admin`, which is a customer auth flow — not an independent admin authentication flow.

1.7 WHEN `cloth_admin/src/main.jsx` renders the app THEN the system does not wrap it with `AuthProvider`, causing `useAuth()` to return null and crash `ProtectedRoute`.

1.8 WHEN `cloth_admin` is built for production THEN the system has no `vercel.json`, no `.env.example`, and no deployment configuration, making it impossible to deploy independently to Vercel.

---

### Expected Behavior (Correct)

2.1 WHEN a user visits any admin URL THEN the system SHALL serve those pages exclusively from the standalone `cloth_admin` React application deployed at a separate domain (e.g., `admin.yeshiclothe.com.et`), with no admin pages present on the customer frontend.

2.2 WHEN the `cloth_frontend` is deployed THEN the system SHALL NOT include any admin HTML files, admin JS files (`admin-common.js`, `admin-guard.js`), or admin CSS (`admin-dashboard.css`) in the deployment.

2.3 WHEN `cloth_frontend/frontend/vercel.json` is processed THEN the system SHALL NOT contain any `/admin` rewrites or redirects — admin routing SHALL be handled entirely within the `cloth_admin` Vercel project.

2.4 WHEN `cloth_admin/src/App.jsx` lazy-imports `Inventory`, `Notifications`, `Settings`, and `Profile` THEN the system SHALL resolve those imports because the corresponding page files SHALL exist in `cloth_admin/src/pages/`.

2.5 WHEN an admin navigates to the `cloth_admin` app THEN the system SHALL present a standalone Google Sign-In login page that enforces the whitelist (`hailetadilo@gmail.com` only), denying any other Google account and redirecting to the `cloth_admin` login page.

2.6 WHEN `cloth_admin/src/main.jsx` renders THEN the system SHALL wrap the app with `<AuthProvider>` so that `useAuth()` works correctly throughout the component tree.

2.7 WHEN `cloth_admin` is built for production THEN the system SHALL have a `vercel.json` that serves the React SPA correctly (rewrites all paths to `index.html`) and an `.env.example` documenting required environment variables (`VITE_FIREBASE_*`, `VITE_API_URL`).

2.8 WHEN both `cloth_frontend` and `cloth_admin` make API calls THEN the system SHALL direct all requests to the same `cloth_backend` at `https://myclothefullstackhaile.onrender.com`, with no duplication of backend logic.

---

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a customer uses `cloth_frontend` (Home, Product catalog, Cart, Checkout, Auth, Profile, Orders, Wishlist, Payment) THEN the system SHALL CONTINUE TO serve all customer pages and features without modification.

3.2 WHEN an authenticated admin uses `cloth_admin` pages that already work (Dashboard, Orders, Products, Categories, Customers, Payments, Analytics) THEN the system SHALL CONTINUE TO load data from the same `cloth_backend` API endpoints and render correctly.

3.3 WHEN `hailetadilo@gmail.com` signs in via Google on `cloth_admin` THEN the system SHALL CONTINUE TO grant admin access and navigate to the dashboard.

3.4 WHEN any Google account other than `hailetadilo@gmail.com` attempts to sign in on `cloth_admin` THEN the system SHALL CONTINUE TO deny access, sign the user out of Firebase, and display an "Access Denied" error.

3.5 WHEN `cloth_admin` sends API requests to `cloth_backend` THEN the system SHALL CONTINUE TO attach the Firebase ID token as both `Authorization: Bearer <token>` and `x-firebase-token` headers via the Axios interceptor.

3.6 WHEN `cloth_frontend` is deployed to Vercel at `https://www.yeshiclothe.com.et` THEN the system SHALL CONTINUE TO serve the customer site correctly, including all existing URL rewrites and redirects for customer pages (`/auth/login`, `/my-orders`, `/cart`, `/profile`, etc.).

3.7 WHEN `cloth_backend` receives requests from both `cloth_frontend` and `cloth_admin` THEN the system SHALL CONTINUE TO handle them using the same REST API without any backend changes.

3.8 WHEN `cloth_admin` is accessed without authentication THEN the system SHALL CONTINUE TO redirect to the admin `/login` page via `ProtectedRoute`.
