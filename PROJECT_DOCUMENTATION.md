# Project Documentation — Yeshi Clothing Platform

## 1) Project Summary

Yeshi is a tailoring and ordering web platform with:
- **Customer/User** flows for browsing posts, placing orders, tracking orders, and chatting with admin.
- **Admin** flows for managing users, posts, orders, settings, notifications, and audit logs.

Current implementation uses:
- Backend: **Node.js + Express + MongoDB (Mongoose)**
- Frontend: **Static HTML + CSS + JavaScript**
- Realtime: **SSE (Server-Sent Events)** for notifications

---

## 2) Repository / Workspace Structure

- `cloth_backend-/backend/`
  - API server, routes, controllers, middleware, models, utilities.
- `cloth_frontend/frontend/`
  - Static UI pages grouped by active role areas (`admin/`, `user/`) and shared JS/CSS.
- `netlify.toml` and `cloth_frontend/netlify.toml`
  - Deployment/proxy config for static frontend and API routing.

---

## 3) High-Level Architecture

### Backend responsibilities
- Authentication and authorization (JWT + role checks)
- Post management (catalog-like items)
- Order creation and order lifecycle updates
- Chat, notifications, audit logs
- File upload/download (documents, payment screenshots, reference images)
- Site settings (branding/social links/content)
- Exchange-rate utility endpoint

### Frontend responsibilities
- Role-specific dashboards and pages
- API calls using `fetch`
- Token/session persistence in `localStorage`
- Navigation and UI state
- Notification stream subscription via `EventSource`

---

## 4) Roles and Permissions

## Admin
Can:
- Manage users: update user status (`active`, `inactive`, `banned`), inspect devices, block/unblock devices.
- Manage posts (create/edit/delete).
- View and update all orders and payment status.
- Manage chat, notifications, and audit logs.
- Update site content/social settings.

## Customer/User
Can:
- Register/login (including Google Sign-In when enabled).
- Browse posts and interact (like/comment/reply).
- Place orders with measurements, delivery method, payment screenshot, and reference images.
- View own orders.
- Chat with admin and receive notifications.

## 5) Authentication & Security Model

## Auth token
- JWT issued on successful auth.
- Sent in header: `x-auth-token`.
- Some endpoints also allow `?token=` (used by SSE / upload image URLs).

## Middleware
- `authMiddleware.js`
  - Validates token.
  - Enforces account status (`active`, `inactive`, `banned`).
  - Adds `req.user` with user id/role.
- `optionalAuth.js`
  - Attempts auth if token exists; otherwise proceeds unauthenticated.

## Device controls
- Device fingerprint hash can be captured.
- Admin accounts require device fingerprint for login.
- Blocked devices cannot login.
- Admin can list and block/unblock devices.

## 6) Core Domain Models (MongoDB)

- `User`
  - Identity, role (`admin`, `customer`), auth provider, status, and profile fields.
- `Post`
  - Catalog/content item with media, price, engagement (views/shares/likes/comments).
- `Order`
  - Customer info, cloth details, measurements, reference images, payment info, order status.
- `ChatMessage`
  - Direct messages (with optional job/delivery references).
- `Notification`
  - User-targeted alerts with read/unread state.
- `AuditLog`
  - Trace of important admin/system actions.
- `Upload`
  - Binary file storage with visibility (`public`/`private`) and purpose metadata.
- `UserDevice`, `BlockedDevice`, `OTPCode`, `SiteSettings`
  - Security, recovery, and dynamic configuration support.

---

## 7) Backend API Modules

All APIs are mounted under `/api/*` in `server.js`.

### `auth` (`/api/auth`)
- Register/login
- Google auth config/login
- OTP forgot/verify/reset
- Reset-link flow
- Change password

### `orders` (`/api/orders`)
- Create order (multipart for screenshots/images)
- Get own orders (or all for admin)
- Update order/payment status (admin)
- Last delivery location
- Order stats (admin)

### `posts` (`/api/posts`)
- Public listing/details/views/shares
- Auth actions: likes/comments/replies
- Admin CRUD for posts

### `workflow` (`/api/workflow`)
- Chat messages + block messaging
- Notifications (list/unread/read/read-all/stream)
- Audit logs (admin)

### `admin/users`, `admin/devices`, `admin/uploads`
- User moderation/status/device inspection
- Device block/unblock
- Admin upload endpoints

### `settings` (`/api/settings`)
- Social links and editable content
- Public GET, admin PUT

### `exchange` (`/api/exchange`)
- USD→ETB exchange rate endpoint with caching

---

## 8) Frontend Pages and Role Areas

## Public/User pages
- Home, about, contact, how-it-works, size-guide, auth pages, order forms, my-orders, single post view.

## Admin pages
- Login/recovery
- Orders, order stats
- Posts management
- Users/workers/drivers management
- Workflow control
- Links/settings management

## Employee pages
- Dashboard, jobs, offers, chat, notifications

