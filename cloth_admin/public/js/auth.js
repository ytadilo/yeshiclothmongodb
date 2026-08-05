(() => {
if (window.__yeshiAuthRuntimeInitialized) { return; }
window.__yeshiAuthRuntimeInitialized = true;

const YESHI_AUTH_FLASH_KEY = 'yeshi_auth_flash';
const YESHI_PENDING_SIGNUP_PROFILE_KEY = 'yeshi_pending_signup_profile';

// ─── Utilities ───────────────────────────────────────────────────────────────

function safeParseJson(value) {
    try { return value ? JSON.parse(value) : null; } catch (_) { return null; }
}

function getDeviceFingerprint() {
    try {
        const p = {
            ua: navigator.userAgent || '',
            lang: navigator.language || '',
            langs: Array.isArray(navigator.languages) ? navigator.languages : [],
            hc: navigator.hardwareConcurrency || 0,
            dm: navigator.deviceMemory || 0,
            scr: { w: screen.width || 0, h: screen.height || 0, d: screen.colorDepth || 0 },
            tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
            tzOff: new Date().getTimezoneOffset()
        };
        const bytes = new TextEncoder().encode(JSON.stringify(p));
        return btoa(String.fromCharCode(...bytes));
    } catch (_) { return ''; }
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
        if (!next.startsWith('/')) next = `/${next.replace(/^\/+/, '')}`;
    }
    return next.startsWith('/') ? next : fallback;
}

function getSafeNextDestination() {
    return normalizeNextDestination(new URLSearchParams(window.location.search).get('next'));
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

function setAuthFlash(type, message) {
    try { sessionStorage.setItem(YESHI_AUTH_FLASH_KEY, JSON.stringify({ type, message })); } catch (_) {}
}
function consumeAuthFlash() {
    try {
        const raw = sessionStorage.getItem(YESHI_AUTH_FLASH_KEY);
        sessionStorage.removeItem(YESHI_AUTH_FLASH_KEY);
        return safeParseJson(raw);
    } catch (_) { return null; }
}
function readPendingSignupProfile(email) {
    try {
        const parsed = safeParseJson(localStorage.getItem(YESHI_PENDING_SIGNUP_PROFILE_KEY));
        if (!parsed) return null;
        if (String(parsed.email || '').toLowerCase() !== String(email || '').toLowerCase()) return null;
        return parsed;
    } catch (_) { return null; }
}
function sanitizeEmailInput(input) {
    if (!input) return '';
    const s = String(input.value || '').replace(/\s+/g, '').trim().toLowerCase();
    if (input.value !== s) input.value = s;
    return s;
}
function isValidEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()); }
function createError(message, code) {
    const e = new Error(String(message || '').trim() || 'Something went wrong');
    if (code) e.code = code;
    return e;
}
function readJsonSafe(raw) {
    const p = safeParseJson(raw);
    if (p && typeof p === 'object') return p;
    const t = String(raw || '').trim();
    return t ? { msg: t } : {};
}
async function readApiPayload(response) { return readJsonSafe(await response.text()); }

function persistSessionFromApi(payload) {
    if (!payload || !payload.token || !payload.user) throw createError('Incomplete login response from server');
    if (window.YeshiAuth && typeof window.YeshiAuth.setSession === 'function') {
        window.YeshiAuth.setSession(payload.token, payload.user);
        return payload;
    }
    localStorage.setItem('token', String(payload.token || '').trim());
    localStorage.setItem('role', String((payload.user && payload.user.role) || '').trim());
    localStorage.setItem('user', JSON.stringify(payload.user || {}));
    if (!localStorage.getItem('loginTime')) localStorage.setItem('loginTime', Date.now().toString());
    try { window.dispatchEvent(new CustomEvent('yeshi:auth-state-changed')); } catch (_) {}
    return payload;
}

// ─── Backend API calls ────────────────────────────────────────────────────────

async function apiLogin(email, password) {
    const fp = getDeviceFingerprint();
    const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-fingerprint': fp },
        credentials: 'include',
        body: JSON.stringify({ email, password })
    });
    const data = await readApiPayload(resp);
    if (!resp.ok) {
        const msg = String((data && data.msg) || '').trim();
        if (/invalid credentials/i.test(msg)) throw createError('Invalid email or password', 'auth/invalid-credential');
        if (/google sign-in/i.test(msg)) throw createError(msg, 'auth/account-exists-with-different-credential');
        throw createError(msg || 'Login failed');
    }
    return persistSessionFromApi(data);
}

async function apiRegister(fields) {
    const fp = getDeviceFingerprint();
    const resp = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-fingerprint': fp },
        credentials: 'include',
        body: JSON.stringify(fields)
    });
    const data = await readApiPayload(resp);
    if (!resp.ok) throw createError((data && data.msg) || 'Registration failed');
    return data;
}

