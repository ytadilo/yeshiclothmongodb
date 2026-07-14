# Admin/Frontend Separation Bugfix Design

## Overview

The admin panel is incorrectly co-located inside the customer frontend at
`cloth_frontend/frontend/admin/`. A standalone `cloth_admin` React + Vite +
Firebase Auth application already exists and is nearly complete; however it
cannot boot because four page files it imports via `React.lazy` are missing
(`Inventory`, `Notifications`, `Settings`, `Profile`) and the app tree lacks
the required `<AuthProvider>` wrapper. Deployment is also blocked because
`cloth_admin` ships no `vercel.json` or `.env.example`.

The fix has two sides:

1. **Complete `cloth_admin`** — add the four missing pages, ensure
   `main.jsx` already wraps with `<AuthProvider>` (it does as of the latest
   commit), and add the two missing deployment artefacts.
2. **Clean `cloth_frontend`** — delete the `admin/` folder, `admin-login.html`,
   `js/admin-common.js`, `js/admin-guard.js`, `css/admin-dashboard.css`, and
   remove the `/admin/:path*` rewrite + `/admin` redirect entries from
   `cloth_frontend/frontend/vercel.json`.

No backend changes are required. Both apps will continue to call
`https://myclothe.app.aletcloud.com` as the single backend.

---

## Glossary

- **Bug_Condition (C)**: The condition that triggers the defect — admin code
  is served from the customer-frontend deployment or `cloth_admin` crashes on
  boot.
- **Property (P)**: The desired correct state — admin pages are served
  exclusively from the standalone `cloth_admin` deployment, and `cloth_admin`
  boots and authenticates correctly.
- **Preservation**: Customer-facing features (`cloth_frontend`) and working
  admin pages (Dashboard, Orders, Products, Categories, Customers, Payments,
  Analytics) must continue to function exactly as before.
- **`AuthProvider`**: React context provider exported from
  `cloth_admin/src/hooks/useAuth.jsx`. Supplies `{ user, loading, error,
  loginWithGoogle, logout }` to every component in the tree via `useAuth()`.
- **`ProtectedRoute`**: Component in `cloth_admin/src/components/ProtectedRoute.jsx`
  that calls `useAuth()`. Crashes with a null-context error when rendered
  outside an `<AuthProvider>`.
- **`isBugCondition(input)`**: Pseudocode predicate — returns `true` for any
  input that exercises the defective state.
- **`cloth_admin/src/main.jsx`**: Entry point for the admin SPA. Already wraps
  `<App>` with `<AuthProvider>` in the current source (confirmed by code
  inspection); this remains correct post-fix.
- **Lazy import**: `React.lazy(() => import('./pages/PageName'))` — throws a
  runtime error if the target file does not exist, preventing the entire app
  from loading.

---

## Bug Details

### Bug Condition

The defect manifests in **two distinct sub-conditions** that together prevent
the correct architecture from working:

**Sub-condition A — Missing pages crash `cloth_admin`**

`cloth_admin/src/App.jsx` lazily imports `Inventory`, `Notifications`,
`Settings`, and `Profile`. None of those files exist in
`cloth_admin/src/pages/`. Any navigation to those routes — or a stale
Webpack/Vite chunk — causes an unhandled promise rejection that surfaces as a
white-screen React error boundary failure.

**Sub-condition B — Admin code present in `cloth_frontend`**

`cloth_frontend/frontend/` contains:
- `admin/` — 11 HTML files (`dashboard.html`, `orders.html`, `users.html`,
  `chat.html`, `posts.html`, `order-stats.html`, `login.html`,
  `forgot-password.html`, `reset-password.html`, `verify-otp.html`,
  `links.html`)
- `admin-login.html` at the root
- `js/admin-common.js` and `js/admin-guard.js`
- `css/admin-dashboard.css`

`cloth_frontend/frontend/vercel.json` contains:
- A redirect: `{ "source": "/admin", "destination": "/admin/orders" }`
- A redirect: `{ "source": "/admin/", "destination": "/admin/orders" }`
- A rewrite: `{ "source": "/admin/:path*", "destination":
  "https://myclothe.app.aletcloud.com/admin/:path*" }`

These entries mean that visiting `/admin/*` on the customer site proxies admin
traffic through the customer deployment — a security and maintenance hazard.

