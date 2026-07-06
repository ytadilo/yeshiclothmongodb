/**
 * admin-config.js
 * Loaded first on every admin page.
 * Patches fetch so all /api/* and /auth/* calls go to the Render backend,
 * regardless of the domain this admin is deployed on.
 */
(function () {
    var BACKEND = 'https://myclothefullstackhaile.onrender.com';

    var _fetch = window.fetch.bind(window);

    window.fetch = function (input, init) {
        var url = String(input instanceof Request ? input.url : input || '');

        // Only rewrite relative API paths — leave absolute URLs untouched
        if (
            url.startsWith('/api/') ||
            url.startsWith('/auth/') ||
            url === '/api/auth/me'
        ) {
            url = BACKEND + url;
            if (input instanceof Request) {
                input = new Request(url, input);
            } else {
                input = url;
            }
        }

        // Attach CORS credentials header for cross-origin requests
        var options = init ? Object.assign({}, init) : {};
        options.credentials = options.credentials || 'include';
        options.headers = Object.assign({}, options.headers || {});

        return _fetch(input, options);
    };

    // Expose backend base URL for any inline scripts that build URLs manually
    window.__ADMIN_API_BASE = BACKEND;
})();
