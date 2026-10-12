/**
 * sms.js
 * -----------------------------------------------------------------------
 * The one place the app sends text messages from. Uses Twilio's REST API
 * (https://www.twilio.com/docs/messaging/api/message-resource) through
 * Node's built-in fetch, so there is no extra package to install.
 *
 * Settings (environment variables — locally these live in .env):
 *   TWILIO_ACCOUNT_SID   Account SID (AC...)
 *   TWILIO_AUTH_TOKEN    Auth token
 *   TWILIO_FROM          The Twilio number texts are sent from, e.g. +18885550100
 *
 * Loud-failure rule: a missing setting, a bad phone number or a rejected
 * send THROWS with the real reason. Callers decide what the customer sees.
 * -----------------------------------------------------------------------
 */

function setting(name) {
    return process.env[name] || ''
}

function isSmsConfigured() {
    return !!(setting('TWILIO_ACCOUNT_SID') && setting('TWILIO_AUTH_TOKEN') && setting('TWILIO_FROM'))
}

/**
 * US phone number in the +1XXXXXXXXXX form Twilio requires, from however
 * it was typed: "(919) 555-0100", "919-555-0100", "1 919 555 0100".
 * Returns '' if it isn't a 10-digit US number.
 */
function toE164(phone) {
    const digits = String(phone || '').replace(/\D/g, '')
    if (digits.length === 10) return `+1${digits}`
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
    return ''
}

/** Sends one text. Resolves with Twilio's message SID; throws with the real reason on any failure. */
async function sendSms({ to, body }) {
    const accountSid = setting('TWILIO_ACCOUNT_SID')
    const authToken = setting('TWILIO_AUTH_TOKEN')
    const from = setting('TWILIO_FROM')
    if (!accountSid || !authToken || !from) {
        throw new Error('SMS is not configured: set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM.')
    }

    const toNumber = toE164(to)
    if (!toNumber) {
        throw new Error(`Cannot text "${to}": not a 10-digit US phone number.`)
    }

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
        method: 'POST',
        headers: {
            Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({ To: toNumber, From: from, Body: body })
    })

    const result = await res.json().catch(() => ({}))
    if (!res.ok) {
        throw new Error(`Twilio rejected the text (HTTP ${res.status}, code ${result.code || 'n/a'}): ${result.message || JSON.stringify(result)}`)
    }
    return result.sid
}

module.exports = { sendSms, isSmsConfigured, toE164 }