**Formal Specification:**

```
FUNCTION isBugCondition(input)
  INPUT: input — one of:
           { type: "page_navigation", target: RoutePath }    // cloth_admin route visit
         | { type: "file_exists",     path: FilePath }       // file system check
         | { type: "config_entry",    source: URLPattern }   // vercel.json rule
  OUTPUT: boolean

  CASE input.type = "page_navigation":
    RETURN input.target IN ["/inventory", "/notifications", "/settings", "/profile"]
           AND NOT fileExists("cloth_admin/src/pages/" + titleCase(input.target) + ".jsx")

  CASE input.type = "file_exists":
    RETURN input.path IN [
      "cloth_frontend/frontend/admin/",
      "cloth_frontend/frontend/admin-login.html",
      "cloth_frontend/frontend/js/admin-common.js",
      "cloth_frontend/frontend/js/admin-guard.js",
      "cloth_frontend/frontend/css/admin-dashboard.css"
    ]

  CASE input.type = "config_entry":
    RETURN input.source IN ["/admin", "/admin/", "/admin/:path*"]
           AND input.config_file = "cloth_frontend/frontend/vercel.json"

  DEFAULT: RETURN false
END FUNCTION
```

### Examples

- **Missing page crash**: Admin navigates to `/inventory` in `cloth_admin` →
  `React.lazy` rejects with `Cannot find module './pages/Inventory'` → React
  error boundary shows blank screen. Expected: Inventory page renders.
- **Admin HTML on customer domain**: Customer visits
  `https://www.yeshiclothe.com.et/admin/orders` → receives the legacy HTML
  admin dashboard served from `cloth_frontend`. Expected: request 404s or
  redirects to the standalone admin domain.
- **Admin proxy rewrite**: `cloth_frontend` Vercel project receives
  `GET /admin/api/...` → rewrites to `cloth_backend/admin/api/...` bypassing
  Firebase Auth checks. Expected: this rewrite does not exist.
- **`cloth_admin` boot with no `<AuthProvider>`**: (Historical state — already
  fixed in source.) `ProtectedRoute` calls `useAuth()` → returns `null` →
  destructuring `null.user` throws a TypeError. Expected: `useAuth()` returns
  the auth context object.

---

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**

- All customer-facing pages in `cloth_frontend` (Home, Product catalog, Cart,
  Checkout, Auth, Profile, Orders, Wishlist, Payment) MUST continue to work
  without modification.
- All existing admin pages in `cloth_admin` that currently load — Dashboard,
  Orders, OrderDetail, Products, ProductForm, Categories, Customers,
  CustomerDetail, Payments, Analytics — MUST continue to load data from the
  same `cloth_backend` API endpoints and render correctly.
- Google Sign-In with `hailetadilo@gmail.com` MUST continue to grant admin
  access; any other Google account MUST continue to be denied and signed out.
- The Firebase ID token MUST continue to be attached as `Authorization: Bearer
  <token>` and `x-firebase-token` headers on every `cloth_admin` API request,
  via the existing Axios interceptor in `cloth_admin/src/api/axios.js`.
- `ProtectedRoute` MUST continue to redirect unauthenticated visits to
  `/login`.
- `cloth_frontend` Vercel deployment MUST continue to serve all customer URL
  patterns correctly — `/auth/login`, `/my-orders`, `/cart`, `/profile`,
  `/payment-checkout`, etc.
- `cloth_backend` MUST require no changes whatsoever.

**Scope of Non-Impact:**

All inputs that do NOT involve the four missing pages or the admin entries in
`cloth_frontend` are completely unaffected. This includes:

- Any customer-facing HTTP request to `yeshiclothe.com.et`
- Any admin API call routed through `cloth_admin` → `cloth_backend`
- The Firebase Firestore real-time notifications listener in `useNotifications.js`
- Dark/light theme toggle and `localStorage` theme persistence in `TopBar.jsx`

---

## Hypothesized Root Cause

Based on code inspection, the causes are confirmed (not hypothetical):

1. **Missing page files**: `cloth_admin/src/App.jsx` (lines 16–19) declares
   four lazy imports — `Inventory`, `Notifications`, `Settings`, `Profile` —
   but the corresponding `.jsx` files were never created in
   `cloth_admin/src/pages/`. The Sidebar already has nav items for all four
   routes, indicating intent to implement them that was never completed.

