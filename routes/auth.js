const router = require('express').Router()
const { limitForm } = require('../config/rateLimits')
const bcrypt = require('bcryptjs')
const passport = require('passport')

const User = require('../models/User')
const verification = require('../services/emailVerification')
const { isEmailConfigured } = require('../services/email')

router.post('/signup', limitForm('signup', { fallback: '/signup' }), async (req, res) => {
    const name = String(req.body.name || '').trim()
    const email = String(req.body.email || '').trim()
    const phone = String(req.body.phone || '').trim()
    const password = String(req.body.password || '')
    const password2 = String(req.body.password2 || '')
    const errors = []

    // Sends the form back with what was typed (never the passwords).
    const showForm = () => res.status(200).render('signup', { errors, name, email, phone })

    if (!name || !email || !phone || !password || !password2) {
        errors.push({ message: 'Please fill all fields.' })
    }
    if (name.length < 3) {
        errors.push({ message: 'Name must be at least 3 characters.' })
    }
    if (email.length < 5) {
        errors.push({ message: 'Email must be at least 5 characters.' })
    }
    if (User.phoneDigits(phone).length < 10) {
        errors.push({ message: 'Phone number must have at least 10 digits.' })
    }
    if (password.length < 6) {
        errors.push({ message: 'Password must be at least 6 characters.' })
    }
    if (password !== password2) {
        errors.push({ message: 'Passwords must match.' })
    }

    if (errors.length > 0) return showForm()

    try {
        // One account per email and per phone number. Both checks ignore
        // formatting: "Me@Mail.com" = "me@mail.com", "(919) 555-0100" = "919-555-0100".
        const [emailTaken, phoneTaken] = await Promise.all([
            User.emailTaken(email),
            User.phoneTaken(phone)
        ])
        if (emailTaken) errors.push({ message: 'Email already in use.' })
        if (phoneTaken) errors.push({ message: 'Phone number already in use.' })
        if (errors.length > 0) return showForm()

        if (!isEmailConfigured()) {
            console.error('[signup] Email is not configured — set RESEND_API_KEY and EMAIL_FROM. Nobody can sign up until it is.')
            errors.push({ message: "Sign up isn't available right now. Please try again later." })
            return showForm()
        }

        // The account is NOT created yet. A 6-digit code goes to their
        // email, and routes/verify.js creates the account once they enter
        // it — so every account has an email its owner can actually read.
        await verification.start(req, {
            purpose: 'signup',
            email,
            payload: { name, email, phone, password: await bcrypt.hash(password, 10) }
        })
        res.redirect('/verify-email')
    } catch (err) {
        console.error('Signup failed:', err)
        errors.push({ message: err.userMessage || "We couldn't send your verification email. Check the address and try again." })
        showForm()
    }
})

router.post('/login', limitForm('login', { flashKey: 'error', fallback: '/login' }), async (req, res, next) => {
    passport.authenticate('local', {
        successRedirect: '/',
        failureRedirect: '/login',
        failureFlash: true
    })(req, res, next)
})

router.get('/logout', async (req, res, next) => {
    req.logout(function (err) {
        if (err) {
            return next(err);
        }
        req.flash('successMessage', 'You have been logged out.');
        res.redirect('/login');
    })
})

module.exports = router
