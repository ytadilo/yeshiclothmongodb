(() => {
    const path = String(window.location.pathname || '').toLowerCase().replace(/\/+$/, '') || '/';
    const isFooterPage = path === '/user/footer.html' || path === '/user/footer' || path === '/footer';
    if (!isFooterPage) return;
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    if (isMobile) return;
    window.location.replace('/user/');
})();

const YESHI_AUTH_STATE = {
    ready: false,
    token: '',
    user: null,
    resolving: null
};

let yeshiMainFirebaseBridgePromise = null;

function ensureFirebaseAuthBridge() {
    if (window.YeshiFirebaseAuth) {
        return Promise.resolve(window.YeshiFirebaseAuth.whenReady()).then(() => window.YeshiFirebaseAuth);
    }

    if (yeshiMainFirebaseBridgePromise) {
        return yeshiMainFirebaseBridgePromise;
    }

    yeshiMainFirebaseBridgePromise = new Promise((resolve, reject) => {
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
        script.src = '/js/firebase-auth.js?v=20260414';
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

    return yeshiMainFirebaseBridgePromise;
}

function getProtectedUserPaths() {
    return new Set([
        '/my-orders',
        '/user/my-orders.html',
        '/mychat',
        '/user/mychat.html',
        '/order',
        '/user/order.html',
        '/profile',
        '/user/profile.html',
        '/favorites',
        '/user/favorites.html',
        '/cart',
        '/user/cart.html'
    ]);
}

function isProtectedUserPath(pathname) {
    const path = String(pathname || window.location.pathname || '')
        .toLowerCase()
        .replace(/\/+/g, '/')
        .replace(/\/+$/, '') || '/';
    return getProtectedUserPaths().has(path);
}

function getStoredAuthUser() {
    const parsed = safeParseJson(localStorage.getItem('user'));
    return parsed && typeof parsed === 'object' ? parsed : null;
}

function getCurrentAuthSnapshot() {
    const token = String(YESHI_AUTH_STATE.token || localStorage.getItem('token') || '').trim();
    const user = YESHI_AUTH_STATE.user || getStoredAuthUser();
    const role = String((user && user.role) || localStorage.getItem('role') || '').trim();
    const status = String((user && user.status) || '').toLowerCase();
    const blocked = !!(user && (user.isBanned || status === 'banned' || status === 'inactive'));
    const hasFirebaseHint = !!String(localStorage.getItem('yeshi_firebase_uid') || '').trim();
    const hasRestorableFirebaseSession = hasFirebaseHint && !blocked;

    return {
        ready: !!YESHI_AUTH_STATE.ready,
        token,
        user,
        role,
        blocked,
        isLoggedIn: (!!token && !!user && !blocked) || (!token && hasRestorableFirebaseSession && !YESHI_AUTH_STATE.ready)
    };
}

function emitAuthStateChanged() {
    const detail = getCurrentAuthSnapshot();
    try {
        window.dispatchEvent(new CustomEvent('yeshi:auth-state-changed', { detail }));
    } catch (_) {
        // Ignore environments without CustomEvent support.
    }
    return detail;
}

const USER_SCOPED_LOCAL_STORAGE_KEYS = [
    'token',
    'role',
    'user',
    'loginTime',
    'yeshi_firebase_uid',
    'yeshi_firebase_email',
    'yeshi_firebase_provider',
    'yeshi_profile_avatar',
    'yeshi_profile_shipping',
    'yeshi_saved_shipping_addresses',
    'yeshi_saved_measurements',
    'yeshi_pending_signup_profile'
];

const USER_SCOPED_SESSION_STORAGE_KEYS = [
    'yeshi_auth_flash'
];

function clearUserScopedBrowserState() {
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

function clearStoredAuthSession(options = {}) {
    YESHI_AUTH_STATE.token = '';
    YESHI_AUTH_STATE.user = null;
    YESHI_AUTH_STATE.ready = options.preserveReady ? true : YESHI_AUTH_STATE.ready;

    clearUserScopedBrowserState();

    if (!options.silent) {
        emitAuthStateChanged();
    }

    return getCurrentAuthSnapshot();
}

function removeLegacyDesktopProfileIcons() {
    document.querySelectorAll('#desktopProfileIcon').forEach((icon) => {
        try {
            icon.remove();
        } catch (_) {
            // Ignore stale DOM cleanup failures.
        }
    });
}

function setStoredAuthSession(token, user, options = {}) {
    const safeToken = String(token || '').trim();
    const safeUser = user && typeof user === 'object' ? user : null;

    if (!safeToken || !safeUser) {
        return clearStoredAuthSession({ ...options, preserveReady: true });
    }

    YESHI_AUTH_STATE.ready = true;
    YESHI_AUTH_STATE.token = safeToken;
    YESHI_AUTH_STATE.user = safeUser;

    try {
        localStorage.setItem('token', safeToken);
        localStorage.setItem('role', String(safeUser.role || '').trim());
        localStorage.setItem('user', JSON.stringify(safeUser));
        if (!localStorage.getItem('loginTime')) {
            localStorage.setItem('loginTime', Date.now().toString());
        }
    } catch (_) {
        // Ignore storage errors and keep the in-memory state.
    }

    if (!options.silent) {
        emitAuthStateChanged();
    }

    return getCurrentAuthSnapshot();
}

async function resolveAuthSession(options = {}) {
    if (YESHI_AUTH_STATE.resolving && !options.force) {
        return YESHI_AUTH_STATE.resolving;
    }

    YESHI_AUTH_STATE.resolving = (async () => {
        const storedToken = String(localStorage.getItem('token') || '').trim();
        let firebaseBridge = null;

        try {
            firebaseBridge = await ensureFirebaseAuthBridge().catch(() => null);
        } catch (_) {
            firebaseBridge = null;
        }

        try {
            if (!storedToken && firebaseBridge && typeof firebaseBridge.ensureAppSession === 'function') {
                const restored = await firebaseBridge.ensureAppSession({ force: !!options.force }).catch(() => null);
                if (restored && restored.ok) {
                    YESHI_AUTH_STATE.ready = true;
                    return getCurrentAuthSnapshot();
                }
            }

            if (!storedToken) {
                YESHI_AUTH_STATE.ready = true;
                YESHI_AUTH_STATE.token = '';
                YESHI_AUTH_STATE.user = null;
                emitAuthStateChanged();
                return getCurrentAuthSnapshot();
            }

            const res = await fetch('/api/auth/me', {
                method: 'GET',
                credentials: 'same-origin',
                headers: { 'x-auth-token': storedToken }
            });

            if (!res.ok) {
                clearStoredAuthSession({ preserveReady: true });

                if (firebaseBridge && typeof firebaseBridge.ensureAppSession === 'function') {
                    const restored = await firebaseBridge.ensureAppSession({ force: true }).catch(() => null);
                    if (restored && restored.ok) {
                        YESHI_AUTH_STATE.ready = true;
                        return getCurrentAuthSnapshot();
                    }
                }

                return getCurrentAuthSnapshot();
            }

            const raw = await res.text();
            const payload = safeParseJson(raw) || {};
            const user = payload && typeof payload.user === 'object' ? payload.user : null;

            if (!user) {
                clearStoredAuthSession({ preserveReady: true });
                return getCurrentAuthSnapshot();
            }

            return setStoredAuthSession(storedToken, user);
        } catch (_) {
            YESHI_AUTH_STATE.ready = true;
            YESHI_AUTH_STATE.token = storedToken;
            YESHI_AUTH_STATE.user = getStoredAuthUser();
            emitAuthStateChanged();
            return getCurrentAuthSnapshot();
        } finally {
            YESHI_AUTH_STATE.resolving = null;
        }
    })();

    return YESHI_AUTH_STATE.resolving;
}

async function performLogout(redirectTo) {
    const snapshot = getCurrentAuthSnapshot();
    try {
        await fetch('/api/auth/logout', {
            method: 'POST',
            credentials: 'same-origin',
            headers: snapshot.token ? { 'x-auth-token': snapshot.token } : {}
        });
    } catch (_) {
        // Local logout should still work if the API call fails.
    }

    try {
        const firebaseBridge = await ensureFirebaseAuthBridge().catch(() => null);
        if (firebaseBridge && typeof firebaseBridge.signOutUser === 'function') {
            await firebaseBridge.signOutUser();
        } else {
            clearStoredAuthSession({ preserveReady: true });
        }
    } catch (_) {
        clearStoredAuthSession({ preserveReady: true });
    }

    const destination = redirectTo || (snapshot.role === 'admin' ? '/admin/login' : '/auth/login');
    window.location.replace(destination);
}

window.YeshiAuth = {
    getSnapshot: getCurrentAuthSnapshot,
    resolveSession: resolveAuthSession,
    setSession: setStoredAuthSession,
    clearSession: clearStoredAuthSession,
    performLogout
};

function bindGlobalLogoutDelegation() {
    if (document.body && document.body.dataset.yeshiLogoutBound === '1') return;
    if (document.body) {
        document.body.dataset.yeshiLogoutBound = '1';
    }

    document.addEventListener('click', (event) => {
        const logoutTrigger = event.target && event.target.closest ? event.target.closest('[data-action="logout"]') : null;
        if (!logoutTrigger) return;

        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
        }

        performLogout();
    }, true);
}

window.addEventListener('storage', (event) => {
    if (!event || !['token', 'role', 'user', 'loginTime', 'yeshi_firebase_uid', 'yeshi_firebase_email', 'yeshi_firebase_provider'].includes(String(event.key || ''))) return;

    const snapshot = getCurrentAuthSnapshot();
    YESHI_AUTH_STATE.ready = true;
    YESHI_AUTH_STATE.token = snapshot.token;
    YESHI_AUTH_STATE.user = snapshot.user;
    emitAuthStateChanged();
});

window.addEventListener('yeshi:auth-state-changed', () => {
    try { applyAuthVisibility(); } catch (_) {}
    try { applyGlobalMenuAuthState(); } catch (_) {}
    try { enforceMobileMenuLinkPolicy(); } catch (_) {}
    try { ensureProfileAvatarEverywhere(); } catch (_) {}
});

// Auto-logout after 2 weeks (1209600000 ms)
function checkSessionExpiry() {
    const token = String(localStorage.getItem('token') || '').trim();
    const loginTime = parseInt(localStorage.getItem('loginTime'), 10);
    if (!token || !loginTime) return false;

    const now = Date.now();
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;
    if (now - loginTime <= twoWeeks) return false;

    clearStoredAuthSession({ preserveReady: true });

    if (isProtectedUserPath(window.location.pathname)) {
        const next = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
            window.location.replace('/auth/login?next=' + next);
        return true;
    }

    return true;
}

document.addEventListener('DOMContentLoaded', async () => {
    bindGlobalLogoutDelegation();
    checkSessionExpiry();
    try {
        await ensureFirebaseAuthBridge().catch(() => null);
    } catch (_) {
        // Continue gracefully when Firebase is not configured yet.
    }
    await resolveAuthSession();

    if (enforceUserGuestAccessPolicy()) return;
    if (enforceFooterMobileOnlyView()) return;

    enforceLoginForBagAndOrderActions();
    ensureHomepageNavForListedPages();
    ensureMobileFooterShortcutIcon();
    enforceMobileTopNavLayout();
    enforceMobileSearchVisibility();
    ensureMobileBottomNav();
    ensureBagCountBadges();
    wireGenericMobileMenuToggle();

    ensureMyOrdersNavLink();
    ensureUserChatLauncher();
    ensureUserThemeToggle();
    ensureLogoSpin();
    ensureUnifiedUserFooter();
    ensureProfileAvatarEverywhere();
    applyActiveNavAndFooterColors();
    showFirstVisitSplash();

    applyAuthVisibility();
    applyGlobalMenuAuthState();
    enforceMobileMenuLinkPolicy();
    applySocialLinks();
    applySiteContent();
    initAnalyticsTracking();
    initUnifiedLayoutInjection();
});

function getAnalyticsDeviceId() {
    try {
        const key = 'yeshi_analytics_device_id';
        let id = localStorage.getItem(key);
        if (!id) {
            id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (`d_${Date.now()}_${Math.random().toString(16).slice(2)}`);
            localStorage.setItem(key, id);
        }
        return id;
    } catch (_) {
        return '';
    }
}

function getAnalyticsSessionId() {
    try {
        const key = 'yeshi_analytics_session_id';
        let id = sessionStorage.getItem(key);
        if (!id) {
            id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : (`s_${Date.now()}_${Math.random().toString(16).slice(2)}`);
            sessionStorage.setItem(key, id);
        }
        return id;
    } catch (_) {
        return '';
    }
}

function detectDeviceType() {
    const ua = String(navigator.userAgent || '').toLowerCase();
    const isTablet = /ipad|tablet|playbook|silk/.test(ua) || (window.innerWidth >= 768 && window.innerWidth <= 1024);
    const isMobile = /mobi|iphone|android/.test(ua) && !isTablet;
    if (isTablet) return 'tablet';
    if (isMobile) return 'mobile';
    return 'desktop';
}

async function trackAnalyticsEvent(eventType, eventData) {
    try {
        const token = localStorage.getItem('token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['x-auth-token'] = token;

        await fetch('/api/analytics/track', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                eventType,
                eventData: eventData || {},
                deviceId: getAnalyticsDeviceId(),
                deviceType: detectDeviceType(),
                sessionId: getAnalyticsSessionId()
            }),
            keepalive: true
        });
    } catch (_) {
        // Analytics must never break UI.
    }
}

function getCurrentProductIdFromContext() {
    try {
        const params = new URLSearchParams(window.location.search || '');
        const fromQuery = params.get('id') || params.get('postId') || params.get('productId');
        if (fromQuery) return String(fromQuery);
    } catch (_) {}

    const fromDom =
        document.querySelector('[data-product-id]')?.getAttribute('data-product-id') ||
        document.querySelector('[data-post-id]')?.getAttribute('data-post-id') ||
        document.querySelector('[data-add-cart-post-id]')?.getAttribute('data-add-cart-post-id') ||
        '';

    return String(fromDom || '');
}

function initAnalyticsTracking() {
    const path = String(window.location.pathname || '').toLowerCase();
    if (path.startsWith('/admin')) return;

    // Page/session level tracking
    trackAnalyticsEvent('page_view', { path, title: document.title || '' });

    if (path.includes('/post') || path.includes('/product') || path.includes('/order')) {
        const productId = getCurrentProductIdFromContext();
        if (productId) {
            trackAnalyticsEvent('product_view', { productId, path });
        }
    }

    document.addEventListener('click', (event) => {
        const el = event.target && event.target.closest ? event.target.closest('a,button,[data-action],[data-download-url]') : null;
        if (!el) return;

        const text = String(el.textContent || '').trim().toLowerCase();
        const aria = String(el.getAttribute('aria-label') || '').trim().toLowerCase();
        const action = String(el.getAttribute('data-action') || '').trim().toLowerCase();
        const productId =
            String(el.getAttribute('data-product-id') || '') ||
            String(el.getAttribute('data-post-id') || '') ||
            String(el.getAttribute('data-add-cart-post-id') || '') ||
            getCurrentProductIdFromContext();

        const isAddToCart = el.matches('[data-add-cart-post-id], #addToBagBtn, #postBagActionBtn') || action === 'add_to_cart';
        if (isAddToCart) {
            trackAnalyticsEvent('add_to_cart', { productId });
        }

        const isLike = action === 'like' || el.matches('[data-like], .like-btn, .btn-like') || aria.includes('like') || text === 'like';
        if (isLike) {
            trackAnalyticsEvent('like', { productId });
        }

        const isShare = action === 'share' || el.matches('[data-share], .share-btn, .btn-share') || aria.includes('share') || text.includes('share');
        if (isShare) {
            trackAnalyticsEvent('share', { productId });
        }

        const isDownload = el.matches('[data-download-url], #downloadImageBtn, [aria-label="Download"]') || action === 'download';
        if (isDownload) {
            const href = el.getAttribute('data-download-url') || el.getAttribute('href') || '';
            trackAnalyticsEvent('image_download', { productId, url: href });
        }

        if (el.tagName === 'A') {
            const href = String(el.getAttribute('href') || '').trim();
            if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
                trackAnalyticsEvent('click', { link: href, path });
            }

            const lowHref = href.toLowerCase();
            if (lowHref.includes('youtube.com') || lowHref.includes('youtu.be')) {
                trackAnalyticsEvent('video_view', { productId, platform: 'youtube', url: href });
            } else if (lowHref.includes('instagram.com')) {
                trackAnalyticsEvent('video_view', { productId, platform: 'instagram', url: href });
            } else if (lowHref.includes('tiktok.com')) {
                trackAnalyticsEvent('video_view', { productId, platform: 'tiktok', url: href });
            }
        }
    }, true);
}

