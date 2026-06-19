// Initialize form on load
document.addEventListener('DOMContentLoaded', async () => {
    if (window.YeshiAuth && typeof window.YeshiAuth.resolveSession === 'function') {
        await window.YeshiAuth.resolveSession().catch(() => null);
    }

    const token = localStorage.getItem('token');
    if (!token) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        alert('Login to order');
        window.location.href = `/auth/login?next=${next}`;
        return;
    }

    toggleMeasurementMode();
    updateMeasurementFields();
    initPaymentMethodUI();
    initProductQuantityControls();
    setupOrderStepFlow();
    initShippingAddressUI();
    await loadSavedProfileSettings();
    bindSavedSettingsChoices();
    bindRefundPolicyModal();
    prefillOrderFromSavedProfile();

    // Load order history for the logged-in user
    loadMyOrders();
    initMyOrdersAutoRefresh();

    // Check URL params for pre-filled data
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('postId');
    const title = urlParams.get('title');

    if (postId) {
        const formTitle = document.querySelector('.hero h1');
        if (formTitle && title) formTitle.innerText = `Ordering: ${title}`;

        form.dataset.postId = postId;
        form.dataset.postTitle = title || '';

        applyProductOrderMode(true);
        loadSelectedCloth(postId, title);
    } else {
        applyProductOrderMode(false);
    }
});

function applyProductOrderMode(isProductOrder) {
    const categorySelect = document.getElementById('clothCategory');
    const measurementSetupGroup = document.getElementById('measurementSetupGroup');
    const referenceImagesGroup = document.getElementById('referenceImagesGroup');
    const eventTypeGroup = document.getElementById('eventTypeGroup');
    const proposedPriceGroup = document.getElementById('proposedPriceETB')?.closest('.form-group');
    const paymentMethodGroup = document.getElementById('paymentMethodGroup');
    const paymentMethodInput = document.getElementById('paymentMethod');
    const paymentDetailsCard = document.getElementById('productPaymentDetailsCard');
    const paymentScreenshotInput = document.getElementById('paymentScreenshot');
    const paymentCommentInput = document.getElementById('paymentComment');
    const productQuantityGroup = document.getElementById('productQuantityGroup');

    if (categorySelect) {
        categorySelect.disabled = !!isProductOrder;
        categorySelect.style.opacity = isProductOrder ? '0.65' : '1';
        categorySelect.style.cursor = isProductOrder ? 'not-allowed' : 'pointer';
    }

    if (measurementSetupGroup) {
        measurementSetupGroup.style.display = isProductOrder ? 'none' : '';
    }
    document.querySelectorAll('[data-custom-measurement-profile]').forEach((input) => {
        input.disabled = !!isProductOrder;
    });

    if (referenceImagesGroup) {
        referenceImagesGroup.style.display = isProductOrder ? 'none' : '';
    }
    if (productQuantityGroup) {
        productQuantityGroup.style.display = '';
    }

    if (proposedPriceGroup) {
        proposedPriceGroup.style.display = isProductOrder ? 'none' : '';
    }

    if (paymentMethodGroup) {
        paymentMethodGroup.style.display = isProductOrder ? '' : 'none';
    }
    if (paymentDetailsCard) {
        paymentDetailsCard.style.display = isProductOrder ? '' : 'none';
    }
    if (paymentMethodInput) {
        paymentMethodInput.required = !!isProductOrder;
        if (!isProductOrder) paymentMethodInput.value = '';
    }
    if (paymentScreenshotInput) {
        paymentScreenshotInput.required = !!isProductOrder;
    }
    if (!isProductOrder && paymentScreenshotInput) {
        paymentScreenshotInput.value = '';
    }
    if (!isProductOrder && paymentCommentInput) {
        paymentCommentInput.value = '';
    }
    updatePaymentDetailsVisibility();

    syncEventTypeVisibility();

    if (isProductOrder) {
        const eventType = document.getElementById('eventType');
        const referenceImages = document.getElementById('referenceImages');
        if (eventType) eventType.value = '';
        if (referenceImages) referenceImages.value = '';
    } else if (form) {
        form.dataset.measurementProfiles = '[]';
        form.dataset.postCategories = '[]';
    }
}

function syncEventTypeVisibility() {
    const eventTypeGroup = document.getElementById('eventTypeGroup');
    const eventTypeInput = document.getElementById('eventType');
    const categorySelect = document.getElementById('clothCategory');
    if (!eventTypeGroup || !eventTypeInput || !categorySelect) return;

    const isProductOrder = !!form.dataset.postId;
    const isOtherCategory = String(categorySelect.value || '').toLowerCase() === 'other';
    const shouldShow = !isProductOrder && isOtherCategory;

    eventTypeGroup.style.display = shouldShow ? '' : 'none';
    eventTypeInput.required = shouldShow;

    if (!shouldShow) {
        eventTypeInput.value = '';
    }
}

let countryPhoneData = [
    { name: 'Ethiopia', code: '+251' },
    { name: 'Kenya', code: '+254' },
    { name: 'Uganda', code: '+256' },
    { name: 'Tanzania', code: '+255' },
    { name: 'United Arab Emirates', code: '+971' },
    { name: 'United Kingdom', code: '+44' },
    { name: 'United States', code: '+1' }
];

let globalDeliveryConfig = {
    default_mode: 'ethiopia_only',
    default_country: 'Ethiopia',
    default_country_code: '+251',
    allow_all_country_codes: true
};

let activeDeliveryScope = 'ethiopia_only';
let activeDeliveryCountries = ['Ethiopia'];

function findCountryData(countryName) {
    const normalized = String(countryName || '').trim().toLowerCase();
    return countryPhoneData.find((c) => String(c.name || '').toLowerCase() === normalized) || null;
}

function getDialCodeForCountry(countryName) {
    const found = findCountryData(countryName);
    return found ? found.code : (globalDeliveryConfig.default_country_code || '+251');
}

function upsertCountryOptions(countryList, preferredCountry) {
    const countryEl = document.getElementById('country');
    if (!countryEl) return;

    const list = Array.isArray(countryList) && countryList.length
        ? countryList
        : countryPhoneData.map((c) => c.name);

    const unique = Array.from(new Set(list.map((v) => String(v || '').trim()).filter(Boolean)));
    countryEl.innerHTML = unique.map((country) => `<option value="${escapeHtml(country)}">${escapeHtml(country)}</option>`).join('');

    const desired = String(preferredCountry || globalDeliveryConfig.default_country || 'Ethiopia').trim();
    const hasDesired = unique.some((c) => c.toLowerCase() === desired.toLowerCase());
    countryEl.value = hasDesired ? unique.find((c) => c.toLowerCase() === desired.toLowerCase()) : unique[0];
}

function setCountryLockState(isLocked) {
    const countryEl = document.getElementById('country');
    if (!countryEl) return;
    countryEl.disabled = !!isLocked;
    countryEl.style.opacity = isLocked ? '0.75' : '1';
    countryEl.style.cursor = isLocked ? 'not-allowed' : 'pointer';
}

function syncPhoneCodeWithCountry() {
    const countryEl = document.getElementById('country');
    const phoneEl = document.getElementById('phone');
    if (!countryEl || !phoneEl) return;

    const code = getDialCodeForCountry(countryEl.value || globalDeliveryConfig.default_country);
    const raw = String(phoneEl.value || '').trim();
    if (!raw) {
        phoneEl.value = `${code} `;
        return;
    }
    const withoutCode = raw.replace(/^\+[1-9]\d{0,3}[\s\-]?/, '').trim();
    phoneEl.value = `${code} ${withoutCode}`.trim();
}

function syncRegionCustomVisibility() {
    const regionEl = document.getElementById('region');
    const groupEl = document.getElementById('regionCustomGroup');
    const inputEl = document.getElementById('regionCustom');
    if (!regionEl || !groupEl || !inputEl) return;
    const isOther = String(regionEl.value || '').toLowerCase() === 'other';
    groupEl.style.display = isOther ? '' : 'none';
    inputEl.required = isOther;
    if (!isOther) inputEl.value = '';
}

function applyDeliveryScope(scope, countries) {
    const normalizedScope = ['ethiopia_only', 'selected_countries', 'all_countries'].includes(String(scope || '').trim())
        ? String(scope || '').trim()
        : 'ethiopia_only';
    activeDeliveryScope = normalizedScope;
    activeDeliveryCountries = Array.isArray(countries) ? countries.filter(Boolean) : [];

    if (normalizedScope === 'ethiopia_only') {
        upsertCountryOptions(['Ethiopia'], 'Ethiopia');
        setCountryLockState(true);
    } else if (normalizedScope === 'selected_countries') {
        upsertCountryOptions(activeDeliveryCountries, activeDeliveryCountries[0] || globalDeliveryConfig.default_country);
        setCountryLockState(false);
    } else {
        upsertCountryOptions(countryPhoneData.map((c) => c.name), globalDeliveryConfig.default_country);
        setCountryLockState(false);
    }

    form.dataset.deliveryScope = normalizedScope;
    form.dataset.deliveryCountries = activeDeliveryCountries.join('\n');
    syncPhoneCodeWithCountry();
}

async function initShippingAddressUI() {
    const regionEl = document.getElementById('region');
    const countryEl = document.getElementById('country');
    if (regionEl) {
        regionEl.addEventListener('change', syncRegionCustomVisibility);
        syncRegionCustomVisibility();
    }
    if (countryEl) {
        countryEl.addEventListener('change', syncPhoneCodeWithCountry);
    }

    try {
        if (window.YeshiCountryData && typeof window.YeshiCountryData.getCountries === 'function') {
            const remoteCountries = await window.YeshiCountryData.getCountries();
            if (Array.isArray(remoteCountries) && remoteCountries.length) {
                countryPhoneData = remoteCountries;
            }
        }

        const res = await fetch('/api/settings/delivery');
        const data = await res.json();
        if (res.ok && data && data.delivery) {
            globalDeliveryConfig = {
                default_mode: String(data.delivery.default_mode || 'ethiopia_only') === 'all_countries' ? 'all_countries' : 'ethiopia_only',
                default_country: String(data.delivery.default_country || 'Ethiopia').trim() || 'Ethiopia',
                default_country_code: String(data.delivery.default_country_code || '+251').trim() || '+251',
                allow_all_country_codes: data.delivery.allow_all_country_codes !== false
            };
        }
    } catch (_) {
        // keep defaults
    }

    applyDeliveryScope(globalDeliveryConfig.default_mode, []);
}

