(function () {
    var token = localStorage.getItem('token');
    if (!token) return;

    var userRaw = localStorage.getItem('user');
    var user = null;
    try { user = userRaw ? JSON.parse(userRaw) : null; } catch (e) { user = null; }

    var role = (user && user.role) || localStorage.getItem('role');

    // If already admin, go to dashboard
    if (role === 'admin') {
        window.location.replace('/admin');
        return;
    }

    // If logged in as non-admin, do not show admin auth pages
    if (role) {
        window.location.replace('/index.html');
    }
})();