function enforceUserGuestAccessPolicy() {
    const path = String(window.location.pathname || '').toLowerCase().replace(/\/+/g, '/').replace(/\/+$/, '') || '/';
    const token = localStorage.getItem('token');
    const storedUser = (() => {
        try {
            return JSON.parse(localStorage.getItem('user') || '{}') || {};
        } catch (_) {
            return {};
        }
    })();
    const status = String(storedUser.status || '').toLowerCase();
    const blocked = !!storedUser.isBanned || status === 'banned' || status === 'inactive';

    const loginRequiredPaths = new Set([
        '/my-orders',
        '/user/my-orders.html',
        '/mychat',
        '/user/mychat.html',
        '/order',
        '/user/order.html',
        '/profile',
        '/user/profile.html',
        '/favorites',
        '/user/favorites.html',
        '/cart',
        '/user/cart.html'
    ]);

    if (!loginRequiredPaths.has(path)) return false;
    if (token && !blocked) return false;

    const next = encodeURIComponent(window.location.pathname + window.location.search + window.location.hash);
    if (blocked) {
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('user');
        localStorage.removeItem('loginTime');
    }
    window.location.replace('/auth/login?next=' + next);
    return true;
}

function enforceFooterMobileOnlyView() {
    const path = String(window.location.pathname || '').toLowerCase().replace(/\/+$/, '') || '/';
    const isFooterPage = path === '/user/footer.html' || path === '/user/footer' || path === '/footer';
    if (!isFooterPage) return false;
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    if (isMobile) return false;
    window.location.replace('/user/');
    return true;
}

function enforceLoginForBagAndOrderActions() {
    const path = String(window.location.pathname || '').toLowerCase();
    if (path.startsWith('/admin') || path.startsWith('/auth')) return;

    const buildLoginRedirect = (nextPath) => {
        const next = String(nextPath || (window.location.pathname + window.location.search + window.location.hash));
        return '/auth/login?next=' + encodeURIComponent(next);
    };

    const isProtectedViewOrderLink = (anchor) => {
        if (!anchor) return false;
        const href = String(anchor.getAttribute('href') || '').trim();
        const text = String(anchor.textContent || '').trim().toLowerCase();
        if (!href) return false;

        if (text === 'view & order' || text === 'view and order') return true;

        try {
            const url = new URL(href, window.location.origin);
            const p = String(url.pathname || '').toLowerCase().replace(/\/+$/, '') || '/';
            if (p === '/user/post.html' || p === '/post' || p === '/user/post') return true;
            return false;
        } catch (_) {
            return false;
        }
    };

    document.addEventListener('click', (event) => {
        const target = event.target && event.target.closest ? event.target.closest('a,button') : null;
        if (!target) return;

        const token = localStorage.getItem('token');
        if (token) return;

        const isAddToBagAction = target.matches('[data-add-cart-post-id], #addToBagBtn, #postBagActionBtn');
        const isViewOrderAction = target.tagName === 'A' && isProtectedViewOrderLink(target);
        const isDownloadAction = target.matches('[data-download-url], #downloadImageBtn, [aria-label="Download"]');
        if (!isAddToBagAction && !isViewOrderAction && !isDownloadAction) return;

        event.preventDefault();
        event.stopPropagation();

        let next = window.location.pathname + window.location.search + window.location.hash;
        if (target.tagName === 'A') {
            const href = target.getAttribute('href');
            if (href) next = href;
        }

        window.location.href = buildLoginRedirect(next);
    }, true);
}

function isHomeLikePath(path) {
    const value = String(path || '').toLowerCase().replace(/\/+$/, '') || '/';
    return value === '/' || value === '/index.html' || value === '/user' || value === '/user/' || value === '/user/index.html';
}

function enforceMobileSearchVisibility() {
    if (!window.matchMedia('(max-width: 900px)').matches) return;
    const path = String(window.location.pathname || '');
    if (isHomeLikePath(path)) return;
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;
    const section = searchInput.closest('section') || searchInput.parentElement;
    if (section) {
        section.style.display = 'none';
    } else {
        searchInput.style.display = 'none';
    }
}

