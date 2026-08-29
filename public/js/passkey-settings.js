(function () {
    'use strict';

    const addBtn = document.getElementById('addPasskeyBtn');
    const listEl = document.getElementById('passkeyList');
    if (!addBtn || !listEl) return;

    if (!window.PublicKeyCredential) {
        addBtn.style.display = 'none';
        listEl.innerHTML = '<p>Your browser doesn\'t support passkeys.</p>';
        return;
    }

    async function loadPasskeys() {
        const res = await fetch('/auth/webauthn/list');
        if (!res.ok) {
            listEl.innerHTML = '<p>Failed to load passkeys.</p>';
            return;
        }
        const passkeys = await res.json();

        if (passkeys.length === 0) {
            listEl.innerHTML = '<p>No passkeys added yet.</p>';
            return;
        }

        listEl.innerHTML = passkeys.map(pk => `
            <div class="passkey-row" data-credential-id="${pk.credentialID}">
                <span>${pk.nickname || 'Unnamed passkey'} — added ${new Date(pk.createdAt).toLocaleDateString()}</span>
                <button type="button" class="btn-ghost passkey-remove-btn" data-credential-id="${pk.credentialID}">Remove</button>
            </div>
        `).join('');
    }

    addBtn.addEventListener('click', async function () {
        addBtn.disabled = true;
        addBtn.textContent = 'Waiting for passkey…';

        try {
            const optionsRes = await fetch('/auth/webauthn/register-options');
            if (!optionsRes.ok) {
                const body = await optionsRes.json().catch(() => ({}));
                throw new Error(body.error || 'Could not start passkey registration.');
            }
            const options = await optionsRes.json();

            const { startRegistration } = SimpleWebAuthnBrowser;
            const attResponse = await startRegistration({ optionsJSON: options });

            const nickname = window.prompt('Name this passkey (e.g. "iPhone", "MacBook"):', '') || null;

            const verifyRes = await fetch('/auth/webauthn/register-verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...attResponse, nickname })
            });
            const result = await verifyRes.json();

            if (verifyRes.ok && result.verified) {
                await loadPasskeys();
            } else {
                throw new Error(result.error || 'Failed to save passkey.');
            }
        } catch (err) {
            if (err.name !== 'NotAllowedError') {
                alert(err.message || 'Failed to add passkey.');
            }
        } finally {
            addBtn.disabled = false;
            addBtn.textContent = 'Add a Passkey';
        }
    });

    listEl.addEventListener('click', async function (e) {
        const btn = e.target.closest('.passkey-remove-btn');
        if (!btn) return;

        if (!window.confirm('Remove this passkey? You will no longer be able to log in with it.')) return;

        const res = await fetch(`/auth/webauthn/${btn.dataset.credentialId}`, { method: 'DELETE' });
        if (res.ok) {
            await loadPasskeys();
        } else {
            const body = await res.json().catch(() => ({}));
            alert(body.error || 'Failed to remove passkey.');
        }
    });

    loadPasskeys();
})();
