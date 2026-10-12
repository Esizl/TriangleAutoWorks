const router = require('express').Router()
const User = require('../models/User')
const verification = require('../services/emailVerification')
const { sendEmail, buildEmail } = require('../services/email')

// Where to send someone who has to start over.
function startPage(req) {
    return req.user ? '/settings' : '/signup'
}

/** Loads the session's pending verification, or redirects with an explanation. */
async function loadPending(req, res) {
    const doc = await verification.current(req)
    if (!doc) {
        req.flash('errorMessage', 'That code has expired. Please start again.')
        res.redirect(startPage(req))
        return null
    }
    // An email change can only be completed by the account that asked for it.
    if (doc.purpose === 'email-change' && (!req.user || String(req.user._id) !== String(doc.user))) {
        await verification.finish(req, doc)
        req.flash('errorMessage', 'Please log in and try changing your email again.')
        res.redirect('/login')
        return null
    }
    return doc
}

// --- Enter the code ---
router.get('/verify-email', async (req, res) => {
    try {
        const doc = await loadPending(req, res)
        if (!doc) return
        res.render('verify-email', {
            email: doc.email,
            purpose: doc.purpose,
            minutes: verification.CODE_MINUTES,
            startPage: startPage(req)
        })
    } catch (err) {
        console.error('[verify-email] Failed to load page:', err)
        req.flash('errorMessage', 'Something went wrong. Please start again.')
        res.redirect(startPage(req))
    }
})

router.post('/verify-email', async (req, res) => {
    try {
        const doc = await loadPending(req, res)
        if (!doc) return

        const result = await verification.check(doc, req.body.code)
        if (!result.ok) {
            if (result.locked) {
                await verification.finish(req, doc)
                req.flash('errorMessage', 'Too many wrong codes. Please start again.')
                return res.redirect(startPage(req))
            }
            req.flash('errorMessage', `That code isn't right. ${result.attemptsLeft} ${result.attemptsLeft === 1 ? 'try' : 'tries'} left.`)
            return res.redirect('/verify-email')
        }

        if (doc.purpose === 'signup') {
            const account = doc.payload
            // Checked again: someone else may have taken the email or
            // phone while this code was waiting to be entered.
            if (await User.emailTaken(account.email) || await User.phoneTaken(account.phone)) {
                await verification.finish(req, doc)
                req.flash('errorMessage', 'That email or phone number was just used for another account. Please sign up again.')
                return res.redirect('/signup')
            }
            await User.create(account)
            await verification.finish(req, doc)
            req.flash('successMessage', 'Your email is confirmed and your account has been created. Log in to get started.')
            return res.redirect('/login')
        }

        // email-change
        if (await User.emailTaken(doc.email, req.user._id)) {
            await verification.finish(req, doc)
            req.flash('errorMessage', 'That email is already in use by another account.')
            return res.redirect('/settings')
        }
        const oldEmail = req.user.email
        await User.findByIdAndUpdate(req.user._id, { email: doc.email })
        await verification.finish(req, doc)

        // Heads-up to the old address, so the owner finds out if this
        // wasn't them. A failure here must not undo the change.
        try {
            const { html, text } = buildEmail({
                heading: 'Your email was changed',
                paragraphs: [
                    `The email on your Triangle Auto Works account was changed to ${doc.email}.`,
                    "If that was you, there's nothing to do. If it wasn't, call us right away so we can secure your account."
                ]
            })
            await sendEmail({ to: oldEmail, subject: 'Your Triangle Auto Works email was changed', html, text })
        } catch (err) {
            console.error('[verify-email] Could not notify the old address of an email change:', err)
        }

        req.flash('successMessage', 'Your email has been updated.')
        res.redirect('/settings')
    } catch (err) {
        console.error('[verify-email] Failed to verify code:', err)
        req.flash('errorMessage', 'Something went wrong checking that code. Please try again.')
        res.redirect('/verify-email')
    }
})

// --- Send a new code ---
router.post('/verify-email/resend', async (req, res) => {
    try {
        const doc = await loadPending(req, res)
        if (!doc) return

        const waitSeconds = await verification.resend(doc)
        if (waitSeconds > 0) {
            req.flash('errorMessage', `Please wait ${waitSeconds} more seconds before asking for another code.`)
        } else {
            req.flash('successMessage', 'A new code is on its way. The old one no longer works.')
        }
        res.redirect('/verify-email')
    } catch (err) {
        console.error('[verify-email] Failed to resend code:', err)
        req.flash('errorMessage', "We couldn't send a new code. Please try again in a moment.")
        res.redirect('/verify-email')
    }
})

module.exports = router
