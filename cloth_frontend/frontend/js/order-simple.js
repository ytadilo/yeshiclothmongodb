(function () {
    const form = document.getElementById('orderForm');
    if (!form) return;

    function getValue(id) {
        const el = document.getElementById(id);
        return el ? String(el.value || '').trim() : '';
    }

    function toMoney(value) {
        const n = Number(value || 0);
        return Number.isFinite(n) ? n.toLocaleString() : '0';
    }

    function closeModal() {
        const overlay = document.getElementById('orderConfirmOverlay');
        if (overlay) overlay.remove();
    }

    function buildConfirmationModal(data) {
        const overlay = document.createElement('div');
        overlay.id = 'orderConfirmOverlay';
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;';

        const modal = document.createElement('div');
        modal.style.cssText = 'width:min(560px,100%);background:#fff;border-radius:14px;padding:16px;box-shadow:0 18px 40px rgba(0,0,0,0.25);';

        modal.innerHTML =
            '<h3 style="margin:0 0 12px;">Confirm Your Order</h3>' +
            '<div style="display:flex;gap:12px;align-items:flex-start;">' +
                '<img src="' + (data.productImage || '/images/logo.png') + '" alt="Product" style="width:110px;height:110px;object-fit:cover;border-radius:10px;border:1px solid rgba(0,0,0,0.1);">' +
                '<div style="min-width:0;">' +
                    '<div style="font-weight:700;">' + data.productName + '</div>' +
                    '<div style="margin-top:6px;color:#444;">Price: ' + toMoney(data.productPrice) + ' ETB</div>' +
                    '<div style="margin-top:4px;color:#444;">Shipping: ' + toMoney(data.shippingPrice) + ' ETB</div>' +
                    '<div style="margin-top:6px;font-weight:800;color:#745b18;">Total: ' + toMoney(data.totalPrice) + ' ETB</div>' +
                '</div>' +
            '</div>' +
            '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;">' +
                '<button type="button" id="cancelOrderBtn" style="border:1px solid #ddd;background:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;">Cancel</button>' +
                '<button type="button" id="confirmOrderBtn" style="border:0;background:#745b18;color:#fff;border-radius:8px;padding:8px 12px;cursor:pointer;">Confirm Order</button>' +
            '</div>';

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        return new Promise((resolve) => {
            const onCancel = () => {
                closeModal();
                resolve(false);
            };

            const onConfirm = () => {
                closeModal();
                resolve(true);
            };

            overlay.addEventListener('click', function (e) {
                if (e.target === overlay) onCancel();
            });

            const cancelBtn = document.getElementById('cancelOrderBtn');
            const confirmBtn = document.getElementById('confirmOrderBtn');
            if (cancelBtn) cancelBtn.addEventListener('click', onCancel);
            if (confirmBtn) confirmBtn.addEventListener('click', onConfirm);
        });
    }

    async function submitOrder(payload) {
        const token = localStorage.getItem('token');
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['x-auth-token'] = token;

        const res = await fetch('/api/orders', {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(data.msg || 'Failed to create order');
        }

        return data;
    }

    form.addEventListener('submit', async function (e) {
        e.preventDefault();

        const customerName = getValue('fullName');
        const phone = getValue('phone');
        const address = getValue('address');

        const productId = String(form.dataset.postId || '').trim();
        const productName = String(form.dataset.postTitle || '').trim();
        const productImage = String(form.dataset.postImage || '').trim();
        const productPrice = Number(form.dataset.postPriceEtb || 0);
        const shippingPrice = Number(form.dataset.postShippingPriceEtb || 0);
        const quantity = Number(getValue('quantity') || 1);

        const customDetails = {
            size: getValue('size') || getValue('clothCategory'),
            color: getValue('color'),
            note: getValue('note') || getValue('eventType')
        };

        const totalPrice = (productPrice * Math.max(1, quantity)) + shippingPrice;

        if (!customerName || !phone || !address || !productId || !productName || !productImage) {
            alert('Please fill all required fields before ordering.');
            return;
        }

        const payload = {
            customerName,
            phone,
            address,
            productId,
            productName,
            productImage,
            quantity: Math.max(1, quantity),
            customDetails,
            productPrice,
            shippingPrice,
            totalPrice
        };

        const confirmed = await buildConfirmationModal(payload);
        if (!confirmed) return;

        try {
            await submitOrder(payload);
            alert('Order confirmed successfully');
            form.reset();
        } catch (err) {
            alert(err.message || 'Order failed');
        }
    });
})();
