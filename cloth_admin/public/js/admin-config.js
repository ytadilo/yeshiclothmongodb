/**
 * admin-config.js — MUST be the first script on every admin page.
 *
 * Patches window.fetch so all relative /api/* and /auth/* paths are
 * prefixed with the Render backend URL. This makes the old admin HTML
 * pages work correctly when hosted on a different domain (aletcloud)
 * from the backend (onrender.com).
 *
 * Compatible with firebase-auth.js which also wraps fetch — both can
 * coexist because each wrapper calls the previous fetch (chain).
 */
(function () {
    if (window.__ADMIN_CONFIG_PATCHED__) return;
    window.__ADMIN_CONFIG_PATCHED__ = true;

    var BACKEND = 'https://myclothefullstackhaile.onrender.com';
    window.__ADMIN_API_BASE = BACKEND;

    var _prev = window.fetch.bind(window);

    window.fetch = function adminConfigFetch(input, init) {
        var url = typeof input === 'string'
            ? input
            : (input instanceof Request ? input.url : String(input || ''));

        // Rewrite only relative paths starting with /api/ or /auth/
        if (url.length > 1 && url.charAt(0) === '/' &&
            (url.indexOf('/api/') === 0 || url.indexOf('/auth/') === 0)) {

            var fullUrl = BACKEND + url;
            input = (input instanceof Request) ? new Request(fullUrl, input) : fullUrl;
        }

        var opts = init ? Object.assign({}, init) : {};
        // Use 'omit' — the admin sends auth via x-auth-token header, not cookies
        if (!opts.credentials) opts.credentials = 'omit';

        return _prev(input, opts);
    };
})();
