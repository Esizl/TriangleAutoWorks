const router = require('express').Router()
const bcrypt = require('bcryptjs')
const passport = require('passport')

const User = require('../models/User')

router.post('/signup', async (req, res) => {
    const { name, email, phone, password, password2 } = req.body
    let errors = []

    if (!name || !email || !phone || !password || !password2) {
        errors.push({ message: 'Please fill all fields.' })
    }

    if (name.length < 3) {
        errors.push({ message: 'Name must be at least 3 characters.' })
    }

    if (email.length < 5) {
        errors.push({ message: 'Email must be at least 5 characters.' })
    }

    if (phone.length < 10) {
        errors.push({ message: 'Phone number must be at least 10 characters.' })
    }

    if (password.length < 6) {
        errors.push({ message: 'Password must be at least 6 characters.' })
    }

    if (password != password2) {
        errors.push({ message: 'Passwords must match.' })
    }

    console.log(req.body)

    if (errors.length > 0) {
        res.status(200).render('signup', { errors, name, email, password, password2 })
    } else {
        User.findOne({ email: email })
            .then(user => {
                if (user) {
                    errors.push({ message: 'Email already in use.' })
                    res.status(200).render('signup', { errors, name, email, phone, password, password2 })
                } else {
                    const newUser = new User({
                        name,
                        email,
                        phone,
                        password,
                        password2
                    })

                    bcrypt.genSalt(10, (err, salt) => {
                        bcrypt.hash(newUser.password, salt, (err, hash) => {
                            if (err) throw err;

                            newUser.password = hash
                            newUser.save()
                                .then(user => {
                                    req.flash('successMessage', 'Your account has been created')
                                    console.log('Account Created')
                                    res.status(200).redirect('/login')
                                })
                                .catch(err => console.log(err))
                        })
                    })
                }
            })
    }
})

router.post('/login', async (req, res, next) => {
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

// LEDGER
router.post('/validatePin', (req, res) => {
    const { pin } = req.body;
    console.log("ESP32 sent PIN:", pin);

    if (pin === "2107") {
        res.json({ success: true, message: "PIN accepted" });
    } else {
        res.json({ success: false, message: "Invalid PIN" });
    }
})


module.exports = router