function updatePaymentDetailsVisibility() {
    const paymentMethod = String(document.getElementById('paymentMethod')?.value || '').trim();
    const chapaDetails = document.getElementById('chapaDetails');
    const bankTransferDetails = document.getElementById('bankTransferDetails');
    const telebirrDetails = document.getElementById('telebirrDetails');
    const telebirrApiDetails = document.getElementById('telebirrApiDetails');
    const chapaPaymentGroup = document.getElementById('chapaPaymentGroup');
    const manualPaymentGroup = document.getElementById('manualPaymentGroup');
    const paymentScreenshotGroup = document.getElementById('paymentScreenshotGroup');
    const submitBtn = document.getElementById('orderPrimaryBtn');

    // Show/hide Chapa details
    if (chapaDetails) {
        chapaDetails.style.display = paymentMethod === 'chapa' ? 'block' : 'none';
    }
    if (chapaPaymentGroup) {
        chapaPaymentGroup.style.display = paymentMethod === 'chapa' ? 'block' : 'none';
    }

    // Show/hide manual payment groups
    if (manualPaymentGroup) {
        manualPaymentGroup.style.display = paymentMethod !== 'chapa' && paymentMethod !== 'telebirr_api' ? 'block' : 'none';
    }

    if (bankTransferDetails) {
        bankTransferDetails.style.display = paymentMethod === 'bank_transfer' ? 'block' : 'none';
    }
    if (telebirrDetails) {
        telebirrDetails.style.display = paymentMethod === 'telebirr' ? 'block' : 'none';
    }
    if (telebirrApiDetails) {
        telebirrApiDetails.style.display = paymentMethod === 'telebirr_api' ? 'block' : 'none';
    }
    if (paymentScreenshotGroup) {
        paymentScreenshotGroup.style.display = paymentMethod === 'telebirr_api' ? 'none' : (paymentMethod === 'chapa' ? 'none' : 'block');
    }
    
    // Default text
    if (submitBtn) {
        submitBtn.textContent = 'Place Order';
    }

    updateProductPaymentDetailsSummary();
}

function getOrderUnitPricing() {
    const unitPrice = Number(form?.dataset?.postPriceEtb || 0);
    const freeShipping = String(form?.dataset?.postFreeShipping || '').toLowerCase() === 'true';
    const unitShipping = freeShipping ? 0 : Number(form?.dataset?.postShippingPriceEtb || 0);
    return {
        unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
        unitShipping: Number.isFinite(unitShipping) ? unitShipping : 0,
        freeShipping
    };
}

function computeQuantityTotal(unitPrice, unitShipping, quantity) {
    const qty = Math.max(1, Math.floor(Number(quantity) || 1));
    const price = Number.isFinite(Number(unitPrice)) ? Number(unitPrice) : 0;
    const shipping = Number.isFinite(Number(unitShipping)) ? Number(unitShipping) : 0;
    return (price + shipping) * qty;
}

function getOrderPaymentComment(order) {
    const paymentInfo = order && order.payment_info && typeof order.payment_info === 'object'
        ? order.payment_info
        : {};

    return String(paymentInfo.comment || order?.payment_comment || '').trim();
}

function updateProductPaymentDetailsSummary() {
    const box = document.getElementById('productPriceSummary');
    const paymentMethod = String(document.getElementById('paymentMethod')?.value || '').trim();
    const submitBtn = document.getElementById('orderPrimaryBtn');

    if (!box) return;
    if (!form?.dataset?.postId) {
        box.style.display = 'none';
        if (submitBtn && paymentMethod === 'telebirr_api') {
            submitBtn.textContent = `Pay Now with Telebirr`;
        }
        return;
    }

    const qty = Math.max(1, currentProductQuantity);
    const { unitPrice, unitShipping, freeShipping } = getOrderUnitPricing();
    const total = computeQuantityTotal(unitPrice, unitShipping, qty);

    if (submitBtn && paymentMethod === 'telebirr_api') {
        const displayTotal = total > 0 ? total.toLocaleString() + ' ETB' : '';
        submitBtn.textContent = displayTotal ? `Pay ${displayTotal} via Telebirr` : 'Pay Now with Telebirr';
    } else if (submitBtn) {
        submitBtn.textContent = 'Place Order';
    }

    box.style.display = '';
    box.innerHTML = `
        <div><strong>Product Price (per 1):</strong> ${unitPrice > 0 ? unitPrice.toLocaleString() + ' ETB' : 'Price on request'}</div>
        <div><strong>Shipping Price (per 1):</strong> ${freeShipping ? 'Free shipping' : unitShipping.toLocaleString() + ' ETB'}</div>
        <div><strong>Product Quantity:</strong> ${qty}</div>
        <div style="margin-top:4px; font-weight:800; color:#0f2f21;"><strong>Total Price:</strong> (${unitPrice.toLocaleString()} + ${unitShipping.toLocaleString()}) × ${qty} = ${total.toLocaleString()} ETB</div>
    `;
}

function initPaymentMethodUI() {
    const paymentMethodInput = document.getElementById('paymentMethod');
    if (!paymentMethodInput) return;
    paymentMethodInput.addEventListener('change', updatePaymentDetailsVisibility);
    
    // Add Chapa payment button handler
    const proceedChapaBtn = document.getElementById('proceedChapaPaymentBtn');
    if (proceedChapaBtn) {
        proceedChapaBtn.addEventListener('click', handleChapaPayment);
    }
    
    updatePaymentDetailsVisibility();
}

async function handleChapaPayment(e) {
    e.preventDefault();
    
    try {
        // Get form data
        const formData = new FormData(form);
        const fullName = formData.get('fullName');
        const phone = formData.get('phone');
        const quantity = parseInt(formData.get('productQuantity') || 1);
        
        // Calculate total
        const unitPrice = Number(form?.dataset?.postPriceEtb || 0);
        const freeShipping = String(form?.dataset?.postFreeShipping || '').toLowerCase() === 'true';
        const unitShipping = freeShipping ? 0 : Number(form?.dataset?.postShippingPriceEtb || 0);
        const subtotal = unitPrice * quantity;
        const shipping = unitShipping * quantity;
        const total = subtotal + shipping;
        
        if (total <= 0) {
            alert('Invalid order amount');
            return;
        }
        
        // Get user email from localStorage or profile
        let customerEmail = localStorage.getItem('yeshi_firebase_email') || localStorage.getItem('email') || '';
        if (!customerEmail) {
            try {
                const userStr = localStorage.getItem('user');
                const user = userStr ? JSON.parse(userStr) : {};
                customerEmail = user.email || '';
            } catch (_) {}
        }
        
        if (!customerEmail) {
            alert('Email not found. Please check your profile.');
            return;
        }
        
        // Prepare checkout data
        const checkoutData = {
            total: total,
            subtotal: subtotal,
            shipping: shipping,
            items: [{
                name: form.dataset.postTitle || 'Product',
                price: unitPrice,
                quantity: quantity
            }],
            customer_name: fullName,
            customer_email: customerEmail,
            customer_phone: phone,
            order_id: form.dataset.postId,
            description: `Ordering: ${form.dataset.postTitle || 'Product'}`
        };
        
        // Save to localStorage for checkout page
        localStorage.setItem('checkout_order', JSON.stringify(checkoutData));
        
        // Redirect to checkout page
        window.location.href = '/user/payment-checkout.html';
        
    } catch (error) {
        console.error('Chapa payment error:', error);
        alert('Failed to initiate payment. Please try again.');
    }
}

function getSavedProfileShipping() {
    try {
        const raw = localStorage.getItem('yeshi_profile_shipping');
        const parsed = raw ? JSON.parse(raw) : null;
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
        return {};
    }
}

function prefillOrderFromSavedProfile() {
    const saved = getSavedProfileShipping();
    if (!saved || typeof saved !== 'object') return;

    const map = [
        ['fullName', 'fullName'],
        ['fatherName', 'fatherName'],
        ['phone', 'phone'],
        ['country', 'country'],
        ['region', 'region'],
        ['regionCustom', 'regionCustom'],
        ['city', 'city'],
        ['zipCode', 'zipCode'],
        ['address', 'address']
    ];

    map.forEach(([id, key]) => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.value && String(el.value).trim()) return;
        if (saved[key]) el.value = saved[key];
    });

    syncRegionCustomVisibility();
}

let currentOrderStep = 1;
let currentProductQuantity = 1;
let currentNormalMeasurementMode = 'same';
let savedShippingAddresses = [];
let savedMeasurementProfiles = [];
let useSavedShipping = true;
let useSavedMeasurements = true;
let deviceLocationSnapshotPromise = null;

async function getDeviceLocationSnapshot() {
    if (deviceLocationSnapshotPromise) {
        return deviceLocationSnapshotPromise;
    }

    deviceLocationSnapshotPromise = (async () => {
        const base = {
            source: 'browser_geolocation',
            status: 'unavailable',
            latitude: null,
            longitude: null,
            accuracy: null,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
            language: navigator.language || '',
            capturedAt: new Date().toISOString()
        };

        if (!navigator.geolocation || typeof navigator.geolocation.getCurrentPosition !== 'function') {
            return base;
        }

        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: false,
                    timeout: 7000,
                    maximumAge: 300000
                });
            });

            return {
                ...base,
                status: 'captured',
                latitude: Number(position.coords.latitude),
                longitude: Number(position.coords.longitude),
                accuracy: Number(position.coords.accuracy),
                capturedAt: new Date().toISOString()
            };
        } catch (error) {
            const code = Number(error && error.code);
            return {
                ...base,
                status: code === 1 ? 'denied' : (code === 3 ? 'timeout' : 'unavailable')
            };
        }
    })();

    return deviceLocationSnapshotPromise;
}

const MEASUREMENT_TEMPLATE_DEFS = {
    general: {
        key: 'general',
        label: 'Measurements',
        fields: [
            { key: 'height', label: 'Height' },
            { key: 'shoulder', label: 'Shoulder' },
            { key: 'chest', label: 'Chest' },
            { key: 'waist', label: 'Waist' },
            { key: 'hip', label: 'Hip' },
            { key: 'length', label: 'Length' },
            { key: 'sleeve', label: 'Sleeve' }
        ],
        savedProfileMap: {
            height: 'length',
            shoulder: 'shoulder',
            chest: 'chest',
            waist: 'waist',
            hip: 'hip',
            length: 'length',
            sleeve: 'sleeve_length'
        }
    },
    general_woman: {
        key: 'general_woman',
        label: 'Woman Measurement',
        fields: [
            { key: 'height', label: 'Height' },
            { key: 'shoulder', label: 'Shoulder' },
            { key: 'chest', label: 'Chest' },
            { key: 'waist', label: 'Waist' },
            { key: 'hip', label: 'Hip' },
            { key: 'length', label: 'Length' },
            { key: 'sleeve', label: 'Sleeve' }
        ],
        savedProfileMap: {
            height: 'length',
            shoulder: 'shoulder',
            chest: 'chest',
            waist: 'waist',
            hip: 'hip',
            length: 'length',
            sleeve: 'sleeve_length'
        }
    },
    general_man: {
        key: 'general_man',
        label: 'Man Measurement',
        fields: [
            { key: 'height', label: 'Height' },
            { key: 'shoulder', label: 'Shoulder' },
            { key: 'chest', label: 'Chest' },
            { key: 'waist', label: 'Waist' },
            { key: 'hip', label: 'Hip' },
            { key: 'length', label: 'Length' },
            { key: 'sleeve', label: 'Sleeve' }
        ],
        savedProfileMap: {
            height: 'length',
            shoulder: 'shoulder',
            chest: 'chest',
            waist: 'waist',
            hip: 'hip',
            length: 'length',
            sleeve: 'sleeve_length'
        }
    },
    women: {
        key: 'women',
        label: "Women's Measurements | የሴቶች ልብስ ልኬቶች",
        fields: [
            { key: 'shoulder', label: 'Shoulder', amharicLabel: 'ትክሻ' },
            { key: 'bust', label: 'Bust', amharicLabel: 'ደረት' },
            { key: 'waist', label: 'Waist', amharicLabel: 'ወገብ' },
            { key: 'sleeve', label: 'Sleeve', amharicLabel: 'እጅጌ' },
            { key: 'waist_height', label: 'Waist Height', amharicLabel: 'ወገብ ቁመት' },
            { key: 'length_below_waist', label: 'Length (Below Waist)', amharicLabel: 'ከወገብ በታች ቁመት' }
        ],
        savedProfileMap: {
            shoulder: 'shoulder',
            bust: 'chest',
            waist: 'waist',
            sleeve: 'sleeve_length',
            waist_height: 'length',
            length_below_waist: 'length'
        }
    },
    men_tshirt: {
        key: 'men_tshirt',
        label: "Men's T-Shirt | የወንዶች ቲሸርት",
        fields: [
            { key: 'shoulder', label: 'Shoulder', amharicLabel: 'ትክሻ' },
            { key: 'chest', label: 'Chest', amharicLabel: 'ደረት' },
            { key: 'stomach', label: 'Stomach / Belly', amharicLabel: 'ቦርጭ' },
            { key: 'tshirt_length', label: 'T-shirt Length', amharicLabel: 'ቲሸርት ቁመት' }
        ],
        savedProfileMap: {
            shoulder: 'shoulder',
            chest: 'chest',
            stomach: 'waist',
            tshirt_length: 'length'
        }
    },
    men_trousers: {
        key: 'men_trousers',
        label: "Men's Trousers | የወንዶች ሱሪ",
        fields: [
            { key: 'waist', label: 'Waist', amharicLabel: 'ወገብ' },
            { key: 'hips', label: 'Hips', amharicLabel: 'ዳሌ' },
            { key: 'thigh', label: 'Thigh', amharicLabel: 'ጭን' },
            { key: 'ankle', label: 'Ankle / Heel', amharicLabel: 'ተረከዝ' },
            { key: 'length', label: 'Length', amharicLabel: 'ቁመት' }
        ],
        savedProfileMap: {
            waist: 'waist',
            hips: 'hip',
            thigh: 'hip',
            ankle: 'length',
            length: 'length'
        }
    }
};

