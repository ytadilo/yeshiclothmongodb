const YESHI_AUTH_FLASH_KEY = 'yeshi_auth_flash';
const YESHI_PENDING_SIGNUP_PROFILE_KEY = 'yeshi_pending_signup_profile';
let yeshiFirebaseBridgePromise = null;

function safeParseJson(value) {
    try {
        return value ? JSON.parse(value) : null;
    } catch (_) {
        return null;
    }
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

    next = next.replace('/user/contact.html', '/user/mychat.html');
    return next.startsWith('/') ? next : fallback;
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

function setAuthFlash(type, message) {
    try {
        sessionStorage.setItem(YESHI_AUTH_FLASH_KEY, JSON.stringify({ type, message }));
    } catch (_) {
        // Ignore storage failures.
    }
}

function consumeAuthFlash() {
    try {
        const raw = sessionStorage.getItem(YESHI_AUTH_FLASH_KEY);
        sessionStorage.removeItem(YESHI_AUTH_FLASH_KEY);
        return safeParseJson(raw);
    } catch (_) {
        return null;
    }
}

function storePendingSignupProfile(profile) {
    try {
        localStorage.setItem(YESHI_PENDING_SIGNUP_PROFILE_KEY, JSON.stringify({
            ...profile,
            savedAt: Date.now()
        }));
    } catch (_) {
        // Ignore storage failures.
    }
}

function readPendingSignupProfile(email) {
    try {
        const raw = localStorage.getItem(YESHI_PENDING_SIGNUP_PROFILE_KEY);
        if (!raw) return null;
        const parsed = safeParseJson(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (String(parsed.email || '').trim().toLowerCase() !== String(email || '').trim().toLowerCase()) {
            return null;
        }
        return parsed;
    } catch (_) {
        return null;
    }
}

function sanitizeEmailInput(input) {
    if (!input) return '';
    const sanitized = String(input.value || '').replace(/\s+/g, '').trim().toLowerCase();
    if (input.value !== sanitized) {
        input.value = sanitized;
    }
    return sanitized;
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function ensureFieldMessage(input) {
    if (!input || !input.id) return null;
    let fieldMessage = input.parentElement && input.parentElement.querySelector(`.field-message[data-field-for="${input.id}"]`);
    if (fieldMessage) return fieldMessage;

    fieldMessage = document.createElement('div');
    fieldMessage.className = 'field-message';
    fieldMessage.setAttribute('data-field-for', input.id);
    fieldMessage.setAttribute('aria-live', 'polite');
    input.parentElement && input.parentElement.appendChild(fieldMessage);
    return fieldMessage;
}

function setFieldMessage(input, message) {
    if (!input) return;
    const fieldMessage = ensureFieldMessage(input);
    if (fieldMessage) {
        fieldMessage.textContent = message || '';
    }
    input.classList.toggle('is-invalid', !!message);
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function ensureFormStatus(form) {
    if (!form) return null;
    let status = form.querySelector('.form-status');
    if (status) return status;

    status = document.createElement('div');
    status.className = 'form-status';
    status.setAttribute('aria-live', 'polite');
    const actions = form.querySelector('.auth-actions');
    if (actions && actions.parentNode) {
        actions.parentNode.insertBefore(status, actions.nextSibling);
    } else {
        form.appendChild(status);
    }
    return status;
}

function setFormStatus(form, type, message) {
    const status = ensureFormStatus(form);
    if (!status) return;
    status.textContent = message || '';
    status.classList.remove('error', 'success', 'info');
    if (type) {
        status.classList.add(type);
    }
}

function setButtonLoading(button, isLoading, loadingText) {
    if (!button) return;
    if (!button.dataset.defaultLabel) {
        button.dataset.defaultLabel = button.textContent || '';
    }
    button.disabled = !!isLoading;
    button.classList.toggle('is-loading', !!isLoading);
    button.textContent = isLoading ? loadingText : button.dataset.defaultLabel;
}

function getFirebaseBridge() {
    if (window.YeshiFirebaseAuth) {
        return Promise.resolve(window.YeshiFirebaseAuth.whenReady()).then(() => window.YeshiFirebaseAuth);
    }

    if (yeshiFirebaseBridgePromise) {
        return yeshiFirebaseBridgePromise;
    }

    yeshiFirebaseBridgePromise = new Promise((resolve, reject) => {
        const existingScript = document.querySelector('script[data-yeshi-firebase-auth="1"]');
        if (existingScript) {
            const waitForBridge = () => {
                if (window.YeshiFirebaseAuth) {
                    window.YeshiFirebaseAuth.whenReady().then(() => resolve(window.YeshiFirebaseAuth)).catch(reject);
                    return;
                }
                window.setTimeout(waitForBridge, 50);
            };
            waitForBridge();
            return;
        }

        const script = document.createElement('script');
        script.src = '/js/firebase-auth.js?v=20260413';
        script.async = true;
        script.setAttribute('data-yeshi-firebase-auth', '1');
        script.onload = () => {
            if (!window.YeshiFirebaseAuth) {
                reject(new Error('Firebase auth bridge failed to initialize'));
                return;
            }
            window.YeshiFirebaseAuth.whenReady().then(() => resolve(window.YeshiFirebaseAuth)).catch(reject);
        };
        script.onerror = () => reject(new Error('Failed to load Firebase auth bridge'));
        document.head.appendChild(script);
    });

    return yeshiFirebaseBridgePromise;
}

function getCurrentStoredRole() {
    const user = safeParseJson(localStorage.getItem('user'));
    return String(user && user.role || localStorage.getItem('role') || '').trim();
}

function redirectAfterAuth(user) {
    const role = String(user && user.role || getCurrentStoredRole() || '').trim();
    if (role === 'admin') {
        window.location.replace('/admin');
        return;
    }
    window.location.replace(getSafeNextDestination());
}

async function flushPendingSignupProfile(user) {
    const pendingProfile = readPendingSignupProfile(user && user.email);
    if (!pendingProfile) return user;

    const token = String(localStorage.getItem('token') || '').trim();
    if (!token) return user;

    const patch = {
        fullName: String(pendingProfile.fullName || '').trim(),
        fatherName: String(pendingProfile.fatherName || '').trim(),
        phone: String(pendingProfile.phone || '').trim(),
        age: String(pendingProfile.age || '').trim(),
        sex: String(pendingProfile.sex || '').trim()
    };

    try {
        const response = await fetch('/api/auth/me', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify(patch)
        });
        const payload = await response.text();
        const data = safeParseJson(payload) || {};
        if (!response.ok || !data || !data.user) {
            return user;
        }

        localStorage.setItem('user', JSON.stringify(data.user));
        localStorage.removeItem(YESHI_PENDING_SIGNUP_PROFILE_KEY);
        return data.user;
    } catch (_) {
        return user;
    }
}

function validateEmailField(input) {
    const value = sanitizeEmailInput(input);
    const message = isValidEmail(value) ? '' : 'Enter a valid email address';
    setFieldMessage(input, message);
    return !message;
}

function validatePasswordField(input) {
    if (!input) return true;
    const value = String(input.value || '');
    const message = value.length >= 8 ? '' : 'Password must be at least 8 characters';
    setFieldMessage(input, message);
    return !message;
}

function validateConfirmPasswordField(passwordInput, confirmInput) {
    if (!passwordInput || !confirmInput) return true;
    const password = String(passwordInput.value || '');
    const confirm = String(confirmInput.value || '');
    let message = '';
    if (!confirm) {
        message = 'Please confirm your password';
    } else if (password !== confirm) {
        message = 'Passwords do not match';
    }
    setFieldMessage(confirmInput, message);
    return !message;
}

function updateSubmitState(form, validateFn) {
    if (!form || typeof validateFn !== 'function') return;
    const submitButton = form.querySelector('button[type="submit"]');
    if (!submitButton || submitButton.classList.contains('is-loading')) return;
    submitButton.disabled = !validateFn({ silent: true });
}

async function redirectIfAlreadyLoggedIn() {
    const loginFormEl = document.getElementById('loginForm');
    const signupFormEl = document.getElementById('signupForm');
    if (!loginFormEl && !signupFormEl) return;

    try {
        if (window.YeshiAuth && typeof window.YeshiAuth.resolveSession === 'function') {
            await window.YeshiAuth.resolveSession().catch(() => null);
        } else {
            const bridge = await getFirebaseBridge();
            await bridge.ensureAppSession().catch(() => null);
        }
        if (localStorage.getItem('token')) {
            redirectAfterAuth(safeParseJson(localStorage.getItem('user')));
        }
    } catch (_) {
        // Allow the user to continue if Firebase is not configured yet.
    }
}

function bindGoogleButton(container, clickHandler) {
    if (!container) return;
    container.innerHTML = '';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'google-auth-btn';
    button.innerHTML = '<span class="google-auth-icon" aria-hidden="true">G</span><span>Continue with Google</span>';
    button.addEventListener('click', clickHandler);
    container.appendChild(button);
    return button;
}

function initLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const submitButton = form.querySelector('button[type="submit"]');
    const googleContainer = document.getElementById('googleSignIn');

    const validate = ({ silent } = {}) => {
        const emailValid = silent ? isValidEmail(sanitizeEmailInput(emailInput)) : validateEmailField(emailInput);
        const passwordValue = String(passwordInput && passwordInput.value || '');
        if (!silent) {
            setFieldMessage(passwordInput, passwordValue ? '' : 'Enter your password');
        }
        return emailValid && !!passwordValue;
    };

    const handleLiveValidation = () => updateSubmitState(form, validate);
    emailInput && emailInput.addEventListener('input', () => {
        validateEmailField(emailInput);
        handleLiveValidation();
    });
    emailInput && emailInput.addEventListener('blur', () => {
        validateEmailField(emailInput);
        handleLiveValidation();
    });
    passwordInput && passwordInput.addEventListener('input', () => {
        setFieldMessage(passwordInput, '');
        handleLiveValidation();
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        setFormStatus(form, '', '');

        if (!validate()) {
            updateSubmitState(form, validate);
            return;
        }

        setButtonLoading(submitButton, true, 'Logging in...');
        if (googleButton) googleButton.disabled = true;

        try {
            const bridge = await getFirebaseBridge();
            const email = sanitizeEmailInput(emailInput);
            const methods = await bridge.detectSignInMethods(email);
            if (methods.includes('google.com') && !methods.includes('password')) {
                throw new Error('This email uses Google Sign-In. Please continue with Google.');
            }

            const session = await bridge.loginWithEmail({
                email,
                password: passwordInput.value
            });

            const enrichedUser = await flushPendingSignupProfile(session && session.user);
            setFormStatus(form, 'success', 'Login successful');
            redirectAfterAuth(enrichedUser || (session && session.user));
        } catch (error) {
            const bridge = window.YeshiFirebaseAuth;
            setFormStatus(form, 'error', bridge ? bridge.getFriendlyError(error) : (error && error.message) || 'Login failed');
        } finally {
            setButtonLoading(submitButton, false);
            if (googleButton) googleButton.disabled = false;
            updateSubmitState(form, validate);
        }
    });

    const googleButton = bindGoogleButton(googleContainer, async () => {
        setFormStatus(form, '', '');
        setButtonLoading(submitButton, true, 'Waiting...');
        if (googleButton) googleButton.disabled = true;

        try {
            const bridge = await getFirebaseBridge();
            const session = await bridge.loginWithGoogle();
            redirectAfterAuth(session && session.user);
        } catch (error) {
            const bridge = window.YeshiFirebaseAuth;
            setFormStatus(form, 'error', bridge ? bridge.getFriendlyError(error) : (error && error.message) || 'Google login failed');
        } finally {
            setButtonLoading(submitButton, false);
            if (googleButton) googleButton.disabled = false;
            updateSubmitState(form, validate);
        }
    });

    const flash = consumeAuthFlash();
    if (flash && flash.message) {
        setFormStatus(form, flash.type || 'info', flash.message);
    }

    updateSubmitState(form, validate);
}

function initSignupForm() {
    const form = document.getElementById('signupForm');
    if (!form) return;

    const firstNameInput = document.getElementById('firstName');
    const fatherNameInput = document.getElementById('fatherName');
    const ageInput = document.getElementById('age');
    const sexInput = document.getElementById('sex');
    const emailInput = document.getElementById('email');
    const phoneInput = document.getElementById('phone');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const submitButton = form.querySelector('button[type="submit"]');
    const googleContainer = document.getElementById('googleSignIn');

    const validate = ({ silent } = {}) => {
        const emailValid = silent ? isValidEmail(sanitizeEmailInput(emailInput)) : validateEmailField(emailInput);
        const passwordValid = silent ? String(passwordInput.value || '').length >= 8 : validatePasswordField(passwordInput);
        const confirmValid = silent
            ? String(passwordInput.value || '') === String(confirmPasswordInput.value || '') && !!String(confirmPasswordInput.value || '')
            : validateConfirmPasswordField(passwordInput, confirmPasswordInput);

        if (!silent && !String(firstNameInput && firstNameInput.value || '').trim()) {
            setFieldMessage(firstNameInput, 'Enter your first name');
        } else if (!silent) {
            setFieldMessage(firstNameInput, '');
        }

        const ageValue = Number(ageInput && ageInput.value || 0);
        if (!silent) {
            setFieldMessage(ageInput, ageValue >= 1 && ageValue <= 150 ? '' : 'Enter a valid age');
            setFieldMessage(sexInput, String(sexInput && sexInput.value || '').trim() ? '' : 'Select your sex');
            setFieldMessage(phoneInput, String(phoneInput && phoneInput.value || '').trim() ? '' : 'Enter your phone number');
        }

        return (
            !!String(firstNameInput && firstNameInput.value || '').trim() &&
            ageValue >= 1 &&
            ageValue <= 150 &&
            !!String(sexInput && sexInput.value || '').trim() &&
            !!String(phoneInput && phoneInput.value || '').trim() &&
            emailValid &&
            passwordValid &&
            confirmValid
        );
    };

    [
        firstNameInput,
        fatherNameInput,
        ageInput,
        sexInput,
        emailInput,
        phoneInput,
        passwordInput,
        confirmPasswordInput
    ].forEach((input) => {
        if (!input) return;
        input.addEventListener('input', () => {
            if (input === emailInput) validateEmailField(emailInput);
            if (input === passwordInput) validatePasswordField(passwordInput);
            if (input === confirmPasswordInput || input === passwordInput) {
                validateConfirmPasswordField(passwordInput, confirmPasswordInput);
            }
            if (input !== emailInput && input !== passwordInput && input !== confirmPasswordInput) {
                setFieldMessage(input, '');
            }
            updateSubmitState(form, validate);
        });
        input.addEventListener('blur', () => {
            validate();
            updateSubmitState(form, validate);
        });
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        setFormStatus(form, '', '');

        if (!validate()) {
            updateSubmitState(form, validate);
            return;
        }

        setButtonLoading(submitButton, true, 'Creating account...');
        if (googleButton) googleButton.disabled = true;

        try {
            const bridge = await getFirebaseBridge();
            const email = sanitizeEmailInput(emailInput);
            const methods = await bridge.detectSignInMethods(email);
            if (methods.includes('google.com') && !methods.includes('password')) {
                throw new Error('This email already uses Google Sign-In. Please continue with Google.');
            }
            if (methods.includes('password')) {
                throw new Error('An account with this email already exists.');
            }

            const displayName = [String(firstNameInput.value || '').trim(), String(fatherNameInput.value || '').trim()]
                .filter(Boolean)
                .join(' ')
                .trim();

            storePendingSignupProfile({
                email,
                fullName: displayName,
                fatherName: String(fatherNameInput.value || '').trim(),
                phone: String(phoneInput.value || '').trim(),
                age: String(ageInput.value || '').trim(),
                sex: String(sexInput.value || '').trim()
            });

            const result = await bridge.registerWithEmail({
                email,
                password: passwordInput.value,
                displayName
            });

            form.reset();
            setFormStatus(form, 'success', result.message);
            setAuthFlash('success', result.message);
        } catch (error) {
            const bridge = window.YeshiFirebaseAuth;
            setFormStatus(form, 'error', bridge ? bridge.getFriendlyError(error) : (error && error.message) || 'Signup failed');
        } finally {
            setButtonLoading(submitButton, false);
            if (googleButton) googleButton.disabled = false;
            updateSubmitState(form, validate);
        }
    });

    const googleButton = bindGoogleButton(googleContainer, async () => {
        setFormStatus(form, '', '');
        setButtonLoading(submitButton, true, 'Waiting...');
        if (googleButton) googleButton.disabled = true;

        try {
            const bridge = await getFirebaseBridge();
            const session = await bridge.loginWithGoogle();
            redirectAfterAuth(session && session.user);
        } catch (error) {
            const bridge = window.YeshiFirebaseAuth;
            setFormStatus(form, 'error', bridge ? bridge.getFriendlyError(error) : (error && error.message) || 'Google signup failed');
        } finally {
            setButtonLoading(submitButton, false);
            if (googleButton) googleButton.disabled = false;
            updateSubmitState(form, validate);
        }
    });

    updateSubmitState(form, validate);
}

function initForgotPasswordForm() {
    const form = document.getElementById('forgotForm');
    if (!form) return;

    const emailInput = document.getElementById('email');
    const submitButton = form.querySelector('button[type="submit"]');

    const validate = ({ silent } = {}) => {
        return silent ? isValidEmail(sanitizeEmailInput(emailInput)) : validateEmailField(emailInput);
    };

    emailInput && emailInput.addEventListener('input', () => {
        validateEmailField(emailInput);
        updateSubmitState(form, validate);
    });
    emailInput && emailInput.addEventListener('blur', () => {
        validateEmailField(emailInput);
        updateSubmitState(form, validate);
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        setFormStatus(form, '', '');

        if (!validate()) {
            updateSubmitState(form, validate);
            return;
        }

        setButtonLoading(submitButton, true, 'Sending...');

        try {
            const bridge = await getFirebaseBridge();
            const email = sanitizeEmailInput(emailInput);
            const methods = await bridge.detectSignInMethods(email);
            if (!methods.length) {
                const notFoundError = new Error('No account was found for that email');
                notFoundError.code = 'yeshi/user-not-found';
                throw notFoundError;
            }
            if (methods.includes('google.com') && !methods.includes('password')) {
                throw new Error('This account uses Google Sign-In. Please continue with Google.');
            }

            const result = await bridge.sendPasswordReset({ email, knownMethods: methods });
            setFormStatus(form, 'success', result.message);
        } catch (error) {
            const bridge = window.YeshiFirebaseAuth;
            setFormStatus(form, 'error', bridge ? bridge.getFriendlyError(error) : (error && error.message) || 'Failed to send reset email');
        } finally {
            setButtonLoading(submitButton, false);
            updateSubmitState(form, validate);
        }
    });

    const flash = consumeAuthFlash();
    if (flash && flash.message) {
        setFormStatus(form, flash.type || 'info', flash.message);
    }

    updateSubmitState(form, validate);
}

async function logout() {
    const storedUser = safeParseJson(localStorage.getItem('user'));
    const storedRole = (storedUser && storedUser.role) || localStorage.getItem('role');

    if (window.YeshiAuth && typeof window.YeshiAuth.performLogout === 'function') {
        await window.YeshiAuth.performLogout(storedRole === 'admin' ? '/admin/login' : '/auth/login');
        return;
    }

    try {
        const bridge = await getFirebaseBridge();
        await bridge.signOutUser();
    } catch (_) {
        try {
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            localStorage.removeItem('user');
            localStorage.removeItem('loginTime');
            localStorage.removeItem('yeshi_firebase_uid');
            localStorage.removeItem('yeshi_firebase_email');
            localStorage.removeItem('yeshi_firebase_provider');
        } catch (_) {
            // Ignore storage failures.
        }
    }

    window.location.href = storedRole === 'admin' ? '/admin/login' : '/auth/login';
}

window.logout = logout;

document.addEventListener('DOMContentLoaded', async function () {
    preserveNextAcrossAuthLinks();
    initLoginForm();
    initSignupForm();
    initForgotPasswordForm();
    await redirectIfAlreadyLoggedIn();
});
