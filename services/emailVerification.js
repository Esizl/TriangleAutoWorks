/**
 * emailVerification.js
 * -----------------------------------------------------------------------
 * Emails a 6-digit code and checks it, for signup and for changing an
 * account's email. The pending step is tied to the visitor's session, so
 * the code only works in the browser that asked for it.
 *
 * Flow: start() -> visitor lands on /verify-email -> check() -> finish().
 * Routes are in routes/verify.js.
 * -----------------------------------------------------------------------
 */

const crypto = require('crypto')
const EmailVerification = require('../models/EmailVerification')
const { sendEmail, buildEmail } = require('./email')

const CODE_MINUTES = 10    // how long a code works
const RESEND_SECONDS = 60  // minimum gap between codes to one address
const MAX_ATTEMPTS = 5     // wrong codes allowed before starting over

const SESSION_KEY = 'emailVerificationId'

function hashCode(id, code) {
    return crypto.createHash('sha256').update(`${id}:${code}`).digest('hex')
}

/** An error whose message is safe to show the visitor as-is. */
function visitorError(message) {
    const err = new Error(message)
    err.userMessage = message
    return err
}

/** Generates a fresh code, stores its hash, restarts the clock and emails it. */
async function sendCode(doc) {
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0')
    doc.codeHash = hashCode(doc._id, code)
    doc.attempts = 0
    doc.lastSentAt = new Date()
    doc.expiresAt = new Date(Date.now() + CODE_MINUTES * 60 * 1000)
    await doc.save()

    const isSignup = doc.purpose === 'signup'
    const { html, text } = buildEmail({
        heading: isSignup ? 'Confirm your email' : 'Confirm your new email',
        paragraphs: [
            isSignup
                ? 'Enter this code on the Triangle Auto Works site to finish creating your account:'
                : 'Enter this code on the Triangle Auto Works site to make this the email on your account:'
        ],
        code,
        footnote: `This code works for ${CODE_MINUTES} minutes. If you didn't ask for it, you can ignore this email.`
    })
    await sendEmail({ to: doc.email, subject: `${code} is your Triangle Auto Works code`, html, text })
}

/**
 * Begins a verification: emails a code to `email` and remembers the
 * pending step in the session. Throws on failure; if the error has a
 * userMessage it can be shown to the visitor.
 */
async function start(req, { purpose, email, payload, user }) {
    const emailKey = email.trim().toLowerCase()

    // Stops this form being used to flood someone's inbox with codes.
    const justSent = await EmailVerification.findOne({
        emailKey,
        lastSentAt: { $gt: new Date(Date.now() - RESEND_SECONDS * 1000) }
    })
    if (justSent) {
        throw visitorError('We just sent a code to that address. Wait a minute before asking for another.')
    }

    const doc = new EmailVerification({ purpose, email: email.trim(), emailKey, payload, user: user || null })
    try {
        await sendCode(doc)
    } catch (err) {
        // Nothing was delivered, so don't leave a record that would
        // make the visitor wait out the resend gap.
        await EmailVerification.deleteOne({ _id: doc._id })
        throw err
    }

    req.session[SESSION_KEY] = String(doc._id)
    return doc
}

/** The session's pending verification, or null if there is none or it expired. */
async function current(req) {
    const id = req.session[SESSION_KEY]
    if (!id) return null
    const doc = await EmailVerification.findById(id)
    if (!doc || doc.expiresAt <= new Date()) return null
    return doc
}

/**
 * Checks a typed code. Returns { ok: true }, or
 * { ok: false, locked, attemptsLeft } — locked means too many wrong
 * codes and the visitor has to start over.
 */
async function check(doc, typedCode) {
    if (doc.attempts >= MAX_ATTEMPTS) return { ok: false, locked: true, attemptsLeft: 0 }

    const code = String(typedCode || '').replace(/\D/g, '')
    const expected = Buffer.from(doc.codeHash, 'hex')
    const actual = Buffer.from(hashCode(doc._id, code), 'hex')
    if (crypto.timingSafeEqual(expected, actual)) return { ok: true }

    doc.attempts += 1
    await doc.save()
    const attemptsLeft = MAX_ATTEMPTS - doc.attempts
    return { ok: false, locked: attemptsLeft <= 0, attemptsLeft }
}

/** Sends a new code. Returns 0 on success, or the seconds left to wait. */
async function resend(doc) {
    const waitMs = doc.lastSentAt.getTime() + RESEND_SECONDS * 1000 - Date.now()
    if (waitMs > 0) return Math.ceil(waitMs / 1000)
    await sendCode(doc)
    return 0
}

/** Ends a verification, whether it succeeded or was abandoned. */
async function finish(req, doc) {
    delete req.session[SESSION_KEY]
    if (doc) await EmailVerification.deleteOne({ _id: doc._id })
}

module.exports = { start, current, check, resend, finish, CODE_MINUTES }