function normalizeStoredList(value) {
    return Array.isArray(value) ? value : [];
}

function getDefaultShippingAddress() {
    const list = normalizeStoredList(savedShippingAddresses);
    return list.find((a) => a && a.is_default) || list[0] || null;
}

function getDefaultMeasurementProfile() {
    const list = normalizeStoredList(savedMeasurementProfiles);
    return list.find((m) => m && m.is_default) || list[0] || null;
}

function fillAddressFormFromSaved(item) {
    if (!item) return;
    const fullNameEl = document.getElementById('fullName');
    const phoneEl = document.getElementById('phone');
    const countryEl = document.getElementById('country');
    const regionEl = document.getElementById('region');
    const regionCustomEl = document.getElementById('regionCustom');
    const cityEl = document.getElementById('city');
    const zipEl = document.getElementById('zipCode');

    if (fullNameEl) fullNameEl.value = String(item.full_name || item.fullName || '').trim();
    if (phoneEl) phoneEl.value = String(item.phone || '').trim();
    if (countryEl) {
        countryEl.value = String(item.country || 'Ethiopia').trim() || 'Ethiopia';
        syncPhoneCodeWithCountry();
    }
    if (regionEl) {
        const regionValue = String(item.region || '').trim();
        regionEl.value = regionValue || regionEl.value;
    }
    if (regionCustomEl) regionCustomEl.value = String(item.region_custom || item.regionCustom || '').trim();
    if (cityEl) cityEl.value = String(item.city || '').trim();
    if (zipEl) zipEl.value = String(item.zip_code || item.zipCode || '').trim();
    syncRegionCustomVisibility();
}

function getSelectedSavedAddress() {
    const list = normalizeStoredList(savedShippingAddresses);
    if (!list.length) return null;
    const selectedId = String(document.getElementById('savedAddressSelect')?.value || '');
    return list.find((row) => String(row.id || row._id || '') === selectedId) || getDefaultShippingAddress();
}

function getSelectedSavedMeasurementProfile() {
    const list = normalizeStoredList(savedMeasurementProfiles);
    if (!list.length) return null;
    const selectedId = String(document.getElementById('savedMeasurementSelect')?.value || '');
    return list.find((row) => String(row.id || row._id || '') === selectedId) || getDefaultMeasurementProfile();
}

function setGroupFieldsDisabled(rootEl, disabled) {
    if (!rootEl) return;
    Array.from(rootEl.querySelectorAll('input, select, textarea')).forEach((el) => {
        el.disabled = !!disabled;
    });
}

function renderSavedAddressPreview(item) {
    const previewEl = document.getElementById('savedAddressPreview');
    if (!previewEl) return;
    if (!item) {
        previewEl.style.display = 'none';
        previewEl.innerHTML = '';
        return;
    }

    const country = String(item.country || 'Ethiopia').trim() || 'Ethiopia';
    const region = String(item.region || '').trim();
    const regionCustom = String(item.region_custom || item.regionCustom || '').trim();
    const city = String(item.city || '').trim();
    const zip = String(item.zip_code || item.zipCode || '').trim();
    const effectiveRegion = String(region).toLowerCase() === 'other' ? regionCustom : region;
    const addressLine = [effectiveRegion, city, zip ? `ZIP ${zip}` : '', country].filter(Boolean).join(', ');

    previewEl.style.display = '';
    previewEl.innerHTML = `
        <div style="border:1px solid rgba(0,0,0,0.1); border-radius:10px; padding:10px; background:#fff8e8;">
            <div style="font-weight:800; color:#1a1c1c; margin-bottom:6px;">Selected Shipping Address</div>
            <div><strong>Full Name:</strong> ${escapeHtml(String(item.full_name || item.fullName || '—'))}</div>
            <div><strong>Phone:</strong> ${escapeHtml(String(item.phone || '—'))}</div>
            <div><strong>Address:</strong> ${escapeHtml(addressLine || '—')}</div>
        </div>
    `;
}

function isValidSavedMeasurementProfile(profile) {
    return !!profile;
}

function renderSavedMeasurementPreview(profile) {
    const previewEl = document.getElementById('savedMeasurementPreview');
    if (!previewEl) return;
    if (!profile) {
        previewEl.style.display = 'none';
        previewEl.innerHTML = '';
        return;
    }

    const templateKeys = getActiveMeasurementTemplateKeys(document.getElementById('clothCategory')?.value || '');
    const fieldsHtml = templateKeys.map((templateKey) => {
        const template = getMeasurementTemplateDefinition(templateKey);
        const sectionFields = (Array.isArray(template.fields) ? template.fields : []).map((field) => {
            const sourceKey = template.savedProfileMap && template.savedProfileMap[field.key] ? template.savedProfileMap[field.key] : field.key;
            const value = readMeasurementNumber(profile[sourceKey] || 0);
            return `<div style="font-size:0.9rem;"><span style="color:#6b665d;">${escapeHtml(field.label)}:</span> ${escapeHtml(value > 0 ? String(value) : '—')}</div>`;
        }).join('');
        return `
            <div style="margin-top:8px;">
                <div style="font-weight:700; color:#2d2410; margin-bottom:4px;">${escapeHtml(template.label)}</div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px 10px;">${sectionFields}</div>
            </div>
        `;
    }).join('');

    previewEl.style.display = '';
    previewEl.innerHTML = `
        <div style="border:1px solid rgba(0,0,0,0.1); border-radius:10px; padding:10px; background:#fff8e8;">
            <div style="font-weight:800; color:#1a1c1c; margin-bottom:6px;">Selected Measurement Profile</div>
            <div><strong>Person Name:</strong> ${escapeHtml(String(profile.profile_name || '—'))}</div>
            ${fieldsHtml}
        </div>
    `;
}

function getMeasurementBlocks(category, quantity, normalMode) {
    const qty = Math.max(1, quantity);
    const blocks = [];

    const templateKeys = getActiveMeasurementTemplateKeys(category);
    if (qty > 1 && normalMode === 'different') {
        for (let i = 1; i <= qty; i += 1) {
            templateKeys.forEach((templateKey) => {
                const template = getMeasurementTemplateDefinition(templateKey);
                blocks.push({
                    productIndex: i,
                    templateKey,
                    label: template.label,
                    key: `p${i}-${templateKey}`,
                    measurementFields: template.fields,
                    savedProfileMap: template.savedProfileMap || {}
                });
            });
        }
    } else {
        templateKeys.forEach((templateKey) => {
            const template = getMeasurementTemplateDefinition(templateKey);
            blocks.push({
                productIndex: 1,
                templateKey,
                label: qty > 1 ? `${template.label} (Applied to All Products)` : template.label,
                key: `all-${templateKey}`,
                measurementFields: template.fields,
                savedProfileMap: template.savedProfileMap || {}
            });
        });
    }

    return blocks;
}

function buildMeasurementEntriesFromSavedProfile(profile, category, quantity) {
    if (!profile) return [];
    const normalMode = getActiveNormalMeasurementMode();
    const blocks = getMeasurementBlocks(category, quantity, normalMode);
    const personName = String(profile.profile_name || '').trim();

    return blocks.map((block) => ({
        key: block.key,
        productIndex: block.productIndex,
        templateKey: block.templateKey,
        label: block.label,
        personName,
        measurementFields: block.measurementFields,
        measurementDetails: block.measurementFields.reduce((acc, field) => {
            const sourceKey = block.savedProfileMap && block.savedProfileMap[field.key] ? block.savedProfileMap[field.key] : field.key;
            acc[field.key] = sanitizeMeasurementValue(profile[sourceKey] || '');
            return acc;
        }, {}),
        notes: ''
    }));
}

function fillMeasurementBlocksFromProfile(profile) {
    if (!profile) return;
    const entries = Array.from(document.querySelectorAll('.measurement-entry'));
    entries.forEach((entry) => {
        const personEl = entry.querySelector('[data-measure-person]');
        if (personEl) personEl.value = String(profile.profile_name || 'Saved profile').trim();
        const template = getMeasurementTemplateDefinition(entry.getAttribute('data-template-key'));
        (Array.isArray(template.fields) ? template.fields : []).forEach((fieldDef) => {
            const sourceKey = template.savedProfileMap && template.savedProfileMap[fieldDef.key] ? template.savedProfileMap[fieldDef.key] : fieldDef.key;
            const field = entry.querySelector(`[data-measure-field="${fieldDef.key}"]`);
            const sanitized = sanitizeMeasurementValue(profile[sourceKey] || '');
            if (field && sanitized) {
                field.value = sanitized;
            }
        });
    });
}

function setProductQuantity(nextQty) {
    const qty = Math.max(1, Math.floor(Number(nextQty) || 1));
    currentProductQuantity = qty;
    const valueEl = document.getElementById('productQuantityValue');
    if (valueEl) valueEl.value = String(qty);
    renderMeasurementBlocks();
    updateProductPaymentDetailsSummary();
}

