/**
 * auth.js
 * -----------------------------------------------------------------------
 * Client-side validation and UI behavior for login.ejs and signup.ejs.
 * This is FRONT-END ONLY — it validates form shape (required fields,
 * email format, password match/length) before the browser submits to
 * /login or /signup. It does NOT authenticate anything; that's the
 * backend's job once it exists. Server-rendered `error` (see the EJS
 * templates) is the source of truth for actual login/signup failures
 * (wrong password, duplicate email, etc).
 * -----------------------------------------------------------------------
 */

// ── SHARED HELPERS ──

function clearFieldError(fieldId) {
    const el = document.getElementById(fieldId);
    if (el) el.classList.remove('has-error');
}

function setFieldError(fieldId) {
    const el = document.getElementById(fieldId);
    if (el) el.classList.add('has-error');
}

function isValidEmail(value) {
    // Deliberately simple — good enough for client-side UX, the backend
    // should do real validation (and the actual check that the address
    // exists/works happens via account verification, not regex).
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function togglePasswordVisibility(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    btn.classList.toggle('active', !showing);
    btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
}

function formatPhone(el) {
    let v = el.value.replace(/\D/g, '').substring(0, 10);
    if (v.length >= 6) v = '(' + v.substring(0, 3) + ') ' + v.substring(3, 6) + '-' + v.substring(6);
    else if (v.length >= 3) v = '(' + v.substring(0, 3) + ') ' + v.substring(3);
    el.value = v;
}

// ── LOGIN FORM VALIDATION ──

function validateLoginForm() {
    let ok = true;

    const email = document.getElementById('loginEmail');
    const password = document.getElementById('loginPassword');

    clearFieldError('f-login-email');
    clearFieldError('f-login-password');

    if (!email.value.trim() || !isValidEmail(email.value)) {
        setFieldError('f-login-email');
        ok = false;
    }

    if (!password.value) {
        setFieldError('f-login-password');
        ok = false;
    }

    return ok;
}

// ── SIGNUP FORM VALIDATION ──

/**
 * Lightweight password strength heuristic for the visual meter only —
 * this is NOT a security control. Real password policy enforcement
 * (breach checks, complexity rules) belongs on the backend.
 */
function getPasswordStrength(pw) {
    if (!pw) return { level: 'none', label: 'At least 8 characters.' };

    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;

    if (pw.length < 8) return { level: 'weak', label: 'At least 8 characters.' };
    if (score <= 2) return { level: 'weak', label: 'Weak — try adding a number or symbol.' };
    if (score <= 3) return { level: 'medium', label: 'Decent — a mix of cases and symbols helps.' };
    return { level: 'strong', label: 'Strong password.' };
}

function onSignupPasswordInput() {
    clearFieldError('f-signup-password');

    const pw = document.getElementById('signupPassword').value;
    const bar = document.getElementById('passwordStrengthBar');
    const label = document.getElementById('passwordStrengthLabel');
    const strength = getPasswordStrength(pw);

    bar.className = 'password-strength-bar' + (strength.level !== 'none' ? ' ' + strength.level : '');
    label.textContent = strength.label;

    // Re-check confirm-password match live, since strength typing often
    // happens after the confirm field was already filled in some flows.
    const confirm = document.getElementById('signupConfirmPassword');
    if (confirm.value) clearFieldError('f-signup-confirm');
}

function validateSignupForm() {
    let ok = true;

    const firstName = document.getElementById('signupFirst');
    const lastName = document.getElementById('signupLast');
    const email = document.getElementById('signupEmail');
    const phone = document.getElementById('signupPhone');
    const password = document.getElementById('signupPassword');
    const confirmPassword = document.getElementById('signupConfirmPassword');
    const agreeTerms = document.getElementById('agreeTerms');

    ['f-signup-fname', 'f-signup-lname', 'f-signup-email', 'f-signup-phone',
        'f-signup-password', 'f-signup-confirm', 'f-signup-terms'].forEach(clearFieldError);

    if (!firstName.value.trim()) {
        setFieldError('f-signup-fname');
        ok = false;
    }

    if (!lastName.value.trim()) {
        setFieldError('f-signup-lname');
        ok = false;
    }

    if (!email.value.trim() || !isValidEmail(email.value)) {
        setFieldError('f-signup-email');
        ok = false;
    }

    const phoneDigits = phone.value.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
        setFieldError('f-signup-phone');
        ok = false;
    }

    if (!password.value || password.value.length < 8) {
        setFieldError('f-signup-password');
        ok = false;
    }

    if (!confirmPassword.value || confirmPassword.value !== password.value) {
        setFieldError('f-signup-confirm');
        ok = false;
    }

    if (!agreeTerms.checked) {
        setFieldError('f-signup-terms');
        ok = false;
    }

    return ok;
}