/**
 * Payment Result Handler
 * Manages payment status display after Chapa redirect
 */

document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const txRef = urlParams.get('tx_ref') || localStorage.getItem('last_payment_ref');

    if (!txRef) {
        showErrorState('No transaction reference provided');
        return;
    }

    try {
        // Fetch payment details from backend
        const response = await fetch(`/api/payments/verify/${txRef}`);
        const result = await response.json();

        if (result.success) {
            const payment = result.data;
            displayPaymentResult(payment);
        } else {
            // If verification failed, still show the status
            const detailsResponse = await fetch(`/api/payments/${txRef}`);
            const detailsResult = detailsResponse.json();
            
            if (detailsResult.success) {
                const payment = detailsResult.data;
                displayPaymentResult(payment);
            } else {
                showErrorState(result.message || 'Could not retrieve payment status');
            }
        }
    } catch (error) {
        console.error('Error fetching payment result:', error);
        showErrorState('An error occurred while retrieving your payment status. Please try again.');
    }

    /**
     * Display payment result based on status
     */
    function displayPaymentResult(payment) {
        const status = payment.status || payment.payment_status;
        const txRefDisplay = payment.tx_ref || txRef;
        const amount = payment.amount || 0;
        const currency = payment.currency || 'ETB';
        const formattedAmount = `${currency} ${formatCurrency(amount)}`;

        // Hide loading state
        hideAllStates();

        switch (status) {
            case 'success':
            case 'completed':
                showSuccessState(txRefDisplay, formattedAmount);
                break;

            case 'failed':
                showFailedState(
                    txRefDisplay,
                    formattedAmount,
                    payment.error_message || 'Payment could not be processed'
                );
                break;

            case 'cancelled':
                showCancelledState(txRefDisplay, formattedAmount);
                break;

            case 'pending':
                showPendingState(txRefDisplay, formattedAmount);
                break;

            default:
                showErrorState(`Unknown payment status: ${status}`);
        }
    }

    /**
     * Show Success State
     */
    function showSuccessState(txRef, amount) {
        const successState = document.getElementById('successState');
        if (successState) {
            document.getElementById('successTxRef').textContent = txRef;
            document.getElementById('successAmount').textContent = amount;
            document.getElementById('successTime').textContent = new Date().toLocaleString();
            successState.classList.remove('hidden');
        }

        // Clear localStorage
        localStorage.removeItem('checkout_order');
        localStorage.removeItem('last_payment_ref');
    }

    /**
     * Show Failed State
     */
    function showFailedState(txRef, amount, reason) {
        const failedState = document.getElementById('failedState');
        if (failedState) {
            document.getElementById('failedTxRef').textContent = txRef;
            document.getElementById('failedAmount').textContent = amount;
            document.getElementById('failedReason').textContent = reason;
            failedState.classList.remove('hidden');

            // Add retry button handler
            document.getElementById('retryButton').addEventListener('click', () => {
                retryPayment(txRef);
            });
        }
    }

    /**
     * Show Cancelled State
     */
    function showCancelledState(txRef, amount) {
        const cancelledState = document.getElementById('cancelledState');
        if (cancelledState) {
            document.getElementById('cancelledTxRef').textContent = txRef;
            document.getElementById('cancelledAmount').textContent = amount;
            cancelledState.classList.remove('hidden');
        }
    }

    /**
     * Show Pending State
     */
    function showPendingState(txRef, amount) {
        const pendingState = document.getElementById('pendingState');
        if (pendingState) {
            document.getElementById('pendingTxRef').textContent = txRef;
            document.getElementById('pendingAmount').textContent = amount;
            pendingState.classList.remove('hidden');

            // Add check status button handler
            document.getElementById('checkStatusButton').addEventListener('click', () => {
                location.reload();
            });
        }
    }

    /**
     * Show Error State
     */
    function showErrorState(message) {
        const errorState = document.getElementById('errorState');
        if (errorState) {
            document.getElementById('errorMessage').textContent = message;
            errorState.classList.remove('hidden');
        }
    }

    /**
     * Hide all states
     */
    function hideAllStates() {
        const states = [
            'loadingState',
            'successState',
            'failedState',
            'cancelledState',
            'pendingState',
            'errorState'
        ];
        
        states.forEach(stateId => {
            const element = document.getElementById(stateId);
            if (element) {
                element.classList.add('hidden');
            }
        });
    }

    /**
     * Retry payment
     */
    async function retryPayment(txRef) {
        try {
            const button = document.getElementById('retryButton');
            button.disabled = true;
            button.textContent = 'Processing...';

            const response = await fetch(`/api/payments/${txRef}/retry`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${await getAuthToken()}`
                }
            });

            const result = await response.json();

            if (result.success && result.data.checkout_url) {
                // Store new tx_ref
                localStorage.setItem('last_payment_ref', result.data.new_tx_ref);
                // Redirect to new checkout
                window.location.href = result.data.checkout_url;
            } else {
                alert(result.message || 'Failed to retry payment');
                button.disabled = false;
                button.textContent = 'Retry Payment';
            }
        } catch (error) {
            console.error('Retry error:', error);
            alert('An error occurred while retrying the payment');
            location.reload();
        }
    }

    /**
     * Get authentication token
     */
    async function getAuthToken() {
        if (window.currentUser) {
            return await window.currentUser.getIdToken();
        }
        
        const token = localStorage.getItem('auth_token');
        return token || '';
    }
});

/**
 * Utility Functions
 */

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-ET', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}