async function apiForgotPassword(email) {
    const resp = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
    });
    const data = await readApiPayload(resp);
    if (!resp.ok) throw createError((data && data.msg) || 'Failed to send reset email');
    return data;
}

async function apiGoogleSession(idToken) {
    const fp = getDeviceFingerprint();
    const resp = await fetch('/api/auth/google/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-device-fingerprint': fp },
        credentials: 'include',
        body: JSON.stringify({ idToken })
    });
    const data = await readApiPayload(resp);
    if (!resp.ok) throw createError((data && data.msg) || 'Google sign-in failed');
    return persistSessionFromApi(data);
}

// ─── Google Identity Services (GIS) token getter ─────────────────────────────

function getGoogleIdToken() {
    return new Promise((resolve, reject) => {
        function init() {
            if (!window.google || !window.google.accounts) {
                return reject(new Error('Google Sign-In failed to load. Please try again.'));
            }
            window.google.accounts.id.initialize({
                client_id: window.__GOOGLE_CLIENT_ID || '',
                callback: (response) => {
                    if (response && response.credential) resolve(response.credential);
                    else reject(new Error('No credential returned from Google'));
                },
                auto_select: false,
                cancel_on_tap_outside: true
            });
            window.google.accounts.id.prompt((notification) => {
                if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                    const tmp = document.createElement('div');
                    tmp.style.display = 'none';
                    document.body.appendChild(tmp);
                    window.google.accounts.id.renderButton(tmp, { type: 'standard' });
                    const btn = tmp.querySelector('div[role=button]');
                    if (btn) btn.click();
                }
            });
        }
        if (window.google && window.google.accounts) { init(); return; }
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true; s.defer = true;
        s.onload = init;
        s.onerror = () => reject(new Error('Failed to load Google Sign-In'));
        document.head.appendChild(s);
    });
}

async function flushPendingSignupProfile(user) {
    const profile = readPendingSignupProfile(user && user.email);
    if (!profile) return user;
    const token = String(localStorage.getItem('token') || '').trim();
    if (!token) return user;
    try {
        const resp = await fetch('/api/auth/me', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
            body: JSON.stringify({
                fullName: profile.fullName, fatherName: profile.fatherName,
                phone: profile.phone, age: profile.age, sex: profile.sex
            })
        });
        const data = await readApiPayload(resp);
        if (resp.ok && data && data.user) {
            localStorage.setItem('user', JSON.stringify(data.user));
            localStorage.removeItem(YESHI_PENDING_SIGNUP_PROFILE_KEY);
            return data.user;
        }
    } catch (_) {}
    return user;
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function ensureFieldMessage(input) {
    if (!input || !input.id) return null;
    let el = input.parentElement && input.parentElement.querySelector(`.field-message[data-field-for="${input.id}"]`);
    if (el) return el;
    el = document.createElement('div');
    el.className = 'field-message';
    el.setAttribute('data-field-for', input.id);
    el.setAttribute('aria-live', 'polite');
    input.parentElement && input.parentElement.appendChild(el);
    return el;
}
function setFieldMessage(input, message) {
    if (!input) return;
    const el = ensureFieldMessage(input);
    if (el) el.textContent = message || '';
    input.classList.toggle('is-invalid', !!message);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
}
function ensureFormStatus(form) {
    if (!form) return null;
    let s = form.querySelector('.form-status');
    if (s) return s;
    s = document.createElement('div');
    s.className = 'form-status';
    s.setAttribute('aria-live', 'polite');
    const actions = form.querySelector('.auth-actions');
    if (actions && actions.parentNode) actions.parentNode.insertBefore(s, actions.nextSibling);
    else form.appendChild(s);
    return s;
}
function setFormStatus(form, type, message) {
    const s = ensureFormStatus(form);
    if (!s) return;
    s.textContent = message || '';
    s.classList.remove('error', 'success', 'info');
    if (type) s.classList.add(type);
}
function setButtonLoading(button, isLoading, loadingText) {
    if (!button) return;
    if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent || '';
    button.disabled = !!isLoading;
    button.classList.toggle('is-loading', !!isLoading);
    button.textContent = isLoading ? loadingText : button.dataset.defaultLabel;
}
function updateSubmitState(form, validateFn) {
    if (!form || typeof validateFn !== 'function') return;
    const btn = form.querySelector('button[type="submit"]');
    if (!btn || btn.classList.contains('is-loading')) return;
    btn.disabled = !validateFn({ silent: true });
}
function validateEmailField(input) {
    const msg = isValidEmail(sanitizeEmailInput(input)) ? '' : 'Enter a valid email address';
    setFieldMessage(input, msg);
    return !msg;
}
function validatePasswordField(input) {
    if (!input) return true;
    const msg = String(input.value || '').length >= 8 ? '' : 'Password must be at least 8 characters';
    setFieldMessage(input, msg);
    return !msg;
}
function validateConfirmPasswordField(pwInput, cfInput) {
    if (!pwInput || !cfInput) return true;
    const msg = !cfInput.value ? 'Please confirm your password'
        : pwInput.value !== cfInput.value ? 'Passwords do not match' : '';
    setFieldMessage(cfInput, msg);
    return !msg;
}
function bindGoogleButton(container, clickHandler) {
    if (!container) return;
    container.innerHTML = '';
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'google-auth-btn';
    btn.innerHTML = '<span class="google-auth-icon" aria-hidden="true">G</span><span>Continue with Google</span>';
    btn.addEventListener('click', clickHandler);
    container.appendChild(btn);
    return btn;
}