function initProductQuantityControls() {
    const minusBtn = document.getElementById('qtyMinusBtn');
    const plusBtn = document.getElementById('qtyPlusBtn');
    const qtyInput = document.getElementById('productQuantityValue');
    if (minusBtn) {
        minusBtn.addEventListener('click', () => setProductQuantity(currentProductQuantity - 1));
    }
    if (plusBtn) {
        plusBtn.addEventListener('click', () => setProductQuantity(currentProductQuantity + 1));
    }
    if (qtyInput) {
        qtyInput.addEventListener('input', () => {
            const raw = String(qtyInput.value || '').trim();
            if (!raw) return;
            setProductQuantity(raw);
        });
        qtyInput.addEventListener('blur', () => {
            setProductQuantity(qtyInput.value || 1);
        });
    }

    document.querySelectorAll('input[name="normalMeasurementMode"]').forEach((radio) => {
        radio.addEventListener('change', () => {
            currentNormalMeasurementMode = radio.value === 'different' ? 'different' : 'same';
            renderMeasurementBlocks();
        });
    });

    setProductQuantity(1);
}

async function loadSavedProfileSettings() {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const res = await fetch('/api/auth/me', {
            headers: { 'x-auth-token': token }
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.user) {
            const user = data.user;
            savedShippingAddresses = normalizeStoredList(user.shipping_addresses);
            savedMeasurementProfiles = normalizeStoredList(user.measurement_profiles);
            localStorage.setItem('yeshi_saved_shipping_addresses', JSON.stringify(savedShippingAddresses));
            localStorage.setItem('yeshi_saved_measurements', JSON.stringify(savedMeasurementProfiles));
            return;
        }
    } catch (_) {
        // fallback below
    }

    savedShippingAddresses = normalizeStoredList(safeJson(localStorage.getItem('yeshi_saved_shipping_addresses')));
    savedMeasurementProfiles = normalizeStoredList(safeJson(localStorage.getItem('yeshi_saved_measurements')));
}

function safeJson(raw) {
    try {
        return raw ? JSON.parse(raw) : null;
    } catch (_) {
        return null;
    }
}

function bindSavedSettingsChoices() {
    const shippingSavedRadio = document.getElementById('shippingSourceSaved');
    const shippingNewRadio = document.getElementById('shippingSourceNew');
    const savedAddressGroup = document.getElementById('savedAddressGroup');
    const savedAddressPreview = document.getElementById('savedAddressPreview');
    const shippingManualGroup = document.getElementById('shippingManualGroup');
    const savedAddressSelect = document.getElementById('savedAddressSelect');
    const measureSavedRadio = document.getElementById('measurementSourceSaved');
    const measureNewRadio = document.getElementById('measurementSourceNew');
    const savedMeasurementGroup = document.getElementById('savedMeasurementGroup');
    const savedMeasurementPreview = document.getElementById('savedMeasurementPreview');
    const customMeasurementGroup = document.getElementById('customMeasurementGroup');
    const savedMeasurementSelect = document.getElementById('savedMeasurementSelect');

    if (savedAddressSelect) {
        const list = normalizeStoredList(savedShippingAddresses);
        if (list.length) {
            savedAddressSelect.innerHTML = list.map((item, idx) => {
                const id = String(item.id || item._id || `saved-${idx}`);
                const label = item.label || item.full_name || `Address ${idx + 1}`;
                return `<option value="${escapeHtml(id)}">${escapeHtml(label)}${item.is_default ? ' (Default)' : ''}</option>`;
            }).join('');

            const defaultRow = getDefaultShippingAddress();
            const defaultId = defaultRow ? String(defaultRow.id || defaultRow._id || '') : '';
            if (defaultId) savedAddressSelect.value = defaultId;
            fillAddressFormFromSaved(defaultRow || list[0]);
        } else {
            savedAddressSelect.innerHTML = '<option value="">No saved address</option>';
            useSavedShipping = false;
            if (shippingNewRadio) shippingNewRadio.checked = true;
        }
    }

    if (savedMeasurementSelect) {
        const list = normalizeStoredList(savedMeasurementProfiles);
        if (list.length) {
            savedMeasurementSelect.innerHTML = list.map((item, idx) => {
                const id = String(item.id || item._id || `measure-${idx}`);
                const label = item.profile_name || `Profile ${idx + 1}`;
                return `<option value="${escapeHtml(id)}">${escapeHtml(label)}${item.is_default ? ' (Default)' : ''}</option>`;
            }).join('');

            const defaultRow = getDefaultMeasurementProfile();
            const defaultId = defaultRow ? String(defaultRow.id || defaultRow._id || '') : '';
            if (defaultId) savedMeasurementSelect.value = defaultId;
            fillMeasurementBlocksFromProfile(defaultRow || list[0]);
        } else {
            savedMeasurementSelect.innerHTML = '<option value="">No saved measurements</option>';
            useSavedMeasurements = false;
            if (measureNewRadio) measureNewRadio.checked = true;
        }
    }

    function syncShippingSource() {
        useSavedShipping = !!(shippingSavedRadio && shippingSavedRadio.checked && savedShippingAddresses.length);
        if (savedAddressGroup) savedAddressGroup.style.display = useSavedShipping ? '' : 'none';
        if (savedAddressPreview) savedAddressPreview.style.display = useSavedShipping ? '' : 'none';
        if (shippingManualGroup) shippingManualGroup.style.display = useSavedShipping ? 'none' : '';
        setGroupFieldsDisabled(shippingManualGroup, useSavedShipping);
        if (useSavedShipping) {
            const selected = getSelectedSavedAddress();
            fillAddressFormFromSaved(selected);
            renderSavedAddressPreview(selected);
        } else {
            renderSavedAddressPreview(null);
        }
    }

    function syncMeasureSource() {
        useSavedMeasurements = !!(measureSavedRadio && measureSavedRadio.checked && savedMeasurementProfiles.length);
        if (savedMeasurementGroup) savedMeasurementGroup.style.display = useSavedMeasurements ? '' : 'none';
        if (savedMeasurementPreview) savedMeasurementPreview.style.display = useSavedMeasurements ? '' : 'none';
        if (customMeasurementGroup) customMeasurementGroup.style.display = useSavedMeasurements ? 'none' : '';
        setGroupFieldsDisabled(customMeasurementGroup, useSavedMeasurements);
        if (useSavedMeasurements) {
            const selected = getSelectedSavedMeasurementProfile();
            fillMeasurementBlocksFromProfile(selected);
            renderSavedMeasurementPreview(selected);
        } else {
            renderSavedMeasurementPreview(null);
        }
    }

    shippingSavedRadio?.addEventListener('change', syncShippingSource);
    shippingNewRadio?.addEventListener('change', syncShippingSource);
    savedAddressSelect?.addEventListener('change', syncShippingSource);

    measureSavedRadio?.addEventListener('change', syncMeasureSource);
    measureNewRadio?.addEventListener('change', syncMeasureSource);
    savedMeasurementSelect?.addEventListener('change', syncMeasureSource);

    syncShippingSource();
    syncMeasureSource();
}

function bindRefundPolicyModal() {
    const link = document.getElementById('viewRefundPolicyLink');
    const modal = document.getElementById('refundPolicyModal');
    const closeBtn = document.getElementById('closeRefundPolicyBtn');
    if (!link || !modal || !closeBtn) return;

    let lastScrollY = 0;
    const close = () => {
        modal.style.display = 'none';
        document.body.style.overflow = '';
        try {
            window.scrollTo({ top: lastScrollY, behavior: 'auto' });
        } catch (_) {
            // ignore
        }
    };

    link.addEventListener('click', (e) => {
        e.preventDefault();
        lastScrollY = window.scrollY || 0;
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    });

    closeBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });
}

function isCoupleCategory(categoryValue) {
    return String(categoryValue || '').trim().toLowerCase() === 'couple';
}

function getActiveNormalMeasurementMode() {
    const checked = document.querySelector('input[name="normalMeasurementMode"]:checked');
    if (checked) return checked.value === 'different' ? 'different' : 'same';
    return currentNormalMeasurementMode === 'different' ? 'different' : 'same';
}

function getMeasurementFieldDefs(templateKey = 'general') {
    return getMeasurementTemplateDefinition(templateKey).fields;
}

function getMeasurementTemplateDefinition(templateKey) {
    return MEASUREMENT_TEMPLATE_DEFS[String(templateKey || '').trim()] || MEASUREMENT_TEMPLATE_DEFS.general;
}

function getConfiguredMeasurementProfiles() {
    const raw = String(form?.dataset?.measurementProfiles || '').trim();
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed)
            ? parsed.map((row) => String(row || '').trim()).filter((row) => !!MEASUREMENT_TEMPLATE_DEFS[row])
            : [];
    } catch (_) {
        return [];
    }
}

function getSelectedCustomMeasurementProfiles() {
    return Array.from(document.querySelectorAll('[data-custom-measurement-profile]:checked'))
        .map((input) => String(input.value || '').trim())
        .filter((value) => !!MEASUREMENT_TEMPLATE_DEFS[value]);
}

function getActiveMeasurementTemplateKeys(categoryValue) {
    if (!form?.dataset?.postId) {
        const selected = getSelectedCustomMeasurementProfiles();
        if (selected.length) return selected;
    }
    const configured = getConfiguredMeasurementProfiles();
    if (configured.length) return configured;
    return isCoupleCategory(categoryValue) ? ['general_woman', 'general_man'] : ['general'];
}

function sanitizeMeasurementValue(value) {
    const raw = String(value ?? '').trim();
    if (!raw) return '';
    const normalized = raw.replace(/,/g, '.');
    const parsed = Number(normalized);
    if (Number.isFinite(parsed) && parsed > 0) {
        return String(Math.trunc(parsed));
    }
    const matched = normalized.match(/\d+(?:\.\d+)?/);
    if (!matched) return '';
    const fallback = Number(matched[0]);
    return Number.isFinite(fallback) && fallback > 0 ? String(Math.trunc(fallback)) : '';
}

function readMeasurementNumber(value) {
    const sanitized = sanitizeMeasurementValue(value);
    return sanitized ? Number(sanitized) : 0;
}

function initMeasurementInputSanitizer() {
    const container = document.getElementById('measurementBlocksContainer');
    if (!container || container.dataset.integerMeasurementBound === '1') return;

    const syncValue = (field) => {
        if (!field || !field.matches('[data-measure-field]')) return;
        const sanitized = sanitizeMeasurementValue(field.value);
        if (field.value !== sanitized) {
            field.value = sanitized;
        }
    };

    container.addEventListener('input', (event) => {
        syncValue(event.target);
    });
    container.addEventListener('blur', (event) => {
        syncValue(event.target);
    }, true);
    container.dataset.integerMeasurementBound = '1';
}

function collectExistingMeasurementValues() {
    const map = new Map();
    document.querySelectorAll('.measurement-entry').forEach((entry) => {
        const key = String(entry.getAttribute('data-measure-key') || '');
        if (!key) return;
        const personName = String(entry.querySelector('[data-measure-person]')?.value || '');
        const notes = String(entry.querySelector('[data-measure-notes]')?.value || '');
        const measurements = {};
        const template = getMeasurementTemplateDefinition(entry.getAttribute('data-template-key'));
        (Array.isArray(template.fields) ? template.fields : []).forEach((field) => {
            const raw = String(entry.querySelector(`[data-measure-field="${field.key}"]`)?.value || '').trim();
            measurements[field.key] = sanitizeMeasurementValue(raw);
        });
        map.set(key, { personName, measurements, notes });
    });
    return map;
}

