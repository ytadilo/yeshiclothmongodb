(function (window) {
    const FIREBASE_APP_URL = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
    const FIREBASE_AUTH_URL = 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
    const FIREBASE_UID_KEY = 'yeshi_firebase_uid';
    const FIREBASE_EMAIL_KEY = 'yeshi_firebase_email';
    const FIREBASE_PROVIDER_KEY = 'yeshi_firebase_provider';

    const state = {
        readyPromise: null,
        app: null,
        auth: null,
        authModule: null,
        config: null,
        currentUser: null,
        syncPromise: null,
        manualAction: false
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
        try {
            localStorage.removeItem('token');
            localStorage.removeItem('role');
            localStorage.removeItem('user');
            localStorage.removeItem('loginTime');
        } catch (_) {
            // Ignore storage cleanup errors.
        }

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

        const response = await fetch('/api/auth/firebase/config', {
            method: 'GET',
            credentials: 'same-origin'
        });
        const data = await readResponsePayload(response);

        if (!response.ok) {
            throw new Error((data && data.msg) || 'Firebase configuration is missing');
        }

        state.config = data;
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
            const response = await fetch('/api/auth/firebase/session', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ idToken })
            });
            const payload = await readResponsePayload(response);

            if (!response.ok) {
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
        await state.authModule.sendPasswordResetEmail(state.auth, email);
        return {
            ok: true,
            message: 'Password reset email sent'
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
        hasFirebaseHint
    };
})(window);
