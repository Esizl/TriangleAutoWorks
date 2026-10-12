const router = require('express').Router()
const { limitForm } = require('../config/rateLimits')
const crypto = require('crypto')
const bcrypt = require('bcryptjs')
const User = require('../models/User')
const { sendEmail, buildEmail, isEmailConfigured, appUrl } = require('../services/email')

const RESET_LINK_MINUTES = 60      // how long an emailed link works
const RESEND_COOLDOWN_SECONDS = 120 // minimum gap between reset emails to one account
const MIN_PASSWORD_LENGTH = 6      // same rule as signup

// Shown whether or not the email belongs to an account, so this form
// can't be used to find out who has one.
const SENT_MESSAGE = `If an account exists for that email, a reset link is on its way. It works for ${RESET_LINK_MINUTES} minutes.`

// Only a hash of the token is stored: a leaked database can't be used
// to reset anyone's password.
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex')
}

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The account a reset link belongs to, or null if the link is malformed, used or expired. */
async function findUserByResetToken(token) {
    if (!/^[a-f0-9]{64}$/.test(token || '')) return null
    return User.findOne({
        resetTokenHash: hashToken(token),
        resetTokenExpires: { $gt: new Date() }
    })
}

// --- Forgot password: ask for the account email ---
router.get('/forgot-password', (req, res) => {
    res.render('forgot-password')
})

router.post('/forgot-password', limitForm('passwordReset', { fallback: '/forgot-password' }), async (req, res) => {
    const email = String(req.body.email || '').trim()

    if (!email) {
        req.flash('errorMessage', 'Enter the email you signed up with.')
        return res.redirect('/forgot-password')
    }

    // Checked before looking anyone up, so this message says nothing
    // about whether the email has an account.
    if (!isEmailConfigured()) {
        console.error('[password reset] Email is not configured — set RESEND_API_KEY and EMAIL_FROM.')
        req.flash('errorMessage', "Password reset by email isn't available right now. Call or text us at 732-647-8703 and we'll sort it out.")
        return res.redirect('/forgot-password')
    }

    try {
        // Signup stores the email exactly as typed, so match it without regard to case.
        const user = await User.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, 'i') })

        const cooldownEnds = user && user.resetRequestedAt
            ? user.resetRequestedAt.getTime() + RESEND_COOLDOWN_SECONDS * 1000
            : 0

        if (user && Date.now() >= cooldownEnds) {
            const token = crypto.randomBytes(32).toString('hex')
            user.resetTokenHash = hashToken(token)
            user.resetTokenExpires = new Date(Date.now() + RESET_LINK_MINUTES * 60 * 1000)
            user.resetRequestedAt = new Date()
            await user.save()

            const { html, text } = buildEmail({
                heading: 'Reset your password',
                paragraphs: [
                    `Hi ${user.name.split(' ')[0]},`,
                    'We got a request to reset the password for your Triangle Auto Works account. Use the button below to choose a new one.'
                ],
                button: { label: 'Reset Password', url: `${appUrl(req)}/reset-password/${token}` },
                footnote: `This link works for ${RESET_LINK_MINUTES} minutes and can be used once. If you didn't ask for this, you can ignore this email — your password stays the same.`
            })
            await sendEmail({ to: user.email, subject: 'Reset your Triangle Auto Works password', html, text })
        }
    } catch (err) {
        // Logged with the real cause; the visitor still gets the neutral
        // message so a failure doesn't reveal that the account exists.
        console.error('[password reset] Failed to send reset email:', err)
    }

    req.flash('successMessage', SENT_MESSAGE)
    res.redirect('/forgot-password')
})

// --- Reset password: the link from the email ---
router.get('/reset-password/:token', async (req, res) => {
    try {
        const user = await findUserByResetToken(req.params.token)
        if (!user) {
            req.flash('errorMessage', 'That reset link is invalid or has expired. Request a new one below.')
            return res.redirect('/forgot-password')
        }
        res.render('reset-password', { token: req.params.token, minPasswordLength: MIN_PASSWORD_LENGTH })
    } catch (err) {
        console.error('[password reset] Failed to load reset page:', err)
        req.flash('errorMessage', 'Something went wrong. Please request a new reset link.')
        res.redirect('/forgot-password')
    }
})

router.post('/reset-password/:token', limitForm('passwordReset', { fallback: '/forgot-password' }), async (req, res) => {
    const { password, password2 } = req.body
    const backToForm = `/reset-password/${encodeURIComponent(req.params.token)}`

    try {
        const user = await findUserByResetToken(req.params.token)
        if (!user) {
            req.flash('errorMessage', 'That reset link is invalid or has expired. Request a new one below.')
            return res.redirect('/forgot-password')
        }

        if (!password || password.length < MIN_PASSWORD_LENGTH) {
            req.flash('errorMessage', `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
            return res.redirect(backToForm)
        }
        if (password !== password2) {
            req.flash('errorMessage', 'Passwords must match.')
            return res.redirect(backToForm)
        }

        user.password = await bcrypt.hash(password, 10)
        // One use only: the link dies the moment the password changes.
        user.resetTokenHash = null
        user.resetTokenExpires = null
        await user.save()

        req.flash('successMessage', 'Your password has been reset. Log in with your new password.')
        res.redirect('/login')
    } catch (err) {
        console.error('[password reset] Failed to reset password:', err)
        req.flash('errorMessage', 'Something went wrong resetting your password. Please try again.')
        res.redirect(backToForm)
    }
})

module.exports = router