## Driver pages
- Dashboard, jobs, offers, chat, notifications

## Shared frontend scripts
- `js/auth.js`: auth handling, role redirects
- `js/main.js`: global behavior, social/content loading
- `js/order-form.js`: order creation flow
- `js/my-orders.js`: user order tracking/chat/notifications
- `js/admin-common.js`: admin auth helpers + common API utilities

---

## 9) Notification and Realtime Design

- Notifications are persisted in DB (`Notification`).
- Realtime pushes use SSE endpoint: `/api/workflow/notifications/stream?token=...`.
- Frontend subscribes with `EventSource` and then refreshes badge/list/chat context.

---

## 10) File Upload & Access Rules

Uploads endpoint: `/api/uploads/:id`
- Public uploads can be accessed directly.
- Private uploads require owner/admin auth.
- For image tags where custom headers are unavailable, token can be appended as query string (`?token=...`) by frontend helper.

Used for:
- Worker legal docs / national ID
- Order payment screenshots
- Order reference images
- Job production images
- Branding assets

---

## 12) Setup & Run (Current Stack)

### Prerequisites
- Node.js
- MongoDB instance

### Backend run
1. Go to `cloth_backend-/backend`
2. Install dependencies
3. Configure env vars
4. Run:
   - Dev: `npm run dev`
   - Prod: `npm start`

### Frontend run
- Served statically by backend when frontend folder exists, or via Netlify/static hosting with API proxy.

---

## 13) Environment Variables (Observed)

## Required/primary
- `MONGO_URI`
- `JWT_SECRET`

## CORS / runtime
- `CORS_ORIGINS` (comma-separated allow list)
- `PORT`

## Deployment metadata (optional)
- `RENDER_GIT_COMMIT`
- `COMMIT_SHA`

## Email (SMTP mode)
- `EMAIL_PROVIDER` (`smtp` default or `resend`)
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE` (`true`/`false`)
- `SMTP_USER` (or `SMTP_EMAIL`)
- `SMTP_PASS` (or `SMTP_PASSWORD`)
- `SMTP_SERVICE` (fallback style)
- `FROM_EMAIL`
- `FROM_NAME`
- `SMTP_CONNECTION_TIMEOUT_MS`
- `SMTP_GREETING_TIMEOUT_MS`
- `SMTP_SOCKET_TIMEOUT_MS`

## Email (Resend mode)
- `RESEND_API_KEY`
- `RESEND_FROM`

## Password reset links
- `PUBLIC_BASE_URL`

## Google Sign-In
- `GOOGLE_CLIENT_ID`

---

## 14) Important Business Rules

- Customer registration cannot self-elevate role to admin/worker.
- Worker registration requires legal + identity documents and banking/tool fields.
- Admin account protection includes device fingerprint requirement.
- Worker/driver accounts with pending/rejected approval are denied login.
- Employees/drivers cannot access customer post catalog endpoints.
- Non-admin chat is restricted to admin-only recipient.

---

## 15) Known Integration Notes for Migration

When migrating to ASP.NET Core + SQL Server while keeping same behavior:
- Preserve role-based authorization exactly.
- Preserve workflow states and transitions.
- Preserve visibility rules for jobs and order snapshots by role.
- Preserve upload privacy semantics (public vs private).
- Preserve SSE-like realtime notifications (SignalR is a good equivalent).
- Preserve audit logging and device block logic.

---

## 16) Recommended SQL Entity Mapping (High-level)

Likely relational tables:
- `Users`, `UserDevices`, `BlockedDevices`
- `Posts`, `PostComments`, `PostCommentReplies`, `PostLikes`
- `Orders`, `OrderReferenceImages`
- `Jobs`, `Offers`
- `ChatMessages`
- `Notifications`
- `AuditLogs`
- `Uploads`
- `SiteSettings`
- `OtpCodes`

Notes:
- Use FK constraints for ownership/relations.
- For flexible blobs like order snapshots, use JSON columns where needed.
- Use rowversion/concurrency where admin updates can conflict.

---

## 17) Deployment Behavior

`server.js` supports:
- API hosting
- Static frontend hosting
- Friendly route mapping for `/admin`, `/employee`, `/driver`, `/auth/*`
- Health checks at `/api/health` and root `/`

Netlify-style deployment can proxy API calls while serving static frontend.

---

## 18) Maintenance Checklist

- Rotate JWT secret and email credentials securely.
- Review blocked devices and banned accounts periodically.
- Monitor audit logs for suspicious actions.
- Backup MongoDB and uploads regularly.
- Validate worker legal docs and approval workflow integrity.
- Test role-based access on every release.

---

## 19) Current Tech Stack Snapshot

### Backend
- Express 5, Mongoose, JWT, bcrypt, multer, nodemailer, Google auth library.

### Frontend
- HTML + CSS + vanilla JavaScript.

### Database
- MongoDB.

### Realtime
- Server-Sent Events.

---

This documentation describes the project as currently implemented in this workspace.