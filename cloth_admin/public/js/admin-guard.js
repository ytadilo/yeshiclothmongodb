(function () {
    var publicPaths = {
        '/admin/login.html': true,
        '/admin/forgot-password.html': true,
        '/admin/verify-otp.html': true,
        '/admin/reset-password.html': true
    };

    var path = String(window.location.pathname || '').replace(/\/+$/, '') || '/';
    if (!path.startsWith('/admin') || publicPaths[path]) return;

    var style = document.createElement('style');
    style.setAttribute('data-admin-guard', '1');
    style.textContent = 'html[data-admin-guard-pending="1"] body{visibility:hidden!important;}';
    document.head.appendChild(style);
    document.documentElement.setAttribute('data-admin-guard-pending', '1');

    function clearPending() {
        document.documentElement.removeAttribute('data-admin-guard-pending');
    }

    function clearStoredSession() {
        try {
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            localStorage.removeItem('user');
            localStorage.removeItem('loginTime');
        } catch (_) {
            // ignore
        }
    }

    function redirectToLogin() {
        clearStoredSession();
        window.location.replace('/login');
    }

    var token = '';
    try {
        token = String(localStorage.getItem('token') || '').trim();
    } catch (_) {
        token = '';
    }

    // Fast-path: if token + admin role already stored, show page immediately
    // and verify in background (avoids CORS delay blocking the UI)
    var storedRole = '';
    var storedUser = null;
    try {
        storedRole = String(localStorage.getItem('role') || '').toLowerCase();
        storedUser = JSON.parse(localStorage.getItem('user') || 'null');
    } catch (_) {}

    if (token && storedRole === 'admin' && storedUser && !storedUser.isBanned) {
        clearPending();
        // Still verify in background — redirect if token is invalid
        var headers = { 'x-auth-token': token };
        var BACKEND_BASE = (typeof window.__ADMIN_API_BASE === 'string' && window.__ADMIN_API_BASE) ? window.__ADMIN_API_BASE : '';
        fetch(BACKEND_BASE + '/api/auth/me', { method: 'GET', credentials: 'omit', headers: headers })
            .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
            .then(function (payload) {
                var user = payload && payload.user;
                var role = String(user && user.role || '').toLowerCase();
                if (!user || role !== 'admin' || user.isBanned) redirectToLogin();
                else {
                    window.__YESHI_ADMIN_SESSION = { ready: true, ok: true, role: role, user: user };
                }
            })
            .catch(function () {
                // Background verify failed — keep page visible, session may still be valid
                window.__YESHI_ADMIN_SESSION = { ready: true, ok: true, role: storedRole, user: storedUser };
            });
        return;
    }

    if (!token) { redirectToLogin(); return; }

    var headers = {};
    headers['x-auth-token'] = token;

    var BACKEND_BASE = (typeof window.__ADMIN_API_BASE === 'string' && window.__ADMIN_API_BASE)
        ? window.__ADMIN_API_BASE
        : '';

    fetch(BACKEND_BASE + '/api/auth/me', {
        method: 'GET',
        credentials: 'omit',
        headers: headers
    })
        .then(function (response) {
            if (!response.ok) throw new Error('unauthorized');
            return response.json();
        })
        .then(function (payload) {
            var user = payload && payload.user && typeof payload.user === 'object' ? payload.user : null;
            var role = String(user && user.role || '').toLowerCase();
            var status = String(user && user.status || '').toLowerCase();
            var blocked = !!(user && (user.isBanned || status === 'banned' || status === 'inactive'));

            if (!user || role !== 'admin' || blocked) {
                redirectToLogin();
                return;
            }

            window.__YESHI_ADMIN_SESSION = {
                ready: true,
                ok: true,
                role: role,
                user: user
            };
            clearPending();
        })
        .catch(function () {
            window.__YESHI_ADMIN_SESSION = { ready: true, ok: false };
            redirectToLogin();
        });
})();
