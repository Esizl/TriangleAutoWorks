(function () {
    'use strict';

    const passkeyBtn = document.getElementById('passkeyLoginBtn');
    if (!passkeyBtn) return;

    // Only show the button if this browser actually supports passkeys —
    // no point offering it on old browsers, and startAuthentication()
    // would just throw anyway.
    if (!window.PublicKeyCredential) {
        passkeyBtn.style.display = 'none';
        return;
    }

    passkeyBtn.addEventListener('click', async function () {
        passkeyBtn.disabled = true;
        passkeyBtn.textContent = 'Waiting for passkey…';

        try {
            const optionsRes = await fetch('/auth/webauthn/login-options');
            if (!optionsRes.ok) throw new Error('Could not start passkey login.');
            const options = await optionsRes.json();

            const { startAuthentication } = SimpleWebAuthnBrowser;
            const authResponse = await startAuthentication({ optionsJSON: options });

            const verifyRes = await fetch('/auth/webauthn/login-verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(authResponse)
            });
            const result = await verifyRes.json();

            if (verifyRes.ok && result.verified) {
                window.location.href = result.redirect || '/';
            } else {
                // The server doesn't know this passkey (it was removed from
                // the account). Where the browser supports it, report that
                // so the device can delete its leftover copy and stop
                // offering it. Best effort: not every browser/device does.
                if (result.unknownCredential && PublicKeyCredential.signalUnknownCredential) {
                    try {
                        await PublicKeyCredential.signalUnknownCredential({
                            rpId: options.rpId,
                            credentialId: authResponse.id
                        });
                    } catch (signalErr) {
                        console.warn('Could not report the unknown passkey to the device:', signalErr);
                    }
                }
                throw new Error(result.error || 'Passkey login failed.');
            }
        } catch (err) {
            // NotAllowedError fires when the user cancels the prompt —
            // that's not a real error, just quietly reset the button.
            if (err.name !== 'NotAllowedError') {
                alert(err.message || 'Passkey login failed. Try your password instead.');
            }
        } finally {
            passkeyBtn.disabled = false;
            passkeyBtn.textContent = 'Sign in with a passkey';
        }
    });
})();