2. **Admin code never removed from `cloth_frontend`**: The `cloth_frontend`
   was the original monolith. When `cloth_admin` was created as a separate
   project, the admin HTML/JS/CSS was not cleaned up from `cloth_frontend`,
   leaving dual admin surfaces.

3. **`vercel.json` not updated**: The `/admin/:path*` rewrite in
   `cloth_frontend/frontend/vercel.json` was added when admin was served
   through the frontend Vercel project. It was never removed when the
   architecture shifted to a standalone admin app.

4. **No deployment configuration for `cloth_admin`**: `cloth_admin` has no
   `vercel.json`, so deploying it to Vercel would result in direct-file serving
   (no SPA fallback to `index.html`), breaking all client-side routes other
   than `/`. It also has no `.env.example`, making onboarding and CI
   configuration difficult.

5. **`main.jsx` `<AuthProvider>` wrap** (already fixed in source): The
   requirements document listed this as a defect (requirement 1.7), but the
   current `cloth_admin/src/main.jsx` already wraps with `<AuthProvider>`.
   The fix implementation must preserve this and not regress it.

---

## Correctness Properties

Property 1: Bug Condition — Missing Pages Resolve and Admin-Free Frontend

_For any_ navigation input where the bug condition holds (`isBugCondition`
returns `true`) — either a route visit to `/inventory`, `/notifications`,
`/settings`, or `/profile` in `cloth_admin`, or the existence of admin files
in `cloth_frontend`, or the presence of admin rewrite/redirect entries in
`cloth_frontend/frontend/vercel.json` — the fixed system SHALL:

- Render the corresponding page component without error for navigation inputs,
- Have deleted the admin file for file-existence inputs, and
- Have removed the config entry for config-entry inputs.

**Validates: Requirements 1.5, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation — Existing Admin Pages and Customer Frontend Unaffected

_For any_ navigation input where the bug condition does NOT hold
(`isBugCondition` returns `false`) — routes that already work in `cloth_admin`
(`/`, `/orders`, `/products`, `/categories`, `/customers`, `/payments`,
`/analytics`), all customer-frontend URLs, and all API requests — the fixed
system SHALL produce the same result as the pre-fix system: the same page
renders, the same API responses are returned, and the same authentication
behaviour is observed.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8**

---

## Fix Implementation

### Changes Required

#### 1. Create Missing Pages in `cloth_admin/src/pages/`

**File: `cloth_admin/src/pages/Inventory.jsx`** (new file)

A functional admin page that lists products with stock-level awareness.
It calls `GET /api/products` via the existing `api` axios instance. The page
renders a table with columns: Product Name, Category, Price (ETB), Stock
Status. Each row has an "Edit" button linking to `/products/:id/edit`. Follows
the same component pattern as `Analytics.jsx` — functional component, `useEffect`
to fetch, `loading` spinner via `<div className="spinner" />`, `data-table`
class for the table, `page-header` for the heading block, `glass-card` for
container cards.

**File: `cloth_admin/src/pages/Notifications.jsx`** (new file)

A full-page notifications list that consumes the `useNotifications` hook.
Receives `adminMongoId` via the AdminLayout context or derives it from the
Firebase user's `uid` (passed as a prop from `AdminLayout`). Displays all
notifications in a scrollable list. Each item shows title, body, timestamp,
read/unread state. Provides "Mark all as read" button. Follows same page
pattern (`page-header`, `section-card`, `data-table`).

**File: `cloth_admin/src/pages/Settings.jsx`** (new file)

Allows the admin to update site settings. Calls:
- `GET /api/settings/social` to load social links (TikTok, Telegram,
  Instagram, WhatsApp, Phone)
- `PUT /api/settings/social` to save social links
- `GET /api/settings/content` to load site content strings (siteTitle,
  footerBrand, etc.)
- `PUT /api/settings/content` to save content

Renders two form sections (Social Links, Site Content) in `glass-card`
containers with `btn btn-primary` save buttons. Uses the existing `api`
axios instance so the Firebase token is automatically attached.

**File: `cloth_admin/src/pages/Profile.jsx`** (new file)