function enforceMobileTopNavLayout() {
    const nav = document.querySelector('nav');
    if (!nav) return;

    if (!document.getElementById('yeshiMobileTopNavRules')) {
        const style = document.createElement('style');
        style.id = 'yeshiMobileTopNavRules';
        style.textContent = `
            @media (min-width: 901px) {
                nav:not(#yeshiMobileBottomNav) #mobile-footer-shortcut {
                    display: none !important;
                }
            }
            @media (max-width: 900px) {
                nav:not(#yeshiMobileBottomNav) .yeshi-nav-left,
                nav:not(#yeshiMobileBottomNav) > div > div:first-child,
                nav:not(#yeshiMobileBottomNav) .flex.items-center.gap-3 {
                    margin-right: auto;
                }
                nav:not(#yeshiMobileBottomNav) .yeshi-actions,
                nav:not(#yeshiMobileBottomNav) > div > div:last-child,
                nav:not(#yeshiMobileBottomNav) .flex.items-center.gap-2.sm\:gap-4 {
                    margin-left: auto;
                    display: inline-flex;
                    gap: 6px;
                    align-items: center;
                }
                nav:not(#yeshiMobileBottomNav) .yeshi-order-btn,
                nav:not(#yeshiMobileBottomNav) [aria-label="Favorites"],
                nav:not(#yeshiMobileBottomNav) [aria-label="Open MyChat"],
                nav:not(#yeshiMobileBottomNav) [aria-label="Profile"] {
                    display: none !important;
                }
                nav:not(#yeshiMobileBottomNav) #shoppingBagLink {
                    display: none !important;
                }
                nav:not(#yeshiMobileBottomNav) a[href="/cart"],
                nav:not(#yeshiMobileBottomNav) a[href="/user/cart"],
                nav:not(#yeshiMobileBottomNav) a[aria-label="Shopping bag"] {
                    display: none !important;
                }
                nav:not(#yeshiMobileBottomNav) #mobile-footer-shortcut,
                nav:not(#yeshiMobileBottomNav) #notification-trigger,
                nav:not(#yeshiMobileBottomNav) #mobile-menu-toggle {
                    display: inline-flex !important;
                }
                nav:not(#yeshiMobileBottomNav) .nav-links {
                    display: none !important;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

function ensureMobileFooterShortcutIcon() {
    const nav = document.querySelector('nav');
    if (!nav) return;
    const leftArea = nav.querySelector('.yeshi-nav-left, .flex.items-center.gap-3, .yeshi-nav-inner > div:first-child');
    if (!leftArea) return;

    let shortcut = document.getElementById('mobile-footer-shortcut');
    if (!shortcut) {
        shortcut = document.createElement('a');
        shortcut.id = 'mobile-footer-shortcut';
        shortcut.href = '/user/footer.html';
        shortcut.setAttribute('aria-label', 'Footer Information');
        shortcut.className = 'yeshi-icon-btn rounded-full p-2 text-brand-muted hover:text-brand-primary';
        shortcut.innerHTML = '<span class="material-symbols-outlined">priority_high</span>';

        const menuBtn = leftArea.querySelector('#mobile-menu-toggle');
        if (menuBtn && menuBtn.parentNode === leftArea) {
            leftArea.insertBefore(shortcut, menuBtn.nextSibling);
        } else {
            leftArea.appendChild(shortcut);
        }
    }
}

function ensureMobileBottomNav() {
    const path = String(window.location.pathname || '').toLowerCase();
    if (path.startsWith('/admin') || path.startsWith('/auth')) return;

    if (!document.getElementById('yeshiMobileBottomNavStyles')) {
        const style = document.createElement('style');
        style.id = 'yeshiMobileBottomNavStyles';
        style.textContent = `
            .yeshi-mobile-bottom-nav {
                position: fixed;
                left: 0;
                right: 0;
                bottom: 0;
                z-index: 2400;
                background: rgba(255, 255, 255, 0.98);
                border-top: 1px solid rgba(116, 91, 24, 0.2);
                box-shadow: 0 -10px 24px rgba(0,0,0,0.12);
                display: none;
                grid-template-columns: repeat(5, minmax(0, 1fr));
                padding: 8px 4px calc(8px + env(safe-area-inset-bottom));
            }
            .yeshi-mobile-bottom-nav a {
                text-decoration: none;
                color: #4d4639;
                font-size: 11px;
                font-weight: 700;
                display: inline-flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                gap: 2px;
                min-height: 46px;
            }
            .yeshi-mobile-bottom-nav .yeshi-nav-icon-wrap {
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            .yeshi-mobile-bottom-nav .yeshi-nav-count-badge {
                position: absolute;
                top: -7px;
                right: -10px;
                min-width: 16px;
                height: 16px;
                border-radius: 999px;
                padding: 0 4px;
                font-size: 10px;
                line-height: 16px;
                text-align: center;
                background: #bb0010;
                color: #fff;
                font-weight: 700;
                display: none;
                z-index: 2;
            }
            .yeshi-mobile-bottom-nav .material-symbols-outlined {
                font-size: 21px;
                line-height: 1;
            }
            .yeshi-mobile-bottom-nav a.active {
                color: #745b18;
            }
            @media (max-width: 900px) {
                .yeshi-mobile-bottom-nav {
                    display: grid;
                }
                body {
                    padding-bottom: 84px;
                }
                body:not(.footer-hub-page) footer {
                    display: none !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    let nav = document.getElementById('yeshiMobileBottomNav');
    if (!nav) {
        nav = document.createElement('nav');
        nav.id = 'yeshiMobileBottomNav';
        nav.className = 'yeshi-mobile-bottom-nav';
        nav.setAttribute('aria-label', 'Mobile bottom navigation');
        nav.innerHTML = `
            <a href="/user/" data-nav-key="home" aria-label="Home"><span class="yeshi-nav-icon-wrap"><span class="material-symbols-outlined">home</span></span><span>Home</span></a>
            <a href="/cart" data-nav-key="cart" aria-label="Bag"><span class="yeshi-nav-icon-wrap"><span class="material-symbols-outlined">shopping_bag</span><span id="mobileBottomBagBadge" class="yeshi-nav-count-badge yeshi-bag-count-badge"></span></span><span>Bag</span></a>
            <a href="/user/favorites" data-nav-key="favorites" aria-label="Favorite"><span class="yeshi-nav-icon-wrap"><span class="material-symbols-outlined">favorite</span></span><span>Favorite</span></a>
            <a href="/user/mychat" data-nav-key="mychat" aria-label="Messages"><span class="yeshi-nav-icon-wrap"><span class="material-symbols-outlined">chat</span><span id="mobileBottomChatBadge" class="yeshi-nav-count-badge user-top-nav-badge"></span></span><span>Messages</span></a>
            <a href="/profile" data-nav-key="profile" aria-label="Profile"><span class="yeshi-nav-icon-wrap"><span class="material-symbols-outlined">person</span></span><span>Profile</span></a>
        `;
        document.body.appendChild(nav);
    }
}

function ensureBagCountBadges() {
    const getBagCount = () => {
        try {
            const raw = localStorage.getItem('yeshi_bag');
            const items = raw ? JSON.parse(raw) : [];
            if (!Array.isArray(items)) return 0;
            return items.reduce((sum, item) => sum + Math.max(1, Number((item && item.quantity) || 1)), 0);
        } catch (_) {
            return 0;
        }
    };

    const setBadgeValue = (badgeEl, count) => {
        if (!badgeEl) return;
        if (count > 0) {
            badgeEl.textContent = count > 99 ? '99+' : String(count);
            badgeEl.style.display = 'inline-block';
        } else {
            badgeEl.textContent = '';
            badgeEl.style.display = 'none';
        }
    };

    const ensureBagBadgeElements = () => {
        const selectors = [
            '#shoppingBagLink',
            '#yeshiMobileBottomNav a[data-nav-key="cart"]',
            'a[aria-label="Shopping bag"]',
            'a[aria-label="Bag"]'
        ];
        const anchors = Array.from(document.querySelectorAll(selectors.join(',')));
        anchors.forEach((anchor, index) => {
            if (!anchor) return;
            const existingPrimary = anchor.querySelector('#bagCount');
            const existingSecondary = anchor.querySelector('.yeshi-bag-count-badge');
            if (existingPrimary || existingSecondary) return;
            const holder = anchor.querySelector('.yeshi-nav-icon-wrap') || anchor;
            holder.style.position = holder.style.position || 'relative';
            const badgeEl = document.createElement('span');
            badgeEl.className = 'yeshi-bag-count-badge user-top-nav-badge';
            badgeEl.id = `yeshiBagBadge${index + 1}`;
            holder.appendChild(badgeEl);
        });
    };

    const syncBagBadges = () => {
        ensureBagBadgeElements();
        const count = getBagCount();
        setBadgeValue(document.getElementById('bagCount'), count);
        Array.from(document.querySelectorAll('.yeshi-bag-count-badge')).forEach((badgeEl) => setBadgeValue(badgeEl, count));
    };

    syncBagBadges();

    if (!window.__yeshiBagBadgeSyncBound) {
        window.__yeshiBagBadgeSyncBound = true;

        window.addEventListener('storage', (event) => {
            if (!event || !event.key || event.key === 'yeshi_bag') {
                syncBagBadges();
            }
        });

        const originalSetItem = localStorage.setItem.bind(localStorage);
        localStorage.setItem = function(key, value) {
            originalSetItem(key, value);
            if (key === 'yeshi_bag') syncBagBadges();
        };

        const originalRemoveItem = localStorage.removeItem.bind(localStorage);
        localStorage.removeItem = function(key) {
            originalRemoveItem(key);
            if (key === 'yeshi_bag') syncBagBadges();
        };

        window.setInterval(syncBagBadges, 2000);
    }
}

function applyActiveNavAndFooterColors() {
    const path = String(window.location.pathname || '').toLowerCase().replace(/\/+$/, '') || '/';

    const keyFromPath = (p) => {
        const value = String(p || '').toLowerCase().replace(/\/+$/, '') || '/';
        if (value === '/' || value === '/index.html' || value === '/user' || value === '/user/index' || value === '/user/index.html') return 'home';
        if (value === '/my-orders' || value === '/user/my-orders.html') return 'my-orders';
        if (value === '/user/order' || value === '/order' || value === '/user/order.html') return 'order';
        if (value === '/user/how-it-works' || value === '/how-it-works' || value === '/user/how-it-works.html') return 'how-it-works';
        if (value === '/user/developer-information.html' || value === '/developer-information') return 'developer-information';
        if (value === '/user/footer.html' || value === '/footer') return 'footer';
        if (value === '/user/size-guide' || value === '/size-guide' || value === '/user/size-guide.html') return 'size-guide';
        if (value === '/user/about' || value === '/about' || value === '/user/about.html') return 'about';
        if (value === '/profile' || value === '/user/profile.html') return 'profile';
        if (value === '/user/favorites' || value === '/favorites' || value === '/user/favorites.html') return 'favorites';
        if (value === '/cart' || value === '/user/cart.html') return 'cart';
        if (value === '/user/mychat' || value === '/mychat' || value === '/user/mychat.html') return 'mychat';
        return '';
    };

    const keyFromHref = (href) => {
        if (!href) return '';
        try {
            const u = new URL(href, window.location.origin);
            return keyFromPath(u.pathname);
        } catch (_) {
            return '';
        }
    };

    const currentKey = keyFromPath(path);
    const ACTIVE = '#7B6324';
    const INACTIVE = '#383A3A';

    const navLinks = Array.from(document.querySelectorAll('nav .nav-links a, #mobile-menu a'));
    navLinks.forEach((link) => {
        const key = keyFromHref(link.getAttribute('href'));
        if (!key) return;
        const isActive = key === currentKey;
        link.style.color = isActive ? ACTIVE : INACTIVE;
        link.style.fontWeight = isActive ? '700' : '';
        if (isActive) link.classList.add('active');
        else link.classList.remove('active');
    });

    const iconTargets = [
        { selector: 'nav a[aria-label="Open MyChat"]', key: 'mychat' },
        { selector: 'nav a[aria-label="Profile"]', key: 'profile' },
        { selector: 'nav a[aria-label="Favorites"]', key: 'favorites' },
        { selector: 'nav #shoppingBagLink', key: 'cart' },
        { selector: 'nav #notification-trigger', key: 'notifications' }
    ];

    iconTargets.forEach(({ selector, key }) => {
        document.querySelectorAll(selector).forEach((el) => {
            el.style.color = currentKey === key ? ACTIVE : INACTIVE;
        });
    });

    const footerLinks = Array.from(document.querySelectorAll('footer a'));
    footerLinks.forEach((link) => {
        const key = keyFromHref(link.getAttribute('href'));
        if (!['developer-information', 'how-it-works', 'size-guide', 'about'].includes(key)) return;
        const isActive = key === currentKey;
        link.style.color = isActive ? ACTIVE : INACTIVE;
        link.style.fontWeight = isActive ? '700' : '';
    });

    const mobileBottomLinks = Array.from(document.querySelectorAll('#yeshiMobileBottomNav a[data-nav-key]'));
    const mobileBottomKeyFromCurrent = (key) => {
        if (['home', 'favorites', 'cart', 'mychat', 'profile'].includes(key)) return key;
        if (['about', 'how-it-works', 'size-guide', 'developer-information', 'footer'].includes(key)) return 'home';
        if (['order', 'my-orders'].includes(key)) return 'cart';
        return '';
    };
    const currentBottomKey = mobileBottomKeyFromCurrent(currentKey);
    mobileBottomLinks.forEach((link) => {
        const key = String(link.getAttribute('data-nav-key') || '').toLowerCase();
        const isActive = key && key === currentBottomKey;
        if (isActive) link.classList.add('active');
        else link.classList.remove('active');
    });
}

function ensureHomepageNavForListedPages() {
    const path = String(window.location.pathname || '').toLowerCase().replace(/\/+$/, '') || '/';
    const targets = new Set([
        '/',
        '/index.html',
        '/user',
        '/user/index',
        '/user/index.html',
        '/my-orders',
        '/user/my-orders.html',
        '/order',
        '/user/order',
        '/user/order.html',
        '/cart',
        '/user/cart',
        '/user/cart.html',
        '/favorites',
        '/user/favorites',
        '/user/favorites.html',
        '/size-guide',
        '/user/size-guide',
        '/user/size-guide.html',
        '/how-it-works',
        '/user/how-it-works',
        '/user/how-it-works.html',
        '/developer-information',
        '/user/developer-information.html',
        '/footer',
        '/user/footer',
        '/user/footer.html',
        '/about',
        '/user/about',
        '/user/about.html',
        '/post',
        '/user/post.html',
        '/profile',
        '/user/profile.html'
    ]);
    if (!targets.has(path)) return;
    if (document.getElementById('yeshiHomeLikeNav')) return;

    const materialSymbolsHref = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap';
    const hasMaterialSymbols = Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some((link) => String(link.href || '').includes('Material+Symbols+Outlined'));
    if (!hasMaterialSymbols) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = materialSymbolsHref;
        document.head.appendChild(link);
    }

    if (!document.getElementById('yeshiHomeLikeNavStyles')) {
        const style = document.createElement('style');
        style.id = 'yeshiHomeLikeNavStyles';
        style.textContent = `
            body.yeshi-home-nav-active {
                padding-top: 56px;
            }
            #yeshiHomeLikeNav {
                position: fixed;
                top: 0;
                z-index: 5000;
                width: 100%;
                background: rgba(255, 255, 255, 0.8);
                backdrop-filter: blur(12px);
                box-shadow: 0 20px 40px rgba(26, 28, 28, 0.08);
            }
            #yeshiHomeLikeNav .yeshi-nav-inner {
                max-width: 1920px;
                margin: 0 auto;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 16px;
                gap: 10px;
            }
            #yeshiHomeLikeNav .yeshi-nav-left {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            #yeshiHomeLikeNav .logo {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                text-decoration: none;
                color: #1a1c1c;
                font-weight: 700;
            }
            #yeshiHomeLikeNav .logo img {
                height: 36px;
                width: auto;
                border-radius: 4px;
            }
            #yeshiHomeLikeNav .yeshi-desktop-nav {
                display: none;
                align-items: center;
                gap: 20px;
                margin: 0;
                padding: 0;
                list-style: none;
                font-size: 12px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.06em;
            }
            #yeshiHomeLikeNav .yeshi-desktop-nav a {
                color: #4d4639;
                text-decoration: none;
            }
            #yeshiHomeLikeNav .yeshi-desktop-nav a:hover,
            #yeshiHomeLikeNav .yeshi-desktop-nav a.active {
                color: #745b18;
            }
            #yeshiHomeLikeNav .yeshi-actions {
                display: flex;
                align-items: center;
                gap: 6px;
            }
            #yeshiHomeLikeNav .yeshi-icon-btn {
                position: relative;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 34px;
                height: 34px;
                border: 0;
                background: transparent;
                color: #4d4639;
                text-decoration: none;
                border-radius: 999px;
                cursor: pointer;
            }
            #yeshiHomeLikeNav .yeshi-icon-btn:hover {
                color: #745b18;
                background: #f5f3ee;
            }
            #yeshiHomeLikeNav #notificationDot {
                position: absolute;
                right: -2px;
                top: -2px;
            }
            #yeshiHomeLikeNav #bagCount {
                position: absolute;
                right: -4px;
                top: -4px;
                min-width: 16px;
                border-radius: 999px;
                background: #745b18;
                color: #fff;
                font-size: 10px;
                line-height: 16px;
                text-align: center;
                padding: 0 4px;
                font-weight: 700;
                display: none;
            }
            #yeshiHomeLikeNav .yeshi-order-btn {
                border-radius: 999px;
                padding: 7px 12px;
                font-size: 11px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                text-decoration: none;
                color: #fff;
                background: linear-gradient(90deg, #745b18 0%, #d4b468 100%);
                white-space: nowrap;
            }
            #mobile-menu-toggle {
                border: 0;
                background: transparent;
                color: #4d4639;
                border-radius: 6px;
                width: 34px;
                height: 34px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
            }
            #mobile-menu-toggle:hover {
                color: #745b18;
                background: #f5f3ee;
            }
            #mobile-menu {
                display: none;
                background: #fff;
                border-top: 1px solid #ece7db;
            }
            #mobile-menu.open {
                display: block;
            }
            #mobile-menu .yeshi-mobile-inner {
                padding: 12px 16px;
                display: grid;
                gap: 4px;
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 0.06em;
                text-transform: uppercase;
            }
            #mobile-menu a {
                color: #4d4639;
                text-decoration: none;
                border-radius: 6px;
                padding: 9px 10px;
                display: block;
            }
            #mobile-menu a:hover,
            #mobile-menu a.active {
                background: #fff4db;
                color: #745b18;
            }
            #yeshiHomeLikeNav a[data-action="logout"],
            #yeshiHomeLikeNav #desktopLogoutItem a,
            #yeshiHomeLikeNav #mobileMenuLogoutBtn,
            #mobile-menu a[data-action="logout"] {
                color: #525454 !important;
            }
            #yeshiHomeLikeNav a[data-action="logout"]:hover,
            #yeshiHomeLikeNav a[data-action="logout"].active,
            #yeshiHomeLikeNav a[data-action="logout"]:focus-visible,
            #yeshiHomeLikeNav #desktopLogoutItem a:hover,
            #yeshiHomeLikeNav #mobileMenuLogoutBtn:hover,
            #mobile-menu a[data-action="logout"]:hover {
                color: #525454 !important;
            }
            @media (min-width: 1024px) {
                #yeshiHomeLikeNav .yeshi-nav-inner {
                    padding-left: 40px;
                    padding-right: 40px;
                }
                #mobile-menu-toggle {
                    display: none;
                }
                #yeshiHomeLikeNav .yeshi-desktop-nav {
                    display: inline-flex;
                }
                #mobile-menu {
                    display: none !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    const firstHeader = document.querySelector('header');
    if (firstHeader) firstHeader.remove();

    const navShell = document.createElement('div');
    navShell.innerHTML = `
        <nav id="yeshiHomeLikeNav" class="fixed top-0 z-50 w-full bg-white/80 shadow-nav backdrop-blur-md">
            <div class="yeshi-nav-inner mx-auto flex max-w-[1920px] items-center justify-between px-4 py-4 md:px-10">
                <div class="yeshi-nav-left flex items-center gap-3">
                    <button type="button" id="mobile-menu-toggle" class="rounded-md p-2 text-brand-muted hover:text-brand-primary lg:hidden" aria-label="Open menu">
                        <span class="material-symbols-outlined text-2xl">menu</span>
                    </button>
                    <a aria-label="የሺ Home" class="logo inline-flex items-center gap-2" href="/user/" title="የሺ">
                        <img src="/images/logo.png" alt="የሺ" class="h-9 w-auto rounded-sm yeshi-logo-spin">
                        <span class="hidden text-xl font-bold tracking-tight sm:inline">Yeshi</span>
                    </a>
                </div>

                <ul class="yeshi-desktop-nav nav-links no-scrollbar hidden items-center gap-5 overflow-x-auto text-xs font-semibold uppercase tracking-wider lg:flex">
                    <li><a class="active text-brand-primary" href="/user/">Home</a></li>
                    <li id="desktopMyOrdersItem" class="hidden"><a href="/my-orders" class="hover:text-brand-primary">My Orders</a></li>
                    <li id="desktopLoginItem"><a href="/auth/login" class="hover:text-brand-primary">Login</a></li>
                    <li id="desktopSignupItem"><a href="/auth/register" class="hover:text-brand-primary">Sign Up</a></li>
                    <li id="desktopLogoutItem" class="hidden"><a href="#" data-action="logout" class="hover:text-brand-primary">Logout</a></li>
                </ul>

                <div class="yeshi-actions flex items-center gap-2 sm:gap-4">
                    <a class="yeshi-order-btn rounded-full bg-gradient-to-r from-brand-primary to-brand-accent px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm transition-opacity hover:opacity-90" data-order-link href="/user/order">Order</a>
                    <a aria-label="Favorites" class="yeshi-icon-btn rounded-full p-2 text-brand-muted hover:text-brand-primary" href="/user/favorites">
                        <span class="material-symbols-outlined">favorite</span>
                    </a>
                    <button type="button" id="notification-trigger" class="yeshi-icon-btn relative rounded-full p-2 text-brand-muted hover:text-brand-primary" aria-label="Notifications">
                        <span class="material-symbols-outlined">notifications</span>
                        <span id="notificationDot" class="absolute right-1 top-1 h-2 w-2 rounded-full bg-brand-accent hidden"></span>
                        <span id="notificationCountBadge" class="user-top-nav-badge"></span>
                    </button>
                    <a id="shoppingBagLink" href="/cart" class="yeshi-icon-btn relative rounded-full p-2 text-brand-muted hover:text-brand-primary" aria-label="Shopping bag">
                        <span class="material-symbols-outlined">shopping_bag</span>
                        <span id="bagCount" class="absolute -right-1 -top-1 min-w-[1rem] rounded-full bg-brand-primary px-1 text-center text-[10px] font-bold leading-4 text-white">0</span>
                    </a>
                    <a aria-label="Open MyChat" class="yeshi-icon-btn rounded-full p-2 text-brand-muted hover:text-brand-primary" href="/user/mychat" style="position: relative;">
                        <span class="material-symbols-outlined">chat</span>
                    </a>
                    <a id="desktopProfileAction" href="/profile" class="yeshi-icon-btn hidden rounded-full p-2 text-brand-muted hover:text-brand-primary" aria-label="Profile">
                        <span class="material-symbols-outlined">person</span>
                    </a>
                </div>
            </div>

            <div id="mobile-menu" class="hidden bg-white lg:hidden">
                <div class="yeshi-mobile-inner space-y-1 p-4 text-sm font-semibold uppercase tracking-wide">
                    <a class="active block rounded-md bg-amber-50 px-3 py-2 text-brand-primary" href="/user/">Home</a>
                    <a id="mobileMenuMyOrdersBtn" href="/my-orders" class="hidden rounded-md px-3 py-2 hover:bg-amber-50">My Orders</a>
                    <a id="mobileMenuLoginBtn" href="/auth/login" class="block rounded-md px-3 py-2 hover:bg-amber-50">Login</a>
                    <a id="mobileMenuSignupBtn" href="/auth/register" class="block rounded-md px-3 py-2 hover:bg-amber-50">Sign Up</a>
                    <a id="mobileMenuLogoutBtn" href="#" data-action="logout" class="hidden rounded-md px-3 py-2 hover:bg-amber-50">Logout</a>
                </div>
            </div>
        </nav>
    `;
    const nav = navShell.firstElementChild;
    if (nav) document.body.prepend(nav);
    removeLegacyDesktopProfileIcons();
    document.body.classList.add('yeshi-home-nav-active');

    const getBagItems = () => {
        try {
            const raw = localStorage.getItem('yeshi_bag');
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch (_) {
            return [];
        }
    };

    const updateBagBadge = () => {
        const countEl = document.getElementById('bagCount');
        const bagLink = document.getElementById('shoppingBagLink');
        if (!countEl || !bagLink) return;
        const count = getBagItems().reduce((sum, item) => sum + Math.max(1, Number(item && item.quantity || 1)), 0);
        if (count > 0) {
            countEl.textContent = count > 99 ? '99+' : String(count);
            countEl.style.display = 'inline-block';
            bagLink.style.display = 'inline-flex';
        } else {
            countEl.style.display = 'none';
            bagLink.style.display = 'inline-flex';
        }
    };

    const applyMenuAuthState = () => {
        const loginBtn = document.getElementById('mobileMenuLoginBtn');
        const signupBtn = document.getElementById('mobileMenuSignupBtn');
        const mobileMyOrdersBtn = document.getElementById('mobileMenuMyOrdersBtn');
        const logoutBtn = document.getElementById('mobileMenuLogoutBtn');
        const desktopMyOrders = document.getElementById('desktopMyOrdersItem');
        const desktopLogin = document.getElementById('desktopLoginItem');
        const desktopSignup = document.getElementById('desktopSignupItem');
        const desktopProfileAction = document.getElementById('desktopProfileAction');
        const desktopLogout = document.getElementById('desktopLogoutItem');
        const loggedIn = getCurrentAuthSnapshot().isLoggedIn;
        if (loginBtn) loginBtn.classList.toggle('hidden', loggedIn);
        if (signupBtn) signupBtn.classList.toggle('hidden', loggedIn);
        if (mobileMyOrdersBtn) mobileMyOrdersBtn.classList.toggle('hidden', !loggedIn);
        if (logoutBtn) logoutBtn.classList.toggle('hidden', !loggedIn);
        if (desktopMyOrders) desktopMyOrders.classList.toggle('hidden', !loggedIn);
        if (desktopLogin) desktopLogin.classList.toggle('hidden', loggedIn);
        if (desktopSignup) desktopSignup.classList.toggle('hidden', loggedIn);
        if (desktopProfileAction) desktopProfileAction.classList.toggle('hidden', !loggedIn);
        if (desktopLogout) desktopLogout.classList.toggle('hidden', !loggedIn);
    };

    applyMenuAuthState();
    updateBagBadge();
    window.addEventListener('storage', updateBagBadge);
}

function getCachedSettings(cacheKey) {
    try {
        const raw = localStorage.getItem(cacheKey);
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
        return null;
    }
}

function setCachedSettings(cacheKey, data) {
    try {
        localStorage.setItem(cacheKey, JSON.stringify({
            data,
            savedAt: Date.now()
        }));
    } catch (_) {
        // ignore storage errors
    }
}

function getSettingsFailUntil(endpointKey) {
    const key = `yeshi_settings_fail_until_${endpointKey}`;
    const raw = localStorage.getItem(key);
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
}

function setSettingsFailUntil(endpointKey, msFromNow) {
    const key = `yeshi_settings_fail_until_${endpointKey}`;
    try {
        localStorage.setItem(key, String(Date.now() + msFromNow));
    } catch (_) {
        // ignore storage errors
    }
}

async function fetchSettingsWithCache({ endpoint, cacheKey, endpointKey }) {
    const cached = getCachedSettings(cacheKey);
    const failUntil = getSettingsFailUntil(endpointKey);

    if (Date.now() < failUntil) {
        return cached ? cached.data : null;
    }

    try {
        const res = await fetch(endpoint);
        const text = await res.text();
        const json = text ? JSON.parse(text) : null;
        if (!res.ok || !json) {
            setSettingsFailUntil(endpointKey, 3 * 60 * 1000);
            return cached ? cached.data : null;
        }
        setCachedSettings(cacheKey, json);
        return json;
    } catch (_) {
        setSettingsFailUntil(endpointKey, 3 * 60 * 1000);
        return cached ? cached.data : null;
    }
}

function applyBrandingFromContent(content) {
    const siteTitle = String(content?.siteTitle || '').trim();
    if (siteTitle) {
        const parts = String(document.title || '').split('-').map((s) => s.trim()).filter(Boolean);
        if (parts.length >= 2) {
            parts[parts.length - 1] = siteTitle;
            document.title = parts.join(' - ');
        } else {
            document.title = siteTitle;
        }
    }

    if (siteTitle) {
        document.querySelectorAll('a.logo').forEach((a) => {
            a.setAttribute('aria-label', siteTitle + ' Home');
            a.title = siteTitle;
        });
        document.querySelectorAll('.logo img, a.logo img').forEach((img) => {
            img.alt = siteTitle;
        });
    }

    const logoUrl = String(content?.headerLogoUrl || '').trim();
    if (logoUrl) {
        document.querySelectorAll('.logo img, a.logo img').forEach((img) => {
            img.src = logoUrl;
            if (siteTitle) {
                img.alt = siteTitle;
                const a = img.closest('a');
                if (a && a.classList.contains('logo')) {
                    a.setAttribute('aria-label', siteTitle + ' Home');
                    a.title = siteTitle;
                }
            }
        });
    }

    const faviconUrl = String(content?.faviconUrl || '').trim();
    if (faviconUrl) {
        const links = Array.from(document.querySelectorAll('link[rel~="icon"]'));
        if (links.length === 0) {
            const link = document.createElement('link');
            link.rel = 'icon';
            link.type = 'image/png';
            link.href = faviconUrl;
            document.head.appendChild(link);
        } else {
            links.forEach((l) => {
                l.href = faviconUrl;
            });
        }
    }
}

function ensureLogoSpin() {
    if (!document.getElementById('yeshiLogoSpinStyles')) {
        const style = document.createElement('style');
        style.id = 'yeshiLogoSpinStyles';
        style.textContent = `
            @keyframes yeshiLogoSpin3d {
                0% { transform: rotateY(0deg); }
                50% { transform: rotateY(180deg); }
                100% { transform: rotateY(360deg); }
            }

            .yeshi-logo-spin {
                display: inline-block;
                transform-style: preserve-3d;
                animation: yeshiLogoSpin3d 8s linear infinite;
                will-change: transform;
            }
        `;
        document.head.appendChild(style);
    }

    document.querySelectorAll('.logo img, a.logo img').forEach((img) => {
        img.classList.add('yeshi-logo-spin');
    });
}

async function applySiteContent() {
    try {
        const data = await fetchSettingsWithCache({
            endpoint: '/api/settings/content',
            cacheKey: 'yeshi_settings_content_cache',
            endpointKey: 'content'
        });
        if (!data) return;
        const content = (data && data.content) || {};

        applyBrandingFromContent(content);

        // Auth pages (login/signup) promo content
        const authBadge = document.querySelector('.auth-badge');
        if (authBadge && String(content.authBadge || '').trim()) {
            authBadge.textContent = String(content.authBadge).trim();
        }

        const authTitle = document.querySelector('.auth-title');
        if (authTitle && String(content.authTitle || '').trim()) {
            authTitle.textContent = String(content.authTitle).trim();
        }

        const authSubtitle = document.querySelector('.auth-subtitle');
        if (authSubtitle && String(content.authSubtitle || '').trim()) {
            authSubtitle.textContent = String(content.authSubtitle).trim();
        }

        const features = Array.from(document.querySelectorAll('.auth-feature-list .auth-feature'));
        const setFeature = (idx, titleKey, textKey) => {
            const row = features[idx];
            if (!row) return;
            const title = String(content[titleKey] || '').trim();
            const text = String(content[textKey] || '').trim();
            if (!title && !text) return;

            const container = row.querySelector('div');
            if (!container) return;
            container.innerHTML = '';
            if (title) {
                const strong = document.createElement('strong');
                strong.textContent = title;
                container.appendChild(strong);
            }
            if (text) {
                container.appendChild(document.createTextNode((title ? ' ' : '') + text));
            }
        };
        setFeature(0, 'authFeature1Title', 'authFeature1Text');
        setFeature(1, 'authFeature2Title', 'authFeature2Text');
        setFeature(2, 'authFeature3Title', 'authFeature3Text');

        // Footer content
        const footer = document.querySelector('footer');
        if (footer) {
            const footerSections = Array.from(footer.querySelectorAll('.footer-section'));
            const brandSection = footerSections[0] || null;
            const brand = String(content.footerBrand || '').trim();
            const tagline = String(content.footerTagline || '').trim();

            if (brandSection) {
                const brandH3 = brandSection.querySelector('h3');
                if (brandH3 && brand) brandH3.textContent = brand;

                if (tagline) {
                    let taglineP = brandSection.querySelector('p');
                    if (!taglineP) {
                        taglineP = document.createElement('p');
                        brandSection.appendChild(taglineP);
                    }
                    taglineP.textContent = tagline;
                }
            }

            const contactSection = footer.querySelector('i.fab.fa-whatsapp, i.fas.fa-phone, i.fab.fa-telegram')?.closest('.footer-section') || null;
            const followSection = footer.querySelector('.social-links')?.closest('.footer-section') || null;

            const contactHeader = String(content.footerContactHeader || '').trim();
            const followHeader = String(content.footerFollowHeader || '').trim();
            if (contactSection && contactHeader) {
                const h3 = contactSection.querySelector('h3');
                if (h3) h3.textContent = contactHeader;
            }
            if (followSection && followHeader) {
                const h3 = followSection.querySelector('h3');
                if (h3) h3.textContent = followHeader;
            }

            const locationP = footer.querySelector('i.fas.fa-map-marker-alt')?.closest('p');
            const location = String(content.footerLocation || '').trim();
            if (locationP && location) {
                const icon = locationP.querySelector('i');
                locationP.innerHTML = '';
                if (icon) locationP.appendChild(icon);
                locationP.appendChild(document.createTextNode(' ' + location));
            }

            const whatsappText = String(content.footerWhatsAppText || '').trim();
            const phoneText = String(content.footerPhoneText || '').trim();
            const telegramText = String(content.footerTelegramText || '').trim();

            const whatsappA = footer.querySelector('i.fab.fa-whatsapp')?.closest('a');
            if (whatsappA && whatsappText) whatsappA.textContent = whatsappText;

            const phoneA = footer.querySelector('i.fas.fa-phone')?.closest('a');
            if (phoneA && phoneText) phoneA.textContent = phoneText;

            const telegramA = contactSection
                ? contactSection.querySelector('i.fab.fa-telegram')?.closest('a')
                : null;
            if (telegramA && telegramText) telegramA.textContent = telegramText;
        }
    } catch (_) {
        // no-op
    }
}

async function applySocialLinks() {
    try {
        const data = await fetchSettingsWithCache({
            endpoint: '/api/settings/social',
            cacheKey: 'yeshi_settings_social_cache',
            endpointKey: 'social'
        });
        if (!data) return;
        const social = (data && data.social) || {};

        const tiktok = String(social.tiktok || '').trim();
        const telegram = String(social.telegram || '').trim();
        const facebook = String(social.facebook || '').trim();
        const instagram = String(social.instagram || '').trim();
        const whatsapp = String(social.whatsapp || '').trim();
        const phone = String(social.phone || '').trim();

        ensureFooterSocialBlocks({ tiktok, telegram, facebook, instagram, whatsapp, phone });

        if (tiktok) {
            document.querySelectorAll('i.fab.fa-tiktok').forEach((icon) => {
                const a = icon.closest('a');
                if (a) a.href = tiktok;
            });
        }

        if (telegram) {
            document.querySelectorAll('i.fab.fa-telegram').forEach((icon) => {
                const a = icon.closest('a');
                if (a) a.href = telegram;
            });
        }

        if (facebook) {
            document.querySelectorAll('i.fab.fa-facebook-f').forEach((icon) => {
                const a = icon.closest('a');
                if (a) a.href = facebook;
            });
        }

        if (instagram) {
            document.querySelectorAll('i.fab.fa-instagram').forEach((icon) => {
                const a = icon.closest('a');
                if (a) a.href = instagram;
            });
        }

        if (whatsapp) {
            document.querySelectorAll('i.fab.fa-whatsapp').forEach((icon) => {
                const a = icon.closest('a');
                if (a) a.href = whatsapp;
            });
        }

        if (phone) {
            const tel = phone.startsWith('tel:') ? phone : `tel:${phone}`;
            document.querySelectorAll('i.fas.fa-phone').forEach((icon) => {
                const a = icon.closest('a');
                if (a) a.href = tel;
            });
        }
    } catch (_) {
        // no-op
    }
}

function ensureFooterSocialBlocks(social) {
    const footer = document.querySelector('footer');
    if (!footer) return;

    const footerSections = Array.from(footer.querySelectorAll('.footer-section'));
    const findSectionByHeading = (needle) => {
        const n = String(needle || '').toLowerCase();
        return footerSections.find((section) => {
            const h3 = section.querySelector('h3');
            const text = String(h3?.textContent || '').toLowerCase();
            return text.includes(n);
        }) || null;
    };

    let contactSection = footer.querySelector('i.fab.fa-whatsapp, i.fas.fa-phone, i.fab.fa-telegram')?.closest('.footer-section') || null;
    if (!contactSection) contactSection = findSectionByHeading('contact') || findSectionByHeading('mychat');

    let followSection = footer.querySelector('.social-links')?.closest('.footer-section') || null;
    if (!followSection) followSection = findSectionByHeading('follow');

    const rootContainer =
        footer.querySelector('.footer-content') ||
        footer.querySelector('.mx-auto.grid') ||
        footer;

    if (!contactSection) {
        contactSection = document.createElement('div');
        contactSection.className = 'footer-section';
        contactSection.innerHTML = '<h3>Contact</h3>';
        rootContainer.appendChild(contactSection);
    }

    if (!followSection) {
        followSection = document.createElement('div');
        followSection.className = 'footer-section';
        followSection.innerHTML = '<h3>Follow Us</h3><div class="social-links mt-3 flex items-center gap-4 text-lg"></div>';
        rootContainer.appendChild(followSection);
    }

    // Normalize pre-existing contact rows so we update in-place instead of duplicating rows.
    const existingContactRows = Array.from(contactSection.querySelectorAll('p'));
    existingContactRows.forEach((row) => {
        if (row.getAttribute('data-social-key')) return;

        const icon = row.querySelector('i');
        if (!icon) return;

        let key = '';
        if (icon.classList.contains('fa-whatsapp')) key = 'whatsapp';
        else if (icon.classList.contains('fa-telegram')) key = 'telegram';
        else if (icon.classList.contains('fa-facebook-f') || icon.classList.contains('fa-facebook')) key = 'facebook';
        else if (icon.classList.contains('fa-instagram')) key = 'instagram';
        else if (icon.classList.contains('fa-tiktok')) key = 'tiktok';
        else if (icon.classList.contains('fa-phone')) key = 'phone';

        if (key) row.setAttribute('data-social-key', key);
    });

    // Remove duplicate keyed rows, keep the first occurrence for each social key.
    const seenContactKeys = new Set();
    Array.from(contactSection.querySelectorAll('p[data-social-key]')).forEach((row) => {
        const key = row.getAttribute('data-social-key');
        if (!key) return;
        if (seenContactKeys.has(key)) {
            row.remove();
            return;
        }
        seenContactKeys.add(key);
    });

    // Normalize pre-existing follow anchors so text links become icon links.
    const followContainer = followSection.querySelector('.social-links');
    if (followContainer) {
        Array.from(followContainer.querySelectorAll('a')).forEach((anchor) => {
            if (anchor.getAttribute('data-social-key')) return;

            const icon = anchor.querySelector('i');
            const label = String(anchor.getAttribute('aria-label') || '').toLowerCase();
            const text = String(anchor.textContent || '').toLowerCase();
            let key = '';

            if (icon) {
                if (icon.classList.contains('fa-whatsapp')) key = 'whatsapp';
                else if (icon.classList.contains('fa-telegram')) key = 'telegram';
                else if (icon.classList.contains('fa-facebook-f') || icon.classList.contains('fa-facebook')) key = 'facebook';
                else if (icon.classList.contains('fa-instagram')) key = 'instagram';
                else if (icon.classList.contains('fa-tiktok')) key = 'tiktok';
            }

            if (!key) {
                if (label.includes('whatsapp') || text.includes('whatsapp')) key = 'whatsapp';
                else if (label.includes('telegram') || text.includes('telegram')) key = 'telegram';
                else if (label.includes('facebook') || text.includes('facebook')) key = 'facebook';
                else if (label.includes('instagram') || text.includes('instagram')) key = 'instagram';
                else if (label.includes('tiktok') || text.includes('tiktok')) key = 'tiktok';
            }

            if (!key) return;

            anchor.setAttribute('data-social-key', key);
            if (!icon) {
                const i = document.createElement('i');
                anchor.innerHTML = '';
                anchor.appendChild(i);
            }
        });

        // Remove duplicate follow anchors by social key.
        const seenFollowKeys = new Set();
        Array.from(followContainer.querySelectorAll('a[data-social-key]')).forEach((anchor) => {
            const key = anchor.getAttribute('data-social-key');
            if (!key) return;
            if (seenFollowKeys.has(key)) {
                anchor.remove();
                return;
            }
            seenFollowKeys.add(key);
        });
    }

    const ensureContactItem = ({ key, iconClass, text, href, external }) => {
        if (!href) return;
        let row = contactSection.querySelector(`p[data-social-key="${key}"]`);
        if (!row) {
            row = document.createElement('p');
            row.setAttribute('data-social-key', key);
            row.innerHTML = `<i class="${iconClass}"></i> <a>${text}</a>`;
            contactSection.appendChild(row);
        }

        const icon = row.querySelector('i');
        if (icon) icon.className = iconClass;

        const anchor = row.querySelector('a');
        if (anchor) {
            anchor.textContent = text;
            anchor.href = href;
            if (external) {
                anchor.target = '_blank';
                anchor.rel = 'noopener noreferrer';
            } else {
                anchor.removeAttribute('target');
                anchor.removeAttribute('rel');
            }
        }
    };

    const ensureFollowIcon = ({ key, iconClass, href, label }) => {
        if (!href) return;
        let container = followSection.querySelector('.social-links');
        if (!container) {
            container = document.createElement('div');
            container.className = 'social-links mt-3 flex items-center gap-4 text-lg';
            followSection.appendChild(container);
        }

        let link = container.querySelector(`a[data-social-key="${key}"]`);
        if (!link) {
            link = document.createElement('a');
            link.setAttribute('data-social-key', key);
            link.innerHTML = `<i class="${iconClass}"></i>`;
            container.appendChild(link);
        }

        link.href = href;
        link.setAttribute('aria-label', label);
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = '';
        if (!link.querySelector('i')) {
            link.innerHTML = `<i class="${iconClass}"></i>`;
        }
        const icon = link.querySelector('i');
        if (icon) icon.className = iconClass;
    };

    const phoneHref = social.phone ? (social.phone.startsWith('tel:') ? social.phone : `tel:${social.phone}`) : '';

    ensureContactItem({ key: 'whatsapp', iconClass: 'fab fa-whatsapp', text: 'WhatsApp', href: social.whatsapp, external: true });
    ensureContactItem({ key: 'phone', iconClass: 'fas fa-phone', text: social.phone || 'Phone', href: phoneHref, external: false });

    // Keep social platforms only under "Follow Us", not in the "Contact" block.
    ['telegram', 'facebook', 'instagram', 'tiktok'].forEach((key) => {
        const row = contactSection.querySelector(`p[data-social-key="${key}"]`);
        if (row) row.remove();
    });

    ensureFollowIcon({ key: 'whatsapp', iconClass: 'fab fa-whatsapp', href: social.whatsapp, label: 'WhatsApp' });
    ensureFollowIcon({ key: 'telegram', iconClass: 'fab fa-telegram', href: social.telegram, label: 'Telegram' });
    ensureFollowIcon({ key: 'facebook', iconClass: 'fab fa-facebook-f', href: social.facebook, label: 'Facebook' });
    ensureFollowIcon({ key: 'instagram', iconClass: 'fab fa-instagram', href: social.instagram, label: 'Instagram' });
    ensureFollowIcon({ key: 'tiktok', iconClass: 'fab fa-tiktok', href: social.tiktok, label: 'TikTok' });
}

function applyThemeMode(mode) {
    const normalized = mode === 'dark' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', normalized);
    document.body.setAttribute('data-theme', normalized);
    try {
        localStorage.setItem('yeshi_theme', normalized);
    } catch (_) {
        // ignore storage errors
    }

    const btn = document.getElementById('themeModeToggle');
    if (btn) {
        btn.textContent = normalized === 'dark' ? 'Light' : 'Dark';
        btn.setAttribute('aria-label', normalized === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
        btn.title = normalized === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    }
}

function ensureUserThemeToggle() {
    const path = String(window.location.pathname || '').toLowerCase();
    if (path.startsWith('/admin') || path.startsWith('/auth')) return;

    if (!document.getElementById('yeshiThemeStyles')) {
        const style = document.createElement('style');
        style.id = 'yeshiThemeStyles';
        style.textContent = `
            :root[data-theme="dark"],
            body[data-theme="dark"] {
                --dark-bg: #0f172a;
                --dark-top: #020617;
                --dark-section: #111827;
                --dark-surface: #1e293b;
                --dark-border: #334155;
                --text-primary: #f9fafb;
                --text-secondary: #cbd5e1;
                --text-muted: #94a3b8;
                --gold: #d4af37;
                --gold-hover: #facc15;
                --link-color: #38bdf8;
                --link-hover: #7dd3fc;
                --status-success: #22c55e;
                --status-error: #ef4444;
                --status-warning: #f59e0b;
                --status-info: #0ea5e9;
                --light-text: #94a3b8;
                --accent-color: #d4af37;
            }
            #themeModeToggle {
                position: fixed;
                right: 18px;
                bottom: 138px;
                z-index: 2100;
                border: 1px solid rgba(116,91,24,0.28);
                background: #ffffff;
                color: #1f1b13;
                border-radius: 999px;
                height: 42px;
                min-width: 72px;
                padding: 0 14px;
                font-weight: 700;
                cursor: pointer;
                box-shadow: 0 8px 22px rgba(0,0,0,0.18);
            }
            [data-theme="dark"] #themeModeToggle,
            body[data-theme="dark"] #themeModeToggle {
                background: var(--dark-surface);
                color: var(--text-primary);
                border-color: #475569;
                box-shadow: 0 10px 24px rgba(0,0,0,0.35);
            }
            [data-theme="dark"] body,
            body[data-theme="dark"] {
                background: var(--dark-bg) !important;
                color: var(--text-primary) !important;
            }
            [data-theme="dark"] header,
            [data-theme="dark"] nav,
            [data-theme="dark"] footer,
            [data-theme="dark"] .navbar,
            [data-theme="dark"] .hero,
            body[data-theme="dark"] header,
            body[data-theme="dark"] nav,
            body[data-theme="dark"] footer,
            body[data-theme="dark"] .navbar,
            body[data-theme="dark"] .hero {
                background-color: var(--dark-top) !important;
                color: var(--text-primary) !important;
                border-color: var(--dark-border) !important;
            }
            [data-theme="dark"] main,
            [data-theme="dark"] section,
            body[data-theme="dark"] main,
            body[data-theme="dark"] section {
                background-color: transparent;
                color: var(--text-primary);
            }
            [data-theme="dark"] .product-card,
            [data-theme="dark"] .panel,
            [data-theme="dark"] .card,
            [data-theme="dark"] .form-section,
            [data-theme="dark"] .notification-card,
            [data-theme="dark"] .order-card,
            [data-theme="dark"] .dropdown-menu,
            [data-theme="dark"] .user-chat-panel,
            [data-theme="dark"] .user-notification-drawer,
            body[data-theme="dark"] .product-card,
            body[data-theme="dark"] .panel,
            body[data-theme="dark"] .card,
            body[data-theme="dark"] .form-section,
            body[data-theme="dark"] .notification-card,
            body[data-theme="dark"] .order-card,
            body[data-theme="dark"] .dropdown-menu,
            body[data-theme="dark"] .user-chat-panel,
            body[data-theme="dark"] .user-notification-drawer {
                background: var(--dark-surface) !important;
                color: var(--text-primary) !important;
                border: 1px solid #2d3748 !important;
                box-shadow: 0 8px 20px rgba(2, 6, 23, 0.32);
            }
            [data-theme="dark"] .home-page #superdeals-feed > article,
            [data-theme="dark"] .home-page #newdesign-feed > article,
            body[data-theme="dark"] .home-page #superdeals-feed > article,
            body[data-theme="dark"] .home-page #newdesign-feed > article {
                background: #f4f3f3 !important;
                color: #1a1c1c !important;
                border: 1px solid #d0c5b4 !important;
                box-shadow: 0 8px 18px rgba(26, 28, 28, 0.12) !important;
            }
            [data-theme="dark"] .home-page #superdeals-feed > article h3,
            [data-theme="dark"] .home-page #newdesign-feed > article h3,
            [data-theme="dark"] .home-page #superdeals-feed > article p,
            [data-theme="dark"] .home-page #newdesign-feed > article p,
            [data-theme="dark"] .home-page #superdeals-feed > article span,
            [data-theme="dark"] .home-page #newdesign-feed > article span,
            body[data-theme="dark"] .home-page #superdeals-feed > article h3,
            body[data-theme="dark"] .home-page #newdesign-feed > article h3,
            body[data-theme="dark"] .home-page #superdeals-feed > article p,
            body[data-theme="dark"] .home-page #newdesign-feed > article p,
            body[data-theme="dark"] .home-page #superdeals-feed > article span,
            body[data-theme="dark"] .home-page #newdesign-feed > article span {
                color: #1a1c1c !important;
            }
            [data-theme="dark"] .home-page #superdeals-feed > article .text-brand-muted,
            [data-theme="dark"] .home-page #newdesign-feed > article .text-brand-muted,
            body[data-theme="dark"] .home-page #superdeals-feed > article .text-brand-muted,
            body[data-theme="dark"] .home-page #newdesign-feed > article .text-brand-muted {
                color: #4d4639 !important;
            }
            [data-theme="dark"] .home-page #superdeals-feed > article [class*="bg-[#ececec]"],
            [data-theme="dark"] .home-page #newdesign-feed > article [class*="bg-[#ececec]"],
            body[data-theme="dark"] .home-page #superdeals-feed > article [class*="bg-[#ececec]"],
            body[data-theme="dark"] .home-page #newdesign-feed > article [class*="bg-[#ececec]"] {
                background: #ececec !important;
                color: #1a1c1c !important;
            }
            [data-theme="dark"] #orderForm,
            [data-theme="dark"] #orderForm .form-section,
            [data-theme="dark"] #myOrdersList .product-card,
            [data-theme="dark"] #myOrdersList .payment-proof-form,
            [data-theme="dark"] #myOrdersList .negotiation-form,
            body[data-theme="dark"] #orderForm,
            body[data-theme="dark"] #orderForm .form-section,
            body[data-theme="dark"] #myOrdersList .product-card,
            body[data-theme="dark"] #myOrdersList .payment-proof-form,
            body[data-theme="dark"] #myOrdersList .negotiation-form {
                background: #f4f3f3 !important;
                color: #1a1c1c !important;
                border-color: #d0c5b4 !important;
            }
            [data-theme="dark"] #orderForm h3,
            [data-theme="dark"] #orderForm label,
            [data-theme="dark"] #orderForm p,
            [data-theme="dark"] #orderForm small,
            [data-theme="dark"] #myOrdersList h3,
            [data-theme="dark"] #myOrdersList p,
            [data-theme="dark"] #myOrdersList div,
            [data-theme="dark"] #myOrdersList span,
            body[data-theme="dark"] #orderForm h3,
            body[data-theme="dark"] #orderForm label,
            body[data-theme="dark"] #orderForm p,
            body[data-theme="dark"] #orderForm small,
            body[data-theme="dark"] #myOrdersList h3,
            body[data-theme="dark"] #myOrdersList p,
            body[data-theme="dark"] #myOrdersList div,
            body[data-theme="dark"] #myOrdersList span {
                color: #1a1c1c !important;
            }
            [data-theme="dark"] #orderForm input,
            [data-theme="dark"] #orderForm select,
            [data-theme="dark"] #orderForm textarea,
            [data-theme="dark"] #myOrdersList input,
            [data-theme="dark"] #myOrdersList select,
            [data-theme="dark"] #myOrdersList textarea,
            body[data-theme="dark"] #orderForm input,
            body[data-theme="dark"] #orderForm select,
            body[data-theme="dark"] #orderForm textarea,
            body[data-theme="dark"] #myOrdersList input,
            body[data-theme="dark"] #myOrdersList select,
            body[data-theme="dark"] #myOrdersList textarea {
                background: #ffffff !important;
                color: #1a1c1c !important;
                border-color: #d0c5b4 !important;
            }
            [data-theme="dark"] .filter-pill,
            body[data-theme="dark"] .filter-pill {
                background: var(--dark-surface) !important;
                color: var(--text-secondary) !important;
                border: 1px solid #334155 !important;
            }
            [data-theme="dark"] .filter-pill.bg-brand-primary,
            [data-theme="dark"] .filter-pill.active,
            body[data-theme="dark"] .filter-pill.bg-brand-primary,
            body[data-theme="dark"] .filter-pill.active {
                background: var(--gold) !important;
                color: #020617 !important;
                border-color: var(--gold) !important;
            }
            [data-theme="dark"] input,
            [data-theme="dark"] select,
            [data-theme="dark"] textarea,
            body[data-theme="dark"] input,
            body[data-theme="dark"] select,
            body[data-theme="dark"] textarea {
                background: #1e293b !important;
                color: #f1f5f9 !important;
                border-color: #334155 !important;
            }
            [data-theme="dark"] input::placeholder,
            [data-theme="dark"] textarea::placeholder,
            body[data-theme="dark"] input::placeholder,
            body[data-theme="dark"] textarea::placeholder {
                color: #64748b !important;
            }
            [data-theme="dark"] input:focus,
            [data-theme="dark"] select:focus,
            [data-theme="dark"] textarea:focus,
            body[data-theme="dark"] input:focus,
            body[data-theme="dark"] select:focus,
            body[data-theme="dark"] textarea:focus {
                border-color: var(--gold) !important;
                box-shadow: 0 0 0 2px rgba(212,175,55,0.25) !important;
            }
            [data-theme="dark"] h1,
            [data-theme="dark"] h2,
            [data-theme="dark"] h3,
            [data-theme="dark"] h4,
            [data-theme="dark"] h5,
            [data-theme="dark"] h6,
            [data-theme="dark"] strong,
            body[data-theme="dark"] h1,
            body[data-theme="dark"] h2,
            body[data-theme="dark"] h3,
            body[data-theme="dark"] h4,
            body[data-theme="dark"] h5,
            body[data-theme="dark"] h6,
            body[data-theme="dark"] strong {
                color: var(--text-primary) !important;
            }
            [data-theme="dark"] p,
            [data-theme="dark"] span,
            [data-theme="dark"] small,
            [data-theme="dark"] li,
            [data-theme="dark"] label,
            body[data-theme="dark"] p,
            body[data-theme="dark"] span,
            body[data-theme="dark"] small,
            body[data-theme="dark"] li,
            body[data-theme="dark"] label {
                color: var(--text-secondary) !important;
            }
            [data-theme="dark"] .text-brand-muted,
            [data-theme="dark"] .muted,
            body[data-theme="dark"] .text-brand-muted,
            body[data-theme="dark"] .muted {
                color: var(--text-muted) !important;
            }
            [data-theme="dark"] [style*="color:#1a1c1c"],
            [data-theme="dark"] [style*="color: #1a1c1c"],
            [data-theme="dark"] [style*="color:#666"],
            [data-theme="dark"] [style*="color: #666"],
            [data-theme="dark"] [style*="color:#745B18"],
            [data-theme="dark"] [style*="color: #745B18"],
            [data-theme="dark"] [style*="color:#ba1a1a"],
            [data-theme="dark"] [style*="color: #ba1a1a"],
            body[data-theme="dark"] [style*="color:#1a1c1c"],
            body[data-theme="dark"] [style*="color: #1a1c1c"],
            body[data-theme="dark"] [style*="color:#666"],
            body[data-theme="dark"] [style*="color: #666"],
            body[data-theme="dark"] [style*="color:#745B18"],
            body[data-theme="dark"] [style*="color: #745B18"],
            body[data-theme="dark"] [style*="color:#ba1a1a"],
            body[data-theme="dark"] [style*="color: #ba1a1a"] {
                color: var(--text-secondary) !important;
            }
            [data-theme="dark"] [style*="color:#bb0010"],
            [data-theme="dark"] [style*="color: #bb0010"],
            body[data-theme="dark"] [style*="color:#bb0010"],
            body[data-theme="dark"] [style*="color: #bb0010"] {
                color: #f87171 !important;
            }
            [data-theme="dark"] [style*="color:#1aad19"],
            [data-theme="dark"] [style*="color: #1aad19"],
            body[data-theme="dark"] [style*="color:#1aad19"],
            body[data-theme="dark"] [style*="color: #1aad19"] {
                color: #22c55e !important;
            }
            [data-theme="dark"] a,
            body[data-theme="dark"] a {
                color: #38bdf8 !important;
            }
            [data-theme="dark"] a:hover,
            body[data-theme="dark"] a:hover {
                color: #7dd3fc !important;
                text-decoration: underline;
            }
            [data-theme="dark"] .btn,
            body[data-theme="dark"] .btn {
                background: var(--gold) !important;
                color: #020617 !important;
                border: 1px solid var(--gold) !important;
            }
            [data-theme="dark"] .btn:hover,
            body[data-theme="dark"] .btn:hover {
                background: var(--gold-hover) !important;
                border-color: var(--gold-hover) !important;
            }
            [data-theme="dark"] .btn-secondary,
            body[data-theme="dark"] .btn-secondary {
                background: transparent !important;
                color: #f9fafb !important;
                border: 1px solid #475569 !important;
            }
            [data-theme="dark"] .btn-primary,
            body[data-theme="dark"] .btn-primary {
                background: #2563eb !important;
                color: #ffffff !important;
                border-color: #2563eb !important;
            }
            [data-theme="dark"] .btn-primary:hover,
            body[data-theme="dark"] .btn-primary:hover {
                background: #3b82f6 !important;
                border-color: #3b82f6 !important;
            }
            [data-theme="dark"] button:disabled,
            [data-theme="dark"] .btn:disabled,
            [data-theme="dark"] .btn-secondary:disabled,
            body[data-theme="dark"] button:disabled,
            body[data-theme="dark"] .btn:disabled,
            body[data-theme="dark"] .btn-secondary:disabled {
                background: #334155 !important;
                color: #94a3b8 !important;
                border-color: #334155 !important;
                opacity: 0.85;
            }
            [data-theme="dark"] .material-symbols-outlined,
            [data-theme="dark"] i,
            body[data-theme="dark"] .material-symbols-outlined,
            body[data-theme="dark"] i {
                color: #e2e8f0 !important;
            }
            [data-theme="dark"] #notificationDot,
            [data-theme="dark"] .user-chat-launcher__badge,
            body[data-theme="dark"] #notificationDot,
            body[data-theme="dark"] .user-chat-launcher__badge {
                background: #ef4444 !important;
            }
            [data-theme="dark"] .user-chat-panel,
            body[data-theme="dark"] .user-chat-panel {
                background: #ffffff !important;
                color: #1a1c1c !important;
                border-color: rgba(116, 91, 24, 0.24) !important;
                box-shadow: 0 20px 48px rgba(0,0,0,0.28) !important;
            }
            [data-theme="dark"] .user-chat-panel__frame,
            body[data-theme="dark"] .user-chat-panel__frame {
                background: #ffffff !important;
            }
            [data-theme="dark"] .user-notification-drawer,
            [data-theme="dark"] .user-notification-list,
            [data-theme="dark"] .user-notification-item,
            [data-theme="dark"] .user-notification-item.unread,
            body[data-theme="dark"] .user-notification-drawer,
            body[data-theme="dark"] .user-notification-list,
            body[data-theme="dark"] .user-notification-item,
            body[data-theme="dark"] .user-notification-item.unread {
                background: #ffffff !important;
                color: #1a1c1c !important;
                border-color: #efe8d9 !important;
            }
            [data-theme="dark"] .user-notification-list,
            body[data-theme="dark"] .user-notification-list {
                background: #fafafa !important;
            }
            [data-theme="dark"] .user-notification-item.unread,
            body[data-theme="dark"] .user-notification-item.unread {
                border-color: #d4b468 !important;
                background: #fffaf0 !important;
            }
            [data-theme="dark"] #notification-overlay #notification-drawer,
            [data-theme="dark"] #notification-overlay #notificationList,
            [data-theme="dark"] #notification-overlay #notificationList article,
            body[data-theme="dark"] #notification-overlay #notification-drawer,
            body[data-theme="dark"] #notification-overlay #notificationList,
            body[data-theme="dark"] #notification-overlay #notificationList article {
                background: #ffffff !important;
                color: #1a1c1c !important;
                border-color: #e5e7eb !important;
            }
            [data-theme="dark"] #notification-overlay #notification-drawer *,
            body[data-theme="dark"] #notification-overlay #notification-drawer *,
            [data-theme="dark"] .user-notification-drawer *,
            body[data-theme="dark"] .user-notification-drawer * {
                color: #1a1c1c !important;
            }
            [data-theme="dark"] #notification-overlay #notificationList,
            body[data-theme="dark"] #notification-overlay #notificationList {
                background: #f9fafb !important;
            }
            [data-theme="dark"] #notification-overlay [class*="bg-gray-50"],
            [data-theme="dark"] #notification-overlay [class*="bg-white"],
            [data-theme="dark"] #notification-overlay [class*="text-brand-muted"],
            body[data-theme="dark"] #notification-overlay [class*="bg-gray-50"],
            body[data-theme="dark"] #notification-overlay [class*="bg-white"],
            body[data-theme="dark"] #notification-overlay [class*="text-brand-muted"] {
                background: #ffffff !important;
                color: #4d4639 !important;
            }
            [data-theme="dark"] #notification-overlay a,
            body[data-theme="dark"] #notification-overlay a,
            [data-theme="dark"] .user-notification-drawer a,
            body[data-theme="dark"] .user-notification-drawer a {
                color: #1a1c1c !important;
                text-decoration: none !important;
            }
            [data-theme="dark"] body.mychat-page,
            body.mychat-page[data-theme="dark"] {
                background:
                    radial-gradient(circle at 15% 20%, rgba(212, 180, 104, 0.11), transparent 34%),
                    radial-gradient(circle at 85% 90%, rgba(116, 91, 24, 0.08), transparent 30%),
                    #fff8f0 !important;
                color: #1a1c1c !important;
            }
            [data-theme="dark"] body.mychat-page .shell,
            body.mychat-page[data-theme="dark"] .shell {
                background: color-mix(in srgb, #fff8f0 94%, #ffffff 6%) !important;
                color: #1a1c1c !important;
                box-shadow: 0 0 0 1px rgba(126, 118, 103, 0.12), 0 24px 60px rgba(26, 28, 28, 0.06) !important;
            }
            [data-theme="dark"] body.mychat-page .topbar,
            [data-theme="dark"] body.mychat-page .composer-wrap,
            body.mychat-page[data-theme="dark"] .topbar,
            body.mychat-page[data-theme="dark"] .composer-wrap {
                background: rgba(250, 249, 249, 0.9) !important;
                border-color: rgba(126, 118, 103, 0.12) !important;
            }
            [data-theme="dark"] body.mychat-page .material-symbols-outlined,
            [data-theme="dark"] body.mychat-page p,
            [data-theme="dark"] body.mychat-page span,
            [data-theme="dark"] body.mychat-page small,
            [data-theme="dark"] body.mychat-page a,
            body.mychat-page[data-theme="dark"] .material-symbols-outlined,
            body.mychat-page[data-theme="dark"] p,
            body.mychat-page[data-theme="dark"] span,
            body.mychat-page[data-theme="dark"] small,
            body.mychat-page[data-theme="dark"] a {
                color: #1a1c1c !important;
            }
            [data-theme="dark"] .text-success,
            [data-theme="dark"] .success,
            body[data-theme="dark"] .text-success,
            body[data-theme="dark"] .success {
                color: #22c55e !important;
            }
            [data-theme="dark"] .text-error,
            [data-theme="dark"] .error,
            body[data-theme="dark"] .text-error,
            body[data-theme="dark"] .error {
                color: #ef4444 !important;
            }
            [data-theme="dark"] .text-warning,
            [data-theme="dark"] .warning,
            body[data-theme="dark"] .text-warning,
            body[data-theme="dark"] .warning {
                color: #f59e0b !important;
            }
            [data-theme="dark"] .text-info,
            [data-theme="dark"] .info,
            body[data-theme="dark"] .text-info,
            body[data-theme="dark"] .info {
                color: #0ea5e9 !important;
            }
            [data-theme="dark"] ::-webkit-scrollbar,
            body[data-theme="dark"] ::-webkit-scrollbar {
                width: 10px;
                height: 10px;
            }
            [data-theme="dark"] ::-webkit-scrollbar-track,
            body[data-theme="dark"] ::-webkit-scrollbar-track {
                background: #0f172a;
            }
            [data-theme="dark"] ::-webkit-scrollbar-thumb,
            body[data-theme="dark"] ::-webkit-scrollbar-thumb {
                background: #334155;
                border-radius: 999px;
            }
            @media (max-width: 900px) {
                #themeModeToggle {
                    bottom: 142px;
                    right: 12px;
                    min-width: 64px;
                    height: 38px;
                }
            }
        `;
        document.head.appendChild(style);
    }

    let btn = document.getElementById('themeModeToggle');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'themeModeToggle';
        btn.type = 'button';
        btn.textContent = 'Dark';
        document.body.appendChild(btn);
    }

    btn.onclick = () => {
        const current = document.documentElement.getAttribute('data-theme') || document.body.getAttribute('data-theme') || 'light';
        applyThemeMode(current === 'dark' ? 'light' : 'dark');
    };

    const saved = (() => {
        try { return localStorage.getItem('yeshi_theme'); } catch (_) { return null; }
    })();
    applyThemeMode(saved === 'dark' ? 'dark' : 'light');
}

function ensureUnifiedUserFooter() {
    const path = String(window.location.pathname || '').toLowerCase();
    if (path.startsWith('/admin') || path.startsWith('/auth')) return;

    let footer = document.querySelector('footer');
    if (!footer) {
        footer = document.createElement('footer');
        document.body.appendChild(footer);
    }

    if (!document.getElementById('yeshiUnifiedFooterStyles')) {
        const style = document.createElement('style');
        style.id = 'yeshiUnifiedFooterStyles';
        style.textContent = `
            .yeshi-footer {
                background: #e8e8e8;
                padding: 48px 24px;
            }
            .yeshi-footer__wrap {
                max-width: 1920px;
                margin: 0 auto;
                display: grid;
                gap: 28px;
                grid-template-columns: repeat(1, minmax(0, 1fr));
            }
            .yeshi-footer__brand {
                font-size: 1.25rem;
                font-weight: 800;
                letter-spacing: -0.01em;
                margin: 0;
            }
            .yeshi-footer__title {
                margin: 0;
                font-size: 0.78rem;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.2em;
            }
            .yeshi-footer__text {
                margin: 10px 0 0;
                font-size: 0.92rem;
                color: #4d4639;
                line-height: 1.7;
            }
            .yeshi-footer__text a {
                color: inherit;
                text-decoration: none;
            }
            .yeshi-footer__text a:hover {
                color: #745b18;
            }
            .yeshi-footer__social {
                margin-top: 10px;
                display: flex;
                align-items: center;
                gap: 14px;
                font-size: 1.1rem;
            }
            .yeshi-footer__social a {
                color: #1a1c1c;
                text-decoration: none;
            }
            .yeshi-footer__copyright {
                max-width: 1920px;
                margin: 36px auto 0;
                padding-top: 20px;
                color: #4d4639;
                font-size: 0.74rem;
            }
            @media (min-width: 640px) {
                .yeshi-footer__wrap {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
            }
            @media (min-width: 1024px) {
                .yeshi-footer__wrap {
                    grid-template-columns: repeat(4, minmax(0, 1fr));
                }
            }
        `;
        document.head.appendChild(style);
    }

    footer.className = 'yeshi-footer';
    footer.innerHTML = `
        <div class="yeshi-footer__wrap">
            <div class="footer-section">
                <h3 class="yeshi-footer__brand">የሺ</h3>
                <p class="yeshi-footer__text">Bringing elegance and culture to your wardrobe.</p>
            </div>
            <div class="footer-section">
                <h3 class="yeshi-footer__title">Contact</h3>
                <p class="yeshi-footer__text" data-social-key="whatsapp"><i class="fab fa-whatsapp"></i> <a href="https://wa.me/251933797981" target="_blank" rel="noopener noreferrer">WhatsApp</a></p>
                <p class="yeshi-footer__text" data-social-key="phone"><i class="fas fa-phone"></i> <a href="tel:+251933797981">+251933797981</a></p>
                <p class="yeshi-footer__text"><i class="fas fa-map-marker-alt"></i> Gondar, Ethiopia</p>
            </div>
            <div class="footer-section">
                <h3 class="yeshi-footer__title">Company</h3>
                <p class="yeshi-footer__text"><a href="/user/developer-information.html">Developer Information</a></p>
                <p class="yeshi-footer__text"><a href="/user/how-it-works">How It Works</a></p>
                <p class="yeshi-footer__text"><a href="/user/size-guide">Size Guide</a></p>
                <p class="yeshi-footer__text"><a href="/user/about">About</a></p>
            </div>
            <div class="footer-section">
                <h3 class="yeshi-footer__title">Follow Us</h3>
                <div class="yeshi-footer__social social-links">
                    <a href="https://www.tiktok.com/@yeshiclothe" aria-label="TikTok" data-social-key="tiktok" target="_blank" rel="noopener noreferrer"><i class="fab fa-tiktok"></i></a>
                    <a href="https://t.me/Gondarkemisdress" target="_blank" rel="noopener noreferrer" aria-label="Telegram" data-social-key="telegram"><i class="fab fa-telegram"></i></a>
                    <a href="https://www.instagram.com/yeshiclothe/" aria-label="Instagram" data-social-key="instagram" target="_blank" rel="noopener noreferrer"><i class="fab fa-instagram"></i></a>
                    <a data-social-key="whatsapp" href="https://wa.me/251933797981" aria-label="WhatsApp" target="_blank" rel="noopener noreferrer"><i class="fab fa-whatsapp"></i></a>
                    <a data-social-key="facebook" href="https://web.facebook.com/61580805668142/" aria-label="Facebook" target="_blank" rel="noopener noreferrer"><i class="fab fa-facebook-f"></i></a>
                </div>
            </div>
        </div>
        <div class="yeshi-footer__copyright">© 2026 Yeshi Heritage. All rights reserved.</div>
    `;
}

function ensureProfileAvatarEverywhere() {
    const user = (() => {
        try { return JSON.parse(localStorage.getItem('user') || '{}') || {}; } catch (_) { return {}; }
    })();
    const avatar = String(user.profileImage || user.avatar || user.image || user.picture || localStorage.getItem('yeshi_profile_avatar') || '').trim();
    if (!avatar) return;

    const links = Array.from(document.querySelectorAll('a[href="/profile"], a[href="/user/profile"], a[href="/profile.html"]'));
    links.forEach((link) => {
        let img = link.querySelector('img.yeshi-nav-avatar');
        const icon = link.querySelector('.material-symbols-outlined');
        if (!img) {
            img = document.createElement('img');
            img.className = 'yeshi-nav-avatar';
            img.style.width = '24px';
            img.style.height = '24px';
            img.style.objectFit = 'cover';
            img.style.borderRadius = '999px';
            img.style.display = 'none';
            link.appendChild(img);
        }
        img.onload = () => {
            img.style.display = 'block';
            if (icon) icon.style.display = 'none';
        };
        img.onerror = () => {
            img.style.display = 'none';
            if (icon) icon.style.display = '';
        };
        img.src = avatar;
        img.alt = 'Profile';
    });
}

function showFirstVisitSplash() {
    const path = String(window.location.pathname || '').toLowerCase();
    if (path.startsWith('/admin') || path.startsWith('/auth')) return;

    // Show splash only when the visitor enters from outside the site
    // (or opens directly), not while navigating internal pages.
    const ref = String(document.referrer || '').trim();
    if (ref) {
        try {
            const refUrl = new URL(ref);
            if (refUrl.hostname === window.location.hostname) return;
        } catch (_) {
            // If referrer URL parsing fails, keep splash behavior.
        }
    }

    const overlay = document.createElement('div');
    overlay.id = 'yeshiWelcomeSplash';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.zIndex = '99999';
    overlay.style.background = 'rgba(15, 23, 42, 0.95)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.flexDirection = 'column';
    overlay.style.gap = '14px';
    overlay.style.transition = 'opacity 500ms ease';

    const logo = document.createElement('img');
    logo.src = '/images/logo.png';
    logo.alt = 'Yeshi';
    logo.style.width = '160px';
    logo.style.height = '160px';
    logo.style.borderRadius = '18px';
    logo.style.animation = 'yeshiLogoSpin3d 1.2s linear infinite';
    logo.style.boxShadow = '0 16px 40px rgba(0,0,0,0.45)';

    const text = document.createElement('div');
    text.textContent = 'Yeshi Heritage';
    text.style.color = '#f9fafb';
    text.style.fontWeight = '800';
    text.style.letterSpacing = '0.06em';

    overlay.appendChild(logo);
    overlay.appendChild(text);
    document.body.appendChild(overlay);

    window.setTimeout(() => {
        overlay.style.opacity = '0';
        window.setTimeout(() => overlay.remove(), 520);
    }, 1700);
}

function ensureMyOrdersNavLink() {
    const nav = document.querySelector('ul.nav-links');
    if (!nav) return;

    const loggedIn = getCurrentAuthSnapshot().isLoggedIn;
    const existing = nav.querySelector('a[href="/my-orders"], a[href="/my-orders.html"], a[href="my-orders.html"]');
    if (!loggedIn) {
        if (existing) {
            const li = existing.closest('li');
            if (li) li.remove();
            else existing.remove();
        }
        return;
    }

    if (existing) return;

    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '/my-orders';
    a.textContent = 'My Orders';
    a.addEventListener('click', (e) => {
        const token = localStorage.getItem('token');
        if (!token) {
            e.preventDefault();
            window.location.href = `/user/login.html?next=${encodeURIComponent('/my-orders')}`;
        }
    });
    li.appendChild(a);

    // Insert next to Home (after first item) when possible
    const firstLi = nav.querySelector('li');
    if (firstLi && firstLi.nextSibling) {
        nav.insertBefore(li, firstLi.nextSibling);
    } else {
        nav.appendChild(li);
    }
}

function ensureUserChatLauncher() {
    const path = String(window.location.pathname || '').toLowerCase();
    const isAdminPath = path.startsWith('/admin');
    const isAuthPath = path.startsWith('/auth') || path.includes('/login') || path.includes('/signup') || path.includes('/forgot-password') || path.includes('/reset-password') || path.includes('/verify-otp');
    if (isAdminPath || isAuthPath) return;

    if (!document.getElementById('userChatLauncherStyles')) {
        const style = document.createElement('style');
        style.id = 'userChatLauncherStyles';
        style.textContent = `
            .user-chat-launcher {
                position: fixed;
                right: 18px;
                bottom: 18px;
                width: 52px;
                height: 52px;
                border-radius: 999px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                text-decoration: none;
                background: linear-gradient(120deg, #745b18 0%, #d4b468 100%);
                color: #fff;
                box-shadow: 0 12px 30px rgba(0,0,0,0.24);
                z-index: 2100;
            }
            .user-notification-launcher {
                position: fixed;
                right: 18px;
                bottom: 80px;
                width: 48px;
                height: 48px;
                border-radius: 999px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                text-decoration: none;
                background: #ffffff;
                color: #1f1b13;
                box-shadow: 0 10px 24px rgba(0,0,0,0.2);
                border: 1px solid rgba(116, 91, 24, 0.2);
                z-index: 2100;
                cursor: pointer;
            }
            .user-chat-launcher__badge {
                position: absolute;
                top: -4px;
                right: -4px;
                min-width: 18px;
                height: 18px;
                border-radius: 999px;
                padding: 0 4px;
                font-size: 11px;
                line-height: 18px;
                text-align: center;
                background: #bb0010;
                color: #fff;
                font-weight: 700;
                display: none;
            }
            .user-top-nav-badge {
                position: absolute;
                top: -6px;
                right: -6px;
                min-width: 18px;
                height: 18px;
                border-radius: 999px;
                padding: 0 4px;
                font-size: 11px;
                line-height: 18px;
                text-align: center;
                background: #bb0010;
                color: #fff;
                font-weight: 700;
                display: none;
                z-index: 1;
            }
            .user-notification-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.35);
                z-index: 2200;
                display: none;
            }
            .user-notification-overlay.open {
                display: block;
            }
            .user-notification-drawer {
                position: absolute;
                right: 0;
                top: 0;
                width: min(92vw, 420px);
                height: 100%;
                background: #fff;
                transform: translateX(100%);
                transition: transform 0.25s ease;
                display: flex;
                flex-direction: column;
                box-shadow: -12px 0 30px rgba(0, 0, 0, 0.2);
            }
            .user-notification-overlay.open .user-notification-drawer {
                transform: translateX(0);
            }
            .user-notification-head {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 14px 16px;
                border-bottom: 1px solid #eee;
            }
            .user-notification-title {
                margin: 0;
                font-size: 14px;
                letter-spacing: 0.16em;
                text-transform: uppercase;
                font-weight: 800;
            }
            .user-notification-close {
                border: 0;
                background: #f4f3f3;
                border-radius: 999px;
                width: 34px;
                height: 34px;
                cursor: pointer;
            }
            .user-notification-list {
                flex: 1;
                overflow: auto;
                padding: 10px;
                background: #fafafa;
            }
            .user-notification-item {
                border: 1px solid #efe8d9;
                background: #fff;
                border-radius: 12px;
                padding: 10px;
                margin-bottom: 8px;
                cursor: pointer;
            }
            .user-notification-item.unread {
                border-color: #d4b468;
                background: #fffaf0;
            }
            .user-notification-item h4 {
                margin: 0 0 6px;
                font-size: 14px;
                font-weight: 700;
            }
            .user-notification-item p {
                margin: 0;
                font-size: 13px;
                color: #4d4639;
            }
            .user-notification-item time {
                display: block;
                margin-top: 8px;
                font-size: 11px;
                color: #8a7f6a;
            }
            .user-chat-panel {
                position: fixed;
                right: 18px;
                bottom: 88px;
                width: min(420px, calc(100vw - 36px));
                height: min(72vh, 680px);
                border-radius: 16px;
                overflow: hidden;
                background: #fff;
                border: 1px solid rgba(116, 91, 24, 0.24);
                box-shadow: 0 20px 48px rgba(0,0,0,0.28);
                z-index: 2150;
                display: none;
                flex-direction: column;
            }
            .user-chat-panel.open {
                display: flex;
            }
            .user-chat-panel__head {
                height: 46px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 12px;
                background: linear-gradient(120deg, #745b18 0%, #d4b468 100%);
                color: #fff;
                font-size: 13px;
                font-weight: 700;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                cursor: move;
                user-select: none;
            }
            .user-chat-panel__close {
                border: 0;
                background: rgba(255,255,255,0.22);
                color: #fff;
                width: 28px;
                height: 28px;
                border-radius: 999px;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                line-height: 1;
            }
            .user-chat-panel__frame {
                width: 100%;
                height: calc(100% - 46px);
                border: 0;
                background: #fff;
            }
            .user-chat-launcher.is-open {
                box-shadow: 0 0 0 3px rgba(212, 180, 104, 0.35), 0 12px 30px rgba(0,0,0,0.24);
            }
            @media (max-width: 900px) {
                .user-chat-launcher,
                .user-notification-launcher {
                    display: none !important;
                }
                .user-chat-panel,
                .user-chat-panel.open {
                    display: none !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    let launcher = document.getElementById('userChatLauncher');
    if (!launcher) {
        launcher = document.createElement('a');
        launcher.id = 'userChatLauncher';
        launcher.className = 'user-chat-launcher';
        launcher.href = '/user/mychat.html';
        launcher.setAttribute('aria-label', 'Open MyChat');
        launcher.innerHTML = '<span style="font-size:22px;line-height:1;">💬</span><span id="userChatLauncherBadge" class="user-chat-launcher__badge"></span>';
        document.body.appendChild(launcher);
    }

    let chatPanel = document.getElementById('userChatPanel');
    if (!chatPanel) {
        chatPanel = document.createElement('section');
        chatPanel.id = 'userChatPanel';
        chatPanel.className = 'user-chat-panel';
        chatPanel.innerHTML = `
            <div class="user-chat-panel__head">
                <span>MyChat</span>
                <button type="button" class="user-chat-panel__close" id="userChatPanelClose" aria-label="Close chat">×</button>
            </div>
            <iframe id="userChatPanelFrame" class="user-chat-panel__frame" title="MyChat"></iframe>
        `;
        document.body.appendChild(chatPanel);
    }

    let notificationLauncher = document.getElementById('userNotificationLauncher');
    if (!notificationLauncher) {
        notificationLauncher = document.createElement('button');
        notificationLauncher.type = 'button';
        notificationLauncher.id = 'userNotificationLauncher';
        notificationLauncher.className = 'user-notification-launcher';
        notificationLauncher.setAttribute('aria-label', 'Open Notifications');
        notificationLauncher.innerHTML = '<span aria-hidden="true" style="font-size:18px;line-height:1;">🔔</span><span id="userNotificationLauncherBadge" class="user-chat-launcher__badge"></span>';
        document.body.appendChild(notificationLauncher);
    }

    let notificationOverlay = document.getElementById('userNotificationOverlay');
    if (!notificationOverlay) {
        notificationOverlay = document.createElement('div');
        notificationOverlay.id = 'userNotificationOverlay';
        notificationOverlay.className = 'user-notification-overlay';
        notificationOverlay.innerHTML = `
            <div class="user-notification-drawer" role="dialog" aria-label="Notifications" aria-modal="true">
                <div class="user-notification-head">
                    <h2 class="user-notification-title">Notifications</h2>
                    <button type="button" class="user-notification-close" id="userNotificationCloseBtn" aria-label="Close notifications">close</button>
                </div>
                <div class="user-notification-list" id="userNotificationList"><p style="margin:0;color:#777;">Loading notifications...</p></div>
            </div>
        `;
        document.body.appendChild(notificationOverlay);
    }

    const badge = document.getElementById('userChatLauncherBadge');
    const notificationBadge = document.getElementById('userNotificationLauncherBadge');
    const notificationListEl = document.getElementById('userNotificationList');
    const notificationCloseBtn = document.getElementById('userNotificationCloseBtn');
    const chatPanelCloseBtn = document.getElementById('userChatPanelClose');
    const chatPanelHead = chatPanel.querySelector('.user-chat-panel__head');
    const chatPanelFrame = document.getElementById('userChatPanelFrame');
    if (!badge || !notificationBadge || !notificationListEl || !notificationCloseBtn || !chatPanel || !chatPanelCloseBtn || !chatPanelHead || !chatPanelFrame) return;

    const topNavChatAnchors = Array.from(document.querySelectorAll('a[href]')).filter((anchor) => {
        if (!anchor || anchor.id === 'userChatLauncher') return false;
        if (anchor.closest('#userChatPanel')) return false;
        const href = String(anchor.getAttribute('href') || '').toLowerCase();
        return href.includes('/mychat') || href.endsWith('mychat.html') || href === 'mychat.html';
    });
    const topNavChatBadges = topNavChatAnchors.map((anchor, index) => {
        anchor.style.position = anchor.style.position || 'relative';
        let topBadge = anchor.querySelector('.user-top-nav-badge');
        if (!topBadge) {
            topBadge = document.createElement('span');
            topBadge.className = 'user-top-nav-badge';
            topBadge.id = index === 0 ? 'topNavChatBadge' : `topNavChatBadge${index + 1}`;
            anchor.appendChild(topBadge);
        }
        return topBadge;
    });

    const topNotificationTriggers = Array.from(document.querySelectorAll('#notification-trigger, [aria-label="Notifications"]')).filter((el) => {
        if (!el || el.id === 'userNotificationLauncher') return false;
        if (el.closest('#userNotificationOverlay')) return false;
        return true;
    });
    const topNotificationBadges = topNotificationTriggers.map((trigger, index) => {
        trigger.style.position = trigger.style.position || 'relative';
        let badgeEl = trigger.querySelector('.user-top-nav-badge');
        if (!badgeEl) {
            badgeEl = document.createElement('span');
            badgeEl.className = 'user-top-nav-badge';
            badgeEl.id = index === 0 ? 'topNavNotificationBadge' : `topNavNotificationBadge${index + 1}`;
            trigger.appendChild(badgeEl);
        }
        return badgeEl;
    });
    const topNotificationDot = document.getElementById('notificationDot');

    const isMyChatPage = path.includes('/mychat');
    const isMobileViewport = () => window.matchMedia('(max-width: 900px)').matches;
    const normalizeChatHref = (href) => {
        const raw = String(href || '/user/mychat.html').trim();
        if (!raw) return '/user/mychat.html';
        if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
        if (raw.startsWith('/')) return raw;
        return '/' + raw.replace(/^\/+/, '');
    };

    const withEmbeddedChatParam = (href) => {
        try {
            const u = new URL(href, window.location.origin);
            u.searchParams.set('embedded', '1');
            return u.pathname + u.search + u.hash;
        } catch (_) {
            return href;
        }
    };

    const openChatPanel = (href) => {
        const target = normalizeChatHref(href || launcher.getAttribute('href') || '/user/mychat.html');
        if (isMobileViewport() || isMyChatPage) {
            window.location.href = target;
            return;
        }
        const panelTarget = withEmbeddedChatParam(target);
        if (chatPanelFrame.getAttribute('src') !== panelTarget) {
            chatPanelFrame.setAttribute('src', panelTarget);
        }
        chatPanel.classList.add('open');
        launcher.classList.add('is-open');
    };

    const closeChatPanel = () => {
        chatPanel.classList.remove('open');
        launcher.classList.remove('is-open');
    };

    let dragState = null;
    const startChatPanelDrag = (clientX, clientY) => {
        if (isMobileViewport()) return;
        const rect = chatPanel.getBoundingClientRect();
        dragState = {
            offsetX: clientX - rect.left,
            offsetY: clientY - rect.top
        };
        chatPanel.style.left = rect.left + 'px';
        chatPanel.style.top = rect.top + 'px';
        chatPanel.style.right = 'auto';
        chatPanel.style.bottom = 'auto';
    };

    const moveChatPanelDrag = (clientX, clientY) => {
        if (!dragState) return;
        const panelRect = chatPanel.getBoundingClientRect();
        const maxLeft = Math.max(0, window.innerWidth - panelRect.width);
        const maxTop = Math.max(0, window.innerHeight - panelRect.height);
        const nextLeft = Math.min(maxLeft, Math.max(0, clientX - dragState.offsetX));
        const nextTop = Math.min(maxTop, Math.max(0, clientY - dragState.offsetY));
        chatPanel.style.left = nextLeft + 'px';
        chatPanel.style.top = nextTop + 'px';
    };

    const endChatPanelDrag = () => {
        dragState = null;
    };

    if (!chatPanelHead.dataset.boundDrag) {
        chatPanelHead.dataset.boundDrag = '1';
        chatPanelHead.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;
            startChatPanelDrag(event.clientX, event.clientY);
            event.preventDefault();
        });
        chatPanelHead.addEventListener('touchstart', (event) => {
            const touch = event.touches && event.touches[0];
            if (!touch) return;
            startChatPanelDrag(touch.clientX, touch.clientY);
        }, { passive: true });
    }

    if (!document.body.dataset.boundChatPanelDragMove) {
        document.body.dataset.boundChatPanelDragMove = '1';
        window.addEventListener('mousemove', (event) => {
            moveChatPanelDrag(event.clientX, event.clientY);
        });
        window.addEventListener('touchmove', (event) => {
            const touch = event.touches && event.touches[0];
            if (!touch) return;
            moveChatPanelDrag(touch.clientX, touch.clientY);
        }, { passive: true });
        window.addEventListener('mouseup', endChatPanelDrag);
        window.addEventListener('touchend', endChatPanelDrag);
        window.addEventListener('touchcancel', endChatPanelDrag);
    }

    if (!launcher.dataset.boundOpen) {
        launcher.dataset.boundOpen = '1';
        launcher.addEventListener('click', (e) => {
            if (isMobileViewport() || isMyChatPage) return;
            e.preventDefault();
            if (chatPanel.classList.contains('open')) {
                closeChatPanel();
            } else {
                openChatPanel(launcher.getAttribute('href') || '/user/mychat.html');
            }
        });
    }

    if (!chatPanelCloseBtn.dataset.boundClose) {
        chatPanelCloseBtn.dataset.boundClose = '1';
        chatPanelCloseBtn.addEventListener('click', closeChatPanel);
    }

    if (!document.body.dataset.boundChatLinkIntercept) {
        document.body.dataset.boundChatLinkIntercept = '1';
        document.addEventListener('click', (event) => {
            if (isMobileViewport() || isMyChatPage) return;
            const anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
            if (!anchor) return;
            const href = String(anchor.getAttribute('href') || '').trim();
            if (!href) return;
            const lower = href.toLowerCase();
            const isChatLink = lower.includes('/mychat') || lower.includes('/user/mychat.html') || lower === 'mychat.html';
            if (!isChatLink) return;
            event.preventDefault();
            openChatPanel(href);
        });
    }

    window.addEventListener('resize', () => {
        if (isMobileViewport()) {
            closeChatPanel();
            chatPanel.style.left = '';
            chatPanel.style.top = '';
            chatPanel.style.right = '18px';
            chatPanel.style.bottom = '88px';
        }
    });

    const token = localStorage.getItem('token');
    if (!token) {
        badge.style.display = 'none';
        notificationBadge.style.display = 'none';
        topNavChatBadges.forEach((el) => {
            el.style.display = 'none';
            el.textContent = '';
        });
        if (topNotificationDot) {
            topNotificationDot.classList.add('hidden');
            topNotificationDot.textContent = '';
        }
        return;
    }

    let unreadPollFailures = 0;

    function setBadgeValue(el, count) {
        if (!el) return;
        if (count > 0) {
            el.textContent = count > 99 ? '99+' : String(count);
            el.style.display = 'inline-block';
        } else {
            el.textContent = '';
            el.style.display = 'none';
        }
    }

    function syncTopNavChatBadge(count) {
        topNavChatBadges.forEach((el) => setBadgeValue(el, count));
    }

    function syncTopNavNotificationBadge(count) {
        topNotificationBadges.forEach((el) => setBadgeValue(el, count));
        if (topNotificationBadges.length > 0 && topNotificationDot) {
            topNotificationDot.textContent = '';
            topNotificationDot.classList.add('hidden');
            return;
        }
        if (!topNotificationDot) return;
        if (count > 0) {
            topNotificationDot.textContent = count > 99 ? '99+' : String(count);
            topNotificationDot.classList.remove('hidden');
            topNotificationDot.style.display = 'inline-flex';
            topNotificationDot.style.alignItems = 'center';
            topNotificationDot.style.justifyContent = 'center';
            topNotificationDot.style.minWidth = '16px';
            topNotificationDot.style.height = '16px';
            topNotificationDot.style.padding = '0 4px';
            topNotificationDot.style.borderRadius = '999px';
            topNotificationDot.style.background = '#bb0010';
            topNotificationDot.style.color = '#fff';
            topNotificationDot.style.fontSize = '10px';
            topNotificationDot.style.fontWeight = '700';
            topNotificationDot.style.lineHeight = '16px';
        } else {
            topNotificationDot.textContent = '';
            topNotificationDot.classList.add('hidden');
        }
    }

    async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), timeoutMs);
        try {
            const response = await fetch(url, {
                ...options,
                signal: controller.signal
            });
            return response;
        } finally {
            window.clearTimeout(timer);
        }
    }

    function applyUnreadCounts(unreadMessages, unreadNotifications) {
        const messageCount = Math.max(0, Number(unreadMessages) || 0);
        const notificationCount = Math.max(0, Number(unreadNotifications) || 0);

        setBadgeValue(badge, messageCount);
        setBadgeValue(notificationBadge, notificationCount);
        syncTopNavChatBadge(messageCount);
        syncTopNavNotificationBadge(notificationCount);
    }

    async function refreshUnreadCounts() {
        try {
            const res = await fetchWithTimeout('/api/workflow/unread-counts', {
                headers: { 'x-auth-token': token }
            });
            if (!res.ok) throw new Error('Failed unread counts');

            const data = await res.json();
            const unreadMessages = Number(data && data.unreadMessages || 0);
            const unreadNotifications = Number(data && data.unreadNotifications || 0);
            applyUnreadCounts(unreadMessages, unreadNotifications);
            unreadPollFailures = 0;
        } catch (_) {
            applyUnreadCounts(0, 0);
            unreadPollFailures += 1;
        }
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function getNotificationHref(item) {
        const ref = String(item && item.reference_id || '').trim();
        const type = String(item && item.type || '').trim().toLowerCase();
        const title = String(item && item.title || '').trim().toLowerCase();
        const body = String(item && item.body || '').trim().toLowerCase();
        if (type === 'message' || type === 'chat' || type === 'chat_message') {
            return '/user/mychat';
        }
        if (/^[a-f\d]{24}$/i.test(ref)) {
            if (type === 'new_product' || type === 'product' || type === 'post_update') {
                return '/post?id=' + encodeURIComponent(ref);
            }

            const looksLikeOrderUpdate =
                type === 'status_update' ||
                type === 'order_update' ||
                title.includes('order') ||
                title.includes('payment') ||
                title.includes('delivery') ||
                body.includes('order') ||
                body.includes('payment') ||
                body.includes('delivery');

            if (looksLikeOrderUpdate) {
                return '/my-orders?highlight=' + encodeURIComponent(ref);
            }
            return '/post?id=' + encodeURIComponent(ref);
        }
        return '';
    }

    async function refreshUnreadNotificationCount() {
        try {
            const res = await fetchWithTimeout('/api/workflow/notifications/unread-count', {
                headers: { 'x-auth-token': token }
            });
            if (!res.ok) throw new Error('Failed unread count');

            const data = await res.json();
            const unread = Number((data && (data.unreadNotifications || data.unreadCount || data.unread)) || 0);
            setBadgeValue(notificationBadge, unread);
            syncTopNavNotificationBadge(unread);
        } catch (_) {
            setBadgeValue(notificationBadge, 0);
            syncTopNavNotificationBadge(0);
        }
    }

    async function loadNotifications() {
        notificationListEl.innerHTML = '<p style="margin:0;color:#777;">Loading notifications...</p>';
        try {
            const res = await fetchWithTimeout('/api/workflow/notifications?limit=30', {
                headers: { 'x-auth-token': token }
            });
            const data = await res.json();
            if (!res.ok) {
                notificationListEl.innerHTML = '<p style="margin:0;color:#777;">Could not load notifications.</p>';
                return;
            }

            const list = Array.isArray(data) ? data : [];
            if (!list.length) {
                notificationListEl.innerHTML = '<p style="margin:0;color:#777;">No notifications yet.</p>';
                return;
            }

            notificationListEl.innerHTML = list.map((item) => {
                const title = escapeHtml(item.title || 'Notification');
                const body = escapeHtml(item.body || '');
                const when = item.timestamp ? new Date(item.timestamp).toLocaleString() : '';
                const href = getNotificationHref(item);
                return `
                    <article class="user-notification-item ${item.is_read ? '' : 'unread'}" data-id="${escapeHtml(item._id || '')}" data-href="${escapeHtml(href)}">
                        <h4>${title}</h4>
                        ${body ? `<p>${body}</p>` : ''}
                        ${when ? `<time>${escapeHtml(when)}</time>` : ''}
                    </article>
                `;
            }).join('');

            Array.from(notificationListEl.querySelectorAll('.user-notification-item')).forEach((card) => {
                card.addEventListener('click', async () => {
                    const notificationId = card.getAttribute('data-id') || '';
                    const href = card.getAttribute('data-href') || '';
                    if (notificationId) {
                        try {
                            await fetchWithTimeout('/api/workflow/notifications/' + encodeURIComponent(notificationId) + '/read', {
                                method: 'PUT',
                                headers: { 'x-auth-token': token }
                            }, 8000);
                        } catch (_) {
                            // ignore
                        }
                    }

                    if (href) {
                        window.location.href = href;
                        return;
                    }

                    refreshUnreadCounts();
                    loadNotifications();
                });
            });
        } catch (_) {
            notificationListEl.innerHTML = '<p style="margin:0;color:#777;">Could not load notifications.</p>';
        }
    }

    function openNotifications() {
        notificationOverlay.classList.add('open');
        loadNotifications();
        fetchWithTimeout('/api/workflow/notifications/read-all', {
            method: 'PUT',
            headers: { 'x-auth-token': token }
        }, 8000).then(() => {
            refreshUnreadCounts();
        }).catch(() => {});
    }

    function closeNotifications() {
        notificationOverlay.classList.remove('open');
    }

    if (!notificationLauncher.dataset.boundOpen) {
        notificationLauncher.dataset.boundOpen = '1';
        notificationLauncher.addEventListener('click', openNotifications);
    }

    if (!notificationCloseBtn.dataset.boundClose) {
        notificationCloseBtn.dataset.boundClose = '1';
        notificationCloseBtn.addEventListener('click', closeNotifications);
    }

    if (!notificationOverlay.dataset.boundBackdropClose) {
        notificationOverlay.dataset.boundBackdropClose = '1';
        notificationOverlay.addEventListener('click', (e) => {
            if (e.target === notificationOverlay) closeNotifications();
        });
    }

    const navNotificationTrigger = document.getElementById('notification-trigger');
    if (navNotificationTrigger && !navNotificationTrigger.dataset.boundOpen) {
        navNotificationTrigger.dataset.boundOpen = '1';
        navNotificationTrigger.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            openNotifications();
        }, true);
    }

    function scheduleUnreadPoll() {
        const delay = unreadPollFailures >= 3 ? 60000 : 20000;
        window.setTimeout(async () => {
            await refreshUnreadCounts();
            scheduleUnreadPoll();
        }, delay);
    }

    refreshUnreadCounts();
    scheduleUnreadPoll();
}

