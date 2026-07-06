/**
 * admin-config.js — MUST be the first script on every admin page.
 *
 * When the admin site is deployed on a different domain from the backend
 * (e.g. yeshiclothe.app.aletcloud.com vs myclothefullstackhaile.onrender.com),
 * every fetch() call with a relative /api/* or /auth/* path would go to the
 * wrong origin. This shim patches window.fetch so those relative paths are
 * automatically prefixed with the backend base URL.
 */
(function () {
    var BACKEND = 'https://myclothefullstackhaile.onrender.com';

    // Expose for inline scripts that build URLs manually
    window.__ADMIN_API_BASE = BACKEND;

    var _nativeFetch = window.fetch.bind(window);

    window.fetch = function (input, init) {
        var url = typeof input === 'string'
            ? input
            : (input instanceof Request ? input.url : String(input || ''));

        // Only rewrite relative paths that start with /api/ or /auth/
        if (url.charAt(0) === '/' && (url.indexOf('/api/') === 0 || url.indexOf('/auth/') === 0)) {
            var fullUrl = BACKEND + url;
            if (input instanceof Request) {
                // Rebuild Request with new URL
                input = new Request(fullUrl, input);
            } else {
                input = fullUrl;
            }
        }

        var options = init ? Object.assign({}, init) : {};
        // credentials:'include' sends the cookie if any; 'omit' avoids CORS preflight issues
        // We use 'omit' since the admin uses x-auth-token header, not cookies
        if (!options.credentials) {
            options.credentials = 'omit';
        }

        return _nativeFetch(input, options);
    };
})();