Displays the currently authenticated admin's profile from Firebase Auth:
`user.displayName`, `user.email`, `user.photoURL`. Shows a read-only card
(admin accounts are managed via Firebase, not the backend). Provides a
"Logout" button that calls `logout()` from `useAuth()`. Follows the standard
`glass-card` / `page-header` pattern.

#### 2. Add Deployment Artefacts to `cloth_admin`

**File: `cloth_admin/vercel.json`** (new file)

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

This makes Vercel serve `index.html` for every path, enabling React Router's
client-side routing to work correctly on hard refresh and direct URL access.

**File: `cloth_admin/.env.example`** (new file)

```
# Firebase project config (copy from Firebase Console → Project Settings)
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Backend API base URL
VITE_API_URL=https://myclothe.app.aletcloud.com
```

#### 3. Remove Admin Code from `cloth_frontend`

**Delete the following files/folders:**

| Path | Action |
|------|--------|
| `cloth_frontend/frontend/admin/` (entire folder) | Delete |
| `cloth_frontend/frontend/admin-login.html` | Delete |
| `cloth_frontend/frontend/js/admin-common.js` | Delete |
| `cloth_frontend/frontend/js/admin-guard.js` | Delete |
| `cloth_frontend/frontend/css/admin-dashboard.css` | Delete |

#### 4. Update `cloth_frontend/frontend/vercel.json`

Remove the following three entries from `cloth_frontend/frontend/vercel.json`:

From the `"redirects"` array — remove both objects whose `"source"` is
`"/admin"` or `"/admin/"`:
```json
{ "source": "/admin",  "destination": "/admin/orders", "permanent": false },
{ "source": "/admin/", "destination": "/admin/orders", "permanent": false }
```

From the `"rewrites"` array — remove the object whose `"source"` is
`"/admin/:path*"`:
```json
{ "source": "/admin/:path*", "destination": "https://myclothe.app.aletcloud.com/admin/:path*" }
```

All other redirects and rewrites in `vercel.json` are preserved unchanged.

#### 5. Verify `cloth_admin/src/main.jsx` (no change needed)

Confirmed: `main.jsx` already wraps `<App>` with `<BrowserRouter>` and
`<AuthProvider>`. No modification required. The implementation tasks must
not regress this.

---

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface
counterexamples that demonstrate the bug on unfixed code (exploratory), then
verify the fix works correctly and that existing behaviour is preserved
(fix checking + preservation checking).

### Exploratory Bug Condition Checking

**Goal**: Confirm the root causes by observing actual failure modes on the
unfixed codebase before writing the fix.

**Test Plan**: Attempt to navigate to each missing page in the running
`cloth_admin` dev server and observe the error. Confirm the presence of admin
artefacts in `cloth_frontend` by file-system checks. Inspect
`cloth_frontend/frontend/vercel.json` for the three admin entries.

**Test Cases**:

1. **Missing Inventory page** — Navigate `cloth_admin` dev server to
   `/inventory`. Expect: React error boundary or browser console shows
   `Error: Cannot find module './pages/Inventory'`. (Fails on unfixed code.)
2. **Missing Notifications page** — Navigate to `/notifications`. Same error.
   (Fails on unfixed code.)
3. **Missing Settings page** — Navigate to `/settings`. Same error.
   (Fails on unfixed code.)
4. **Missing Profile page** — Navigate to `/profile`. Same error.
   (Fails on unfixed code.)
5. **Admin folder present in `cloth_frontend`** — Assert
   `cloth_frontend/frontend/admin/dashboard.html` exists. (Passes, confirming
   defect.)
6. **Admin JS present** — Assert `cloth_frontend/frontend/js/admin-guard.js`
   exists.
7. **Admin rewrite present** — Assert `cloth_frontend/frontend/vercel.json`
   contains the `"/admin/:path*"` rewrite source.

**Expected Counterexamples**:

- React lazy-import failures for the four missing page modules.
- File system confirms presence of 13+ admin artefacts in `cloth_frontend`.
- JSON parse of `vercel.json` confirms three admin routing entries.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed
system produces the expected correct behaviour.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedSystem(input)
  ASSERT expectedBehavior(result)
