(function () {
    function safeParseJson(value) {
        try {
            return value ? JSON.parse(value) : null;
        } catch (_) {
            return null;
        }
    }

    function getToken() {
        return localStorage.getItem('token');
    }

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
            // btoa requires latin1; encode to UTF-8 first
            return btoa(unescape(encodeURIComponent(raw)));
        } catch (_) {
            return '';
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

    function getRole() {
        const storedUser = safeParseJson(localStorage.getItem('user'));
        return (storedUser && storedUser.role) || '';
    }

    function ensureAdmin() {
        const token = getToken();
        const storedUser = safeParseJson(localStorage.getItem('user')) || {};
        const status = String(storedUser.status || '').toLowerCase();
        const blocked = !!storedUser.isBanned || status === 'banned' || status === 'inactive';
        const serverSession = window.__YESHI_ADMIN_SESSION;
        const serverDenied = !!(serverSession && serverSession.ready && !serverSession.ok);
        const serverRole = String(serverSession && serverSession.role || '').toLowerCase();
        if (!token || blocked || serverDenied || (serverSession && serverSession.ok && serverRole !== 'admin')) {
            const next = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.replace('/auth/login?next=' + next);
            return false;
        }
        return true;
    }

    function escapeHtml(str) {
        return String(str ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function getImgUrl(pathValue) {
        const v = String(pathValue || '').trim();
        if (!v) return '';

        const base = (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/'))
            ? v
            : '/' + v.replace(/^\/+/, '');

        // For DB-backed uploads, <img> requests cannot send headers.
        // We append the JWT as a query param so private images can still be authorized.
        try {
            const token = getToken();
            if (token && base.startsWith('/api/uploads/') && !/[?&](token|auth)=/.test(base)) {
                const sep = base.includes('?') ? '&' : '?';
                return base + sep + 'token=' + encodeURIComponent(token) + '&fallback=1';
            }
            if (base.startsWith('/api/uploads/') && !/[?&]fallback=/.test(base)) {
                const sep = base.includes('?') ? '&' : '?';
                return base + sep + 'fallback=1';
            }
        } catch (_) {
            // ignore
        }

        return base;
    }

    async function apiFetch(url, options) {
        const token = getToken();
        const nextOptions = options ? { ...options } : {};
        nextOptions.headers = nextOptions.headers ? { ...nextOptions.headers } : {};
        if (token) {
            nextOptions.headers['x-auth-token'] = token;
        }

        const fp = getDeviceFingerprint();
        if (fp && !nextOptions.headers['x-device-fingerprint']) {
            nextOptions.headers['x-device-fingerprint'] = fp;
        }
        return fetch(url, nextOptions);
    }

    async function applyBranding() {
        try {
            const res = await fetch('/api/settings/content');
            const data = await res.json();
            if (!res.ok) return;
            applyBrandingFromContent((data && data.content) || {});
        } catch (_) {
            // ignore
        }
    }

    function timeAgo(value) {
        const d = new Date(value);
        if (Number.isNaN(d.getTime())) return '';
        const diff = Date.now() - d.getTime();
        const sec = Math.max(1, Math.floor(diff / 1000));
        if (sec < 60) return sec + 's ago';
        const min = Math.floor(sec / 60);
        if (min < 60) return min + 'm ago';
        const hour = Math.floor(min / 60);
        if (hour < 24) return hour + 'h ago';
        const day = Math.floor(hour / 24);
        return day + 'd ago';
    }

    function ensureNotificationStyles() {
        if (document.getElementById('adminNotificationStyles')) return;
        const style = document.createElement('style');
        style.id = 'adminNotificationStyles';
        style.textContent = `
            .admin-notification-bell {
                position: fixed;
                top: 14px;
                right: 16px;
                z-index: 2000;
                width: 42px;
                height: 42px;
                border-radius: 999px;
                border: 1px solid rgba(116, 91, 24, 0.18);
                background: #fff;
                color: #745B18;
                cursor: pointer;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
            }
            .admin-notification-bell-inline {
                position: relative;
                color: #745B18 !important;
            }
            .admin-notification-bell .admin-notification-badge {
                position: absolute;
                top: -4px;
                right: -4px;
                min-width: 18px;
                height: 18px;
                border-radius: 999px;
                background: #b91c1c;
                color: #fff;
                font-size: 11px;
                line-height: 18px;
                text-align: center;
                padding: 0 4px;
                font-weight: 700;
            }
            .admin-notification-bell-inline .admin-notification-badge {
                position: absolute;
                top: -4px;
                right: -4px;
                min-width: 18px;
                height: 18px;
                border-radius: 999px;
                background: #b91c1c;
                color: #fff;
                font-size: 11px;
                line-height: 18px;
                text-align: center;
                padding: 0 4px;
                font-weight: 700;
            }
            .admin-notification-panel {
                position: fixed;
                top: 62px;
                right: 16px;
                width: min(92vw, 380px);
                max-height: 72vh;
                overflow: hidden;
                border: 1px solid rgba(116, 91, 24, 0.2);
                border-radius: 12px;
                background: #fff;
                box-shadow: 0 18px 45px rgba(0, 0, 0, 0.18);
                z-index: 2000;
                display: none;
            }
            .admin-notification-panel.open {
                display: block;
            }
            .admin-notification-list {
                max-height: calc(72vh - 52px);
                overflow: auto;
            }
            .admin-notification-item {
                border-top: 1px solid rgba(0, 0, 0, 0.06);
                padding: 10px 12px;
                cursor: pointer;
            }
            .admin-notification-item.unread {
                background: rgba(212, 175, 55, 0.1);
            }
            .admin-notification-context {
                display: flex;
                gap: 10px;
                align-items: flex-start;
                margin-top: 6px;
            }
            .admin-notification-thumb {
                width: 44px;
                height: 44px;
                border-radius: 8px;
                object-fit: cover;
                border: 1px solid rgba(0, 0, 0, 0.08);
                background: #f8f6ef;
                flex: 0 0 44px;
            }
            .admin-notification-meta {
                min-width: 0;
            }
            .admin-notification-meta-title {
                font-size: 12px;
                color: #2d2410;
                font-weight: 700;
                line-height: 1.3;
            }
            .admin-notification-meta-sub {
                margin-top: 2px;
                font-size: 11px;
                color: #666;
                line-height: 1.3;
            }
            .admin-notification-empty {
                color: #666;
                padding: 14px;
                text-align: center;
            }
        `;
        document.head.appendChild(style);
    }

    function findHeaderNotificationButton() {
        const iconButtons = Array.from(document.querySelectorAll('button'));
        return iconButtons.find((button) => {
            const icon = button.querySelector('.material-symbols-outlined');
            return icon && String(icon.textContent || '').trim() === 'notifications';
        }) || null;
    }

    function initAdminNotificationsWidget() {
        const role = getRole();
        const token = getToken();
        if (!token || role !== 'admin') return;

        ensureNotificationStyles();

        let bell = findHeaderNotificationButton();
        if (!bell) {
            bell = document.createElement('button');
            bell.type = 'button';
            bell.className = 'admin-notification-bell';
            bell.innerHTML = '<span class="material-symbols-outlined">notifications</span>';
            document.body.appendChild(bell);
        } else {
            bell.classList.add('admin-notification-bell-inline');
            bell.type = 'button';
        }

        let badge = bell.querySelector('.admin-notification-badge');
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'admin-notification-badge';
            badge.style.display = 'none';
            bell.appendChild(badge);
        }

        const panel = document.createElement('div');
        panel.className = 'admin-notification-panel';
        panel.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.06);">
                <strong>Notifications</strong>
                <button type="button" id="markAllNotificationsReadBtn" style="border:0; background:none; color:#745B18; cursor:pointer; font-weight:700;">Mark all read</button>
            </div>
            <div class="admin-notification-list" id="adminNotificationList"><div class="admin-notification-empty">Loading...</div></div>
        `;
        document.body.appendChild(panel);

        const listEl = panel.querySelector('#adminNotificationList');
        const markAllBtn = panel.querySelector('#markAllNotificationsReadBtn');

        function buildDestinationHref(destination) {
            if (!destination || typeof destination !== 'object') return '';
            const pathname = String(destination.path || '').trim();
            if (!pathname) return '';
            try {
                const url = new URL(pathname, window.location.origin);
                const query = destination.query && typeof destination.query === 'object' ? destination.query : {};
                Object.entries(query).forEach(([key, value]) => {
                    if (value === undefined || value === null) return;
                    const normalized = String(value).trim();
                    if (!normalized) return;
                    url.searchParams.set(key, normalized);
                });
                return url.pathname + url.search + url.hash;
            } catch (_) {
                return pathname;
            }
        }

        function resolveNotificationTarget(item) {
            const destinationHref = buildDestinationHref(item?.destination);
            if (destinationHref) return destinationHref;

            const type = String(item?.type || '').toLowerCase();
            const title = String(item?.title || '').toLowerCase();
            const body = String(item?.body || '').toLowerCase();
            const reference = String(item?.reference_id || '').trim();
            const combined = `${type} ${title} ${body}`;

            if (combined.includes('message') || combined.includes('chat')) {
                return '/admin/chat';
            }

            if (combined.includes('order') || combined.includes('payment') || combined.includes('delivery') || combined.includes('shipped')) {
                const suffix = reference ? `?highlight=${encodeURIComponent(reference)}` : '';
                return '/admin/orders' + suffix;
            }

            if (combined.includes('post') || combined.includes('comment')) {
                return '/admin/posts';
            }

            if (combined.includes('user') || combined.includes('account') || combined.includes('approval') || combined.includes('job')) {
                return '/admin/users';
            }

            if (combined.includes('stat')) {
                return '/admin/order-stats';
            }

            return '/admin/orders';
        }

        function formatNotificationBody(rawBody) {
            const value = String(rawBody || '').trim();
            if (!value) return { text: '', image: '', title: '', subtitle: '' };

            const getQuotedField = (text, field) => {
                const re = new RegExp('"' + field + '"\\s*:\\s*"([^"\\n\\r]*)"', 'i');
                const match = String(text || '').match(re);
                return match ? String(match[1] || '').trim() : '';
            };

            const safeHttpImage = (src) => {
                const v = String(src || '').trim();
                return /^https?:\/\//i.test(v) ? v : '';
            };

            const parseProductContext = (obj) => {
                if (!obj || typeof obj !== 'object') return null;
                const type = String(obj.type || '').toLowerCase();
                const hasProductShape = type === 'product_context' || obj.postId || obj.title || obj.image;
                if (!hasProductShape) return null;

                const title = String(obj.title || 'Shared product').trim();
                const price = String(obj.price || '').trim();
                const shipping = String(obj.shipping || '').trim();
                const bits = [];
                if (price) bits.push(price);
                if (shipping) bits.push(shipping);
                return {
                    text: 'Customer shared a product',
                    image: safeHttpImage(obj.image),
                    title,
                    subtitle: bits.join(' · ')
                };
            };

            const parseProductFromLooseText = (text) => {
                const lower = String(text || '').toLowerCase();
                if (!lower.includes('product_context') && !lower.includes('postid')) return null;

                const title = getQuotedField(text, 'title') || 'Shared product';
                const price = getQuotedField(text, 'price');
                const shipping = getQuotedField(text, 'shipping');
                const image = safeHttpImage(getQuotedField(text, 'image'));
                const bits = [];
                if (price) bits.push(price);
                if (shipping) bits.push(shipping);
                return {
                    text: 'Customer shared a product',
                    image,
                    title,
                    subtitle: bits.join(' · ')
                };
            };

            try {
                const parsed = JSON.parse(value);
                const productData = parseProductContext(parsed);
                if (productData) return productData;
            } catch (_) {
                // continue
            }

            const userPayloadMatch = value.match(/^\s*user\s*:\s*(\{[\s\S]*\})\s*$/i);
            if (userPayloadMatch) {
                try {
                    const parsed = JSON.parse(userPayloadMatch[1]);
                    const productData = parseProductContext(parsed);
                    if (productData) return productData;
                } catch (_) {
                    // continue
                }
            }

            const looseProductData = parseProductFromLooseText(value);
            if (looseProductData) return looseProductData;

            return { text: value, image: '', title: '', subtitle: '' };
        }

        async function refreshUnreadCount() {
            try {
                const res = await apiFetch('/api/workflow/notifications/unread-count');
                const data = await res.json();
                if (!res.ok) return;
                const unread = Number(data?.unread || 0);
                if (unread > 0) {
                    badge.textContent = unread > 99 ? '99+' : String(unread);
                    badge.style.display = 'inline-block';
                } else {
                    badge.style.display = 'none';
                }
            } catch (_) {
                // ignore
            }
        }

        async function refreshNotifications() {
            if (!listEl) return;
            listEl.innerHTML = '<div class="admin-notification-empty">Loading...</div>';
            try {
                const res = await apiFetch('/api/workflow/notifications?limit=40');
                const data = await res.json();
                if (!res.ok) throw new Error(data?.msg || 'Failed to load notifications');

                const items = Array.isArray(data) ? data : [];
                if (!items.length) {
                    listEl.innerHTML = '<div class="admin-notification-empty">No notifications yet.</div>';
                    return;
                }

                listEl.innerHTML = items.map((item) => {
                    const unreadClass = item?.is_read ? '' : ' unread';
                    const rawBody = String(item?.body || '');
                    const displayBody = formatNotificationBody(rawBody);
                    const productContextHtml = displayBody.image || displayBody.title || displayBody.subtitle
                        ? `
                            <div class="admin-notification-context">
                                ${displayBody.image ? `<img src="${escapeHtml(displayBody.image)}" alt="Product" class="admin-notification-thumb" loading="lazy">` : ''}
                                <div class="admin-notification-meta">
                                    ${displayBody.title ? `<div class="admin-notification-meta-title">${escapeHtml(displayBody.title)}</div>` : ''}
                                    ${displayBody.subtitle ? `<div class="admin-notification-meta-sub">${escapeHtml(displayBody.subtitle)}</div>` : ''}
                                </div>
                            </div>
                        `
                        : '';
                    return `
                        <div class="admin-notification-item${unreadClass}"
                            data-id="${escapeHtml(item._id || '')}"
                            data-type="${escapeHtml(item.type || '')}"
                            data-title="${escapeHtml(item.title || '')}"
                            data-body="${escapeHtml(rawBody)}"
                            data-destination-path="${escapeHtml(item?.destination?.path || '')}"
                            data-destination-query="${escapeHtml(JSON.stringify(item?.destination?.query || {}))}"
                            data-reference-id="${escapeHtml(item.reference_id || '')}">
                            <div style="font-weight:800; color:#2d2410;">${escapeHtml(item.title || 'Notification')}</div>
                            <div style="margin-top:4px; color:#555; font-size:13px;">${escapeHtml(displayBody.text || '')}</div>
                            ${productContextHtml}
                            <div style="margin-top:4px; color:#777; font-size:11px;">${escapeHtml(timeAgo(item.timestamp))}</div>
                        </div>
                    `;
                }).join('');

                listEl.querySelectorAll('.admin-notification-item').forEach((el) => {
                    el.addEventListener('click', async () => {
                        const id = el.getAttribute('data-id');
                        if (!id) return;
                        const notificationLike = {
                            type: el.getAttribute('data-type') || '',
                            title: el.getAttribute('data-title') || '',
                            body: el.getAttribute('data-body') || '',
                            destination: {
                                path: el.getAttribute('data-destination-path') || '',
                                query: safeParseJson(el.getAttribute('data-destination-query') || '{}') || {}
                            },
                            reference_id: el.getAttribute('data-reference-id') || ''
                        };
                        const target = resolveNotificationTarget(notificationLike);
                        try {
                            await apiFetch('/api/workflow/notifications/' + encodeURIComponent(id) + '/read', { method: 'PUT' });
                        } catch (_) {
                            // ignore read errors and still navigate
                        } finally {
                            await refreshUnreadCount().catch(() => null);
                            panel.classList.remove('open');
                            window.location.href = target;
                        }
                    });
                });
            } catch (err) {
                listEl.innerHTML = `<div class="admin-notification-empty">${escapeHtml(err?.message || 'Failed to load notifications')}</div>`;
            }
        }

        bell.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isOpen = panel.classList.contains('open');
            if (isOpen) {
                panel.classList.remove('open');
                return;
            }
            panel.classList.add('open');
            await refreshNotifications();
            await refreshUnreadCount();
        });

        markAllBtn?.addEventListener('click', async () => {
            try {
                await apiFetch('/api/workflow/notifications/read-all', { method: 'PUT' });
                await refreshUnreadCount();
                await refreshNotifications();
            } catch (_) {
                // ignore
            }
        });

        document.addEventListener('click', (e) => {
            if (!panel.classList.contains('open')) return;
            const target = e.target;
            if (!target) return;
            if (panel.contains(target) || bell.contains(target)) return;
            panel.classList.remove('open');
        });

        refreshUnreadCount();
        setInterval(refreshUnreadCount, 15000);
    }

    document.addEventListener('DOMContentLoaded', () => {
        applyBranding();
        initAdminNotificationsWidget();
    });

    window.AdminCommon = {
        safeParseJson,
        getToken,
        getRole,
        getDeviceFingerprint,
        applyBrandingFromContent,
        ensureAdmin,
        escapeHtml,
        getImgUrl,
        apiFetch
    };
})();
