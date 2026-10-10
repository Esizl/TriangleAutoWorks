/**
 * email.js
 * -----------------------------------------------------------------------
 * The one place the app sends email from. Uses Resend's REST API
 * (https://resend.com/docs/api-reference/emails/send-email) through
 * Node's built-in fetch, so there is no extra package to install.
 *
 * Settings — an environment variable wins over config/config.json:
 *   RESEND_API_KEY  or  config.email.resendApiKey   Resend API key (re_...)
 *   EMAIL_FROM      or  config.email.from           e.g. "Triangle Auto Works <no-reply@triangleautowork.com>"
 *                                                   (the domain must be verified in Resend)
 *   APP_URL         or  config.email.appUrl         e.g. "https://triangleautowork.com" — used to build
 *                                                   links inside emails
 *
 * Loud-failure rule: a missing setting or a rejected send THROWS with
 * the real reason. Callers decide what the customer sees.
 * -----------------------------------------------------------------------
 */

const emailConfig = require('../config/config.json').email || {}

function setting(envName, configKey) {
    return process.env[envName] || emailConfig[configKey] || ''
}

function isEmailConfigured() {
    return !!(setting('RESEND_API_KEY', 'resendApiKey') && setting('EMAIL_FROM', 'from'))
}

/**
 * Base URL for links in emails, no trailing slash. Prefers the
 * configured URL; falling back to the request's own host is fine for
 * local dev but set APP_URL in production so links never depend on a
 * request header.
 */
function appUrl(req) {
    const configured = setting('APP_URL', 'appUrl')
    return (configured || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '')
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ))
}

/**
 * Shared branded layout so every email looks the same.
 * paragraphs: plain-text strings (escaped here). button: { label, url }.
 * Returns { html, text } ready for sendEmail().
 */
function buildEmail({ heading, paragraphs, button, footnote }) {
    const body = paragraphs
        .map(p => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;">${escapeHtml(p)}</p>`)
        .join('')
    const buttonHtml = button
        ? `<p style="margin:24px 0;"><a href="${escapeHtml(button.url)}" style="display:inline-block;background:#C8102E;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;letter-spacing:1px;text-transform:uppercase;padding:14px 28px;border-radius:2px;">${escapeHtml(button.label)}</a></p>
           <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#666666;">Or paste this link into your browser:<br><a href="${escapeHtml(button.url)}" style="color:#C8102E;word-break:break-all;">${escapeHtml(button.url)}</a></p>`
        : ''
    const footnoteHtml = footnote
        ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#666666;">${escapeHtml(footnote)}</p>`
        : ''

    const html = `<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:24px 12px;background:#f2f2f2;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-top:4px solid #C8102E;">
    <div style="padding:28px 28px 8px;">
      <div style="font-size:13px;font-weight:bold;letter-spacing:2px;text-transform:uppercase;color:#C8102E;">Triangle Auto Works</div>
      <h1 style="margin:10px 0 20px;font-size:24px;line-height:1.2;color:#111111;">${escapeHtml(heading)}</h1>
      ${body}
      ${buttonHtml}
      ${footnoteHtml}
    </div>
    <div style="padding:16px 28px 24px;font-size:12px;color:#999999;">Triangle Auto Works · 732-647-8703</div>
  </div>
</body>
</html>`

    const text = [
        heading,
        '',
        ...paragraphs,
        ...(button ? ['', `${button.label}: ${button.url}`] : []),
        ...(footnote ? ['', footnote] : []),
        '',
        'Triangle Auto Works · 732-647-8703'
    ].join('\n')

    return { html, text }
}

/** Sends one email. Resolves with Resend's email id; throws with the real reason on any failure. */
async function sendEmail({ to, subject, html, text }) {
    const apiKey = setting('RESEND_API_KEY', 'resendApiKey')
    const from = setting('EMAIL_FROM', 'from')
    if (!apiKey || !from) {
        throw new Error('Email is not configured: set RESEND_API_KEY and EMAIL_FROM (or email.resendApiKey / email.from in config/config.json).')
    }

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ from, to, subject, html, text })
    })

    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
        throw new Error(`Resend rejected the email (HTTP ${res.status}): ${body.message || JSON.stringify(body)}`)
    }
    return body.id
}

module.exports = { sendEmail, buildEmail, isEmailConfigured, appUrl }
