/**
 * discount.js
 * -----------------------------------------------------------------------
 * Discount code box on the Review step (Step 6). One code per booking,
 * applied to the whole booking regardless of category.
 *
 *  - The customer's code is checked by POST /api/discount/validate. The
 *    server answers with the code's public rules; nothing about which
 *    codes exist is ever shipped to the browser.
 *  - A valid code is kept in state.discount. applyDiscountToEstimate()
 *    (called by computeEstimate() in configurator.js) takes it off the
 *    pre-tax subtotal, so the Step 3 estimate card, the Step 6 invoice
 *    and the admin payload all show the same discounted numbers.
 *  - The server re-checks the code and recomputes the amount when the
 *    booking is submitted — what's shown here is a preview, not the
 *    source of truth.
 *
 * Load order: after configurator.js and booking.js.
 * -----------------------------------------------------------------------
 */

state.discount = null;

function roundCents(n) {
    return Math.round(n * 100) / 100;
}

/**
 * Re-checks the rules the browser can see (category, minimum subtotal)
 * against the booking as it stands right now — the customer can go back
 * and change services after applying a code.
 * Returns { amount, note }: note explains why an applied code is
 * currently giving $0 off.
 */
function evaluateDiscount(discount, category, subtotal) {
    if (discount.categories.length > 0 && !discount.categories.includes(category)) {
        return { amount: 0, note: `Code ${discount.code} is only good for ${discount.categories.join(' or ')} bookings.` };
    }
    if (discount.minSubtotal > 0 && subtotal < discount.minSubtotal) {
        return { amount: 0, note: `Code ${discount.code} needs a subtotal of at least $${discount.minSubtotal.toFixed(2)}.` };
    }
    const raw = discount.type === 'percent' ? subtotal * (discount.value / 100) : discount.value;
    return { amount: roundCents(Math.min(raw, subtotal)), note: '' };
}

/**
 * Takes a finished estimate (Automotive or Detailing) and applies
 * state.discount to it: subtotal stays the pre-discount figure, tax is
 * charged on what's left after the discount.
 */
function applyDiscountToEstimate(estimate) {
    estimate.taxRate = TAX_RATE;
    estimate.discount = null;
    estimate.discountAmount = 0;
    estimate.discountNote = '';

    const discount = state.discount;
    if (!discount) return estimate;

    const result = evaluateDiscount(discount, state.category, estimate.subtotal);
    estimate.discount = discount;
    estimate.discountAmount = result.amount;
    estimate.discountNote = result.note;
    estimate.tax = (estimate.subtotal - result.amount) * TAX_RATE;
    estimate.total = estimate.subtotal - result.amount + estimate.tax;
    return estimate;
}

/** Subtotal the server should check a code against — null when the category has no online pricing. */
function discountSubtotal() {
    if (!categoryHasEstimate(state.category)) return null;
    return computeBaseEstimate().subtotal;
}

function renderDiscountBox() {
    const input = document.getElementById('discountCodeInput');
    const applyBtn = document.getElementById('discountApplyBtn');
    const removeBtn = document.getElementById('discountRemoveBtn');
    const status = document.getElementById('discountStatus');
    if (!input || !applyBtn || !removeBtn || !status) return;

    const discount = state.discount;
    input.disabled = !!discount;
    applyBtn.style.display = discount ? 'none' : '';
    removeBtn.style.display = discount ? '' : 'none';

    if (!discount) {
        if (!status.classList.contains('is-error')) status.textContent = '';
        return;
    }

    input.value = discount.code;
    status.className = 'discount-status is-applied';

    if (!categoryHasEstimate(state.category)) {
        status.textContent = `${discount.code} — ${discount.label}. We'll take it off your quote.`;
        return;
    }
    const result = evaluateDiscount(discount, state.category, discountSubtotal());
    if (result.note) {
        status.className = 'discount-status is-error';
        status.textContent = result.note;
    } else {
        status.textContent = `${discount.code} applied — ${discount.label}.`;
    }
}

function setDiscountError(message) {
    const status = document.getElementById('discountStatus');
    if (!status) return;
    status.className = 'discount-status is-error';
    status.textContent = message;
}

/** Everything that shows a price gets rebuilt from the new state.discount. */
function refreshAfterDiscountChange() {
    refreshConfiguratorAndEstimate();
    if (state.step === 6) buildInvoicePreview();
    renderDiscountBox();
}

async function applyDiscountCode() {
    const input = document.getElementById('discountCodeInput');
    const applyBtn = document.getElementById('discountApplyBtn');
    const status = document.getElementById('discountStatus');
    const code = input.value.trim().toUpperCase();

    if (!code) {
        setDiscountError('Enter a code first.');
        return;
    }

    applyBtn.disabled = true;
    status.className = 'discount-status';
    status.textContent = 'Checking…';

    try {
        const res = await fetch('/api/discount/validate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                code,
                category: state.category,
                pricing: { subtotal: discountSubtotal() },
                firstTimeCustomer: document.getElementById('firstTime').value === 'yes',
                contact: { phone: document.getElementById('contactPhone').value.trim() }
            })
        });
        const data = await res.json();

        if (!data.valid) {
            setDiscountError(data.message || "That code isn't valid.");
            return;
        }

        state.discount = data.discount;
        status.className = 'discount-status';
        refreshAfterDiscountChange();
    } catch (err) {
        console.error('Discount check failed:', err);
        setDiscountError('Could not check that code right now. Please try again.');
    } finally {
        applyBtn.disabled = false;
    }
}

function removeDiscountCode(message) {
    state.discount = null;
    const input = document.getElementById('discountCodeInput');
    const status = document.getElementById('discountStatus');
    if (input) input.value = '';
    if (status) { status.className = 'discount-status'; status.textContent = ''; }
    refreshAfterDiscountChange();
    if (message) setDiscountError(message);
}

document.getElementById('discountApplyBtn')?.addEventListener('click', applyDiscountCode);
document.getElementById('discountRemoveBtn')?.addEventListener('click', () => removeDiscountCode());
document.getElementById('discountCodeInput')?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        event.preventDefault();
        applyDiscountCode();
    }
});

window.applyDiscountToEstimate = applyDiscountToEstimate;
window.renderDiscountBox = renderDiscountBox;
window.removeDiscountCode = removeDiscountCode;
