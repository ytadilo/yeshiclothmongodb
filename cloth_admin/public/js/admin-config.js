/**
 * admin-config.js — MUST be the first script on every admin page.
 *
 * 1. Inlines the Firebase config so firebase-auth.js never needs to
 *    call /api/auth/firebase/config — eliminates the CORS / invalid-api-key
 *    error when the admin site is hosted on a different domain.
 *
 * 2. Patches window.fetch so all relative /api/* paths are prefixed
 *    with the backend URL (myclothe.app.aletcloud.com).
 */
(function () {
    if (window.__ADMIN_CONFIG_PATCHED__) return;
    window.__ADMIN_CONFIG_PATCHED__ = true;

    // ── Inline Firebase config ───────────────────────────────────────────────
    // firebase-auth.js reads window.YESHI_FIREBASE_CONFIG first and skips the
    // /api/auth/firebase/config network request entirely when this is set.
    window.YESHI_FIREBASE_CONFIG = {
        apiKey:            'AIzaSyBheqF3CLn3hhv2pzXmLdTt0D54236BP04',
        authDomain:        'clotheyeshi.firebaseapp.com',
        projectId:         'clotheyeshi',
        storageBucket:     'clotheyeshi.firebasestorage.app',
        messagingSenderId: '342924950227',
        appId:             ''   // optional — only needed for Analytics
    };

    // ── Backend base URL ─────────────────────────────────────────────────────
    var BACKEND = 'https://myclothe.app.aletcloud.com';
    window.__ADMIN_API_BASE = BACKEND;

    // ── Fetch patch ──────────────────────────────────────────────────────────
    var _prev = window.fetch.bind(window);

    window.fetch = function adminConfigFetch(input, init) {
        var url = typeof input === 'string'
            ? input
            : (input instanceof Request ? input.url : String(input || ''));

        // Rewrite relative /api/* and /auth/* paths to the backend domain
        if (url.length > 1 && url.charAt(0) === '/' &&
            (url.indexOf('/api/') === 0 || url.indexOf('/auth/') === 0)) {

            var fullUrl = BACKEND + url;
            input = (input instanceof Request) ? new Request(fullUrl, input) : fullUrl;
        }

        var opts = init ? Object.assign({}, init) : {};
        // Use 'omit' — admin authenticates via x-auth-token header, not cookies
        if (!opts.credentials) opts.credentials = 'omit';

        return _prev(input, opts);
    };
})();