function safeParseJson(value) {
    try {
        return value ? JSON.parse(value) : null;
    } catch (_) {
        return null;
    }
}

function hideLink(linkEl) {
    if (!linkEl) return;
    const li = linkEl.closest('li');
    if (li) {
        li.style.display = 'none';
        return;
    }
    linkEl.style.display = 'none';
}

function applyAuthVisibility() {
    const snapshot = getCurrentAuthSnapshot();
    const role = snapshot.role;
    const isLoggedIn = snapshot.isLoggedIn;
    const isAdmin = role === 'admin';

    const nav = document.querySelector('ul.nav-links');
    if (!nav) return;

    const toggleNavLink = (selectors, visible) => {
        nav.querySelectorAll(selectors).forEach((el) => {
            const li = el.closest('li');
            if (li) li.style.display = visible ? '' : 'none';
            el.style.display = visible ? '' : 'none';
            if (el.classList) {
                el.classList.toggle('hidden', !visible);
            }
        });
    };

    if (!isLoggedIn) {
        toggleNavLink('a[href="/auth/login"], a[href="/auth/register"]', true);
        toggleNavLink('[data-action="logout"]', false);
        return;
    }

    toggleNavLink('a[href="/auth/login"], a[href="/auth/register"]', false);
    toggleNavLink('[data-action="logout"]', true);

    if (!isAdmin) {
        nav.querySelectorAll('a[href^="/admin"]').forEach(hideLink);
        nav.querySelectorAll('a').forEach((a) => {
            const text = (a.textContent || '').trim().toLowerCase();
            if (text === 'admin' || text === 'admin login') {
                hideLink(a);
            }
        });
    }
}

