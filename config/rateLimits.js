/**
 * rateLimits.js
 * -----------------------------------------------------------------------
 * Caps how often one visitor (by IP address) can hit the routes worth
 * abusing: guessing passwords or codes, mass-creating accounts, making
 * the site send email, or flooding the calendar with fake bookings.
 *
 * Counts are kept in memory, which is right for a single server. They
 * reset when the server restarts.
 *
 * Two flavours, because the site has two kinds of routes:
 *   limitForm(name)  for HTML forms — over the limit: flash a message
 *                    and send the visitor back where they came from.
 *   limitApi(name)   for fetch() calls — over the limit: HTTP 429 with
 *                    { error } JSON.
 *
 * To change a limit, edit LIMITS below: `max` requests per `minutes`.
 * -----------------------------------------------------------------------
 */

const { rateLimit } = require('express-rate-limit')

const LIMITS = {
    // Password guessing. Successful logins don't count against the limit.
    login: { max: 10, minutes: 15, skipSuccessfulRequests: true, what: 'login attempts' },
    signup: { max: 5, minutes: 60, what: 'sign-up attempts' },
    // Each of these makes the site send an email.
    passwordReset: { max: 5, minutes: 60, what: 'password reset requests' },
    resendCode: { max: 5, minutes: 15, what: 'code requests' },
    // Guessing a 6-digit code (each code also locks itself after 5 wrong tries).
    verifyCode: { max: 15, minutes: 15, what: 'code attempts' },
    settings: { max: 20, minutes: 15, what: 'account changes' },
    // Booking form.
    booking: { max: 10, minutes: 60, what: 'booking requests' },
    discount: { max: 20, minutes: 15, what: 'discount code checks' },
    vin: { max: 20, minutes: 15, what: 'VIN lookups' },
    manage: { max: 10, minutes: 15, what: 'booking changes' },
    review: { max: 10, minutes: 60, what: 'reviews' },
    passkey: { max: 20, minutes: 15, what: 'passkey attempts' }
}

function waitText(minutes) {
    return minutes >= 60 ? `${Math.round(minutes / 60)} hour${minutes >= 120 ? 's' : ''}` : `${minutes} minutes`
}

function build(name, handler) {
    const limit = LIMITS[name]
    if (!limit) throw new Error(`No rate limit named "${name}" in config/rateLimits.js`)

    const message = `Too many ${limit.what}. Please wait up to ${waitText(limit.minutes)} and try again.`
    return rateLimit({
        windowMs: limit.minutes * 60 * 1000,
        limit: limit.max,
        skipSuccessfulRequests: !!limit.skipSuccessfulRequests,
        // "Successful" means actually logged in. A wrong password answers
        // with a redirect (HTTP 302), which the library's default would
        // count as a success and never limit.
        requestWasSuccessful: req => !!(req.isAuthenticated && req.isAuthenticated()),
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (req, res) => {
            console.warn(`[rate limit] ${name}: ${req.ip} blocked on ${req.method} ${req.originalUrl}`)
            handler(req, res, message)
        }
    })
}

/** Where to send someone back to: the page the form was on, if it was one of ours. */
function backPath(req, fallback) {
    const referer = req.get('referer')
    if (referer) {
        try {
            const url = new URL(referer)
            if (url.host === req.get('host')) return url.pathname + url.search
        } catch (err) {
            // not a URL — fall through
        }
    }
    return fallback
}

/**
 * options.flashKey  which flash list the page shows errors from
 *                   ('errorMessage' everywhere except the login page, which shows 'error')
 * options.fallback  where to go if the browser didn't say which page the form was on
 */
function limitForm(name, options = {}) {
    const flashKey = options.flashKey || 'errorMessage'
    const fallback = options.fallback || '/login'
    return build(name, (req, res, message) => {
        req.flash(flashKey, message)
        res.redirect(backPath(req, fallback))
    })
}

function limitApi(name) {
    return build(name, (req, res, message) => {
        res.status(429).json({ error: message, message })
    })
}

module.exports = { limitForm, limitApi, LIMITS }
