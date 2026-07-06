# Implementation Plan

## Overview

This plan follows the bugfix exploratory workflow (bug condition methodology):
1. **Explore** — Write tests BEFORE the fix to confirm the bug exists (Property 1: Bug Condition)
2. **Preserve** — Write property-based tests for non-buggy inputs on UNFIXED code (Property 2: Preservation)
3. **Implement** — Apply the fix (create 4 missing pages, add deployment artefacts, remove admin code from `cloth_frontend`)
4. **Validate** — Re-run both property sets to confirm the fix is correct and no regressions were introduced

## Tasks

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Missing Pages and Admin Artefacts in Frontend
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate all sub-conditions of the bug exist
  - **Scoped PBT Approach**: The bug condition is deterministic across a small finite set of file paths and route targets — enumerate every case to ensure complete coverage
  - **Sub-condition A — Missing page files (4 cases)**:
    - Assert `cloth_admin/src/pages/Inventory.jsx` does NOT exist → confirms lazy-import crash bug
    - Assert `cloth_admin/src/pages/Notifications.jsx` does NOT exist → confirms lazy-import crash bug
    - Assert `cloth_admin/src/pages/Settings.jsx` does NOT exist → confirms lazy-import crash bug
    - Assert `cloth_admin/src/pages/Profile.jsx` does NOT exist → confirms lazy-import crash bug
  - **Sub-condition B — Admin artefacts present in `cloth_frontend` (5 paths)**:
    - Assert `cloth_frontend/frontend/admin/` directory EXISTS → confirms dual admin surface
    - Assert `cloth_frontend/frontend/admin-login.html` EXISTS → confirms dual admin surface
    - Assert `cloth_frontend/frontend/js/admin-common.js` EXISTS → confirms dual admin surface
    - Assert `cloth_frontend/frontend/js/admin-guard.js` EXISTS → confirms dual admin surface
    - Assert `cloth_frontend/frontend/css/admin-dashboard.css` EXISTS → confirms dual admin surface
  - **Sub-condition C — Admin routing entries in `cloth_frontend/frontend/vercel.json` (3 entries)**:
    - Parse `vercel.json` and assert `redirects` array contains entry with `"source": "/admin"` → confirms admin redirect present
    - Assert `redirects` array contains entry with `"source": "/admin/"` → confirms admin redirect present
    - Assert `rewrites` array contains entry with `"source": "/admin/:path*"` → confirms admin proxy rewrite present
  - For all isBugCondition inputs above, `isBugCondition(input)` returns `true`
  - Run checks on UNFIXED code
  - **EXPECTED OUTCOME**: All file-existence and config-entry assertions CONFIRM the bug (missing pages absent, admin files present, admin routes present) — this is the correct failure that proves the bug exists
  - Document all counterexamples found (e.g., "Inventory.jsx not found", "admin/ folder found at cloth_frontend/frontend/admin/", "/admin/:path* rewrite found in vercel.json")
  - Mark task complete when checks are written, run, and all counterexamples are documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Admin Pages and Customer Frontend Unaffected
  - **IMPORTANT**: Follow observation-first methodology — observe actual behavior on unfixed code for all inputs where `isBugCondition` returns `false`
  - **Non-bug-condition inputs** are any routes or file checks that do NOT involve the four missing pages or admin entries in `cloth_frontend`
  - **Observe baseline behavior on unfixed code**:
    - Navigate `cloth_admin` dev server to `/` → observe Dashboard renders with stats cards and recent-orders table
    - Navigate to `/orders` → observe orders table renders with data from `GET /api/orders`
    - Navigate to `/products` → observe products table renders with data from `GET /api/products`
    - Navigate to `/categories` → observe categories list renders
    - Navigate to `/customers` → observe customers table renders
    - Navigate to `/payments` → observe payments table renders
    - Navigate to `/analytics` → observe analytics charts render
    - Navigate to `/login` without auth → observe Google Sign-In button is present
    - Navigate to `/` without auth → observe redirect to `/login`
    - Observe `cloth_frontend/frontend/vercel.json` contains `/api/:path*` rewrite → customer API proxy preserved
    - Observe `cloth_frontend/frontend/vercel.json` contains `/auth/login` rewrite → customer auth route preserved
    - Observe `cloth_frontend/frontend/vercel.json` contains `/my-orders` rewrite → customer orders route preserved
  - **Write property-based test**: For all order arrays with arbitrarily shaped objects (varied field presence: `created_at` vs `createdAt`, `payment_status` vs `paymentStatus`, nested `cloth_details` with missing fields, empty arrays), Dashboard and Analytics pages render without throwing — validates defensive field-access patterns already present
  - **Write property-based test**: For all Firestore notification snapshot shapes (arbitrary `is_read` boolean, any `timestamp`, optional `title`/`body` fields), `useNotifications` hook returns `{ notifications: Array, unreadCount: number }` with correct `unreadCount` = count of items where `is_read === false`
  - **Write unit test**: `ProtectedRoute` redirects to `/login` when `useAuth()` returns `{ user: null, loading: false }`
  - **Write unit test**: `ProtectedRoute` renders children when `useAuth()` returns `{ user: { email: 'hailetadilo@gmail.com' }, loading: false }`
  - Run all tests on UNFIXED code
  - **EXPECTED OUTCOME**: All preservation tests PASS on unfixed code (confirms baseline behavior that must not be broken)
  - Mark task complete when tests are written, run, and all passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 3. Fix: complete `cloth_admin` and clean `cloth_frontend`

  - [x] 3.1 Create `cloth_admin/src/pages/Inventory.jsx`
    - Functional component following the same pattern as `Analytics.jsx` — `useEffect` to fetch, `loading` spinner, `page-header`, `glass-card`, `data-table`
    - Calls `GET /api/products` via the existing `api` axios instance (Firebase token auto-attached by interceptor)
    - Renders a table with columns: Product Name, Category, Price (ETB), Stock Status
    - Each row has an "Edit" button linking to `/products/:id/edit` via `useNavigate`
    - Export as default function `Inventory`
    - _Bug_Condition: isBugCondition({ type: "page_navigation", target: "/inventory" }) — file does not exist, lazy import throws_
    - _Expected_Behavior: Component renders `<h1>Inventory</h1>` in page-header without error boundary_
    - _Preservation: Does not modify any other page or shared component_
    - _Requirements: 1.5, 2.4_

  - [x] 3.2 Create `cloth_admin/src/pages/Notifications.jsx`
    - Functional component that receives `adminMongoId` prop (passed via `React.cloneElement` in `AdminLayout`)
    - Consumes `useNotifications(adminMongoId)` hook from `cloth_admin/src/hooks/useNotifications.js`
    - Displays all notifications in a scrollable list using `section-card` container
    - Each notification item shows: title, body, timestamp, read/unread state (`badge-success` for read, `badge-warning` for unread)
    - Provides "Mark all as read" button (calls `markAllAsRead()`) styled as `btn btn-primary`
    - Loading state renders `<div className="spinner" />`
    - Export as default function `Notifications`
    - _Bug_Condition: isBugCondition({ type: "page_navigation", target: "/notifications" }) — file does not exist, lazy import throws_
    - _Expected_Behavior: Component renders notifications page heading without error boundary_
    - _Preservation: Uses existing `useNotifications` hook without modification_
    - _Requirements: 1.5, 2.4_

  - [x] 3.3 Create `cloth_admin/src/pages/Settings.jsx`
    - Functional component using `useState` for form fields and `useEffect` to load on mount
    - Calls `GET /api/settings/social` on mount → populate social links state (TikTok, Telegram, Instagram, WhatsApp, Phone)
    - Calls `GET /api/settings/content` on mount → populate site content state (siteTitle, footerBrand, etc.)
    - Save handlers call `PUT /api/settings/social` and `PUT /api/settings/content` respectively
    - Renders two `glass-card` form sections: "Social Links" and "Site Content", each with a `btn btn-primary` save button
    - Uses `api` axios instance so Firebase token is automatically attached
    - Export as default function `Settings`
    - _Bug_Condition: isBugCondition({ type: "page_navigation", target: "/settings" }) — file does not exist, lazy import throws_
    - _Expected_Behavior: Component renders settings form with social-link fields without error boundary_
    - _Preservation: Uses existing api axios instance without modification_
    - _Requirements: 1.5, 2.4_

  - [x] 3.4 Create `cloth_admin/src/pages/Profile.jsx`
    - Functional component that calls `useAuth()` to get `{ user, logout }`
    - Reads `user.displayName`, `user.email`, `user.photoURL` from Firebase Auth user object
    - Displays a read-only `glass-card` with `page-header` showing admin profile info
    - If `user.photoURL` exists render an `<img>` avatar; otherwise render initials placeholder
    - Provides "Logout" button (`btn btn-primary`) that calls `logout()` from `useAuth()`
    - Note in comments: admin accounts are managed via Firebase Console, not the backend
    - Export as default function `Profile`
    - _Bug_Condition: isBugCondition({ type: "page_navigation", target: "/profile" }) — file does not exist, lazy import throws_
    - _Expected_Behavior: Component renders admin email without error boundary_
    - _Preservation: Uses existing `useAuth()` hook without modification; `logout()` behaviour unchanged_
    - _Requirements: 1.5, 2.4_

  - [x] 3.5 Create `cloth_admin/vercel.json`
    - Create file at `cloth_admin/vercel.json` with SPA catch-all rewrite:
      `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`
    - Ensures Vercel serves `index.html` for every path, enabling React Router client-side routing on hard refresh and direct URL access
    - _Bug_Condition: isBugCondition({ type: "file_exists", path: "cloth_admin/vercel.json" }) — file absent, SPA routing broken on Vercel_
    - _Expected_Behavior: File exists and contains rewrites array with catch-all rule_
    - _Requirements: 1.8, 2.7_

  - [x] 3.6 Create `cloth_admin/.env.example`
    - Create file at `cloth_admin/.env.example` documenting all required environment variables
    - Must contain keys: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_API_URL`
    - Set `VITE_API_URL` default value to `https://myclothefullstackhaile.onrender.com`
    - _Bug_Condition: isBugCondition({ type: "file_exists", path: "cloth_admin/.env.example" }) — file absent, CI/onboarding blocked_
    - _Expected_Behavior: File exists and lists all required keys_
    - _Requirements: 1.8, 2.7_

  - [x] 3.7 Delete admin folder and artefacts from `cloth_frontend`
    - Delete `cloth_frontend/frontend/admin/` entire folder (contains `dashboard.html`, `orders.html`, `users.html`, `chat.html`, `posts.html`, `order-stats.html`, `login.html`, `forgot-password.html`, `reset-password.html`, `verify-otp.html`, `links.html`)
    - Delete `cloth_frontend/frontend/admin-login.html`
    - Delete `cloth_frontend/frontend/js/admin-common.js`
    - Delete `cloth_frontend/frontend/js/admin-guard.js`
    - Delete `cloth_frontend/frontend/css/admin-dashboard.css`
    - Verify no other customer-facing files reference these paths before deleting
    - _Bug_Condition: isBugCondition({ type: "file_exists", path: "cloth_frontend/frontend/admin/" }) — admin HTML/JS/CSS co-located with customer code_
    - _Expected_Behavior: None of the 5 admin artefact paths exist in cloth_frontend after deletion_
    - _Preservation: All customer-facing files (`user/`, non-admin `js/`, non-admin `css/`) remain untouched_
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2_

  - [x] 3.8 Remove admin routing entries from `cloth_frontend/frontend/vercel.json`
    - Remove from `"redirects"` array: entry with `"source": "/admin"` (destination `/admin/orders`)
    - Remove from `"redirects"` array: entry with `"source": "/admin/"` (destination `/admin/orders`)
    - Remove from `"rewrites"` array: entry with `"source": "/admin/:path*"` (destination `https://myclothefullstackhaile.onrender.com/admin/:path*`)
    - All other redirects (37 customer URL redirects) and all other rewrites (`/api/:path*`, `/favicon.ico`, `/payment-result`, `/auth/login`, `/my-orders`, etc.) MUST be preserved unchanged
    - Validate the resulting JSON is syntactically valid
    - _Bug_Condition: isBugCondition({ type: "config_entry", source: "/admin/:path*", config_file: "cloth_frontend/frontend/vercel.json" }) — admin traffic proxied through customer deployment_
    - _Expected_Behavior: vercel.json contains no entries with source "/admin", "/admin/", or "/admin/:path*"_
    - _Preservation: All 37 customer redirect entries and all non-admin rewrite entries remain byte-identical_
    - _Requirements: 1.3, 2.3_

  - [x] 3.9 Verify `cloth_admin/src/main.jsx` AuthProvider wrap is intact (no change required)
    - Confirm `main.jsx` wraps `<App>` with `<BrowserRouter>` and `<AuthProvider>` (already correct per code inspection)
    - Confirm implementation steps 3.1–3.8 did NOT modify `main.jsx`
    - Confirm `<AuthProvider>` is still the outermost wrapper so `useAuth()` works throughout the tree
    - _Preservation: ProtectedRoute calls useAuth() and must not receive null context_
    - _Requirements: 2.6, 3.8_

  - [x] 3.10 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Missing Pages Resolved and Admin-Free Frontend
    - **IMPORTANT**: Re-run the SAME checks from task 1 — do NOT write new checks
    - The checks from task 1 encode the expected behavior; when they pass, the fix is confirmed
    - Re-verify all isBugCondition checks from task 1:
      - `Inventory.jsx`, `Notifications.jsx`, `Settings.jsx`, `Profile.jsx` now EXIST in `cloth_admin/src/pages/`
      - `cloth_admin/vercel.json` now EXISTS with catch-all rewrite
      - `cloth_admin/.env.example` now EXISTS with all required keys
      - `cloth_frontend/frontend/admin/` does NOT exist
      - `cloth_frontend/frontend/admin-login.html` does NOT exist
      - `cloth_frontend/frontend/js/admin-common.js` does NOT exist
      - `cloth_frontend/frontend/js/admin-guard.js` does NOT exist
      - `cloth_frontend/frontend/css/admin-dashboard.css` does NOT exist
      - `cloth_frontend/frontend/vercel.json` does NOT contain `/admin`, `/admin/`, or `/admin/:path*` entries
    - **EXPECTED OUTCOME**: All checks PASS (confirms all sub-conditions of the bug are resolved)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.7_

  - [x] 3.11 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Admin Pages and Customer Frontend Unaffected
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run all unit tests: `ProtectedRoute` redirect and children-render behaviors unchanged
    - Run PBT: Dashboard/Analytics render without throwing for arbitrary order data shapes
    - Run PBT: `useNotifications` hook returns correct shape for arbitrary Firestore snapshot shapes
    - Navigate all existing admin pages (Dashboard, Orders, Products, Categories, Customers, Payments, Analytics) and assert each renders without error boundary
    - Assert `cloth_frontend/frontend/vercel.json` still contains `/api/:path*`, `/auth/login`, and `/my-orders` rewrites
    - **EXPECTED OUTCOME**: All preservation tests PASS (no regressions introduced)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [x] 4. Write unit and integration tests for new pages

  - [x] 4.1 Unit test: `Inventory.jsx` renders without crashing
    - Mock `api.get('/api/products')` to return empty array `[]` → assert page header "Inventory" is present
    - Mock to return minimal valid product `[{ _id: '1', name: 'Test Shirt', category: 'Shirt', post_price_etb: 100 }]` → assert table row for "Test Shirt" is rendered
    - _Requirements: 2.4_

  - [x] 4.2 Unit test: `Notifications.jsx` renders without crashing
    - Mock `useNotifications` to return `{ notifications: [], unreadCount: 0, loading: false, markAsRead: jest.fn(), markAllAsRead: jest.fn() }` → assert page heading is present
    - Mock with 2 notifications (1 read, 1 unread) → assert unread badge shows `1`
    - _Requirements: 2.4_

  - [x] 4.3 Unit test: `Settings.jsx` renders without crashing
    - Mock `api.get('/api/settings/social')` and `api.get('/api/settings/content')` to return `{}` → assert both form sections and save buttons render
    - _Requirements: 2.4_

  - [x] 4.4 Unit test: `Profile.jsx` renders without crashing
    - Mock `useAuth()` to return `{ user: { email: 'hailetadilo@gmail.com', displayName: 'Haile', photoURL: null }, logout: jest.fn() }`
    - Assert email `hailetadilo@gmail.com` and "Logout" button are present
    - Click "Logout" → assert `logout` was called once
    - _Requirements: 2.4, 2.5_

  - [x] 4.5 Unit test: `cloth_admin/vercel.json` structure is correct
    - Parse JSON → assert `rewrites` array contains exactly one entry: `{ "source": "/(.*)", "destination": "/index.html" }`
    - _Requirements: 2.7_

  - [x] 4.6 Unit test: `cloth_admin/.env.example` contains all required keys
    - Read file as text → assert presence of all seven keys: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`, `VITE_API_URL`
    - _Requirements: 2.7_

  - [x] 4.7 Integration test: sidebar navigation through all pages without error boundaries
    - Mock Firebase Auth as signed-in with `hailetadilo@gmail.com`
    - Navigate sequentially: Dashboard → Orders → Products → Categories → Customers → Payments → Analytics → Inventory → Notifications → Settings → Profile
    - Assert each page mounts without triggering a React error boundary
    - _Requirements: 2.4, 3.2_

  - [x] 4.8 Integration test: full login flow
    - Open `cloth_admin` with no authenticated user → assert redirect to `/login` and Google Sign-In button is present
    - Mock `signInWithPopup` returning `{ user: { email: 'hailetadilo@gmail.com' } }` → assert navigation to `/` (Dashboard)
    - Mock `signInWithPopup` returning `{ user: { email: 'other@gmail.com' } }` → assert "Access Denied" message shown and user remains on `/login`
    - _Requirements: 2.5, 3.3, 3.4_

- [x] 5. Checkpoint — Ensure all tests pass
  - Run the full test suite from `cloth_admin` (`npm test` or equivalent)
  - Confirm all unit tests (4.1–4.6) pass
  - Confirm all integration tests (4.7–4.8) pass
  - Confirm all property-based tests (from task 2) still pass
  - Verify `cloth_admin` dev server starts without console errors (`npm run dev` — run manually in terminal)
  - Verify navigating to `/inventory`, `/notifications`, `/settings`, `/profile` in the running dev server renders the correct page heading without white-screen or error boundary
  - Verify `cloth_frontend/frontend/vercel.json` is valid JSON with no admin entries remaining
  - Ensure all tests pass; ask the user if any questions arise.

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2"],
      "description": "Exploration and preservation tests written on unfixed code before any implementation"
    },
    {
      "wave": 2,
      "tasks": ["3.1", "3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8"],
      "description": "All fix tasks — create missing pages, add deployment artefacts, remove admin code from cloth_frontend"
    },
    {
      "wave": 3,
      "tasks": ["3.9", "3.10", "3.11"],
      "description": "Verify AuthProvider wrap intact, re-run bug condition test (expect pass), re-run preservation tests (expect pass)"
    },
    {
      "wave": 4,
      "tasks": ["4.1", "4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8"],
      "description": "Unit and integration tests for new pages and deployment artefacts"
    },
    {
      "wave": 5,
      "tasks": ["5"],
      "description": "Final checkpoint — full test suite must pass"
    }
  ]
}
```

## Notes

- Tasks 1 and 2 are standalone property-based test tasks that MUST be completed before any implementation in task 3.
- Task 1 is expected to FAIL on unfixed code — this is intentional and confirms the bug. Do not attempt to fix the test or the code during task 1.
- Task 2 is expected to PASS on unfixed code — this establishes the preservation baseline.
- Sub-tasks 3.10 and 3.11 re-run the SAME tests from tasks 1 and 2 respectively; do NOT write new tests.
- Task 3.9 requires no code changes — it is a verification step only.
- The four new page files (3.1–3.4) must follow the established component pattern in `cloth_admin/src/pages/` (`glass-card`, `page-header`, `data-table`, `animate-fade-in` CSS classes, `api` axios instance).
- `cloth_admin/src/main.jsx` already has the correct `<AuthProvider>` wrapping — do NOT modify it.
- When deleting files in task 3.7, confirm none of the targeted paths are referenced by any remaining customer-facing file before deletion.
- The `cloth_frontend/frontend/vercel.json` edit in task 3.8 must preserve all 37 existing customer redirect entries and all non-admin rewrite entries byte-for-byte.
- Run the dev server manually with `npm run dev` — do not use a shell command that would block execution.