function applyGlobalMenuAuthState() {
    removeLegacyDesktopProfileIcons();
    const isLoggedIn = getCurrentAuthSnapshot().isLoggedIn;

    const loginBtn = document.getElementById('mobileMenuLoginBtn');
    const signupBtn = document.getElementById('mobileMenuSignupBtn');
    const mobileMyOrdersBtn = document.getElementById('mobileMenuMyOrdersBtn');
    const logoutBtn = document.getElementById('mobileMenuLogoutBtn');
    const desktopMyOrders = document.getElementById('desktopMyOrdersItem');
    const desktopLogin = document.getElementById('desktopLoginItem');
    const desktopSignup = document.getElementById('desktopSignupItem');
    const desktopProfileAction = document.getElementById('desktopProfileAction');
    const desktopLogout = document.getElementById('desktopLogoutItem');

    if (loginBtn) loginBtn.classList.toggle('hidden', isLoggedIn);
    if (signupBtn) signupBtn.classList.toggle('hidden', isLoggedIn);
    if (mobileMyOrdersBtn) mobileMyOrdersBtn.classList.toggle('hidden', !isLoggedIn);
    if (logoutBtn) logoutBtn.classList.toggle('hidden', !isLoggedIn);
    if (desktopMyOrders) desktopMyOrders.classList.toggle('hidden', !isLoggedIn);
    if (desktopLogin) desktopLogin.classList.toggle('hidden', isLoggedIn);
    if (desktopSignup) desktopSignup.classList.toggle('hidden', isLoggedIn);
    if (desktopProfileAction) desktopProfileAction.classList.toggle('hidden', !isLoggedIn);
    if (desktopLogout) desktopLogout.classList.toggle('hidden', !isLoggedIn);
}

