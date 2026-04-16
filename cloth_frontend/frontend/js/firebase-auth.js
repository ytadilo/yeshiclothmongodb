(function (window) {
    const FIREBASE_APP_URL = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
    const FIREBASE_AUTH_URL = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
    const FIREBASE_UID_KEY = 'yeshi_firebase_uid';
    const FIREBASE_EMAIL_KEY = 'yeshi_firebase_email';
    const FIREBASE_PROVIDER_KEY = 'yeshi_firebase_provider';
    const USER_SCOPED_LOCAL_STORAGE_KEYS = [
        'token',
        'role',
        'user',
        'loginTime',
        FIREBASE_UID_KEY,
        FIREBASE_EMAIL_KEY,
        FIREBASE_PROVIDER_KEY,
        'yeshi_profile_avatar',
        'yeshi_profile_shipping',
        'yeshi_saved_shipping_addresses',
        'yeshi_saved_measurements',
        'yeshi_pending_signup_profile'
    ];
    const USER_SCOPED_SESSION_STORAGE_KEYS = [
        'yeshi_auth_flash'
    ];
    const FIREBASE_CONFIG_CACHE_KEY = 'yeshi_firebase_public_config_cache';
    const FIREBASE_CONFIG_CACHE_TTL_MS = 60 * 60 * 1000;
    const FIREBASE_SESSION_SYNC_COOLDOWN_MS = 30 * 1000;

    const state = {
        readyPromise: null,
        app: null,
        auth: null,
        authModule: null,
        config: null,
        currentUser: null,
        syncPromise: null,
        manualAction: false,
        lastSessionSyncAt: 0
    };

    function safeParseJson(value) {
        try {
            return value ? JSON.parse(value) : null;
        } catch (_) {
            return null;
        }
    }

    function readJsonSafe(raw) {
        const parsed = safeParseJson(raw);
        if (parsed && typeof parsed === 'object') return parsed;
        const text = String(raw || '').trim();
        return text ? { msg: text } : {};
    }

    async function readResponsePayload(res) {
        return readJsonSafe(await res.text());
    }

    function setStorageValue(key, value) {
        try {
            if (!value) {
                localStorage.removeItem(key);
                return;
            }
            localStorage.setItem(key, value);
        } catch (_) {
            // Ignore storage failures.
        }
    }

    function readCachedFirebaseConfig() {
        const raw = safeParseJson(localStorage.getItem(FIREBASE_CONFIG_CACHE_KEY));
        if (!raw || typeof raw !== 'object') return null;
        const cachedAt = Number(raw.cachedAt || 0);
        const config = raw.config && typeof raw.config === 'object' ? raw.config : null;
        if (!config || !cachedAt) return null;
        if ((Date.now() - cachedAt) > FIREBASE_CONFIG_CACHE_TTL_MS) return null;
        return config;
    }

    function writeCachedFirebaseConfig(config) {
        try {
            localStorage.setItem(FIREBASE_CONFIG_CACHE_KEY, JSON.stringify({
                cachedAt: Date.now(),
                config
            }));
        } catch (_) {
            // Ignore storage failures.
        }
    }

    function readCurrentAppSession() {
        const token = String(localStorage.getItem('token') || '').trim();
        const user = safeParseJson(localStorage.getItem('user'));
        if (!token || !user || typeof user !== 'object') return null;
        return { token, user };
    }

    function normalizeEmail(value) {
        return String(value || '').trim().toLowerCase();
    }

    function clearUserScopedStorage() {
        try {
            USER_SCOPED_LOCAL_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
        } catch (_) {
            // Ignore localStorage cleanup errors.
        }

        try {
            USER_SCOPED_SESSION_STORAGE_KEYS.forEach((key) => sessionStorage.removeItem(key));
        } catch (_) {
            // Ignore sessionStorage cleanup errors.
        }
    }

    function setFirebaseHint(user) {
        if (!user) {
            setStorageValue(FIREBASE_UID_KEY, '');
            setStorageValue(FIREBASE_EMAIL_KEY, '');
            setStorageValue(FIREBASE_PROVIDER_KEY, '');
            return;
        }

        setStorageValue(FIREBASE_UID_KEY, String(user.uid || '').trim());
        setStorageValue(FIREBASE_EMAIL_KEY, String(user.email || '').trim().toLowerCase());
        setStorageValue(FIREBASE_PROVIDER_KEY, getPrimaryProviderId(user));
    }

    function hasFirebaseHint() {
        try {
            return !!String(localStorage.getItem(FIREBASE_UID_KEY) || '').trim();
        } catch (_) {
            return false;
        }
    }

    function clearLocalSessionOnly() {
        clearUserScopedStorage();

        try {
            window.dispatchEvent(new CustomEvent('yeshi:auth-state-changed'));
        } catch (_) {
            // Ignore CustomEvent failures.
        }
    }

    function clearAppSession() {
        if (window.YeshiAuth && typeof window.YeshiAuth.clearSession === 'function') {
            window.YeshiAuth.clearSession({ preserveReady: true });
            return;
        }
        clearLocalSessionOnly();
    }

    function setAppSession(token, user) {
        if (window.YeshiAuth && typeof window.YeshiAuth.setSession === 'function') {
            window.YeshiAuth.setSession(token, user);
            return;
        }

        try {
            localStorage.setItem('token', String(token || '').trim());
            localStorage.setItem('role', String(user && user.role || '').trim());
            localStorage.setItem('user', JSON.stringify(user || {}));
            if (!localStorage.getItem('loginTime')) {
                localStorage.setItem('loginTime', Date.now().toString());
            }
        } catch (_) {
            // Ignore storage failures.
        }

        try {
            window.dispatchEvent(new CustomEvent('yeshi:auth-state-changed'));
        } catch (_) {
            // Ignore CustomEvent failures.
        }
    }

    function getProviderIds(user) {
        const providerData = Array.isArray(user && user.providerData) ? user.providerData : [];
        const ids = providerData
            .map((provider) => String(provider && provider.providerId || '').trim())
            .filter(Boolean);

        if (!ids.length && user && user.providerId) {
            ids.push(String(user.providerId).trim());
        }

        return Array.from(new Set(ids));
    }

    function getPrimaryProviderId(user) {
        const providerIds = getProviderIds(user);
        if (providerIds.includes('google.com') && !providerIds.includes('password')) {
            return 'google.com';
        }
        if (providerIds.includes('password')) {
            return 'password';
        }
        return providerIds[0] || '';
    }

    function getFriendlyError(error) {
        const code = String(error && error.code || '').trim();
        const rawMessage = String(error && error.message || '').trim();

        if (code === 'auth/email-not-verified') {
            return 'Please verify your email first';
        }
        if (code === 'yeshi/user-not-found') {
            return 'No account was found for that email';
        }
        if (code === 'auth/email-change-password-required') {
            return 'Enter your current password to change your email';
        }
        if (code === 'auth/invalid-email') {
            return 'Enter a valid email address';
        }
        if (code === 'auth/missing-password') {
            return 'Enter your password';
        }
        if (code === 'auth/weak-password') {
            return 'Password must be at least 8 characters';
        }
        if (code === 'auth/email-already-in-use') {
            return 'An account with this email already exists';
        }
        if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
            return 'Invalid email or password';
        }
        if (code === 'auth/popup-closed-by-user') {
            return 'Google sign-in was cancelled';
        }
        if (code === 'auth/account-exists-with-different-credential') {
            return 'This email already uses another sign-in method';
        }
        if (code === 'auth/requires-recent-login') {
            return 'Please sign in again to complete this action';
        }
        if (code === 'auth/too-many-requests') {
            return 'Too many attempts. Please try again later';
        }
        if (rawMessage) {
            return rawMessage;
        }
        return 'Something went wrong. Please try again.';
    }

    async function fetchFirebaseConfig() {
        if (state.config) return state.config;

        const inlineConfig = window.YESHI_FIREBASE_CONFIG;
        if (inlineConfig && typeof inlineConfig === 'object') {
            state.config = { ...inlineConfig };
            return state.config;
        }

        const cachedConfig = readCachedFirebaseConfig();
        if (cachedConfig) {
            state.config = { ...cachedConfig };
            return state.config;
        }

        const response = await fetch('/api/auth/firebase/config', {
            method: 'GET',
            credentials: 'same-origin'
        });
        const data = await readResponsePayload(response);

        if (!response.ok) {
            if (response.status === 429 && cachedConfig) {
                state.config = { ...cachedConfig };
                return state.config;
            }
            throw new Error((data && data.msg) || 'Firebase configuration is missing');
        }

        state.config = data;
        writeCachedFirebaseConfig(data);
        return state.config;
    }

    async function initializeBridge() {
        const [appModule, authModule, firebaseConfig] = await Promise.all([
            import(FIREBASE_APP_URL),
            import(FIREBASE_AUTH_URL),
            fetchFirebaseConfig()
        ]);

        const app = appModule.initializeApp(firebaseConfig);
        const auth = authModule.getAuth(app);
        await authModule.setPersistence(auth, authModule.browserLocalPersistence);

        state.app = app;
        state.auth = auth;
        state.authModule = authModule;
        state.currentUser = auth.currentUser;

        authModule.onAuthStateChanged(auth, async (user) => {
            state.currentUser = user;
            setFirebaseHint(user);

            if (!user) {
                clearAppSession();
                return;
            }

            if (state.manualAction) {
                return;
            }

            try {
                await ensureAppSession();
            } catch (_) {
                // Session sync failures should not break page rendering.
            }
        });

        try {
            window.dispatchEvent(new CustomEvent('yeshi:firebase-auth-ready'));
        } catch (_) {
            // Ignore CustomEvent failures.
        }

        return true;
    }

    function whenReady() {
        if (!state.readyPromise) {
            state.readyPromise = initializeBridge();
        }
        return state.readyPromise;
    }

    async function ensureCurrentUserFresh() {
        await whenReady();
        const auth = state.auth;
        const authModule = state.authModule;

        if (!auth || !auth.currentUser) {
            return null;
        }

        try {
            await authModule.reload(auth.currentUser);
        } catch (_) {
            // Ignore reload failures and use the cached auth user.
        }

        state.currentUser = auth.currentUser;
        setFirebaseHint(auth.currentUser);
        return auth.currentUser;
    }

    async function ensureAppSession(options = {}) {
        await whenReady();

        if (state.syncPromise && !options.force) {
            return state.syncPromise;
        }

        state.syncPromise = (async () => {
            const auth = state.auth;
            const authModule = state.authModule;
            let user = auth && auth.currentUser ? auth.currentUser : null;
            const currentSession = readCurrentAppSession();

            if (!options.force && currentSession && (Date.now() - Number(state.lastSessionSyncAt || 0)) < FIREBASE_SESSION_SYNC_COOLDOWN_MS) {
                return {
                    ok: true,
                    token: currentSession.token,
                    user: currentSession.user,
                    cached: true
                };
            }

            if (!user) {
                setFirebaseHint(null);
                clearAppSession();
                return { ok: false, reason: 'signed-out' };
            }

            if (!options.skipReload) {
                user = await ensureCurrentUserFresh();
            }

            if (!user) {
                setFirebaseHint(null);
                clearAppSession();
                return { ok: false, reason: 'signed-out' };
            }

            const providerIds = getProviderIds(user);
            const isGoogleUser = providerIds.includes('google.com') && !providerIds.includes('password');
            if (!isGoogleUser && !user.emailVerified) {
                clearAppSession();
                await authModule.signOut(auth).catch(() => {});
                setFirebaseHint(null);
                const verificationError = new Error('Please verify your email first');
                verificationError.code = 'auth/email-not-verified';
                throw verificationError;
            }

            const idToken = await user.getIdToken(!!options.forceIdTokenRefresh);
            const firebaseEmail = normalizeEmail(user.email);
            const response = await fetch('/api/auth/firebase/session', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken })
            });
            const payload = await readResponsePayload(response);

            if (!response.ok) {
                if (response.status === 429 && currentSession) {
                    state.lastSessionSyncAt = Date.now();
                    return {
                        ok: true,
                        token: currentSession.token,
                        user: currentSession.user,
                        cached: true,
                        rateLimited: true
                    };
                }
                const currentSessionEmail = normalizeEmail(currentSession && currentSession.user && currentSession.user.email);
                const canReuseCurrentSession = currentSession
                    && currentSession.token
                    && firebaseEmail
                    && currentSessionEmail
                    && currentSessionEmail === firebaseEmail;

                if (canReuseCurrentSession && (response.status === 401 || response.status === 403 || response.status >= 500)) {
                    state.lastSessionSyncAt = Date.now();
                    return {
                        ok: true,
                        token: currentSession.token,
                        user: currentSession.user,
                        cached: true,
                        degraded: true
                    };
                }

                if (response.status === 401 || response.status === 403) {
                    clearAppSession();
                    await authModule.signOut(auth).catch(() => {});
                    setFirebaseHint(null);
                }
                const syncError = new Error((payload && payload.msg) || 'Failed to sync session');
                syncError.code = (payload && payload.code) || '';
                throw syncError;
            }

            if (!payload || !payload.token || !payload.user) {
                throw new Error('Incomplete session response');
            }

            setAppSession(payload.token, payload.user);
            state.lastSessionSyncAt = Date.now();
            return {
                ok: true,
                token: payload.token,
                user: payload.user
            };
        })();

        try {
            return await state.syncPromise;
        } finally {
            state.syncPromise = null;
        }
    }

    async function detectSignInMethods(email) {
        await whenReady();
        const authModule = state.authModule;
        if (typeof authModule.fetchSignInMethodsForEmail !== 'function') {
            return [];
        }

        try {
            const methods = await authModule.fetchSignInMethodsForEmail(state.auth, String(email || '').trim());
            return Array.isArray(methods) ? methods : [];
        } catch (_) {
            return [];
        }
    }

    async function registerWithEmail(payload) {
        await whenReady();
        state.manualAction = true;

        try {
            const email = String(payload && payload.email || '').trim();
            const password = String(payload && payload.password || '');
            const displayName = String(payload && payload.displayName || '').trim();
            const credential = await state.authModule.createUserWithEmailAndPassword(state.auth, email, password);

            if (displayName) {
                await state.authModule.updateProfile(credential.user, { displayName }).catch(() => {});
            }

            await state.authModule.sendEmailVerification(credential.user);
            await state.authModule.signOut(state.auth);
            setFirebaseHint(null);
            clearAppSession();

            return {
                ok: true,
                message: 'Verification email sent. Please verify your email before login'
            };
        } catch (error) {
            await state.authModule.signOut(state.auth).catch(() => {});
            setFirebaseHint(null);
            clearAppSession();
            throw error;
        } finally {
            state.manualAction = false;
        }
    }

    async function loginWithEmail(payload) {
        await whenReady();
        state.manualAction = true;

        try {
            const email = String(payload && payload.email || '').trim();
            const password = String(payload && payload.password || '');
            const credential = await state.authModule.signInWithEmailAndPassword(state.auth, email, password);
            await state.authModule.reload(credential.user).catch(() => {});

            if (!credential.user.emailVerified) {
                await state.authModule.signOut(state.auth).catch(() => {});
                setFirebaseHint(null);
                clearAppSession();
                const verificationError = new Error('Please verify your email first');
                verificationError.code = 'auth/email-not-verified';
                throw verificationError;
            }

            return ensureAppSession({
                force: true,
                forceIdTokenRefresh: true,
                skipReload: true
            });
        } finally {
            state.manualAction = false;
        }
    }

    async function loginWithGoogle() {
        await whenReady();
        state.manualAction = true;

        try {
            const provider = new state.authModule.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });

            await state.authModule.signInWithPopup(state.auth, provider);
            return ensureAppSession({
                force: true,
                forceIdTokenRefresh: true,
                skipReload: true
            });
        } finally {
            state.manualAction = false;
        }
    }

    async function sendPasswordReset(payload) {
        await whenReady();
        const email = String(payload && payload.email || '').trim();
        if (!email) {
            const missingEmailError = new Error('Enter a valid email address');
            missingEmailError.code = 'auth/invalid-email';
            throw missingEmailError;
        }
        const knownMethods = Array.isArray(payload && payload.knownMethods)
            ? payload.knownMethods
            : await detectSignInMethods(email);

        if (knownMethods.includes('google.com') && !knownMethods.includes('password')) {
            const providerError = new Error('This account uses Google Sign-In. Please continue with Google.');
            providerError.code = 'auth/account-exists-with-different-credential';
            throw providerError;
        }

        if (knownMethods.includes('password')) {
            await state.authModule.sendPasswordResetEmail(state.auth, email);
            return {
                ok: true,
                message: 'Password reset email sent'
            };
        }

        const fallbackResponse = await fetch('/api/auth/forgot-password-link', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });
        const fallbackPayload = await readResponsePayload(fallbackResponse);

        if (!fallbackResponse.ok) {
            const fallbackError = new Error((fallbackPayload && fallbackPayload.msg) || 'Failed to send reset email');
            fallbackError.code = (fallbackPayload && fallbackPayload.code) || '';
            throw fallbackError;
        }

        return {
            ok: true,
            message: String((fallbackPayload && fallbackPayload.msg) || 'Password reset email sent').trim() || 'Password reset email sent'
        };
    }

    async function updateEmailAddress(payload) {
        await whenReady();
        state.manualAction = true;

        try {
            const nextEmail = String(payload && payload.newEmail || '').trim();
            const currentPassword = String(payload && payload.currentPassword || '');
            const user = await ensureCurrentUserFresh();

            if (!user) {
                const notSignedInError = new Error('Please log in again');
                notSignedInError.code = 'auth/user-not-found';
                throw notSignedInError;
            }

            const providerIds = getProviderIds(user);
            if (providerIds.includes('password')) {
                if (!currentPassword) {
                    const passwordRequiredError = new Error('Enter your current password to change your email');
                    passwordRequiredError.code = 'auth/email-change-password-required';
                    throw passwordRequiredError;
                }

                const credential = state.authModule.EmailAuthProvider.credential(String(user.email || '').trim(), currentPassword);
                await state.authModule.reauthenticateWithCredential(user, credential);
            } else if (providerIds.includes('google.com')) {
                const provider = new state.authModule.GoogleAuthProvider();
                provider.setCustomParameters({ prompt: 'select_account' });
                await state.authModule.reauthenticateWithPopup(user, provider);
            }

            await state.authModule.verifyBeforeUpdateEmail(user, nextEmail);

            const storedUser = safeParseJson(localStorage.getItem('user')) || {};
            storedUser.pendingEmail = nextEmail;
            localStorage.setItem('user', JSON.stringify(storedUser));

            try {
                window.dispatchEvent(new CustomEvent('yeshi:auth-state-changed'));
            } catch (_) {
                // Ignore CustomEvent failures.
            }

            return {
                ok: true,
                message: 'Verification email sent to your new address. Your email will update after verification.'
            };
        } finally {
            state.manualAction = false;
        }
    }

    async function signOutUser() {
        await whenReady();
        state.manualAction = true;

        try {
            await state.authModule.signOut(state.auth);
        } finally {
            state.manualAction = false;
            setFirebaseHint(null);
            clearAppSession();
        }
    }

    function getCurrentUserSnapshot() {
        const user = state.auth && state.auth.currentUser ? state.auth.currentUser : state.currentUser;
        if (!user) return null;
        return {
            uid: String(user.uid || '').trim(),
            email: String(user.email || '').trim(),
            displayName: String(user.displayName || '').trim(),
            phoneNumber: String(user.phoneNumber || '').trim(),
            emailVerified: !!user.emailVerified,
            providerIds: getProviderIds(user)
        };
    }

    async function getIdToken(options = {}) {
        await whenReady();
        const user = state.auth && state.auth.currentUser ? state.auth.currentUser : state.currentUser;
        if (!user || typeof user.getIdToken !== 'function') return '';
        return user.getIdToken(!!options.forceRefresh);
    }

    if (!window.__YESHI_FETCH_PATCHED__) {
        const nativeFetch = window.fetch.bind(window);
        window.__YESHI_FETCH_PATCHED__ = true;
        window.fetch = async function patchedYeshiFetch(input, init) {
            const requestUrl = typeof input === 'string' ? input : String((input && input.url) || '');
            const isApiRequest = /^\/api(\/|$)/.test(requestUrl) || /^https?:\/\/[^/]+\/api(\/|$)/i.test(requestUrl);
            if (!isApiRequest) {
                return nativeFetch(input, init);
            }

            const nextInit = init ? { ...init } : {};
            const headers = new Headers(nextInit.headers || (input && input.headers) || {});
            const hasAuthHeader = headers.has('Authorization') || headers.has('authorization');
            const skipFirebaseBootstrapEndpoints = /\/api\/auth\/firebase\/(config|session)$/i.test(requestUrl);
            const hasFirebaseUser = !!((state.auth && state.auth.currentUser) || state.currentUser);
            if (!hasAuthHeader && !skipFirebaseBootstrapEndpoints && hasFirebaseUser) {
                try {
                    const token = await getIdToken();
                    if (token) {
                        headers.set('Authorization', 'Bearer ' + token);
                    }
                } catch (_) {
                    // Ignore Firebase token refresh failures and preserve existing request behavior.
                }
            }

            nextInit.headers = headers;
            return nativeFetch(input, nextInit);
        };
    }

    window.YeshiFirebaseAuth = {
        whenReady,
        ensureAppSession,
        ensureCurrentUserFresh,
        detectSignInMethods,
        registerWithEmail,
        loginWithEmail,
        loginWithGoogle,
        sendPasswordReset,
        updateEmailAddress,
        signOutUser,
        getFriendlyError,
        getCurrentUserSnapshot,
        getIdToken,
        hasFirebaseHint
    };
})(window);