END FOR
```

**Test Cases:**

1. Navigate `cloth_admin` dev server to `/inventory` → assert the `<h1>`
   heading text is "Inventory" and no error boundary is shown.
2. Navigate to `/notifications` → assert the notifications page heading is
   visible.
3. Navigate to `/settings` → assert the settings form renders social-link
   fields.
4. Navigate to `/profile` → assert admin email is displayed.
5. `cloth_admin/vercel.json` exists and contains the SPA catch-all rewrite.
6. `cloth_admin/.env.example` exists and contains all six `VITE_FIREBASE_*`
   keys and `VITE_API_URL`.
7. `cloth_frontend/frontend/admin/` directory does not exist.
8. `cloth_frontend/frontend/admin-login.html` does not exist.
9. `cloth_frontend/frontend/js/admin-guard.js` does not exist.
10. `cloth_frontend/frontend/js/admin-common.js` does not exist.
11. `cloth_frontend/frontend/css/admin-dashboard.css` does not exist.
12. `cloth_frontend/frontend/vercel.json` does not contain `"/admin/:path*"`
    in its rewrites array.
13. `cloth_frontend/frontend/vercel.json` does not contain `"/admin"` or
    `"/admin/"` in its redirects array.

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold,
the fixed system produces the same result as the pre-fix system.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalSystem(input) = fixedSystem(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation
checking of the admin pages because it can generate varied API response shapes
and verify the pages render without crashing across many data configurations.

**Test Cases:**

1. **Dashboard preservation** — Load the Dashboard page in `cloth_admin` after
   the fix; assert it fetches `/api/orders` and renders the stats grid and
   recent-orders table without error.
2. **Orders list preservation** — Navigate to `/orders`; assert the orders
   table renders.
3. **Products list preservation** — Navigate to `/products`; assert the
   products table renders.
4. **Login flow preservation** — With no authenticated user, navigate to `/`;
   assert redirect to `/login`. On the login page, assert the Google Sign-In
   button is present.
5. **Auth whitelist preservation** — Sign in with a non-whitelisted Google
   account; assert the "Access Denied" error message is shown and the user
   is redirected back to `/login`.
6. **Firebase token header preservation** — Intercept a `cloth_admin` API
   request; assert `Authorization: Bearer <token>` and `x-firebase-token`
   headers are present.
7. **`cloth_frontend` customer pages preservation** — Verify
   `cloth_frontend/frontend/vercel.json` still contains the `/api/:path*`
   rewrite, the `/auth/login` rewrite, and the `/my-orders` rewrite (unchanged
   customer rewrites).
8. **PBT: existing admin pages render with arbitrary order data** — Generate
   random order arrays with varied field presence (`created_at` vs
   `createdAt`, `payment_status` vs `paymentStatus`, etc.) and verify
   Dashboard, Orders, Analytics pages do not throw.

### Unit Tests

- Test each new page (`Inventory`, `Notifications`, `Settings`, `Profile`)
  renders without crashing when the API returns an empty array or a minimal
  valid response.
- Test `ProtectedRoute` redirects to `/login` when `useAuth()` returns
  `{ user: null, loading: false }`.
- Test `ProtectedRoute` renders `children` when `useAuth()` returns
  `{ user: { email: 'hailetadilo@gmail.com' }, loading: false }`.
- Test that `vercel.json` in `cloth_admin` is valid JSON with a `rewrites`
  array containing the catch-all rule.
- Test that `.env.example` in `cloth_admin` lists all required environment
  variable keys.

### Property-Based Tests

- Generate random arrays of order objects with arbitrarily missing or
  extra fields and verify the Dashboard and Analytics pages render without
  throwing (tests the defensive field-access patterns in those pages).
- Generate random Firestore notification snapshots and verify
  `useNotifications` hook returns a correctly shaped `{ notifications,
  unreadCount }` object.
- Generate random settings objects with arbitrary extra keys and verify the
  Settings page form populates without crashing.

### Integration Tests

- Full admin login flow: open `cloth_admin`, land on `/login`, click Google
  Sign-In (mocked), verify navigation to `/` (Dashboard).
- Navigate sidebar items sequentially (Dashboard → Orders → Products →
  Categories → Customers → Payments → Analytics → Inventory → Notifications
  → Settings → Profile) and assert each page mounts without a React error
  boundary being triggered.
- Verify that a `GET /admin/orders` request to the `cloth_frontend` Vercel
  deployment (post-fix) returns a 404 or a customer-page response, not the
  legacy admin HTML dashboard.