function wireGenericMobileMenuToggle() {
    const menu = document.getElementById('mobile-menu');
    if (!menu) return;

    if (!document.getElementById('yeshiGenericMobileMenuRules')) {
        const style = document.createElement('style');
        style.id = 'yeshiGenericMobileMenuRules';
        style.textContent = `
            @media (max-width: 1023px) {
                #mobile-menu.hidden {
                    display: none !important;
                }
                #mobile-menu:not(.hidden) {
                    display: block !important;
                }
            }
        `;
        document.head.appendChild(style);
    }

    if (document.body.dataset.yeshiMenuToggleBound === '1') return;
    document.body.dataset.yeshiMenuToggleBound = '1';

    document.addEventListener('click', (event) => {
        const toggle = event.target && event.target.closest ? event.target.closest('#mobile-menu-toggle') : null;
        if (!toggle) return;
        const menuEl = document.getElementById('mobile-menu');
        if (!menuEl) return;

        // Prevent page-level duplicate handlers from toggling the menu twice.
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();

        const isHidden = menuEl.classList.contains('hidden');
        if (isHidden) {
            menuEl.classList.remove('hidden');
            menuEl.classList.add('open');
            toggle.setAttribute('aria-expanded', 'true');
            return;
        }
        menuEl.classList.add('hidden');
        menuEl.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
    }, true);
}

