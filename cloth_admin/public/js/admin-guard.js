/**
 * admin-guard.js — Protects all /admin/* pages (except public auth pages).
 *
 * Strategy:
 *   1. If a valid admin token exists in localStorage → show the page immediately.
 *   2. Verify in the background — only redirect on explicit 401/403 (bad token).
 *   3. Network failures (CORS, timeout, offline) never cause a redirect.
 *   4. If no token at all → redirect to /login.
 *
 * This eliminates the "login loop" caused by CORS errors on /api/auth/me.
 */
(function () {
    // Pages that don't require auth
    var PUBLIC = {
        '/admin/login.html': true,
        '/admin/forgot-password.html': true,
        '/admin/verify-otp.html': true,
        '/admin/reset-password.html': true
    };

    var pathname = String(window.location.pathname || '').replace(/\/+$/, '') || '/';

    // Not an admin page, or it's a public auth page — nothing to do
    if (!pathname.startsWith('/admin') || PUBLIC[pathname]) return;

    // ── Read stored session ──────────────────────────────────────────────────
    var token = '';
    var storedRole = '';
    var storedUser = null;

    try { token = String(localStorage.getItem('token') || '').trim(); } catch (_) {}
    try { storedRole = String(localStorage.getItem('role') || '').trim().toLowerCase(); } catch (_) {}
    try { storedUser = JSON.parse(localStorage.getItem('user') || 'null'); } catch (_) {}

    // ── No token → redirect to login immediately ────────────────────────────
    if (!token) {
        window.location.replace('/login');
        return;
    }

    // ── Has token → show page right away ───────────────────────────────────
    // (body was never hidden, so no clearPending needed)
    window.__YESHI_ADMIN_SESSION = {
        ready: true,
        ok: true,
        role: storedRole || 'admin',
        user: storedUser || {}
    };

    // ── Background verification ─────────────────────────────────────────────
    // Only kick the user out on a definitive auth failure (401 or 403).
    // Any network/CORS error is silently ignored.
    var BACKEND = (typeof window.__ADMIN_API_BASE === 'string' && window.__ADMIN_API_BASE)
        ? window.__ADMIN_API_BASE
        : 'https://myclothe.app.aletcloud.com';

    fetch(BACKEND + '/api/auth/me', {
        method: 'GET',
        credentials: 'omit',
        headers: { 'x-auth-token': token }
    })
    .then(function (res) {
        if (res.status === 401 || res.status === 403) {
            // Definitive rejection — token is invalid or expired
            try {
                localStorage.removeItem('token');
                localStorage.removeItem('role');
                localStorage.removeItem('user');
                localStorage.removeItem('loginTime');
            } catch (_) {}
            window.location.replace('/login');
            return;
        }

        if (!res.ok) return; // Server error / CORS / network — ignore

        return res.json();
    })
    .then(function (payload) {
        if (!payload) return; // Already handled above
        var user = payload && payload.user;
        var role = String(user && user.role || '').toLowerCase();
        if (user && role === 'admin' && !user.isBanned) {
            window.__YESHI_ADMIN_SESSION = { ready: true, ok: true, role: role, user: user };
        }
    })
    .catch(function () {
        // Network error, CORS block, offline — keep the page visible
    });
})();
