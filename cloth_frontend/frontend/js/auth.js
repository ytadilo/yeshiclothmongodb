const API_URL = '/api/auth';

function getDeviceFingerprint() {
    try {
        const payload = {
            ua: navigator.userAgent || '',
            lang: navigator.language || '',
            langs: Array.isArray(navigator.languages) ? navigator.languages : [],
            plat: navigator.platform || '',
            hc: navigator.hardwareConcurrency || 0,
            dm: navigator.deviceMemory || 0,
            scr: {
                w: (screen && screen.width) || 0,
                h: (screen && screen.height) || 0,
                d: (screen && screen.colorDepth) || 0
            },
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
            tzOff: new Date().getTimezoneOffset()
        };
        const raw = JSON.stringify(payload);
        return btoa(unescape(encodeURIComponent(raw)));
    } catch (_) {
        return '';
    }
}

function safeParseJson(value) {
    try {
        return value ? JSON.parse(value) : null;
    } catch (_) {
        return null;
    }
}

async function readResponsePayload(res) {
    const raw = await res.text();
    const parsed = safeParseJson(raw);
    if (parsed && typeof parsed === 'object') return parsed;
    const text = String(raw || '').trim();
    return text ? { msg: text } : {};
}

function normalizeNextDestination(rawNext) {
    const fallback = '/index.html';
    if (!rawNext) return fallback;

    let next = String(rawNext).trim();
    if (!next) return fallback;

    try {
        const parsed = new URL(next, window.location.origin);
        if (parsed.origin !== window.location.origin) return fallback;
        next = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch (_) {
        if (/^[A-Za-z0-9._-]+\.html([?#].*)?$/i.test(next)) {
            next = `/user/${next.replace(/^\/+/, '')}`;
        } else if (!next.startsWith('/')) {
            next = `/${next.replace(/^\/+/, '')}`;
        }
    }

    const misplacedAuthHtmlPages = [
        'index.html',
        'order.html',
        'post.html',
        'my-orders.html',
        'size-guide.html',
        'about.html',
        'contact.html',
        'mychat.html',
        'how-it-works.html'
    ];

    for (const page of misplacedAuthHtmlPages) {
        const authPrefix = `/auth/${page}`;
        if (next === authPrefix || next.startsWith(`${authPrefix}?`) || next.startsWith(`${authPrefix}#`)) {
            next = next.replace(authPrefix, `/user/${page}`);
            break;
        }
    }

    // Keep legacy contact destinations mapped to the new mychat route.
    next = next.replace('/user/contact.html', '/user/mychat.html');

    if (!next.startsWith('/')) return fallback;
    return next;
}

function getSafeNextDestination() {
    const rawNext = new URLSearchParams(window.location.search).get('next');
    return normalizeNextDestination(rawNext);
}

function preserveNextAcrossAuthLinks() {
    const rawNext = new URLSearchParams(window.location.search).get('next');
    if (!rawNext) return;
    const encoded = encodeURIComponent(rawNext);

    document.querySelectorAll('a[href="/auth/register"], a[href="/auth/login"]').forEach((link) => {
        const href = link.getAttribute('href') || '';
        if (!href || href.includes('next=')) return;
        link.setAttribute('href', `${href}?next=${encoded}`);
    });
}

// If a logged-in user visits login/register, redirect them away
(function redirectIfAlreadyLoggedIn() {
    const loginFormEl = document.getElementById('loginForm');
    const signupFormEl = document.getElementById('signupForm');
    if (!loginFormEl && !signupFormEl) return;

    const token = localStorage.getItem('token');
    if (!token) return;

    const user = safeParseJson(localStorage.getItem('user'));
    const role = (user && user.role) || localStorage.getItem('role');
    const next = getSafeNextDestination();

    if (role === 'admin') {
        window.location.replace('/admin');
    } else {
        window.location.replace(next);
    }
})();

// Handle Login
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            const fp = getDeviceFingerprint();
            const res = await fetch(`${API_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(fp ? { 'x-device-fingerprint': fp } : {})
                },
                body: JSON.stringify({ email, password })
            });
            const data = await readResponsePayload(res);

            if (res.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('role', data.user.role);
                localStorage.setItem('user', JSON.stringify(data.user));
                localStorage.setItem('loginTime', Date.now().toString()); // Store login time
                alert('Login Successful');
                // Redirect based on current page or role
                if (data.user.role === 'admin') {
                    window.location.href = '/admin';
                } else {
                    window.location.href = getSafeNextDestination();
                }
            } else {
                alert((data && data.msg) || 'Login failed');
            }
        } catch (err) {
            console.error(err);
            alert('Login failed');
        }
    });
}

// Handle Signup
const signupForm = document.getElementById('signupForm');
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const firstNameEl = document.getElementById('firstName');
        const nameEl = document.getElementById('name');
        const firstName = (firstNameEl ? firstNameEl.value : (nameEl ? nameEl.value : '')).trim();
        const fatherName = document.getElementById('fatherName').value;
        const email = document.getElementById('email').value;
        const phone = document.getElementById('phone').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword') ? document.getElementById('confirmPassword').value : password;
        const age = document.getElementById('age') ? document.getElementById('age').value : '';
        const sex = document.getElementById('sex') ? document.getElementById('sex').value : '';
        const profileImageInput = document.getElementById('profileImage');

        if (password !== confirmPassword) {
            alert('Passwords do not match');
            return;
        }

        try {
            const formData = new FormData();
            formData.append('firstName', firstName);
            formData.append('fatherName', fatherName);
            formData.append('email', email);
            formData.append('phone', phone);
            formData.append('password', password);
            formData.append('age', age);
            formData.append('sex', sex);

            if (profileImageInput && profileImageInput.files && profileImageInput.files[0]) {
                formData.append('profileImage', profileImageInput.files[0]);
            }

            const res = await fetch(`${API_URL}/register`, {
                method: 'POST',
                body: formData
            });
            const data = await readResponsePayload(res);

            if (res.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('loginTime', Date.now().toString()); // Store login time
                // Register defaults to customer
                localStorage.setItem('role', 'customer');
                if (data.user) {
                    localStorage.setItem('user', JSON.stringify(data.user));
                }
                alert('Account Created. You can now order.');
                window.location.href = getSafeNextDestination();
            } else {
                alert((data && data.msg) || 'Signup failed');
            }
        } catch (err) {
            console.error(err);
            alert('Signup failed');
        }
    });
}

async function completeAuth(data) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('role', data.user.role);
    localStorage.setItem('user', JSON.stringify(data.user));

    if (data.user.role === 'admin') {
        window.location.href = '/admin';
    } else {
        window.location.href = getSafeNextDestination();
    }
}

async function initGoogleSignIn() {
    const container = document.getElementById('googleSignIn');
    if (!container) return;

    // Wait for GIS script
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
        // If the script hasn't loaded yet, try again shortly
        setTimeout(initGoogleSignIn, 250);
        return;
    }

    try {
        const configRes = await fetch(`${API_URL}/google/config`);
        const config = await configRes.json();
        if (!config || !config.clientId) {
            // Not configured on server; silently skip rendering the button
            return;
        }

        window.google.accounts.id.initialize({
            client_id: config.clientId,
            callback: async (response) => {
                try {
                    const fp = getDeviceFingerprint();
                    const res = await fetch(`${API_URL}/google`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(fp ? { 'x-device-fingerprint': fp } : {})
                        },
                        body: JSON.stringify({ idToken: response.credential })
                    });
                    const data = await readResponsePayload(res);
                    if (res.ok) {
                        await completeAuth(data);
                    } else {
                        alert((data && data.msg) || 'Google login failed');
                    }
                } catch (err) {
                    console.error(err);
                    alert('Google login failed');
                }
            },
            ux_mode: 'popup'
        });

        window.google.accounts.id.renderButton(container, {
            theme: 'outline',
            size: 'large',
            width: 320,
            text: 'continue_with',
            shape: 'pill'
        });
    } catch (err) {
        console.error(err);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    preserveNextAcrossAuthLinks();
    initGoogleSignIn();
});

// Logout function
function logout() {
    const storedUser = safeParseJson(localStorage.getItem('user'));
    const role = (storedUser && storedUser.role) || localStorage.getItem('role');
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('user');
    if (role === 'admin') {
        window.location.href = '/admin/login';
    } else {
        window.location.href = '/auth/login';
    }
}
