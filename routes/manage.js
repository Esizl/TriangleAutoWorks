/**
 * routes/manage.js — mounted at /booking/manage
 * -----------------------------------------------------------------------
 * Lets a customer look at, cancel or reschedule ONE booking through the
 * private link in their confirmation email (/booking/manage/<token>).
 * No login: the long random token in the link is the key, which is how
 * guests (who have no account) can manage their booking too. Logged-in
 * customers reach the same page from Account > Order History.
 *
 * The rules:
 *  - Changes are allowed while the booking is new, contacted or
 *    confirmed, and the appointment is more than CHANGE_CUTOFF_HOURS
 *    away. Inside that window the page says to call instead.
 *  - Rescheduling re-checks the calendar (services/scheduling.js) and
 *    puts a confirmed booking back to "new", because the new time has
 *    not been agreed yet.
 *  - Every change is recorded on the booking and emailed to the owner.
 * -----------------------------------------------------------------------
 */

const router = require('express').Router()
const Booking = require('../models/Booking')
const scheduling = require('../services/scheduling')
const bookingEmails = require('../services/bookingEmails')
const { limitForm } = require('../config/rateLimits')

const CHANGE_CUTOFF_HOURS = 24

const STATUS_LABELS = {
    new: 'Request received',
    contacted: 'In contact',
    confirmed: 'Confirmed',
    completed: 'Completed',
    cancelled: 'Cancelled'
}

/**
 * Hours from now until the appointment's window opens, in the
 * business's time zone. Flexible bookings count from 8 AM.
 */
function hoursUntil(booking) {
    const window = scheduling.WINDOWS.find(w => w.value === booking.preferredTime)
    const startHour = window ? window.start : scheduling.WINDOWS[0].start

    // "Now" as wall-clock time in New York, read back as if it were UTC,
    // so it can be compared with the appointment's wall-clock time.
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York', hourCycle: 'h23',
            year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric'
        }).formatToParts(new Date()).map(p => [p.type, Number(p.value)])
    )
    const nowLocal = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute)

    const [y, m, d] = String(booking.preferredDate).split('-').map(Number)
    const apptLocal = Date.UTC(y, m - 1, d, startHour)

    return (apptLocal - nowLocal) / (60 * 60 * 1000)
}

/** { allowed: true } or { allowed: false, reason } — reason is shown to the customer. */
function changeRules(booking) {
    if (!Booking.OPEN_STATUSES.includes(booking.status)) {
        return { allowed: false, reason: `This booking is ${STATUS_LABELS[booking.status].toLowerCase()}, so it can no longer be changed here.` }
    }
    if (hoursUntil(booking) < CHANGE_CUTOFF_HOURS) {
        return { allowed: false, reason: `Your appointment is less than ${CHANGE_CUTOFF_HOURS} hours away, so changes need a call or text: 732-647-8703.` }
    }
    return { allowed: true }
}

// A wrong or expired link gets the same plain page whatever was wrong
// with it, so links can't be probed for information.
async function loadBooking(req, res, next) {
    try {
        const token = String(req.params.token || '')
        const booking = /^[a-f0-9]{48}$/.test(token) ? await Booking.findOne({ manageToken: token }) : null
        if (!booking) {
            return res.status(404).render('manage-booking', { booking: null })
        }
        req.booking = booking
        next()
    } catch (err) {
        next(err)
    }
}

function managePath(booking) {
    return `/booking/manage/${booking.manageToken}`
}

router.get('/:token', loadBooking, (req, res) => {
    const booking = req.booking
    res.render('manage-booking', {
        booking,
        rules: changeRules(booking),
        statusLabel: STATUS_LABELS[booking.status] || booking.status,
        windows: scheduling.ALL_WINDOW_VALUES,
        jobHours: scheduling.bookingHours(booking),
        isDropOff: booking.locationType === scheduling.DROP_OFF,
        today: scheduling.todayYmd(),
        formatDate: bookingEmails.formatDate,
        vehicleName: bookingEmails.vehicleName(booking)
    })
})

router.post('/:token/cancel', limitForm('manage'), loadBooking, async (req, res) => {
    const booking = req.booking
    try {
        const rules = changeRules(booking)
        if (!rules.allowed) {
            req.flash('errorMessage', rules.reason)
            return res.redirect(managePath(booking))
        }

        booking.status = 'cancelled'
        booking.customerChanges.push({ action: 'cancelled', detail: 'Cancelled by the customer.' })
        await booking.save()

        bookingEmails.sendCustomerCancelled(booking, req)

        req.flash('successMessage', 'Your booking is cancelled.')
        res.redirect(managePath(booking))
    } catch (err) {
        console.error(`Failed to cancel booking ${booking._id}:`, err)
        req.flash('errorMessage', 'Something went wrong cancelling your booking. Please call or text 732-647-8703.')
        res.redirect(managePath(booking))
    }
})

router.post('/:token/reschedule', limitForm('manage'), loadBooking, async (req, res) => {
    const booking = req.booking
    try {
        const rules = changeRules(booking)
        if (!rules.allowed) {
            req.flash('errorMessage', rules.reason)
            return res.redirect(managePath(booking))
        }

        const date = String(req.body.preferredDate || '')
        const time = String(req.body.preferredTime || '')

        if (date === booking.preferredDate && time === booking.preferredTime) {
            req.flash('errorMessage', 'That is the time you already have.')
            return res.redirect(managePath(booking))
        }

        // Its own current slot doesn't count against it.
        const slot = await scheduling.checkSlot(date, time, scheduling.bookingHours(booking), {
            excludeId: booking._id,
            dropOff: booking.locationType === scheduling.DROP_OFF
        })
        if (!slot.ok) {
            req.flash('errorMessage', slot.message)
            return res.redirect(managePath(booking))
        }

        const previous = { date: booking.preferredDate, time: booking.preferredTime }
        const wasConfirmed = booking.status === 'confirmed'

        booking.preferredDate = date
        booking.preferredTime = time
        // The new time hasn't been agreed yet.
        if (wasConfirmed) booking.status = 'new'
        booking.customerChanges.push({
            action: 'rescheduled',
            detail: `Rescheduled by the customer from ${previous.date} (${previous.time}) to ${date} (${time}).` +
                (wasConfirmed ? ' Was confirmed — needs confirming again.' : '')
        })
        await booking.save()

        bookingEmails.sendCustomerRescheduled(booking, previous, req)

        req.flash('successMessage', 'Your new time is requested. We will confirm it with you shortly.')
        res.redirect(managePath(booking))
    } catch (err) {
        console.error(`Failed to reschedule booking ${booking._id}:`, err)
        req.flash('errorMessage', 'Something went wrong changing your booking. Please call or text 732-647-8703.')
        res.redirect(managePath(booking))
    }
})

module.exports = router