// ─── Redirect helpers ─────────────────────────────────────────────────────────

function getCurrentStoredRole() {
    const user = safeParseJson(localStorage.getItem('user'));
    return String((user && user.role) || localStorage.getItem('role') || '').trim();
}
function redirectAfterAuth(user) {
    const role = String((user && user.role) || getCurrentStoredRole() || '').trim();
    if (role === 'admin') {
        window.location.replace('/admin/orders');
        return;
    }
    window.location.replace(getSafeNextDestination());
}
async function redirectIfAlreadyLoggedIn() {
    if (!document.getElementById('loginForm') && !document.getElementById('signupForm')) return;
    if (localStorage.getItem('token')) {
        redirectAfterAuth(safeParseJson(localStorage.getItem('user')));
    }
}

// ─── Login form ───────────────────────────────────────────────────────────────

function initLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const submitButton = form.querySelector('button[type="submit"]');
    const googleContainer = document.getElementById('googleSignIn');

    const validate = ({ silent } = {}) => {
        const emailOk = silent ? isValidEmail(sanitizeEmailInput(emailInput)) : validateEmailField(emailInput);
        const pwVal = String((passwordInput && passwordInput.value) || '');
        if (!silent) setFieldMessage(passwordInput, pwVal ? '' : 'Enter your password');
        return emailOk && !!pwVal;
    };

    emailInput && emailInput.addEventListener('input', () => { validateEmailField(emailInput); updateSubmitState(form, validate); });
    emailInput && emailInput.addEventListener('blur',  () => { validateEmailField(emailInput); updateSubmitState(form, validate); });
    passwordInput && passwordInput.addEventListener('input', () => { setFieldMessage(passwordInput, ''); updateSubmitState(form, validate); });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        setFormStatus(form, '', '');
        if (!validate()) { updateSubmitState(form, validate); return; }
        setButtonLoading(submitButton, true, 'Logging in...');
        const googleBtn = googleContainer && googleContainer.querySelector('button');
        if (googleBtn) googleBtn.disabled = true;
        try {
            const session = await apiLogin(sanitizeEmailInput(emailInput), passwordInput.value);
            const enriched = await flushPendingSignupProfile(session && session.user);
            setFormStatus(form, 'success', 'Login successful');
            redirectAfterAuth(enriched || (session && session.user));
        } catch (err) {
            setFormStatus(form, 'error', (err && err.message) || 'Login failed');
        } finally {
            setButtonLoading(submitButton, false);
            if (googleBtn) googleBtn.disabled = false;
            updateSubmitState(form, validate);
        }
    });

    bindGoogleButton(googleContainer, async () => {
        setFormStatus(form, '', '');
        setButtonLoading(submitButton, true, 'Waiting...');
        try {
            const idToken = await getGoogleIdToken();
            const session = await apiGoogleSession(idToken);
            redirectAfterAuth(session && session.user);
        } catch (err) {
            setFormStatus(form, 'error', (err && err.message) || 'Google login failed');
        } finally {
            setButtonLoading(submitButton, false);
            updateSubmitState(form, validate);
        }
    });

    const flash = consumeAuthFlash();
    if (flash && flash.message) setFormStatus(form, flash.type || 'info', flash.message);
    updateSubmitState(form, validate);
}

// ─── Signup form ──────────────────────────────────────────────────────────────

