const router = require('express').Router()
const { ensureAuthenticated } = require('../config/ensureAuth')
const Booking = require('../models/Booking')
const Review = require('../models/Review')
const { limitForm } = require('../config/rateLimits')

// --- Order history: bookings made while logged in, plus guest bookings
// --- made with this account's phone number (see Booking.accountFilter) ---
router.get('/orders', ensureAuthenticated, async (req, res) => {
    try {
        const [bookings, reviews] = await Promise.all([
            Booking.find(Booking.accountFilter(req.user)).sort({ _id: -1 }),
            Review.find({ user: req.user._id })
        ])

        const reviewByBooking = {}
        reviews.forEach(r => { reviewByBooking[String(r.booking)] = r })

        // "Cancel or reschedule" links, only for bookings made while logged
        // in to this account and still open. Guest bookings that merely
        // share this account's phone number don't get one: a phone match
        // isn't proof enough to let someone cancel the booking.
        const manageLinks = {}
        for (const b of bookings) {
            const isOwn = b.user && String(b.user) === String(req.user._id)
            if (isOwn && Booking.OPEN_STATUSES.includes(b.status)) {
                manageLinks[String(b._id)] = `/booking/manage/${await b.ensureManageToken()}`
            }
        }

        res.render('orders', {
            bookings,
            reviewByBooking,
            manageLinks,
            maxReviewLength: Review.MAX_TEXT_LENGTH
        })
    } catch (err) {
        console.error('Error loading order history:', err)
        req.flash('errorMessage', 'Failed to load your order history.')
        res.redirect('/settings')
    }
})

// --- Leave a review on one of your own completed bookings ---
router.post('/orders/:id/review', ensureAuthenticated, limitForm('review', { fallback: '/account/orders' }), async (req, res) => {
    try {
        const rating = Number(req.body.rating)
        const text = String(req.body.text || '').trim()

        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            req.flash('errorMessage', 'Pick a star rating from 1 to 5.')
            return res.redirect('/account/orders')
        }
        if (text.length > Review.MAX_TEXT_LENGTH) {
            req.flash('errorMessage', `Reviews can be up to ${Review.MAX_TEXT_LENGTH} characters.`)
            return res.redirect('/account/orders')
        }

        // Scoped to this account's bookings, so nobody can review someone else's.
        const booking = await Booking.findOne({ _id: req.params.id, ...Booking.accountFilter(req.user) })
        if (!booking) {
            req.flash('errorMessage', 'Booking not found.')
            return res.redirect('/account/orders')
        }
        if (booking.status !== 'completed') {
            req.flash('errorMessage', 'You can review a booking once the work is completed.')
            return res.redirect('/account/orders')
        }
        if (await Review.exists({ booking: booking._id })) {
            req.flash('errorMessage', 'You already reviewed that booking.')
            return res.redirect('/account/orders')
        }

        await Review.create({
            booking: booking._id,
            user: req.user._id,
            displayName: Review.displayNameFor(req.user.name),
            category: booking.category,
            services: booking.services,
            vehicle: [booking.vehicle?.year, booking.vehicle?.make, booking.vehicle?.model].filter(Boolean).join(' '),
            rating,
            text
        })

        req.flash('successMessage', 'Thanks for the review! It will show on the site once it has been approved.')
        res.redirect('/account/orders')
    } catch (err) {
        console.error('Error saving review:', err)
        req.flash('errorMessage', 'Something went wrong saving your review.')
        res.redirect('/account/orders')
    }
})

module.exports = router
