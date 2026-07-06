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
        window.location.replace('/');
    }

    var token = '';
    try {
        token = String(localStorage.getItem('token') || '').trim();
    } catch (_) {
        token = '';
    }

    var headers = {};
    if (token) headers['x-auth-token'] = token;

    var BACKEND_BASE = (typeof window.__ADMIN_API_BASE === 'string' && window.__ADMIN_API_BASE)
        ? window.__ADMIN_API_BASE
        : 'https://myclothefullstackhaile.onrender.com';

    fetch(BACKEND_BASE + '/api/auth/me', {
        method: 'GET',
        credentials: 'same-origin',
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
