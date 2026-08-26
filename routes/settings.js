const router = require('express').Router()
const bcrypt = require('bcryptjs')
const { ensureAuthenticated } = require('../config/ensureAuth')
const User = require('../models/User')

// --- Settings page ---
router.get('/', ensureAuthenticated, async (req, res) => {
    res.render('settings', { user: req.user })
})

// --- Update profile (name / email / phone) ---
router.post('/profile', ensureAuthenticated, async (req, res) => {
    const { name, email, phone } = req.body
    const errors = []

    if (!name || name.trim().length < 3) {
        errors.push({ message: 'Name must be at least 3 characters.' })
    }
    if (!email || email.trim().length < 5) {
        errors.push({ message: 'Email must be at least 5 characters.' })
    }
    if (!phone || phone.trim().length < 10) {
        errors.push({ message: 'Phone number must be at least 10 characters.' })
    }

    if (errors.length > 0) {
        errors.forEach(e => req.flash('errorMessage', e.message))
        return res.redirect('/settings')
    }

    try {
        // The User schema has no unique index on email, so a collision
        // has to be checked for manually here — otherwise two accounts
        // could silently end up sharing an email and login would only
        // ever resolve to whichever one User.findOne() returns first.
        const existing = await User.findOne({ email: email.trim() })
        if (existing && String(existing._id) !== String(req.user._id)) {
            req.flash('errorMessage', 'That email is already in use by another account.')
            return res.redirect('/settings')
        }

        await User.findByIdAndUpdate(req.user._id, {
            name: name.trim(),
            email: email.trim(),
            phone: phone.trim()
        })

        req.flash('successMessage', 'Profile updated.')
        res.redirect('/settings')
    } catch (err) {
        console.error('Error updating profile:', err)
        req.flash('errorMessage', 'Something went wrong updating your profile.')
        res.redirect('/settings')
    }
})

// --- Change password ---
router.post('/password', ensureAuthenticated, async (req, res) => {
    const { currentPassword, newPassword, newPassword2 } = req.body
    const errors = []

    if (!currentPassword || !newPassword || !newPassword2) {
        errors.push({ message: 'Please fill all password fields.' })
    }
    if (newPassword && newPassword.length < 6) {
        errors.push({ message: 'New password must be at least 6 characters.' })
    }
    if (newPassword !== newPassword2) {
        errors.push({ message: 'New passwords must match.' })
    }

    if (errors.length > 0) {
        errors.forEach(e => req.flash('errorMessage', e.message))
        return res.redirect('/settings')
    }

    try {
        const user = await User.findById(req.user._id)

        bcrypt.compare(currentPassword, user.password, async (err, isMatch) => {
            if (err) {
                console.error('Error comparing password:', err)
                req.flash('errorMessage', 'Something went wrong. Please try again.')
                return res.redirect('/settings')
            }

            if (!isMatch) {
                req.flash('errorMessage', 'Current password is incorrect.')
                return res.redirect('/settings')
            }

            bcrypt.genSalt(10, (err, salt) => {
                if (err) throw err
                bcrypt.hash(newPassword, salt, async (err, hash) => {
                    if (err) throw err

                    user.password = hash
                    await user.save()

                    req.flash('successMessage', 'Password updated.')
                    res.redirect('/settings')
                })
            })
        })
    } catch (err) {
        console.error('Error changing password:', err)
        req.flash('errorMessage', 'Something went wrong changing your password.')
        res.redirect('/settings')
    }
})

module.exports = router