function enforceMobileMenuLinkPolicy() {
    const isMobile = window.matchMedia('(max-width: 900px)').matches;
    if (!isMobile) return;

    const isLoggedIn = getCurrentAuthSnapshot().isLoggedIn;
    const menuRoots = Array.from(document.querySelectorAll('#mobile-menu, .mobile-menu, [data-mobile-menu]'));

    const ensureMenuLink = (root, { id, href, label, action }) => {
        if (!root) return null;
        if (id) {
            const existingById = root.querySelector('#' + id);
            if (existingById) return existingById;
        }
        let existing = root.querySelector('a[href="' + href + '"]');
        if (!existing && action) {
            existing = root.querySelector('a[data-action="' + action + '"]');
        }
        if (existing) {
            if (id) existing.id = id;
            return existing;
        }
        const anchor = document.createElement('a');
        if (id) anchor.id = id;
        anchor.href = href;
        if (action) anchor.setAttribute('data-action', action);
        anchor.textContent = label;
        anchor.className = 'block rounded-md px-3 py-2 hover:bg-amber-50';
        root.appendChild(anchor);
        return anchor;
    };

    menuRoots.forEach((root) => {
        ensureMenuLink(root, { id: 'mobileMenuMyOrdersBtn', href: '/my-orders', label: 'My Orders' });
        ensureMenuLink(root, { id: 'mobileMenuLoginBtn', href: '/auth/login', label: 'Login' });
        ensureMenuLink(root, { id: 'mobileMenuSignupBtn', href: '/auth/register', label: 'Sign Up' });
        ensureMenuLink(root, { id: 'mobileMenuLogoutBtn', href: '#', label: 'Logout', action: 'logout' });
    });

    // Footer link should not appear in mobile menu; it is exposed as the top-left icon shortcut.
    menuRoots.forEach((root) => {
        root.querySelectorAll('a[href="/user/footer.html"], a[href="/footer"], #mobileMenuFooterBtn').forEach((el) => {
            const li = el.closest('li');
            if (li) li.remove();
            else el.remove();
        });
    });

    // Home exists in bottom nav on mobile, so hide it in the side menu.
    menuRoots.forEach((root) => {
        root.querySelectorAll('a[href="/user/"], a[href="/"], a[href="/index.html"], a[href="/user/index.html"]').forEach((a) => {
            a.style.display = 'none';
        });
    });

    const toggleInMobileMenu = (selectors, visible) => {
        menuRoots.forEach((root) => {
            root.querySelectorAll(selectors).forEach((el) => {
                el.style.display = visible ? '' : 'none';
                if (el.classList) {
                    el.classList.toggle('hidden', !visible);
                }
                const li = el.closest('li');
                if (li) li.style.display = visible ? '' : 'none';
            });
        });
    };

    const loginLinks = 'a[href="/auth/login"], a[href="/user/login.html"]';
    const signupLinks = 'a[href="/auth/register"], a[href="/user/signup.html"]';
    const profileLinks = 'a[href="/profile"], a[href="/user/profile.html"]';
    const logoutLinks = 'a[data-action="logout"]';
    const myOrdersLinks = 'a[href="/my-orders"], a[href="/my-orders/"], a[href="/user/my-orders.html"], #mobileMenuMyOrdersBtn';

    if (isLoggedIn) {
        toggleInMobileMenu(loginLinks, false);
        toggleInMobileMenu(signupLinks, false);
        toggleInMobileMenu(profileLinks, false);
        toggleInMobileMenu(logoutLinks, true);
        toggleInMobileMenu(myOrdersLinks, true);
    } else {
        toggleInMobileMenu(loginLinks, true);
        toggleInMobileMenu(signupLinks, true);
        toggleInMobileMenu(profileLinks, false);
        toggleInMobileMenu(logoutLinks, false);
        toggleInMobileMenu(myOrdersLinks, false);
    }
}