function initSignupForm() {
    const form = document.getElementById('signupForm');
    if (!form) return;
    const firstNameInput       = document.getElementById('firstName');
    const fatherNameInput      = document.getElementById('fatherName');
    const ageInput             = document.getElementById('age');
    const sexInput             = document.getElementById('sex');
    const emailInput           = document.getElementById('email');
    const phoneInput           = document.getElementById('phone');
    const passwordInput        = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const submitButton         = form.querySelector('button[type="submit"]');
    const googleContainer      = document.getElementById('googleSignIn');

    const validate = ({ silent } = {}) => {
        const emailOk = silent ? isValidEmail(sanitizeEmailInput(emailInput)) : validateEmailField(emailInput);
        const pwOk    = silent ? String(passwordInput.value || '').length >= 8 : validatePasswordField(passwordInput);
        const cfOk    = silent
            ? String(passwordInput.value || '') === String(confirmPasswordInput.value || '') && !!confirmPasswordInput.value
            : validateConfirmPasswordField(passwordInput, confirmPasswordInput);
        const nameOk  = !!String((firstNameInput && firstNameInput.value) || '').trim();
        if (!silent) setFieldMessage(firstNameInput, nameOk ? '' : 'Enter your first name');
        const ageVal  = Number((ageInput && ageInput.value) || 0);
        const ageOk   = Number.isFinite(ageVal) && ageVal >= 1 && ageVal <= 150;
        if (!silent) setFieldMessage(ageInput, ageOk ? '' : 'Enter a valid age (1–150)');
        const sexOk   = !!String((sexInput && sexInput.value) || '').trim();
        if (!silent) setFieldMessage(sexInput, sexOk ? '' : 'Select your sex');
        return emailOk && pwOk && cfOk && nameOk && ageOk && sexOk;
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        setFormStatus(form, '', '');
        if (!validate()) { updateSubmitState(form, validate); return; }
        setButtonLoading(submitButton, true, 'Creating account...');
        try {
            const email       = sanitizeEmailInput(emailInput);
            const displayName = [String(firstNameInput.value || '').trim(), String(fatherNameInput.value || '').trim()]
                .filter(Boolean).join(' ').trim();
            await apiRegister({
                fullName: displayName,
                fatherName: String(fatherNameInput.value || '').trim(),
                email, password: passwordInput.value,
                phone: String(phoneInput.value || '').trim(),
                age: String(ageInput.value || '').trim(),
                sex: String(sexInput.value || '').trim()
            });
            form.reset();
            const msg = 'Account created! Please log in.';
            setFormStatus(form, 'success', msg);
            setAuthFlash('success', msg);
        } catch (err) {
            setFormStatus(form, 'error', (err && err.message) || 'Signup failed');
        } finally {
            setButtonLoading(submitButton, false);
            updateSubmitState(form, validate);
        }
    });

    bindGoogleButton(googleContainer, async () => {
        setFormStatus(form, '', '');
        setButtonLoading(submitButton, true, 'Waiting...');
        try {
            const idToken = await getGoogleIdToken();
            const session = await apiGoogleSession(idToken);
            redirectAfterAuth(session && session.user);
        } catch (err) {
            setFormStatus(form, 'error', (err && err.message) || 'Google signup failed');
        } finally {
            setButtonLoading(submitButton, false);
            updateSubmitState(form, validate);
        }
    });

    updateSubmitState(form, validate);
}

// ─── Forgot-password form ─────────────────────────────────────────────────────

function initForgotPasswordForm() {
    const form = document.getElementById('forgotForm');
    if (!form) return;
    const emailInput   = document.getElementById('email');
    const submitButton = form.querySelector('button[type="submit"]');

    const validate = ({ silent } = {}) =>
        silent ? isValidEmail(sanitizeEmailInput(emailInput)) : validateEmailField(emailInput);

    emailInput && emailInput.addEventListener('input', () => { validateEmailField(emailInput); updateSubmitState(form, validate); });
    emailInput && emailInput.addEventListener('blur',  () => { validateEmailField(emailInput); updateSubmitState(form, validate); });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        setFormStatus(form, '', '');
        if (!validate()) { updateSubmitState(form, validate); return; }
        setButtonLoading(submitButton, true, 'Sending...');
        try {
            const data = await apiForgotPassword(sanitizeEmailInput(emailInput));
            setFormStatus(form, 'success', (data && data.msg) || 'OTP sent to your email');
        } catch (err) {
            setFormStatus(form, 'error', (err && err.message) || 'Failed to send reset email');
        } finally {
            setButtonLoading(submitButton, false);
            updateSubmitState(form, validate);
        }
    });

    const flash = consumeAuthFlash();
    if (flash && flash.message) setFormStatus(form, flash.type || 'info', flash.message);
    updateSubmitState(form, validate);
}

// ─── Logout ───────────────────────────────────────────────────────────────────

async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (_) {}
    try {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('user');
        localStorage.removeItem('loginTime');
    } catch (_) {}
    window.location.href = '/';
}
window.logout = logout;

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async function () {
    preserveNextAcrossAuthLinks();
    initLoginForm();
    initSignupForm();
    initForgotPasswordForm();
    await redirectIfAlreadyLoggedIn();
});
})();
