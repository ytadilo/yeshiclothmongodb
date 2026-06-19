/**
 * Payment Checkout Handler
 * Manages payment form, validation, and initialization
 */

document.addEventListener('DOMContentLoaded', async () => {
    const paymentForm = document.getElementById('paymentForm');
    const proceedButton = document.getElementById('proceedButton');
    const formError = document.getElementById('formError');

    // Get order data from localStorage or URL parameters
    const orderData = getOrderData();
    if (!orderData) {
        showError('No order information found. Redirecting to cart...');
        setTimeout(() => {
            window.location.href = '/cart';
        }, 2000);
        return;
    }

    // Populate form with order data
    populateFormData(orderData);
    updateOrderSummary(orderData);

    /**
     * Get order data from localStorage or URL
     */
    function getOrderData() {
        // Try from localStorage first (most reliable)
        const stored = localStorage.getItem('checkout_order');
        if (stored) {
            try {
                return JSON.parse(stored);
            } catch (e) {
                console.error('Failed to parse stored order data:', e);
            }
        }

        // Try from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const orderJson = urlParams.get('order');
        if (orderJson) {
            try {
                return JSON.parse(decodeURIComponent(orderJson));
            } catch (e) {
                console.error('Failed to parse URL order data:', e);
            }
        }

        return null;
    }

    /**
     * Populate form fields with order and user data
     */
    function populateFormData(data) {
        // Try to get user info from Firebase
        if (window.currentUser) {
            document.getElementById('customerName').value = 
                window.currentUser.displayName || window.currentUser.email || '';
            document.getElementById('customerEmail').value = 
                window.currentUser.email || '';
            document.getElementById('customerPhone').value = 
                data.customer_phone || '';
        }

        // Use data from order if provided
        if (data.customer_name) {
            document.getElementById('customerName').value = data.customer_name;
        }
        if (data.customer_email) {
            document.getElementById('customerEmail').value = data.customer_email;
        }
        if (data.customer_phone) {
            document.getElementById('customerPhone').value = data.customer_phone;
        }
        if (data.description) {
            document.getElementById('description').value = data.description;
        }

        // Set amount
        document.getElementById('amount').value = (data.total || data.amount || 0).toFixed(2);
    }

    /**
     * Update order summary display
     */
    function updateOrderSummary(data) {
        const subtotal = data.subtotal || 0;
        const shipping = data.shipping || 0;
        const total = data.total || subtotal + shipping;

        // Update totals
        document.getElementById('subtotal').textContent = `ETB ${formatCurrency(subtotal)}`;
        document.getElementById('shipping').textContent = `ETB ${formatCurrency(shipping)}`;
        document.getElementById('totalAmount').textContent = `ETB ${formatCurrency(total)}`;
        document.getElementById('amount').value = total.toFixed(2);

        // Show order items if available
        const orderDetails = document.getElementById('orderDetails');
        if (data.items && Array.isArray(data.items) && data.items.length > 0) {
            const itemsHtml = data.items.map(item => `
                <div class="order-item">
                    <div class="item-info">
                        <div class="item-name">${escapeHtml(item.name || 'Item')}</div>
                        <div class="item-qty">Quantity: ${item.quantity || 1}</div>
                    </div>
                    <div class="item-price">ETB ${formatCurrency(item.price || 0)}</div>
                </div>
            `).join('');
            orderDetails.innerHTML = itemsHtml;
        }
    }

    /**
     * Handle form submission
     */
    paymentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Reset error state
        clearErrors();
        hideError();

        // Validate form
        if (!validateForm()) {
            return;
        }

        // Disable button and show loading
        proceedButton.disabled = true;
        proceedButton.classList.add('loading');

        try {
            // Get form data
            const formData = {
                customer_name: document.getElementById('customerName').value.trim(),
                customer_email: document.getElementById('customerEmail').value.trim(),
                customer_phone: document.getElementById('customerPhone').value.trim(),
                amount: parseFloat(document.getElementById('amount').value),
                currency: 'ETB',
                description: document.getElementById('description').value.trim(),
                order_id: orderData.order_id || null
            };

            // Show loading state
            showLoading();

            // Send payment initialization request
            const response = await fetch('/api/payments/initialize', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${await getAuthToken()}`
                },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (!response.ok || !result.success) {
                throw new Error(result.message || 'Payment initialization failed');
            }

            // Store payment reference for result page
            localStorage.setItem('last_payment_ref', result.data.tx_ref);

            // Redirect to Chapa checkout
            if (result.data.checkout_url) {
                window.location.href = result.data.checkout_url;
            } else {
                throw new Error('No checkout URL received from payment gateway');
            }

        } catch (error) {
            console.error('Payment initialization error:', error);
            showError(error.message || 'Failed to initialize payment. Please try again.');
            proceedButton.disabled = false;
            proceedButton.classList.remove('loading');
        }
    });

    /**
     * Validate form fields
     */
    function validateForm() {
        let isValid = true;

        // Validate name
        const name = document.getElementById('customerName').value.trim();
        if (!name || name.length < 2) {
            showFieldError('customerNameError', 'Please enter a valid full name');
            isValid = false;
        }

        // Validate email
        const email = document.getElementById('customerEmail').value.trim();
        if (!isValidEmail(email)) {
            showFieldError('customerEmailError', 'Please enter a valid email address');
            isValid = false;
        }

        // Validate phone
        const phone = document.getElementById('customerPhone').value.trim();
        if (!isValidPhone(phone)) {
            showFieldError('customerPhoneError', 'Please enter a valid phone number');
            isValid = false;
        }

        // Validate amount
        const amount = parseFloat(document.getElementById('amount').value);
        if (!amount || amount <= 0) {
            showFieldError('amountError', 'Invalid amount');
            isValid = false;
        }

        // Validate terms
        if (!document.getElementById('agreeTerms').checked) {
            showFieldError('agreeTermsError', 'You must agree to the terms and conditions');
            isValid = false;
        }

        return isValid;
    }

    /**
     * Show field error
     */
    function showFieldError(elementId, message) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = message;
            element.style.display = 'block';
        }
    }

    /**
     * Clear all field errors
     */
    function clearErrors() {
        document.querySelectorAll('.error-message').forEach(el => {
            el.textContent = '';
            el.style.display = 'none';
        });
    }

    /**
     * Show form error
     */
    function showError(message) {
        formError.textContent = message;
        formError.classList.remove('hidden');
    }

    /**
     * Hide form error
     */
    function hideError() {
        formError.classList.add('hidden');
    }

    /**
     * Show loading state
     */
    function showLoading() {
        const buttonText = proceedButton.querySelector('.button-text');
        const buttonLoader = proceedButton.querySelector('.button-loader');
        
        if (buttonText) buttonText.classList.add('hidden');
        if (buttonLoader) buttonLoader.classList.remove('hidden');
    }

    /**
     * Get authentication token
     */
    async function getAuthToken() {
        if (window.currentUser) {
            return await window.currentUser.getIdToken();
        }
        
        // Try to get from localStorage
        const token = localStorage.getItem('auth_token');
        return token || '';
    }
});

/**
 * Utility Functions
 */

function isValidEmail(email) {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
}

function isValidPhone(phone) {
    // Remove spaces and special characters
    const cleaned = phone.replace(/\D/g, '');
    // Check if at least 9 digits
    return cleaned.length >= 9;
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-ET', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}