function guessFileExtensionFromUrl(url) {
    try {
        const u = new URL(String(url || ''), window.location.origin);
        const pathname = u.pathname || '';
        const last = pathname.split('/').pop() || '';
        const idx = last.lastIndexOf('.');
        if (idx <= 0) return '';
        const ext = last.slice(idx + 1);
        if (!/^[a-z0-9]{1,6}$/i.test(ext)) return '';
        return '.' + ext.toLowerCase();
    } catch (_) {
        return '';
    }
}

function toSafeFilename(name) {
    const raw = String(name || '').trim();
    const base = raw || 'download';
    // Windows + common invalid filename chars
    let safe = base.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');
    safe = safe.replace(/\s+/g, ' ').trim();
    safe = safe.replace(/[. ]+$/g, '');
    if (!safe) safe = 'download';
    if (safe.length > 120) safe = safe.slice(0, 120).trim();
    return safe;
}

async function triggerDownload(url, suggestedName) {
    const href = String(url || '').trim();
    if (!href) return;
    const resolvedHref = (() => {
        try {
            return new URL(href, window.location.origin).toString();
        } catch (_) {
            return href;
        }
    })();

    trackAnalyticsEvent('image_download', {
        productId: getCurrentProductIdFromContext(),
        url: href
    });

    const ext = guessFileExtensionFromUrl(resolvedHref);
    const baseName = toSafeFilename(suggestedName);
    const filename = baseName.toLowerCase().endsWith(ext) ? baseName : (baseName + (ext || ''));

    // 0) Preferred path: backend proxy forces attachment download for external links.
    try {
        const proxied = `/api/download?url=${encodeURIComponent(resolvedHref)}&filename=${encodeURIComponent(filename)}`;
        const res = await fetch(proxied);
        if (res.ok) {
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = filename;
            a.rel = 'noopener noreferrer';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
            return;
        }
    } catch (_) {
        // ignore and continue with next fallback
    }

    // 1) Best effort: fetch as blob (works reliably for same-origin, and for CORS-enabled images)
    try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 20000);
        const res = await fetch(resolvedHref, { signal: controller.signal });
        clearTimeout(t);
        if (res.ok) {
            const blob = await res.blob();
            const objectUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = objectUrl;
            a.download = filename;
            a.rel = 'noopener noreferrer';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(objectUrl), 15000);
            return;
        }
    } catch (_) {
        // ignore, fall back
    }

    // 2) Fallback: try native download attribute; if browser blocks it (cross-origin), open in new tab
    try {
        const a = document.createElement('a');
        a.href = resolvedHref;
        a.download = filename;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        a.remove();
    } catch (_) {
        window.open(resolvedHref, '_blank', 'noopener,noreferrer');
    }
}

// Expose as a global helper for inline page scripts
window.triggerDownload = triggerDownload;

const YESHI_LAYOUT_STATE = {
    initialized: false,
    navigating: false,
    hostSelector: '#yeshiLayoutContentHost'
};

function isShellRoute(pathname) {
    const path = String(pathname || '').toLowerCase().replace(/\/+$/, '') || '/';
    if (path.startsWith('/admin') || path.startsWith('/api') || path.startsWith('/auth')) return false;
    return path === '/' ||
        path.startsWith('/user') ||
        path === '/cart' ||
        path === '/profile' ||
        path === '/my-orders' ||
        path === '/mychat' ||
        path === '/order' ||
        path === '/favorites' ||
        path === '/about' ||
        path === '/contact' ||
        path === '/size-guide' ||
        path === '/how-it-works';
}

function isExternalOrIgnoredLink(anchor) {
    if (!anchor) return true;
    const href = String(anchor.getAttribute('href') || '').trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:') || href.startsWith('tel:')) return true;
    if (anchor.hasAttribute('download')) return true;
    if (anchor.getAttribute('target') === '_blank') return true;
    if (anchor.hasAttribute('data-no-shell')) return true;

    let url;
    try {
        url = new URL(href, window.location.origin);
    } catch (_) {
        return true;
    }
    if (url.origin !== window.location.origin) return true;
    return !isShellRoute(url.pathname);
}

function ensureShellContentHost() {
    const body = document.body;
    if (!body) return null;

    let host = document.querySelector(YESHI_LAYOUT_STATE.hostSelector);
    if (host) return host;

    const staticLayout = document.getElementById('yeshiStaticLayout');
    const footer = document.querySelector('footer.yeshi-footer');
    if (!staticLayout || !footer) return null;

    host = document.createElement('div');
    host.id = 'yeshiLayoutContentHost';

    const movingNodes = [];
    let cursor = staticLayout.nextSibling;
    while (cursor && cursor !== footer) {
        const next = cursor.nextSibling;
        movingNodes.push(cursor);
        cursor = next;
    }

    body.insertBefore(host, footer);
    movingNodes.forEach((node) => host.appendChild(node));
    return host;
}

function collectBodyScriptsForExecution(doc) {
    const scripts = [];
    if (!doc || !doc.body) return scripts;

    doc.body.querySelectorAll('script').forEach((script) => {
        const src = String(script.getAttribute('src') || '').trim();
        if (src && /\/js\/main\.js(\?.*)?$/i.test(src)) return;
        if (src && /cdn\.tailwindcss\.com/i.test(src)) return;
        scripts.push({ src, code: src ? '' : String(script.textContent || '') });
    });

    return scripts;
}

function extractContentNodesFromDoc(doc) {
    const nodes = [];
    if (!doc || !doc.body) return nodes;

    const staticLayout = doc.body.querySelector('#yeshiStaticLayout');
    const footer = doc.body.querySelector('footer.yeshi-footer');
    const bottomNav = doc.body.querySelector('#yeshiMobileBottomNav');

    Array.from(doc.body.childNodes).forEach((node) => {
        if (node === staticLayout || node === footer || node === bottomNav) return;
        if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'SCRIPT') return;
        nodes.push(node.cloneNode(true));
    });

    return nodes;
}

async function runInjectedScripts(scripts) {
    for (const scriptInfo of scripts) {
        if (scriptInfo.src) {
            await new Promise((resolve) => {
                const el = document.createElement('script');
                el.src = scriptInfo.src;
                el.async = false;
                el.onload = () => resolve();
                el.onerror = () => resolve();
                document.body.appendChild(el);
            });
            continue;
        }

        if (!scriptInfo.code.trim()) continue;
        const inlineScript = document.createElement('script');
        inlineScript.textContent = scriptInfo.code;
        document.body.appendChild(inlineScript);
    }
}

function reapplyShellState() {
    try { applyAuthVisibility(); } catch (_) {}
    try { applyGlobalMenuAuthState(); } catch (_) {}
    try { applyActiveNavAndFooterColors(); } catch (_) {}
    try { ensureBagCountBadges(); } catch (_) {}
    try { enforceMobileMenuLinkPolicy(); } catch (_) {}
}

async function navigateWithinShell(nextUrl, replaceState) {
    if (YESHI_LAYOUT_STATE.navigating) return;
    const host = ensureShellContentHost();
    if (!host) {
        window.location.href = nextUrl;
        return;
    }

    YESHI_LAYOUT_STATE.navigating = true;
    try {
        const res = await fetch(nextUrl, {
            credentials: 'same-origin',
            headers: { 'X-Yeshi-Layout': 'partial' }
        });

        if (!res.ok) {
            window.location.href = nextUrl;
            return;
        }

        const html = await res.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        const parsedTitle = String(doc.querySelector('title')?.textContent || '').trim();
        const parsedPath = String(doc.location?.pathname || '').trim();

        if (parsedPath && !isShellRoute(parsedPath)) {
            window.location.href = nextUrl;
            return;
        }

        const contentNodes = extractContentNodesFromDoc(doc);
        const scripts = collectBodyScriptsForExecution(doc);

        host.innerHTML = '';
        const fragment = document.createDocumentFragment();
        contentNodes.forEach((node) => fragment.appendChild(node));
        host.appendChild(fragment);

        if (parsedTitle) document.title = parsedTitle;
        if (replaceState) {
            window.history.replaceState({ yeshiShell: true }, '', nextUrl);
        } else {
            window.history.pushState({ yeshiShell: true }, '', nextUrl);
        }

        await runInjectedScripts(scripts);
        reapplyShellState();
        window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (_) {
        window.location.href = nextUrl;
    } finally {
        YESHI_LAYOUT_STATE.navigating = false;
    }
}

function initUnifiedLayoutInjection() {
    if (YESHI_LAYOUT_STATE.initialized) return;
    if (!isShellRoute(window.location.pathname)) return;

    const staticLayout = document.getElementById('yeshiStaticLayout');
    const footer = document.querySelector('footer.yeshi-footer');
    if (!staticLayout || !footer) return;

    ensureShellContentHost();
    YESHI_LAYOUT_STATE.initialized = true;

    document.addEventListener('click', (event) => {
        const anchor = event.target && event.target.closest ? event.target.closest('a[href]') : null;
        if (!anchor) return;
        if (isExternalOrIgnoredLink(anchor)) return;

        const href = anchor.getAttribute('href');
        if (!href) return;

        const nextUrl = new URL(href, window.location.origin).toString();
        if (nextUrl === window.location.href) return;

        event.preventDefault();
        navigateWithinShell(nextUrl, false);
    }, true);

    window.addEventListener('popstate', () => {
        const nextUrl = window.location.href;
        navigateWithinShell(nextUrl, true);
    });
}
