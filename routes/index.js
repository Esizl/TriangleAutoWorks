const router = require('express').Router()
const { ensureAuthenticated } = require('../config/ensureAuth')
const User = require('../models/User')
const axios = require('axios')

// --- Home route ---
router.get('/', async (req, res) => {
    res.render('index')
})

router.get('/booking', async (req, res) => {
    res.render('booking')
})

router.get('/login', (req, res) => {
    res.render('login.ejs')
})

router.get('/signup', (req, res) => {
    res.render('signup.ejs')
})

// Profile Actions

router.post('/updateProfile', ensureAuthenticated, async (req, res) => {
    try {
        const { name, email } = req.body;

        if (!name || !email) {
            return res.status(400).send('Name and email are required');
        }

        await User.findByIdAndUpdate(req.user._id, { name, email });
        req.user.name = name;
        req.user.email = email;

        res.redirect('/settings');
    } catch (err) {
        console.error(err);
        res.status(500).send('Server error');
    }
});

router.post('/changePassword', ensureAuthenticated, async (req, res) => {
    let errors = [];

    try {
        const { currentPassword, newPassword, confirmPassword } = req.body;

        if (!currentPassword || !newPassword || !confirmPassword) {
            errors.push({ message: 'All fields are required' });
        }

        if (newPassword !== confirmPassword) {
            errors.push({ message: 'New password and confirmation do not match' });
        }

        const user = await User.findById(req.user._id);
        if (!user) {
            errors.push({ message: 'User not found' });
        } else {
            const isMatch = await bcrypt.compare(currentPassword, user.password);
            if (!isMatch) {
                errors.push({ message: 'Current password is incorrect' });
            }
        }

        if (errors.length > 0) {
            return res.status(400).render('settings', { errors, user: req.user });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        user.password = hashedPassword;
        await user.save();

        req.logout(err => {
            if (err) {
                console.error(err);
                return res.status(500).send('Logout error');
            }
            req.flash('successMessage', 'Password changed successfully');
            return res.redirect('/login');
        });

    } catch (err) {
        console.error(err);
        return res.status(500).send('Server error');
    }
});

module.exports = router;