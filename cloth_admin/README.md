# cloth_admin — Yeshi Clothe Admin Panel

Pure static HTML/CSS/JS admin panel. No build step required.

## Structure

```
public/
  index.html            ← Login page (entry point)
  admin/
    dashboard.html
    orders.html
    posts.html
    users.html
    chat.html
    order-stats.html
    links.html
    forgot-password.html
    reset-password.html
    verify-otp.html
  css/
    style.css
    admin-dashboard.css
    auth.css
    shared-shell.css
  js/
    admin-config.js     ← API base URL shim (load first)
    admin-guard.js      ← Auth guard for admin pages
    admin-common.js     ← Shared admin utilities
    auth.js             ← Login/logout logic
    firebase-auth.js    ← Firebase bridge (optional)
    order-stats.js
  images/
    logo.png
```

## Deployment (aletcloud)

- **Root directory**: `cloth_admin`
- **Build command**: *(leave empty — no build needed)*
- **Output directory**: `public`
- **Install command**: *(leave empty)*

## Required env var on Render backend

Add `https://yeshiclothe.app.aletcloud.com` to `CORS_ORIGINS`.

## How auth works

1. User visits `https://yeshiclothe.app.aletcloud.com` → `public/index.html` (login page)
2. Email + password → `POST /api/auth/login` on Render backend
3. JWT stored in `localStorage.token`
4. Every admin page has `admin-config.js` + `admin-guard.js` which verify the token
5. Logout clears `localStorage` and redirects back to `/`
