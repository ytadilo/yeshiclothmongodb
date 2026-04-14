document.addEventListener('DOMContentLoaded', () => {
    (async () => {
        if (window.YeshiAuth && typeof window.YeshiAuth.resolveSession === 'function') {
            await window.YeshiAuth.resolveSession().catch(() => null);
        }

        const token = localStorage.getItem('token');
        if (!token) {
            const next = encodeURIComponent('/my-orders');
            window.location.href = `/auth/login?next=${next}`;
            return;
        }

        loadMyOrders();
        // Poll for updates every 10 seconds
        setInterval(() => loadMyOrders({ skipDuringPaymentInteraction: true, skipDuringNegotiationInteraction: true }), 10000);
    })();
});

let lastAppliedHighlightKey = '';
let paymentInteractionUntil = 0;
let negotiationInteractionUntil = 0;
const PAYMENT_METHOD_STATE_KEY = 'yeshi_my_orders_payment_method_state';

function readPaymentMethodState() {
    try {
        const raw = sessionStorage.getItem(PAYMENT_METHOD_STATE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function writePaymentMethodState(state) {
    try {
        sessionStorage.setItem(PAYMENT_METHOD_STATE_KEY, JSON.stringify(state && typeof state === 'object' ? state : {}));
    } catch (_) {
        // ignore storage failures
    }
}

function getSavedPaymentMethod(orderId) {
    const key = String(orderId || '').trim();
    if (!key) return '';
    const state = readPaymentMethodState();
    const value = String(state[key] || '').trim();
    return ['bank_transfer', 'telebirr'].includes(value) ? value : '';
}

function setSavedPaymentMethod(orderId, method) {
    const key = String(orderId || '').trim();
    if (!key) return;
    const state = readPaymentMethodState();
    const normalized = String(method || '').trim();
    if (!normalized) {
        delete state[key];
    } else {
        state[key] = normalized;
    }
    writePaymentMethodState(state);
}

function markPaymentInteraction() {
    paymentInteractionUntil = Date.now() + 15000;
}

function isPaymentInteractionActive() {
    return Date.now() < paymentInteractionUntil;
}

function markNegotiationInteraction() {
    negotiationInteractionUntil = Date.now() + 15000;
}

function isNegotiationInteractionActive() {
    return Date.now() < negotiationInteractionUntil;
}

function hasPendingNegotiationDraft(container) {
    const root = container || document;
    const forms = Array.from(root.querySelectorAll('.negotiation-form'));
    for (const frm of forms) {
        const textInput = frm.querySelector('input[name="message"]');
        const fileInput = frm.querySelector('input[name="image"]');
        const text = String(textInput && textInput.value ? textInput.value : '').trim();
        const hasFile = !!(fileInput && fileInput.files && fileInput.files.length > 0);
        if (text || hasFile) return true;

        const activeEl = document.activeElement;
        if (activeEl && frm.contains(activeEl)) return true;
    }
    return false;
}

function ensureOrderHighlightStyles() {
    if (document.getElementById('orderHighlightStyles')) return;
    const style = document.createElement('style');
    style.id = 'orderHighlightStyles';
    style.textContent = `
        .product-card.order-highlight-active {
            position: relative;
            background: linear-gradient(180deg, rgba(255, 249, 220, 0.95) 0%, rgba(255, 239, 184, 0.9) 52%, rgba(255, 248, 230, 0.94) 100%) !important;
            border: 1px solid rgba(212, 180, 104, 0.7) !important;
            box-shadow: 0 0 0 3px rgba(212, 180, 104, 0.65), 0 16px 34px rgba(116, 91, 24, 0.24);
            animation: orderHighlightIntro 500ms ease-out 1, orderHighlightPulse 900ms ease-in-out 3 500ms, orderHighlightSunset 3600ms ease-out 3200ms 1 forwards;
            will-change: box-shadow, background-color, transform;
        }

        @keyframes orderHighlightIntro {
            from {
                transform: scale(0.995);
                box-shadow: 0 0 0 0 rgba(212, 180, 104, 0.1), 0 10px 20px rgba(116, 91, 24, 0.12);
            }
            to {
                transform: scale(1);
                box-shadow: 0 0 0 3px rgba(212, 180, 104, 0.65), 0 16px 34px rgba(116, 91, 24, 0.24);
            }
        }

        @keyframes orderHighlightPulse {
            0%, 100% {
                box-shadow: 0 0 0 3px rgba(212, 180, 104, 0.65), 0 16px 34px rgba(116, 91, 24, 0.24);
            }
            50% {
                box-shadow: 0 0 0 6px rgba(212, 180, 104, 0.36), 0 20px 40px rgba(116, 91, 24, 0.3);
            }
        }

        @keyframes orderHighlightSunset {
            0% {
                background: linear-gradient(180deg, rgba(255, 249, 220, 0.95) 0%, rgba(255, 239, 184, 0.9) 52%, rgba(255, 248, 230, 0.94) 100%);
                box-shadow: 0 0 0 3px rgba(212, 180, 104, 0.65), 0 16px 34px rgba(116, 91, 24, 0.24);
            }
            100% {
                background: transparent;
                box-shadow: 0 0 0 0 rgba(212, 180, 104, 0), 0 0 0 rgba(0, 0, 0, 0);
            }
        }
    `;
    document.head.appendChild(style);
}

function getHighlightOrderIdFromUrl() {
    const params = new URLSearchParams(window.location.search || '');
    return String(params.get('highlight') || '').trim();
}

function findOrderCardById(container, orderId) {
    if (!container || !orderId) return null;
    const cards = Array.from(container.querySelectorAll('.product-card[data-order-id]'));
    return cards.find((card) => String(card.getAttribute('data-order-id') || '').trim() === orderId) || null;
}

function clearExistingOrderHighlights(container) {
    if (!container) return;
    Array.from(container.querySelectorAll('.product-card.order-highlight-active')).forEach((card) => {
        card.classList.remove('order-highlight-active');
    });
}

function applyOrderHighlight(container, orderId) {
    if (!container || !orderId) return;
    const applyKey = `${window.location.pathname}|${window.location.search}|${orderId}`;
    if (applyKey === lastAppliedHighlightKey) return;

    let attempts = 0;
    const maxAttempts = 18;
    const retryDelay = 140;

    const tryHighlight = () => {
        attempts += 1;
        const card = findOrderCardById(container, orderId);
        if (!card) {
            if (attempts < maxAttempts) {
                window.setTimeout(tryHighlight, retryDelay);
            } else {
                console.warn('Highlight target order not found:', orderId);
            }
            return;
        }

        clearExistingOrderHighlights(container);

        card.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

        // Force animation restart for repeated highlights.
        card.classList.remove('order-highlight-active');
        void card.offsetWidth;
        card.classList.add('order-highlight-active');

        window.setTimeout(() => {
            card.classList.remove('order-highlight-active');
        }, 7000);

        try {
            const url = new URL(window.location.href);
            if (url.searchParams.has('highlight')) {
                url.searchParams.delete('highlight');
                const next = url.pathname + (url.search || '') + (url.hash || '');
                window.history.replaceState({}, '', next);
            }
        } catch (_) {
            // Ignore URL update failures.
        }

        lastAppliedHighlightKey = applyKey;
    };

    tryHighlight();
}

function formatDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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

    try {
        const token = localStorage.getItem('token');
        const isPrivateUpload = base.startsWith('/api/uploads/') || /\/api\/uploads\//i.test(base);
        if (token && isPrivateUpload && !/[?&](token|auth)=/.test(base)) {
            const sep = base.includes('?') ? '&' : '?';
            return base + sep + 'token=' + encodeURIComponent(token);
        }
    } catch (_) {
        // ignore
    }

    return base;
}

function getOrderPaymentScreenshot(order) {
    const paymentInfo = order && order.payment_info && typeof order.payment_info === 'object'
        ? order.payment_info
        : {};

    return getImgUrl(
        paymentInfo.screenshot_url
        || paymentInfo.screenshotUrl
        || order?.payment_screenshot_url
        || order?.paymentScreenshotUrl
        || order?.screenshot_url
        || ''
    );
}

function toPriceText(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? `${n.toLocaleString()} ETB` : 'Price on request';
}

function computeQuantityTotal(price, shipping, qty) {
    const unitPrice = Number.isFinite(Number(price)) ? Number(price) : 0;
    const unitShipping = Number.isFinite(Number(shipping)) ? Number(shipping) : 0;
    const quantity = Math.max(1, Math.floor(Number(qty) || 1));
    return (unitPrice + unitShipping) * quantity;
}

function buildItemLabel(cloth, order) {
    const category = String(cloth?.category || '').trim();
    const title = String(cloth?.post_title || order?.productName || cloth?.design_type || '').trim();
    const eventType = String(cloth?.event_type || '').trim();
    const bits = [title || category || 'Custom Cloth'];
    if (category && category.toLowerCase() !== (title || '').toLowerCase()) bits.push(category);
    if (eventType) bits.push(eventType);
    return bits.join(' · ');
}

function parseMeasurementPack(measurements) {
    const raw = String(measurements?.size || '').trim();
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if (!Array.isArray(parsed.entries)) return null;
        return parsed;
    } catch (_) {
        return null;
    }
}

function renderMeasurementSummary(order) {
    const measurements = order?.measurements || {};
    const pack = parseMeasurementPack(measurements);
    if (pack && Array.isArray(pack.entries) && pack.entries.length) {
        const preview = pack.entries.slice(0, 4).map((entry) => {
            const productIndex = Number(entry?.productIndex || 1);
            const label = String(entry?.label || 'Measurement');
            const person = String(entry?.personName || '—');
            const detailsObj = entry?.measurementDetails && typeof entry.measurementDetails === 'object'
                ? entry.measurementDetails
                : {};
            const details = [
                ['Height', detailsObj.height],
                ['Shoulder', detailsObj.shoulder],
                ['Chest', detailsObj.chest],
                ['Waist', detailsObj.waist],
                ['Hip', detailsObj.hip],
                ['Length', detailsObj.length],
                ['Sleeve', detailsObj.sleeve]
            ].map(([k, v]) => `${k}: ${v || '—'}`).join(' · ');
            return `
                <div style="margin-top:6px; padding:8px; border:1px solid rgba(0,0,0,0.08); border-radius:8px; background:#fafafa;">
                    <div style="font-weight:700; color:#1a1c1c;">Product ${escapeHtml(String(productIndex))} · ${escapeHtml(label)}</div>
                    <div style="margin-top:3px; font-size:0.88rem;"><span style="color:var(--light-text);">Person:</span> ${escapeHtml(person)}</div>
                    <div style="margin-top:3px; font-size:0.88rem;"><span style="color:var(--light-text);">Details:</span> ${escapeHtml(details)}</div>
                </div>
            `;
        }).join('');

        const remaining = pack.entries.length > 4
            ? `<div style="margin-top:6px; font-size:0.84rem; color:var(--light-text);">+${escapeHtml(String(pack.entries.length - 4))} more measurement block(s)</div>`
            : '';

        return `
            <div style="margin-top:12px; padding:10px; border:1px solid rgba(0,0,0,0.1); border-radius:10px; background:#fff;">
                <div style="font-weight:800; color:#1a1c1c;">Measurements Submitted</div>
                <div style="margin-top:4px; font-size:0.86rem; color:var(--light-text);">Rule: ${escapeHtml(String(pack.rule || '—'))} · Quantity: ${escapeHtml(String(Number(pack.quantity || 1) || 1))}</div>
                ${preview}
                ${remaining}
            </div>
        `;
    }

    const size = measurements?.size;
    if (size) {
        return `
            <div style="margin-top:12px; padding:10px; border:1px solid rgba(0,0,0,0.1); border-radius:10px; background:#fff;">
                <div style="font-weight:800; color:#1a1c1c;">Measurements Submitted</div>
                <div style="margin-top:4px; font-size:0.88rem; color:#333;">${escapeHtml(String(size))}</div>
            </div>
        `;
    }

    return '';
}

function renderNegotiationMessages(order) {
    const msgs = Array.isArray(order?.negotiation_messages) ? order.negotiation_messages : [];
    if (!msgs.length) {
        return '<div style="font-size:0.86rem; color:var(--light-text);">No negotiation messages yet.</div>';
    }

    const latest = msgs.slice(-5);
    return latest.map((msg) => {
        const isAdmin = String(msg?.sender_role || '').toLowerCase() === 'admin';
        const who = isAdmin ? 'Admin' : 'You';
        const when = formatDate(msg?.timestamp);
        const imageUrl = getImgUrl(msg?.image_url || '');
        return `
            <div style="margin-bottom:6px; padding:8px 10px; border-radius:8px; background:${isAdmin ? 'rgba(186,26,26,0.08)' : 'rgba(30,75,53,0.08)'}; border:1px solid rgba(0,0,0,0.08);">
                <div style="font-weight:700; font-size:0.82rem;">${escapeHtml(who)}${when ? ` · ${escapeHtml(when)}` : ''}</div>
                ${msg?.message ? `<div style="margin-top:3px; font-size:0.88rem;">${escapeHtml(msg?.message || '')}</div>` : ''}
                ${imageUrl ? `<div style="margin-top:6px;"><a href="${escapeHtml(imageUrl)}" target="_blank" rel="noopener noreferrer"><img src="${escapeHtml(imageUrl)}" alt="Negotiation attachment" style="max-width:220px; width:100%; border-radius:10px; border:1px solid rgba(0,0,0,0.12);"></a></div>` : ''}
            </div>
        `;
    }).join('');
}

async function sendNegotiationMessage(orderId, message, imageFile) {
    const token = localStorage.getItem('token');
    const fd = new FormData();
    fd.append('message', String(message || '').trim());
    if (imageFile) fd.append('image', imageFile);
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/negotiation`, {
        method: 'POST',
        headers: { 'x-auth-token': token },
        body: fd
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.msg || 'Failed to send message');
}

async function uploadPaymentProof(orderId, paymentMethod, file) {
    const token = localStorage.getItem('token');
    const fd = new FormData();
    fd.append('paymentMethod', paymentMethod);
    fd.append('paymentScreenshot', file);

    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/payment-proof`, {
        method: 'POST',
        headers: { 'x-auth-token': token },
        body: fd
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.msg || 'Failed to upload payment proof');
}

function updatePaymentProofMethodDetails(formEl) {
    if (!formEl) return;
    const method = String(formEl.querySelector('select[name="paymentMethod"]')?.value || '').trim();
    const bankDetails = formEl.querySelector('[data-payment-details="bank_transfer"]');
    const telebirrDetails = formEl.querySelector('[data-payment-details="telebirr"]');
    if (bankDetails) bankDetails.style.display = method === 'bank_transfer' ? 'block' : 'none';
    if (telebirrDetails) telebirrDetails.style.display = method === 'telebirr' ? 'block' : 'none';
}

async function loadMyOrders(options = {}) {
    const container = document.getElementById('myOrdersList');
    if (!container) return;

    if (options && options.skipDuringPaymentInteraction && isPaymentInteractionActive()) {
        return;
    }
    if (options && options.skipDuringNegotiationInteraction && (isNegotiationInteractionActive() || hasPendingNegotiationDraft(container))) {
        return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
        container.innerHTML = '<p style="text-align:center; width:100%;">Login to see your orders.</p>';
        return;
    }

    try {
        ensureOrderHighlightStyles();
        const res = await fetch('/api/orders', {
            headers: { 'x-auth-token': token }
        });

        const raw = await res.text();
        let payload = [];
        try {
            payload = raw ? JSON.parse(raw) : [];
        } catch (_) {
            payload = [];
        }
        if (!res.ok) {
            throw new Error(payload?.msg || 'Failed to load orders');
        }

        const orders = Array.isArray(payload) ? payload : [];

        if (orders.length === 0) {
            container.innerHTML = '<p style="text-align:center; width:100%;">No orders yet. Place your first order.</p>';
            return;
        }

        container.innerHTML = orders.map((order) => {
            const cloth = order?.cloth_details || {};
            const paymentInfo = order?.payment_info || {};
            const status = order?.order_status || order?.status || 'Received';
            let paymentStatus = order?.payment_status || order?.payment_info?.status || 'Pending';
            if (String(status).toLowerCase() === 'payment confirmed' && String(paymentStatus).toLowerCase() === 'pending') {
                paymentStatus = 'Confirmed';
            }
            const sewingStatus = order?.sewing_status || 'Pending';
            const createdAt = formatDate(order?.created_at || order?.createdAt);
            const orderedQty = Math.max(1, Math.floor(Number(order?.quantity || 1)));

            const title = cloth.post_title || order?.productName || cloth.design_type || cloth.category || 'Custom Order';
            const color = cloth.color ? ` · ${cloth.color}` : '';
            const category = cloth.category || '—';
            const image = getImgUrl(cloth.post_image || order?.productImage || '');
            const itemLabel = buildItemLabel(cloth, order);
            const price = Number(cloth.post_price_etb ?? order?.productPrice);
            const shippingPrice = Number(cloth.post_shipping_price_etb ?? order?.shippingPrice);
            const freeShipping = !!cloth.post_free_shipping;
            const payableTotal = Number.isFinite(price)
                ? computeQuantityTotal(price, Number.isFinite(shippingPrice) ? shippingPrice : 0, orderedQty)
                : NaN;
            const paymentScreenshot = getOrderPaymentScreenshot(order);
            const isProductAsIsOrder =
                String(order?.order_type || '').toLowerCase() === 'product'
                || Boolean(order?.post_id || order?.productId);
            const clothPrice = Number(cloth?.post_price_etb);
            const quotedShipping = Number(cloth?.post_shipping_price_etb);
            const hasQuotedPrice = Number.isFinite(clothPrice) && clothPrice >= 0;
            const hasQuotedShipping = Number.isFinite(quotedShipping) && quotedShipping >= 0;
            const negotiationHtml = renderNegotiationMessages(order);
            const measurementSummaryHtml = renderMeasurementSummary(order);
            const orderId = String(order?._id || '').trim();
            const savedPaymentMethod = getSavedPaymentMethod(orderId);
            const selectedPaymentMethod = savedPaymentMethod || String(paymentInfo?.method || '').trim();

            return `
                <div class="product-card" data-order-id="${escapeHtml(order?._id || '')}" style="padding: 16px;">
                    <div style="display:flex; justify-content:space-between; gap: 10px; align-items:flex-start;">
                        <div>
                            <h3 style="margin-bottom: 6px;">${escapeHtml(title)}${escapeHtml(color)}</h3>
                            <p style="margin:0; color: var(--light-text); font-size: 0.9rem;">${createdAt ? `Ordered: ${escapeHtml(createdAt)}` : ''}</p>
                            <p style="margin:6px 0 0; color: var(--light-text); font-size: 0.9rem;"><strong>Item:</strong> ${escapeHtml(itemLabel)}</p>
                            <p style="margin:4px 0 0; color: var(--light-text); font-size: 0.9rem;"><strong>Quantity:</strong> ${escapeHtml(String(orderedQty))}</p>
                        </div>
                        <div style="text-align:right;">
                            <div style="display:inline-block; padding: 6px 10px; border-radius: 999px; background: rgba(30,75,53,0.08); border: 1px solid rgba(30,75,53,0.18); color: #0f2f21; font-weight: 700; font-size: 0.85rem;">
                                ${escapeHtml(status)}
                            </div>
                            <div style="margin-top: 6px; color: var(--light-text); font-size: 0.85rem;">Payment: ${escapeHtml(paymentStatus)}</div>
                            <div style="margin-top: 2px; color: var(--light-text); font-size: 0.85rem;">Sewing: ${escapeHtml(sewingStatus)}</div>
                        </div>
                    </div>

                    ${(image || category !== '—' || Number.isFinite(price)) ? `
                        <div style="display:flex; gap:10px; align-items:flex-start; margin-top:10px;">
                            ${image ? `<img src="${escapeHtml(image)}" alt="Ordered product" style="width:72px; height:72px; object-fit:cover; border-radius:10px; border:1px solid rgba(0,0,0,0.1);">` : ''}
                            <div style="min-width:0; font-size:0.92rem;">
                                <div style="font-weight:800; color:#1a1c1c;">${escapeHtml(title)}</div>
                                <div style="margin-top:3px; color:#666;">Category: ${escapeHtml(category)}</div>
                                <div style="margin-top:3px; color:#ba1a1a; font-weight:700;">Product Price (per 1): ${escapeHtml(toPriceText(price))}</div>
                                <div style="margin-top:2px; color:#745B18; font-weight:700;">Shipping (per 1): ${freeShipping ? 'Free shipping' : (Number.isFinite(shippingPrice) && shippingPrice >= 0 ? `${escapeHtml(shippingPrice.toLocaleString())} ETB` : 'Shipping: —')}</div>
                                <div style="margin-top:2px; color:#0f2f21; font-weight:800;">${Number.isFinite(payableTotal) && payableTotal >= 0 ? `Total payable: ${escapeHtml(payableTotal.toLocaleString())} ETB (you should pay total price)` : ''}</div>
                            </div>
                        </div>
                    ` : ''}

                    ${paymentScreenshot ? `
                        <div style="margin-top:10px; display:flex; gap:10px; align-items:center;">
                            <a href="${escapeHtml(paymentScreenshot)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;">
                                <img src="${escapeHtml(paymentScreenshot)}" alt="Payment screenshot" style="width:72px; height:72px; object-fit:cover; border-radius:10px; border:1px solid rgba(0,0,0,0.1);">
                            </a>
                            <div style="font-size:0.85rem; color:var(--light-text);">Payment proof uploaded</div>
                        </div>
                    ` : ''}

                    ${measurementSummaryHtml}

                    ${(!isProductAsIsOrder && (hasQuotedPrice || hasQuotedShipping)) ? `
                        <div style="margin-top:12px; padding:10px; border:1px solid rgba(0,0,0,0.1); border-radius:10px; background:#fff9ef;">
                            <div style="font-weight:800; color:#745B18;">Admin Quote</div>
                            <div style="margin-top:4px; font-size:0.9rem; color:#1a1c1c;">Cloth (per 1): ${hasQuotedPrice ? `${escapeHtml(clothPrice.toLocaleString())} ETB` : 'TBD'}</div>
                            <div style="margin-top:2px; font-size:0.9rem; color:#1a1c1c;">Shipping (per 1): ${hasQuotedShipping ? `${escapeHtml(quotedShipping.toLocaleString())} ETB` : 'TBD'}</div>
                            <div style="margin-top:2px; font-size:0.9rem; color:#0f2f21; font-weight:800;">Total payable: ${(hasQuotedPrice || hasQuotedShipping) ? `${escapeHtml(computeQuantityTotal(hasQuotedPrice ? clothPrice : 0, hasQuotedShipping ? quotedShipping : 0, orderedQty).toLocaleString())} ETB` : 'TBD'}</div>
                        </div>
                    ` : ''}

                    ${!isProductAsIsOrder ? `
                    <div style="margin-top:12px; padding:10px; border:1px solid rgba(0,0,0,0.1); border-radius:10px; background:#f8faf9;">
                        <div style="font-weight:800; color:#0f2f21; margin-bottom:8px;">Negotiation</div>
                        <div>${negotiationHtml}</div>
                        <form class="negotiation-form" data-order-id="${escapeHtml(order?._id || '')}" style="margin-top:8px; display:grid; gap:8px; align-items:center;">
                            <div style="display:flex; align-items:center; gap:8px; background:#ece9df; border:1px solid rgba(0,0,0,0.08); border-radius:999px; padding:5px 7px; min-height:48px; width:100%; max-width:100%; box-sizing:border-box; overflow:hidden;">
                                <button type="button" data-attach-image style="width:40px; height:40px; border:none; border-radius:999px; background:transparent; color:#463f32; display:inline-flex; align-items:center; justify-content:center; cursor:pointer;" aria-label="Attach image">
                                    <span class="material-symbols-outlined">add_circle</span>
                                </button>
                                <input type="text" name="message" placeholder="Write negotiation..." style="flex:1; min-width:0; width:1%; border:none; background:transparent; color:#5d574a; outline:none; font:inherit; font-size:0.95rem;">
                                <span data-image-name style="max-width:36%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.82rem; color:#6e6658; display:none;"></span>
                                <button type="submit" class="btn" style="width:40px; min-width:40px; height:40px; min-height:40px; padding:0; border-radius:999px; display:inline-flex; align-items:center; justify-content:center; background:#d9d3a4; color:#5b5800; border:none;" aria-label="Send message">
                                    <span class="material-symbols-outlined">send</span>
                                </button>
                            </div>
                            <div data-image-preview-wrap style="display:none; align-items:center; gap:8px; background:#fff; border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:8px;">
                                <img data-image-preview alt="Selected image" style="width:42px; height:42px; border-radius:8px; object-fit:cover; border:1px solid rgba(0,0,0,0.12);">
                                <span data-image-preview-name style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:0.82rem; color:#6e6658;"></span>
                                <button type="button" data-clear-image style="border:none; background:transparent; color:#735c00; cursor:pointer; font-size:0.82rem;">Remove</button>
                            </div>
                            <input type="file" name="image" accept="image/*" style="display:none;">
                        </form>
                    </div>
                    ` : ''}

                    ${(!isProductAsIsOrder && !paymentScreenshot && (hasQuotedPrice || hasQuotedShipping)) ? `
                        <form class="payment-proof-form" data-order-id="${escapeHtml(orderId)}" style="margin-top:12px; padding:10px; border:1px solid rgba(0,0,0,0.1); border-radius:10px; background:#fff; display:grid; gap:8px;">
                            <div style="font-weight:800; color:#1a1c1c;">Upload Payment Proof</div>
                            <select name="paymentMethod" class="form-control" required>
                                <option value="" ${selectedPaymentMethod ? '' : 'selected'} disabled>Select payment method</option>
                                <option value="bank_transfer" ${selectedPaymentMethod === 'bank_transfer' ? 'selected' : ''}>Ethiopia Commercial Bank Transfer</option>
                                <option value="telebirr" ${selectedPaymentMethod === 'telebirr' ? 'selected' : ''}>Telebirr</option>
                            </select>
                            <div style="background:#fdfdfd; padding:10px; border:1px dashed #ccc; border-radius:8px;">
                                <div style="font-weight:700; margin-bottom:6px; color:#1a1c1c;">Payment Details</div>
                                <div data-payment-details="bank_transfer" style="display:none; font-size:0.9rem; color:#333;">
                                    <div><strong>Bank:</strong> CBE</div>
                                    <div><strong>Account:</strong> 1000338448396 (Haileyesus Tadilo)</div>
                                </div>
                                <div data-payment-details="telebirr" style="display:none; font-size:0.9rem; color:#333;">
                                    <div><strong>Telebirr:</strong> +251933797981 (Haileyesus Tadilo)</div>
                                </div>
                            </div>
                            <input type="file" name="paymentScreenshot" accept="image/*" class="form-control" required>
                            <button type="submit" class="btn">Submit Payment Proof</button>
                        </form>
                    ` : ''}

                    <hr style="border:0; border-top: 1px solid rgba(0,0,0,0.08); margin: 12px 0;">
                </div>
            `;
        }).join('');

        Array.from(container.querySelectorAll('.negotiation-form')).forEach((frm) => {
            const attachBtn = frm.querySelector('[data-attach-image]');
            const hiddenImageInput = frm.querySelector('input[name="image"]');
            const imageNameEl = frm.querySelector('[data-image-name]');
            const previewWrap = frm.querySelector('[data-image-preview-wrap]');
            const previewImg = frm.querySelector('[data-image-preview]');
            const previewName = frm.querySelector('[data-image-preview-name]');
            const clearImageBtn = frm.querySelector('[data-clear-image]');
            const refreshImageName = () => {
                const file = hiddenImageInput && hiddenImageInput.files ? hiddenImageInput.files[0] : null;
                const name = file ? String(file.name || '').trim() : '';
                if (!imageNameEl) return;
                if (!name) {
                    imageNameEl.textContent = '';
                    imageNameEl.style.display = 'none';
                    if (previewWrap) previewWrap.style.display = 'none';
                    if (previewImg && previewImg.dataset.objectUrl) {
                        try { URL.revokeObjectURL(previewImg.dataset.objectUrl); } catch (_) {}
                        delete previewImg.dataset.objectUrl;
                    }
                    return;
                }
                imageNameEl.textContent = name;
                imageNameEl.style.display = 'inline-block';
                if (previewName) previewName.textContent = name;
                if (previewWrap) previewWrap.style.display = 'flex';
                if (previewImg) {
                    if (previewImg.dataset.objectUrl) {
                        try { URL.revokeObjectURL(previewImg.dataset.objectUrl); } catch (_) {}
                    }
                    const obj = URL.createObjectURL(file);
                    previewImg.src = obj;
                    previewImg.dataset.objectUrl = obj;
                }
            };
            if (attachBtn && hiddenImageInput) {
                attachBtn.addEventListener('click', () => {
                    markNegotiationInteraction();
                    hiddenImageInput.click();
                });
                hiddenImageInput.addEventListener('change', () => {
                    markNegotiationInteraction();
                    refreshImageName();
                });
            }
            if (clearImageBtn && hiddenImageInput) {
                clearImageBtn.addEventListener('click', () => {
                    markNegotiationInteraction();
                    hiddenImageInput.value = '';
                    refreshImageName();
                });
            }
            const msgInput = frm.querySelector('input[name="message"]');
            if (msgInput) {
                msgInput.addEventListener('focus', markNegotiationInteraction);
                msgInput.addEventListener('input', markNegotiationInteraction);
            }
            frm.addEventListener('submit', async (ev) => {
                ev.preventDefault();
                markNegotiationInteraction();
                const orderId = String(frm.getAttribute('data-order-id') || '').trim();
                const input = frm.querySelector('input[name="message"]');
                const message = String(input?.value || '').trim();
                const imageFile = frm.querySelector('input[name="image"]')?.files?.[0] || null;
                if (!orderId || (!message && !imageFile)) {
                    alert('Please add a message or image.');
                    return;
                }
                const btn = frm.querySelector('button[type="submit"]');
                if (btn) btn.disabled = true;
                try {
                    await sendNegotiationMessage(orderId, message, imageFile);
                    if (input) input.value = '';
                    const imageInput = frm.querySelector('input[name="image"]');
                    if (imageInput) imageInput.value = '';
                    refreshImageName();
                    await loadMyOrders();
                } catch (e) {
                    alert(e?.message || 'Failed to send message');
                } finally {
                    if (btn) btn.disabled = false;
                }
            });
        });

        Array.from(container.querySelectorAll('.payment-proof-form')).forEach((frm) => {
            const methodSelect = frm.querySelector('select[name="paymentMethod"]');
            if (methodSelect) {
                methodSelect.addEventListener('change', () => {
                    const orderId = String(frm.getAttribute('data-order-id') || '').trim();
                    setSavedPaymentMethod(orderId, methodSelect.value);
                    markPaymentInteraction();
                    updatePaymentProofMethodDetails(frm);
                });
            }
            const fileInput = frm.querySelector('input[name="paymentScreenshot"]');
            if (fileInput) {
                fileInput.addEventListener('click', markPaymentInteraction);
                fileInput.addEventListener('focus', markPaymentInteraction);
                fileInput.addEventListener('change', markPaymentInteraction);
            }
            updatePaymentProofMethodDetails(frm);

            frm.addEventListener('submit', async (ev) => {
                ev.preventDefault();
                const orderId = String(frm.getAttribute('data-order-id') || '').trim();
                const method = String(frm.querySelector('select[name="paymentMethod"]')?.value || '').trim();
                const file = frm.querySelector('input[name="paymentScreenshot"]')?.files?.[0];
                markPaymentInteraction();
                if (!orderId || !method || !file) {
                    alert('Please select payment method and screenshot.');
                    return;
                }
                const btn = frm.querySelector('button[type="submit"]');
                if (btn) btn.disabled = true;
                try {
                    await uploadPaymentProof(orderId, method, file);
                    setSavedPaymentMethod(orderId, '');
                    alert('Payment proof uploaded successfully.');
                    await loadMyOrders();
                } catch (e) {
                    alert(e?.message || 'Failed to upload payment proof');
                } finally {
                    if (btn) btn.disabled = false;
                }
            });
        });

        const highlightId = getHighlightOrderIdFromUrl();
        if (highlightId) {
            applyOrderHighlight(container, highlightId);
        } else {
            lastAppliedHighlightKey = '';
        }
    } catch (err) {
        console.error(err);
        const msg = (err?.message || '').toLowerCase();
        if (msg.includes('token') || msg.includes('unauthorized') || msg.includes('not authorized')) {
            const next = encodeURIComponent('/my-orders');
            window.location.href = `/auth/login?next=${next}`;
            return;
        }
        container.innerHTML = '<p style="text-align:center; width:100%;">Failed to load orders. Please refresh.</p>';
    }
}