function renderMeasurementBlocks() {
    const container = document.getElementById('measurementBlocksContainer');
    const modeGroup = document.getElementById('normalMeasurementModeGroup');
    const category = String(document.getElementById('clothCategory')?.value || '').trim();
    if (!container) return;

    const qty = Math.max(1, currentProductQuantity);
    const saved = collectExistingMeasurementValues();
    const normalMode = getActiveNormalMeasurementMode();

    if (modeGroup) {
        const shouldShowMode = qty > 1;
        modeGroup.classList.toggle('hidden', !shouldShowMode);
    }

    const blocks = getMeasurementBlocks(category, qty, normalMode);

    const html = blocks.map((block) => {
        const old = saved.get(block.key) || { personName: '', measurements: {}, notes: '' };
        const productLabel = qty > 1 && normalMode === 'different'
            ? `<div style="font-size:0.84rem; color:#745B18; font-weight:700; margin-bottom:4px;">Product ${block.productIndex}</div>`
            : '';
        const fieldsHtml = (Array.isArray(block.measurementFields) ? block.measurementFields : []).map((field) => {
            const inputId = `measurement-${block.key}-${field.key}`;
            return `
            <div class="form-group" style="margin-bottom:8px;">
                <label for="${inputId}">${field.label}${field.amharicLabel ? ` | ${field.amharicLabel}` : ''}</label>
                <input type="text" id="${inputId}" name="${inputId}" inputmode="numeric" pattern="[0-9]*" autocomplete="off" class="form-control" data-measure-field="${field.key}" placeholder="cm" value="${escapeHtml(sanitizeMeasurementValue(old.measurements?.[field.key] || ''))}">
            </div>
        `;
        }).join('');
        const personInputId = `measurement-person-${block.key}`;
        const notesInputId = `measurement-notes-${block.key}`;
        return `
            <div class="measurement-entry" data-measure-key="${block.key}" data-product-index="${block.productIndex}" data-template-key="${block.templateKey}" data-label="${block.label}" style="border:1px solid rgba(0,0,0,0.1); border-radius:10px; padding:12px; margin-bottom:10px; background:#fff;">
                ${productLabel}
                <div style="font-weight:800; color:#1a1c1c; margin-bottom:8px;">${block.label}</div>
                <div class="form-group" style="margin-bottom:8px;">
                    <label for="${personInputId}">Person Name (optional)</label>
                    <input type="text" id="${personInputId}" name="${personInputId}" class="form-control" data-measure-person placeholder="Enter person name" value="${escapeHtml(old.personName)}">
                </div>
                ${fieldsHtml}
                <div class="form-group" style="margin-bottom:0;">
                    <label for="${notesInputId}">Measurement notes (optional)</label>
                    <textarea id="${notesInputId}" name="${notesInputId}" class="form-control" rows="4" data-measure-notes placeholder="Add any detailed measurement text here">${escapeHtml(old.notes || '')}</textarea>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
    initMeasurementInputSanitizer();

    if (useSavedMeasurements) {
        const selectedId = String(document.getElementById('savedMeasurementSelect')?.value || '');
        const selected = savedMeasurementProfiles.find((row) => String(row.id || row._id || '') === selectedId) || getDefaultMeasurementProfile();
        fillMeasurementBlocksFromProfile(selected);
    }
}

function collectMeasurementEntries() {
    const entries = [];
    document.querySelectorAll('.measurement-entry').forEach((entry) => {
        const templateKey = String(entry.getAttribute('data-template-key') || 'general');
        const template = getMeasurementTemplateDefinition(templateKey);
        entries.push({
            key: String(entry.getAttribute('data-measure-key') || ''),
            productIndex: Number(entry.getAttribute('data-product-index') || 1),
            templateKey,
            label: String(entry.getAttribute('data-label') || 'Measurement'),
            personName: String(entry.querySelector('[data-measure-person]')?.value || '').trim(),
            measurementFields: Array.isArray(template.fields) ? template.fields : [],
            measurementDetails: (Array.isArray(template.fields) ? template.fields : []).reduce((acc, field) => {
                const raw = String(entry.querySelector(`[data-measure-field="${field.key}"]`)?.value || '').trim();
                acc[field.key] = sanitizeMeasurementValue(raw);
                return acc;
            }, {}),
            notes: String(entry.querySelector('[data-measure-notes]')?.value || '').trim()
        });
    });
    return entries;
}

function validateMeasurementEntries(category, quantity) {
    const invalid = findFirstInvalidMeasurementField();
    if (invalid) {
        return { ok: false, message: invalid.message, field: invalid.field, entries: [] };
    }
    return { ok: true, message: '', entries: collectMeasurementEntries() };
}

function setOrderStep(step) {
    const form = document.getElementById('orderForm');
    const primaryBtn = document.getElementById('orderPrimaryBtn');
    const backBtn = document.getElementById('orderBackBtn');
    if (!form) return;

    currentOrderStep = step === 2 ? 2 : 1;
    const stepSections = Array.from(form.querySelectorAll('[data-order-step]'));
    stepSections.forEach((section) => {
        const secStep = Number(section.getAttribute('data-order-step') || '1');
        const isVisible = secStep === currentOrderStep;
        section.style.display = isVisible ? '' : 'none';

        // Prevent browser validation errors for hidden-step required controls.
        Array.from(section.querySelectorAll('input, select, textarea, button')).forEach((el) => {
            if (el.id === 'orderPrimaryBtn' || el.id === 'orderBackBtn') return;
            if (isVisible) {
                if (el.dataset.stepDisabled === '1') {
                    el.disabled = false;
                    delete el.dataset.stepDisabled;
                }
            } else {
                if (!el.disabled) {
                    el.disabled = true;
                    el.dataset.stepDisabled = '1';
                }
            }
        });
    });

    if (primaryBtn) {
        primaryBtn.textContent = currentOrderStep === 1 ? 'Next' : 'Submit Order';
    }
    if (backBtn) {
        backBtn.style.display = currentOrderStep === 2 ? '' : 'none';
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function focusAndScrollToField(field) {
    if (!field) return;
    const target = field.closest('.form-group, .measurement-entry') || field;
    try {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_) {
        // ignore
    }
    window.setTimeout(() => {
        try {
            field.focus();
        } catch (_) {
            // ignore
        }
    }, 120);
}

function findFirstInvalidMeasurementField() {
    const entries = Array.from(document.querySelectorAll('.measurement-entry'));
    for (const entry of entries) {
        const templateKey = String(entry.getAttribute('data-template-key') || 'general');
        for (const def of getMeasurementFieldDefs(templateKey)) {
            const field = entry.querySelector(`[data-measure-field="${def.key}"]`);
            const raw = String(field?.value || '').trim();
            const num = Number(raw);
            if (!raw || !Number.isFinite(num) || num <= 0) {
                return {
                    field,
                    message: `Please fill valid ${def.label} value in every measurement block.`
                };
            }
        }
    }
    return null;
}

function validateStepOneInputs() {
    const category = document.getElementById('clothCategory');
    const isProductOrder = !!form.dataset.postId;
    if (!category || !String(category.value || '').trim()) {
        alert('Please choose cloth category.');
        focusAndScrollToField(category);
        return false;
    }

    const isOtherCategory = String(category.value || '').toLowerCase() === 'other';
    const eventTypeInput = document.getElementById('eventType');
    if (!isProductOrder && isOtherCategory && (!eventTypeInput || !String(eventTypeInput.value || '').trim())) {
        alert('Please enter Event Type when category is Other.');
        focusAndScrollToField(eventTypeInput);
        return false;
    }

    if (!isProductOrder) {
        const referenceInput = document.getElementById('referenceImages');
        const count = referenceInput && referenceInput.files ? referenceInput.files.length : 0;
        if (count < 1) {
            alert('Please upload at least one reference image before continuing.');
            focusAndScrollToField(referenceInput);
            return false;
        }
        if (count > 3) {
            alert('You can upload up to 3 reference images only.');
            focusAndScrollToField(referenceInput);
            return false;
        }
    }

    return true;
}

function validateStepTwoInputs() {
    const isProductOrder = !!form.dataset.postId;
    const paymentMethodInput = document.getElementById('paymentMethod');
    const selectedAddress = useSavedShipping ? getSelectedSavedAddress() : null;
    const fullName = useSavedShipping
        ? String(selectedAddress?.full_name || selectedAddress?.fullName || '').trim()
        : String(document.getElementById('fullName')?.value || '').trim();
    const phone = useSavedShipping
        ? String(selectedAddress?.phone || '').trim()
        : String(document.getElementById('phone')?.value || '').trim();
    const country = useSavedShipping
        ? String(selectedAddress?.country || '').trim()
        : String(document.getElementById('country')?.value || '').trim();
    const region = useSavedShipping
        ? String(selectedAddress?.region || '').trim()
        : String(document.getElementById('region')?.value || '').trim();
    const regionCustom = useSavedShipping
        ? String(selectedAddress?.region_custom || selectedAddress?.regionCustom || '').trim()
        : String(document.getElementById('regionCustom')?.value || '').trim();
    const city = useSavedShipping
        ? String(selectedAddress?.city || '').trim()
        : String(document.getElementById('city')?.value || '').trim();
    const zipCode = useSavedShipping
        ? String(selectedAddress?.zip_code || selectedAddress?.zipCode || '').trim()
        : String(document.getElementById('zipCode')?.value || '').trim();
    const delivery = String(document.getElementById('delivery')?.value || '').trim();

    if (!fullName) {
        alert(useSavedShipping ? 'Please select a valid saved shipping address with full name.' : 'Please enter full name.');
        focusAndScrollToField(useSavedShipping ? document.getElementById('savedAddressSelect') : document.getElementById('fullName'));
        return false;
    }

    if (!phone || !/^\+[1-9]\d{0,3}[\s\-]?\d{5,14}$/.test(phone)) {
        alert('Please enter a valid phone number with country code (example: +251...).');
        focusAndScrollToField(useSavedShipping ? document.getElementById('savedAddressSelect') : document.getElementById('phone'));
        return false;
    }

    if (!country) {
        alert('Please choose country.');
        focusAndScrollToField(useSavedShipping ? document.getElementById('savedAddressSelect') : document.getElementById('country'));
        return false;
    }

    if (!region) {
        alert('Please choose region.');
        focusAndScrollToField(useSavedShipping ? document.getElementById('savedAddressSelect') : document.getElementById('region'));
        return false;
    }

    if (String(region).toLowerCase() === 'other' && !regionCustom) {
        alert('Please type your region name.');
        focusAndScrollToField(useSavedShipping ? document.getElementById('savedAddressSelect') : document.getElementById('regionCustom'));
        return false;
    }

    if (!city) {
        alert('Please enter city.');
        focusAndScrollToField(useSavedShipping ? document.getElementById('savedAddressSelect') : document.getElementById('city'));
        return false;
    }

    if (!zipCode) {
        alert('Please enter ZIP code.');
        focusAndScrollToField(useSavedShipping ? document.getElementById('savedAddressSelect') : document.getElementById('zipCode'));
        return false;
    }

    const allowedCountries = String(form.dataset.deliveryCountries || '').split(/\n+/).map((v) => String(v || '').trim()).filter(Boolean);
    const scope = String(form.dataset.deliveryScope || globalDeliveryConfig.default_mode || 'ethiopia_only');
    if (scope === 'ethiopia_only' && country.toLowerCase() !== 'ethiopia') {
        alert('This order is currently available for Ethiopia only.');
        focusAndScrollToField(useSavedShipping ? document.getElementById('savedAddressSelect') : document.getElementById('country'));
        return false;
    }
    if (scope === 'selected_countries' && allowedCountries.length && !allowedCountries.some((c) => c.toLowerCase() === country.toLowerCase())) {
        alert('Selected product is not available for the chosen country.');
        focusAndScrollToField(useSavedShipping ? document.getElementById('savedAddressSelect') : document.getElementById('country'));
        return false;
    }

    const addressEl = document.getElementById('address');
    if (addressEl) {
        const regionValue = String(region).toLowerCase() === 'other' ? regionCustom : region;
        addressEl.value = `${regionValue}, ${city}, ZIP ${zipCode}, ${country}`;
    }

    if (!delivery) {
        alert('Please choose a delivery method.');
        return false;
    }

    if (isProductOrder && (!paymentMethodInput || !String(paymentMethodInput.value || '').trim())) {
        alert('Please choose payment method for product order.');
        return false;
    }
    return true;
}

function setupOrderStepFlow() {
    const backBtn = document.getElementById('orderBackBtn');
    const categorySelect = document.getElementById('clothCategory');
    if (backBtn) {
        backBtn.addEventListener('click', () => setOrderStep(1));
    }
    if (categorySelect) {
        categorySelect.addEventListener('change', () => {
            syncEventTypeVisibility();
            renderMeasurementBlocks();
            if (useSavedMeasurements) {
                renderSavedMeasurementPreview(getSelectedSavedMeasurementProfile());
            }
        });
    }
    document.querySelectorAll('[data-custom-measurement-profile]').forEach((input) => {
        input.addEventListener('change', () => {
            renderMeasurementBlocks();
            if (useSavedMeasurements) {
                renderSavedMeasurementPreview(getSelectedSavedMeasurementProfile());
            }
        });
    });
    syncEventTypeVisibility();
    renderMeasurementBlocks();
    setOrderStep(1);
}

function formatPriceEtb(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? `${n.toLocaleString()} ETB` : 'Price on request';
}

function renderSelectedClothPreview(post) {
    const box = document.getElementById('selectedClothPreview');
    if (!box) return;

    const title = post?.title || form?.dataset?.postTitle || 'Selected cloth';
    const image = getImgUrl(Array.isArray(post?.images) && post.images.length ? post.images[0] : '');
    const category = post?.category || '';
    const unitPrice = Number(post?.priceETB);
    const unitShipping = post?.freeShipping ? 0 : Number(post?.shippingPriceETB);
    const qty = Math.max(1, currentProductQuantity);
    const total = computeQuantityTotal(unitPrice, unitShipping, qty);
    const price = formatPriceEtb(unitPrice);
    const shipping = post?.freeShipping
        ? 'Shipping (per 1): Free shipping'
        : (Number.isFinite(unitShipping) ? `Shipping (per 1): ${unitShipping.toLocaleString()} ETB` : '');

    box.classList.remove('hidden');
    box.innerHTML = `
        <div style="display:flex; gap:10px; align-items:flex-start;">
            ${image ? `<img src="${image}" alt="${title}" style="width:86px; height:86px; object-fit:cover; border-radius:10px; border:1px solid rgba(0,0,0,0.1);">` : ''}
            <div style="min-width:0;">
                <div style="font-weight:800; color:#1a1c1c;">${title}</div>
                ${category ? `<div style="margin-top:4px; color:#666;">Category: ${category}</div>` : ''}
                <div style="margin-top:4px; color:#ba1a1a; font-weight:700;">Product Price (per 1): ${price}</div>
                ${shipping ? `<div style="margin-top:2px; color:#745B18; font-weight:700;">${shipping}</div>` : ''}
                <div style="margin-top:2px; color:#0f2f21; font-weight:800;">Total Price: ${Number.isFinite(total) ? total.toLocaleString() + ' ETB' : 'Price on request'}</div>
            </div>
        </div>
    `;
    bindResilientImages(box);
}

async function loadSelectedCloth(postId, fallbackTitle) {
    try {
        const res = await fetch(`/api/posts/${encodeURIComponent(postId)}`);
        if (!res.ok) throw new Error('Post fetch failed');
        const post = await res.json();

        if (post && typeof post === 'object') {
            if (post.title) form.dataset.postTitle = post.title;
            if (Array.isArray(post.images) && post.images.length) {
                form.dataset.postImage = post.images[0];
            }
            if (post.description) form.dataset.postDescription = post.description;
            if (post.priceETB !== undefined) form.dataset.postPriceEtb = String(post.priceETB);
            if (post.shippingPriceETB !== undefined) form.dataset.postShippingPriceEtb = String(post.shippingPriceETB);
            if (post.freeShipping !== undefined) form.dataset.postFreeShipping = String(!!post.freeShipping);
            form.dataset.measurementProfiles = JSON.stringify(Array.isArray(post.measurement_profiles) ? post.measurement_profiles : []);
            form.dataset.postCategories = JSON.stringify(Array.isArray(post.categories) ? post.categories : []);
            if (post.category) {
                const categorySelect = document.getElementById('clothCategory');
                if (categorySelect) {
                    const hasOption = Array.from(categorySelect.options).some((opt) => String(opt.value).toLowerCase() === String(post.category).toLowerCase());
                    if (hasOption) {
                        categorySelect.value = post.category;
                        categorySelect.dataset.lockedCategory = post.category;
                    } else {
                        const dynamicOption = document.createElement('option');
                        dynamicOption.value = post.category;
                        dynamicOption.textContent = post.category;
                        dynamicOption.dataset.dynamicCategoryOption = '1';
                        categorySelect.appendChild(dynamicOption);
                        categorySelect.value = post.category;
                        categorySelect.dataset.lockedCategory = post.category;
                    }
                }
                updateMeasurementFields();
            }

            const deliveryScope = String(post.delivery_scope || '').trim();
            const deliveryCountries = Array.isArray(post.delivery_countries) ? post.delivery_countries : [];
            if (deliveryScope) {
                applyDeliveryScope(deliveryScope, deliveryCountries);
            } else {
                applyDeliveryScope(globalDeliveryConfig.default_mode, []);
            }
        }

        renderSelectedClothPreview(post);
        updateProductPaymentDetailsSummary();
    } catch (_) {
        renderSelectedClothPreview({ title: fallbackTitle || form.dataset.postTitle || 'Selected cloth' });
        updateProductPaymentDetailsSummary();
    }
}

function formatDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function getClothCategoryLabel(cloth) {
    const categories = Array.isArray(cloth?.categories)
        ? cloth.categories.map((row) => String(row || '').trim()).filter(Boolean)
        : [];
    if (categories.length) return categories.join(', ');
    return String(cloth?.category || '').trim();
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

const IMAGE_FALLBACK_DATA_URI = 'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';
const blockedExternalImageHosts = new Set([
    'ethiopiantraditionaldress.com',
    'www.ethiopiantraditionaldress.com'
]);
const failedImagePathCache = new Set();

function normalizeImagePathForCache(urlValue) {
    const raw = String(urlValue || '').trim();
    if (!raw) return '';
    try {
        const parsed = new URL(raw, window.location.origin);
        return (parsed.pathname || '').toLowerCase();
    } catch (_) {
        return raw.split('?')[0].split('#')[0].toLowerCase();
    }
}

function rememberFailedImageUrl(urlValue) {
    const normalized = normalizeImagePathForCache(urlValue);
    if (!normalized) return;
    failedImagePathCache.add(normalized);
}

function isPreviouslyFailedImageUrl(urlValue) {
    const normalized = normalizeImagePathForCache(urlValue);
    return normalized ? failedImagePathCache.has(normalized) : false;
}

function bindResilientImages(root) {
    const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
    scope.querySelectorAll('img').forEach((img) => {
        if (img.dataset.yeshiFallbackBound === '1') return;
        img.dataset.yeshiFallbackBound = '1';
        img.addEventListener('error', () => {
            const failedSrc = String(img.getAttribute('src') || '').trim();
            rememberFailedImageUrl(failedSrc);
            if (img.dataset.yeshiFallbackApplied === '1') return;
            img.dataset.yeshiFallbackApplied = '1';
            img.src = IMAGE_FALLBACK_DATA_URI;
        });
    });
}

function getImgUrl(pathValue) {
    const v = String(pathValue || '').trim();
    if (!v) return '';

    let base = (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/'))
        ? v
        : '/' + v.replace(/^\/+/, '');

    if (isPreviouslyFailedImageUrl(base)) {
        return IMAGE_FALLBACK_DATA_URI;
    }

    try {
        const parsed = new URL(base, window.location.origin);
        if (/^https?:$/i.test(parsed.protocol)) {
            const host = String(parsed.hostname || '').toLowerCase();
            if (blockedExternalImageHosts.has(host)) {
                rememberFailedImageUrl(base);
                return IMAGE_FALLBACK_DATA_URI;
            }
        }
    } catch (_) {
        // ignore parse errors and continue
    }

    try {
        const token = localStorage.getItem('token');
        const isPrivateUpload = base.startsWith('/api/uploads/') || /\/api\/uploads\//i.test(base);
        if (token && isPrivateUpload && !/[?&](token|auth)=/.test(base)) {
            const sep = base.includes('?') ? '&' : '?';
            base += sep + 'token=' + encodeURIComponent(token);
        }
        if (isPrivateUpload && !/[?&]fallback=/.test(base)) {
            const sep = base.includes('?') ? '&' : '?';
            base += sep + 'fallback=1';
        }
    } catch (_) {
        // ignore
    }

    return base;
}

let myOrdersPollId = null;

function initMyOrdersAutoRefresh() {
    if (myOrdersPollId) return;
    myOrdersPollId = window.setInterval(() => {
        loadMyOrders();
    }, 15000);

    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            loadMyOrders();
        }
    });
}

async function loadMyOrders() {
    const container = document.getElementById('myOrdersList');
    if (!container) return;

    const token = localStorage.getItem('token');
    if (!token) {
        container.innerHTML = '<p style="text-align:center; width:100%;">Login to see your orders.</p>';
        return;
    }

    try {
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
            const msg = (payload && payload.msg) ? payload.msg : `Failed to load orders (${res.status})`;
            throw new Error(msg);
        }

        const orders = Array.isArray(payload) ? payload : [];

        if (orders.length === 0) {
            container.innerHTML = '<p style="text-align:center; width:100%;">No orders yet. Place your first order above.</p>';
            return;
        }

        container.innerHTML = orders.map((order) => {
            const customer = order?.customer_info || order?.customerInfo || {};
            const cloth = order?.cloth_details || order?.clothDetails || {};
            const status = order?.order_status || order?.status || 'Received';
            const sewingStatus = order?.sewing_status || 'Pending';
            let paymentStatus = order?.payment_status || order?.payment_info?.status || 'Pending';
            if (String(status).toLowerCase() === 'payment confirmed' && String(paymentStatus).toLowerCase() === 'pending') {
                paymentStatus = 'Confirmed';
            }
            const createdAt = formatDate(order?.created_at || order?.createdAt);

            const title = cloth.post_title || order?.productName || cloth.design_type || getClothCategoryLabel(cloth) || 'Custom Order';
            const design = cloth.design_type ? ` · ${cloth.design_type}` : '';
            const color = cloth.color ? ` · ${cloth.color}` : '';
            const deadline = cloth.deadline_date ? `Deadline: ${formatDate(cloth.deadline_date)}` : '';
            const img = getImgUrl(cloth.post_image || order?.productImage || '');
            const category = getClothCategoryLabel(cloth) || '—';
            const price = Number(cloth.post_price_etb ?? order?.productPrice);
            const shippingPrice = Number(cloth.post_shipping_price_etb ?? order?.shippingPrice);
            const freeShipping = !!cloth.post_free_shipping;
            const paymentScreenshot = getImgUrl(
                order?.payment_info?.screenshot_url
                || order?.payment_screenshot_url
                || ''
            );
            const paymentComment = getOrderPaymentComment(order);
            const payableTotal = Number.isFinite(price)
                ? (Number.isFinite(shippingPrice) ? (price + shippingPrice) * Math.max(1, Number(order?.quantity || 1)) : price * Math.max(1, Number(order?.quantity || 1)))
                : NaN;

            return `
                <div class="product-card" style="padding: 16px;">
                    <div style="display:flex; justify-content:space-between; gap: 10px; align-items:flex-start;">
                        <div>
                            <h3 style="margin-bottom: 6px;">${escapeHtml(title)}${escapeHtml(design)}${escapeHtml(color)}</h3>
                            <p style="margin:0; color: var(--light-text); font-size: 0.9rem;">${createdAt ? `Ordered: ${escapeHtml(createdAt)}` : ''}</p>
                            <p style="margin:6px 0 0; color: var(--light-text); font-size: 0.9rem;"><strong>Quantity:</strong> ${escapeHtml(String(Math.max(1, Number(order?.quantity || 1))))}</p>
                        </div>
                        <div style="text-align:right;">
                            <div style="display:inline-block; padding: 6px 10px; border-radius: 999px; background: rgba(30,75,53,0.08); border: 1px solid rgba(30,75,53,0.18); color: #0f2f21; font-weight: 700; font-size: 0.85rem;">
                                ${escapeHtml(status)}
                            </div>
                            <div style="margin-top: 6px; color: var(--light-text); font-size: 0.85rem;">Payment: ${escapeHtml(paymentStatus)}</div>
                            <div style="margin-top: 2px; color: var(--light-text); font-size: 0.85rem;">Sewing: ${escapeHtml(sewingStatus)}</div>
                        </div>
                    </div>

                    ${(img || category !== '—' || Number.isFinite(price)) ? `
                        <div style="display:flex; gap:10px; align-items:flex-start; margin-top:10px;">
                            ${img ? `<img src="${escapeHtml(img)}" alt="Ordered product" style="width:72px; height:72px; object-fit:cover; border-radius:10px; border:1px solid rgba(0,0,0,0.1);">` : ''}
                            <div style="min-width:0; font-size:0.92rem;">
                                <div style="font-weight:800; color:#1a1c1c;">${escapeHtml(title)}</div>
                                <div style="margin-top:3px; color:#666;">Category: ${escapeHtml(category)}</div>
                                <div style="margin-top:3px; color:#ba1a1a; font-weight:700;">Product Price (per 1): ${Number.isFinite(price) && price > 0 ? `${escapeHtml(price.toLocaleString())} ETB` : 'Price on request'}</div>
                                <div style="margin-top:2px; color:#745B18; font-weight:700;">Shipping (per 1): ${freeShipping ? 'Free shipping' : (Number.isFinite(shippingPrice) && shippingPrice >= 0 ? `${escapeHtml(shippingPrice.toLocaleString())} ETB` : 'Shipping: —')}</div>
                                <div style="margin-top:2px; color:#0f2f21; font-weight:800;">${Number.isFinite(payableTotal) && payableTotal >= 0 ? `Total payable: ${escapeHtml(payableTotal.toLocaleString())} ETB (you should pay total price)` : ''}</div>
                            </div>
                        </div>
                    ` : ''}

                    ${deadline ? `<p style="margin-top: 10px;">${escapeHtml(deadline)}</p>` : ''}

                    ${paymentScreenshot ? `
                        <div style="margin-top:10px; display:flex; gap:10px; align-items:center;">
                            <a href="${escapeHtml(paymentScreenshot)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;">
                                <img src="${escapeHtml(paymentScreenshot)}" alt="Payment screenshot" style="width:72px; height:72px; object-fit:cover; border-radius:10px; border:1px solid rgba(0,0,0,0.1);">
                            </a>
                            <div style="font-size:0.85rem; color:var(--light-text);">
                                <div>Payment proof uploaded</div>
                                ${paymentComment ? `<div style="margin-top:4px; color:#1a1c1c;"><strong>Comment:</strong> ${escapeHtml(paymentComment)}</div>` : ''}
                            </div>
                        </div>
                    ` : ''}

                    <hr style="border:0; border-top: 1px solid rgba(0,0,0,0.08); margin: 12px 0;">
                </div>
            `;
        }).join('');
        bindResilientImages(container);
    } catch (err) {
        console.error(err);
        const msg = (err?.message || '').toLowerCase();
        if (msg.includes('token') || msg.includes('unauthorized') || msg.includes('not authorized')) {
            const next = encodeURIComponent(window.location.pathname + window.location.search);
            window.location.href = `/auth/login?next=${next}`;
            return;
        }
        container.innerHTML = '<p style="text-align:center; width:100%;">Failed to load your orders. Please refresh.</p>';
    }
}

function toggleMeasurementMode() {
    const customGroup = document.getElementById('customMeasurementGroup');
    if (customGroup) customGroup.classList.remove('hidden');
    renderMeasurementBlocks();
}

function updateMeasurementFields() {
    renderMeasurementBlocks();
}

function readNumberField(id) {
    const el = document.getElementById(id);
    if (!el) return undefined;
    const raw = String(el.value || '').trim();
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
}

async function autoSaveProfileSettingsFromOrder(shippingRow, measurementRow) {
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const meRes = await fetch('/api/auth/me', { headers: { 'x-auth-token': token } });
        const meData = await meRes.json().catch(() => null);
        if (!meRes.ok || !meData?.user) return;
        const user = meData.user;

        const shippingList = Array.isArray(user.shipping_addresses) ? user.shipping_addresses.slice() : [];
        const measureList = Array.isArray(user.measurement_profiles) ? user.measurement_profiles.slice() : [];

        if (shippingRow) {
            const exists = shippingList.some((row) => {
                return String(row.full_name || '').trim() === String(shippingRow.full_name || '').trim()
                    && String(row.phone || '').trim() === String(shippingRow.phone || '').trim()
                    && String(row.country || '').trim().toLowerCase() === String(shippingRow.country || '').trim().toLowerCase()
                    && String(row.city || '').trim().toLowerCase() === String(shippingRow.city || '').trim().toLowerCase();
            });
            if (!exists) {
                const isDefault = shippingList.length === 0;
                shippingList.push({ ...shippingRow, is_default: isDefault || !!shippingRow.is_default });
            }
        }

        if (measurementRow) {
            const exists = measureList.some((row) => String(row.profile_name || '').trim().toLowerCase() === String(measurementRow.profile_name || '').trim().toLowerCase());
            if (!exists) {
                const isDefault = measureList.length === 0;
                measureList.push({ ...measurementRow, is_default: isDefault || !!measurementRow.is_default });
            }
        }

        await fetch('/api/auth/me', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': token
            },
            body: JSON.stringify({
                shipping_addresses: shippingList,
                measurement_profiles: measureList
            })
        });

        localStorage.setItem('yeshi_saved_shipping_addresses', JSON.stringify(shippingList));
        localStorage.setItem('yeshi_saved_measurements', JSON.stringify(measureList));
    } catch (_) {
        // do not block order success
    }
}

const form = document.getElementById('orderForm');
if (form) {
    form.noValidate = true;
}
form.addEventListener('submit', async function(e) {
    e.preventDefault();
    const refundAgreement = document.getElementById('refundAgreement');
    const refundWarning = document.getElementById('refundAgreementWarning');
    if (refundWarning) refundWarning.style.display = 'none';

    if (currentOrderStep === 1) {
        if (!validateStepOneInputs()) return;
        setOrderStep(2);
        return;
    }

    if (refundAgreement && !refundAgreement.checked) {
        if (refundWarning) refundWarning.style.display = 'block';
        alert('You must agree to the Refund Policy to continue');
        focusAndScrollToField(refundAgreement);
        return;
    }

    if (!validateStepTwoInputs()) return;

    const token = localStorage.getItem('token');
    if (!token) {
        const next = encodeURIComponent(window.location.pathname + window.location.search);
        alert('Login to order');
        window.location.href = `/auth/login?next=${next}`;
        return;
    }
    
    // 1. Gather Data
    const selectedAddress = useSavedShipping ? getSelectedSavedAddress() : null;
    const name = useSavedShipping
        ? String(selectedAddress?.full_name || selectedAddress?.fullName || '').trim()
        : document.getElementById('fullName').value;
    const fatherName = document.getElementById('fatherName') ? document.getElementById('fatherName').value : '';
    const phone = useSavedShipping
        ? String(selectedAddress?.phone || '').trim()
        : String(document.getElementById('phone').value || '').trim();
    const country = (useSavedShipping
        ? String(selectedAddress?.country || '').trim()
        : String(document.getElementById('country')?.value || '').trim()) || 'Ethiopia';
    const countryCode = getDialCodeForCountry(country);
    const region = useSavedShipping
        ? String(selectedAddress?.region || '').trim()
        : String(document.getElementById('region').value || '').trim();
    const regionCustom = useSavedShipping
        ? String(selectedAddress?.region_custom || selectedAddress?.regionCustom || '').trim()
        : String(document.getElementById('regionCustom')?.value || '').trim();
    const city = useSavedShipping
        ? String(selectedAddress?.city || '').trim()
        : String(document.getElementById('city').value || '').trim();
    const zipCode = useSavedShipping
        ? String(selectedAddress?.zip_code || selectedAddress?.zipCode || '').trim()
        : String(document.getElementById('zipCode')?.value || '').trim();
    const effectiveRegion = String(region).toLowerCase() === 'other' ? regionCustom : region;
    const address = `${effectiveRegion}, ${city}, ZIP ${zipCode}, ${country}`;
    
    const category = document.getElementById('clothCategory').value;
    const eventType = document.getElementById('eventType') ? document.getElementById('eventType').value : '';
    const isProductOrder = !!form.dataset.postId;
    const proposedPriceETB = readNumberField('proposedPriceETB');
    const paymentMethod = String(document.getElementById('paymentMethod')?.value || '').trim();
    const paymentFile = document.getElementById('paymentScreenshot')?.files?.[0] || null;
    const paymentComment = String(document.getElementById('paymentComment')?.value || '').trim();
    const referenceFiles = Array.from(document.getElementById('referenceImages')?.files || []);
    const quantity = currentProductQuantity;
    // Fabric type removed
    
    // Delivery
    const delivery = document.getElementById('delivery').value;
    
    const selectedMeasurementProfile = useSavedMeasurements ? getSelectedSavedMeasurementProfile() : null;
    let measurementEntries = [];
    if (useSavedMeasurements) {
        measurementEntries = buildMeasurementEntriesFromSavedProfile(selectedMeasurementProfile, category, quantity);
    } else {
        const measurementValidation = validateMeasurementEntries(category, quantity);
        if (!measurementValidation.ok) {
            alert(measurementValidation.message);
            focusAndScrollToField(measurementValidation.field);
            return;
        }
        measurementEntries = measurementValidation.entries;
    }
    const normalMode = getActiveNormalMeasurementMode();
    const measurementPack = {
        schemaVersion: 3,
        rule: quantity > 1 && normalMode === 'different' ? 'per-product' : 'shared',
        category,
        configuredProfiles: getActiveMeasurementTemplateKeys(category),
        quantity,
        mode: quantity > 1 ? normalMode : 'single',
        entries: measurementEntries
    };
    const measurements = {
        type: 'structured',
        size: JSON.stringify(measurementPack),
        height: Math.max(1, measurementEntries.length),
        shoulder: quantity
    };

    const customer_info = { full_name: name, father_name: fatherName, phone, region: effectiveRegion, city, address };
    customer_info.country = country;
    customer_info.country_code = countryCode;
    customer_info.region_custom = regionCustom;
    customer_info.zip_code = zipCode;
    const cloth_details = {
        category,
        measurement_profiles: getActiveMeasurementTemplateKeys(category)
    };
    if (!isProductOrder && eventType) cloth_details.event_type = eventType;

    if (form.dataset.postId) {
        cloth_details.post_title = form.dataset.postTitle || '';
        cloth_details.post_image = form.dataset.postImage || '';
        cloth_details.post_description = form.dataset.postDescription || '';
        cloth_details.post_price_etb = form.dataset.postPriceEtb ? Number(form.dataset.postPriceEtb) : undefined;
        cloth_details.post_shipping_price_etb = form.dataset.postShippingPriceEtb ? Number(form.dataset.postShippingPriceEtb) : undefined;
        cloth_details.post_free_shipping = String(form.dataset.postFreeShipping || '').toLowerCase() === 'true';
        try {
            cloth_details.categories = JSON.parse(String(form.dataset.postCategories || '[]'));
        } catch (_) {
            cloth_details.categories = [];
        }
    }
    
    const productId = String(form.dataset.postId || '').trim();
    const productName = String(form.dataset.postTitle || category || 'Custom Cloth').trim();
    const productImage = String(form.dataset.postImage || '').trim();
    const productPrice = Number(form.dataset.postPriceEtb || 0);
    const shippingPrice = String(form.dataset.postFreeShipping || '').toLowerCase() === 'true'
        ? 0
        : Number(form.dataset.postShippingPriceEtb || 0);
    const safeProductPrice = Number.isFinite(productPrice) ? productPrice : 0;
    const safeShippingPrice = Number.isFinite(shippingPrice) ? shippingPrice : 0;
    const calculatedTotalPrice = computeQuantityTotal(safeProductPrice, safeShippingPrice, quantity);

    const payload = {
        productId: productId || undefined,
        productName,
        productImage,
        quantity,
        productPrice: safeProductPrice,
        shippingPrice: safeShippingPrice,
        totalPrice: calculatedTotalPrice,
        clothDetails: {
            category,
            categories: Array.isArray(cloth_details.categories) ? cloth_details.categories : [],
            measurement_profiles: cloth_details.measurement_profiles,
            eventType: isProductOrder ? '' : eventType,
            measurementMode: measurementPack.mode
        },
        measurements,
        customerInfo: {
            fullName: name,
            fatherName,
            phone,
            country,
            countryCode,
            region: effectiveRegion,
            regionCustom,
            city,
            zipCode,
            address
        },
        deliveryPayment: {
            deliveryMethod: delivery,
            paymentMethod: isProductOrder ? paymentMethod : '',
            paymentComment: isProductOrder ? paymentComment : ''
        },
        proposedPriceETB: proposedPriceETB === undefined ? 0 : proposedPriceETB
    };

    const deviceLocation = await getDeviceLocationSnapshot();
    payload.deviceLocation = deviceLocation;

    try {
        const submitBtn = document.getElementById('orderPrimaryBtn');
        if (submitBtn) submitBtn.disabled = true;
        let res;

        if (isProductOrder && !paymentMethod) {
            alert('Please select a payment method.');
            if (submitBtn) submitBtn.disabled = false;
            return;
        }

        if (isProductOrder && !paymentFile && paymentMethod !== 'telebirr_api') {
            alert('Upload payment screenshot before placing the order.');
            if (submitBtn) submitBtn.disabled = false;
            return;
        }

        if (!isProductOrder) {
            if (!referenceFiles.length) {
                alert('Please upload at least one reference image.');
                if (submitBtn) submitBtn.disabled = false;
                return;
            }

            const fd = new FormData();
            fd.append('order_type', 'custom');
            fd.append('customer_info', JSON.stringify(customer_info));
            fd.append('cloth_details', JSON.stringify(cloth_details));
            fd.append('measurements', JSON.stringify(measurements));
            fd.append('delivery_method', delivery);
            fd.append('proposed_price_etb', String(payload.proposedPriceETB || 0));

            fd.append('fullName', name);
            fd.append('fatherName', fatherName);
            fd.append('phone', phone);
            fd.append('country', country);
            fd.append('country_code', countryCode);
            fd.append('region', effectiveRegion);
            fd.append('region_custom', regionCustom);
            fd.append('city', city);
            fd.append('zip_code', zipCode);
            fd.append('address', address);
            fd.append('category', category);
            fd.append('clothCategory', category);
            fd.append('measurementProfiles', JSON.stringify(cloth_details.measurement_profiles || []));
            fd.append('event_type', eventType || '');
            fd.append('quantity', String(quantity));
            fd.append('device_location', JSON.stringify(deviceLocation || {}));

            referenceFiles.slice(0, 3).forEach((file) => {
                fd.append('referenceImages', file);
            });

            res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'x-auth-token': token },
                body: fd
            });
        } else if (paymentFile) {
            const fd = new FormData();
            fd.append('order_type', 'custom');
            fd.append('customer_info', JSON.stringify(customer_info));
            fd.append('cloth_details', JSON.stringify(cloth_details));
            fd.append('measurements', JSON.stringify(measurements));
            fd.append('delivery_method', delivery);
            fd.append('payment_method', paymentMethod);
            fd.append('fullName', name);
            fd.append('fatherName', fatherName);
            fd.append('phone', phone);
            fd.append('country', country);
            fd.append('country_code', countryCode);
            fd.append('region', effectiveRegion);
            fd.append('region_custom', regionCustom);
            fd.append('city', city);
            fd.append('zip_code', zipCode);
            fd.append('address', address);
            fd.append('category', category);
            fd.append('clothCategory', category);
            fd.append('measurementProfiles', JSON.stringify(cloth_details.measurement_profiles || []));
            fd.append('event_type', '');
            fd.append('post_id', productId);
            fd.append('quantity', String(quantity));
            fd.append('payment_comment', paymentComment);
            fd.append('device_location', JSON.stringify(deviceLocation || {}));
            fd.append('paymentScreenshot', paymentFile);

            res = await fetch('/api/orders', {
                method: 'POST',
                headers: { 'x-auth-token': token },
                body: fd
            });
        } else {
            const headers = {
                'x-auth-token': token,
                'Content-Type': 'application/json'
            };

            res = await fetch('/api/orders', {
                method: 'POST',
                headers: headers,
                body: JSON.stringify(payload)
            });
        }
        
        const raw = await res.text();
        let data = null;
        try {
            data = raw ? JSON.parse(raw) : null;
        } catch (_) {
            data = { msg: raw || 'Server Error' };
        }

        if (res.ok) {
            localStorage.setItem('yeshi_profile_shipping', JSON.stringify({
                fullName: name,
                fatherName: fatherName,
                phone: phone,
                country: country,
                region: effectiveRegion,
                regionCustom: regionCustom,
                city: city,
                zipCode: zipCode,
                address: address
            }));

            await autoSaveProfileSettingsFromOrder(
                useSavedShipping ? null : {
                    label: 'Order address',
                    full_name: name,
                    phone: phone,
                    country: country,
                    country_code: countryCode,
                    region: effectiveRegion,
                    region_custom: regionCustom,
                    city: city,
                    zip_code: zipCode,
                    is_default: false
                },
                useSavedMeasurements ? null : {
                    profile_name: 'Order measurement',
                    chest: Number(measurementEntries?.[0]?.measurementDetails?.chest || measurementEntries?.[0]?.measurementDetails?.bust || 0),
                    waist: Number(measurementEntries?.[0]?.measurementDetails?.waist || 0),
                    hip: Number(measurementEntries?.[0]?.measurementDetails?.hip || measurementEntries?.[0]?.measurementDetails?.hips || 0),
                    shoulder: Number(measurementEntries?.[0]?.measurementDetails?.shoulder || 0),
                    length: Number(measurementEntries?.[0]?.measurementDetails?.length || measurementEntries?.[0]?.measurementDetails?.tshirt_length || measurementEntries?.[0]?.measurementDetails?.length_below_waist || 0),
                    sleeve_length: Number(measurementEntries?.[0]?.measurementDetails?.sleeve || 0),
                    is_default: false
                }
            );

            const orderId = data?._id || data?.order?._id || '';

            if (paymentMethod === 'telebirr_api' && orderId) {
                alert('Order placed successfully! Redirecting to Telebirr secure checkout...');
                try {
                    const tRes = await fetch(`/api/telebirr/checkout/${orderId}`, {
                        method: 'POST',
                        headers: { 'x-auth-token': token } 
                    });
                    if (tRes.ok) {
                        const tData = await tRes.json();
                        if (tData.checkoutUrl) {
                            window.location.href = tData.checkoutUrl;
                            return; // Stop here, don't open whatsapp
                        }
                    } else {
                        const tData = await tRes.json().catch(() => ({}));
                        throw new Error(tData.msg || tData.error || `Server error: ${tRes.status}`);
                    }
                } catch(e) {
                    console.error('Telebirr redirect error', e);
                    alert(e.message || 'Server error');
                    window.location.href = '/user/my-orders.html';
                    return;
                }
                alert('Telebirr routing failed. You can pay from My Orders later.');
                window.location.href = '/user/my-orders.html';
                return;
            }

            // 3. Construct WhatsApp Message (Backup/Notification)
            let message = `*New Order Request - YESHI* %0A%0A`;
            message += `👤 *Customer:* ${name}%0A`;
            message += `📞 *Phone:* ${phone}%0A`;
            message += `🆔 *Order ID:* ${orderId}%0A`;
            message += `-----------------------%0A`;
            message += `👗 *Cloth:* ${category}%0A`;
            
            const totalToPay = Number.isFinite(safeProductPrice)
                ? computeQuantityTotal(safeProductPrice, Number.isFinite(safeShippingPrice) ? safeShippingPrice : 0, quantity)
                : NaN;
            const payNote = Number.isFinite(totalToPay) && totalToPay > 0
                ? `\nTotal price (cloth + shipping): ${totalToPay.toLocaleString()} ETB. You should pay total price.`
                : '';
            alert(`Order placed successfully! Redirecting to WhatsApp for confirmation...${payNote}`);

            const adminNumber = "251933797981";
            window.open(`https://wa.me/${adminNumber}?text=${message}`, '_blank');
            window.location.href = '/index.html';
        } else {
            alert((data && data.msg) ? data.msg : 'Error placing order.');
        }
    } catch(err) {
        console.error(err);
        alert('Server Error');
    } finally {
        const submitBtn = document.getElementById('orderPrimaryBtn');
        if (submitBtn) submitBtn.disabled = false;
    }
});


