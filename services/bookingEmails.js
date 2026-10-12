/**
 * bookingEmails.js
 * -----------------------------------------------------------------------
 * Every email about a booking:
 *
 *   To the customer (only if they gave an email address)
 *     - request received      when they submit the booking form
 *     - appointment confirmed when you mark it Confirmed
 *     - booking cancelled     when you mark it Cancelled
 *     - cancelled / rescheduled confirmations for changes they make
 *
 *   To you
 *     - new booking alert
 *     - customer cancelled / rescheduled alert
 *
 * Who "you" is: the addresses in BOOKING_NOTIFY_EMAIL (comma-separated)
 * if that is set, otherwise every owner account (role 3).
 *
 * Emails are a side effect, never a reason to fail the request: each
 * function below catches its own errors and logs them loudly with the
 * booking id, so a Resend outage can't stop a booking being saved.
 * -----------------------------------------------------------------------
 */

const User = require('../models/User')
const { sendEmail, buildEmail, isEmailConfigured, appUrl } = require('./email')

function vehicleName(booking) {
    const v = booking.vehicle || {}
    return [v.year, v.make, v.model].filter(Boolean).join(' ') || (v.vin ? `VIN ${v.vin}` : '')
}

function formatDate(ymd) {
    const d = new Date(ymd + 'T12:00:00Z')
    return isNaN(d) ? ymd : d.toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC'
    })
}

function formatTotal(booking) {
    const pricing = booking.pricing
    if (!pricing || typeof pricing.total !== 'number') return 'We will quote this directly'
    const flags = booking.flags || {}
    if (pricing.total === 0 && (flags.hasQuoteItems || !(booking.labor || []).length)) return 'We will quote this directly'
    const open = flags.isStartingPrice || flags.hasQuoteItems
    return `${open ? 'From ' : ''}$${pricing.total.toFixed(2)} (estimate, tax included)`
}

/** The summary table shared by every booking email. */
function summaryRows(booking, { forOwner } = {}) {
    const contact = booking.contact || {}
    const rows = [
        ['Services', (booking.services || []).join('\n')],
        ['Vehicle', vehicleName(booking)],
        ['Date', formatDate(booking.preferredDate)],
        ['Time window', booking.preferredTime],
        booking.locationType === 'Drop-off'
            ? ['Bring it to', String(booking.serviceAddress).replace(/^Drop-off at /, '')]
            : ['Location', booking.serviceAddress],
        ['Estimate', formatTotal(booking)]
    ]
    if (booking.discount && booking.discount.code) {
        rows.push(['Discount', `${booking.discount.code} — ${booking.discount.label}`])
    }
    if (forOwner) {
        rows.unshift(
            ['Customer', `${contact.firstName || ''} ${contact.lastName || ''}`.trim()],
            ['Phone', contact.phone],
            ['Email', contact.email]
        )
        const hours = booking.pricing && booking.pricing.estimatedHours
        if (hours) rows.push(['Work time', `About ${Math.round(hours * 2) / 2} hrs`])
        rows.push(['Customer notes', booking.notes])
    }
    return rows
}

function manageUrl(booking, req) {
    return `${appUrl(req)}/booking/manage/${booking.manageToken}`
}

async function ownerAddresses() {
    const configured = (process.env.BOOKING_NOTIFY_EMAIL || '')
        .split(',').map(s => s.trim()).filter(Boolean)
    if (configured.length) return configured
    const owners = await User.find({ role: { $gte: 3 } }).select('email')
    return owners.map(o => o.email).filter(Boolean)
}

/** Runs one send and turns any failure into a loud log line instead of a thrown error. */
async function deliver(what, booking, build) {
    if (!isEmailConfigured()) {
        console.error(`[booking email] ${what} for booking ${booking._id} NOT sent: email is not configured (RESEND_API_KEY / EMAIL_FROM).`)
        return false
    }
    try {
        const message = await build()
        if (!message) return false
        await sendEmail(message)
        return true
    } catch (err) {
        console.error(`[booking email] ${what} for booking ${booking._id} FAILED:`, err.message)
        return false
    }
}

function toCustomer(what, booking, req, { subject, heading, paragraphs, footnote, withManageLink = true }) {
    const to = booking.contact && booking.contact.email
    if (!to) return Promise.resolve(false) // no address given — nothing to send
    return deliver(what, booking, () => ({
        to,
        subject,
        ...buildEmail({
            heading,
            paragraphs,
            rows: summaryRows(booking),
            button: withManageLink ? { label: 'View or change booking', url: manageUrl(booking, req) } : undefined,
            footnote
        })
    }))
}

function toOwner(what, booking, req, { subject, heading, paragraphs }) {
    return deliver(what, booking, async () => {
        const to = await ownerAddresses()
        if (to.length === 0) {
            throw new Error('no owner address: set BOOKING_NOTIFY_EMAIL or give an account the owner role')
        }
        return {
            to,
            subject,
            ...buildEmail({
                heading,
                paragraphs,
                rows: summaryRows(booking, { forOwner: true }),
                button: { label: 'Open in admin', url: `${appUrl(req)}/admin/bookings/${booking._id}` }
            })
        }
    })
}

// ── On submit ──

function sendBookingReceived(booking, req) {
    const first = (booking.contact && booking.contact.firstName) || 'there'
    return Promise.all([
        toCustomer('request-received', booking, req, {
            subject: 'We got your booking request — Triangle Auto Works',
            heading: 'Booking request received',
            paragraphs: [
                `Hi ${first}, thanks for booking with Triangle Auto Works.`,
                'This is a request, not a confirmed appointment yet. We will text or call you shortly to confirm the time, and you will get another email once it is locked in.'
            ],
            footnote: 'Need to change something? Use the button above, or call or text 732-647-8703.'
        }),
        toOwner('new-booking alert', booking, req, {
            subject: `New booking: ${(booking.services || []).join(', ')} — ${formatDate(booking.preferredDate)}`,
            heading: 'New booking request',
            paragraphs: ['A new booking came in through the website. It is waiting for you to confirm.']
        })
    ])
}

// ── When you change the status in the admin panel ──

function sendStatusChange(booking, status, req) {
    const first = (booking.contact && booking.contact.firstName) || 'there'
    if (status === 'confirmed') {
        return toCustomer('confirmed', booking, req, {
            subject: 'Your appointment is confirmed — Triangle Auto Works',
            heading: 'Appointment confirmed',
            paragraphs: [
                booking.locationType === 'Drop-off'
                    ? `Hi ${first}, your appointment is confirmed. Bring the vehicle to the address below at the start of your time window.`
                    : `Hi ${first}, your appointment is confirmed. We come to you — just have the vehicle accessible at the address below.`
            ],
            footnote: 'Plans changed? You can cancel or reschedule with the button above up to 24 hours before your appointment. After that, call or text 732-647-8703.'
        })
    }
    if (status === 'cancelled') {
        return toCustomer('cancelled-by-shop', booking, req, {
            subject: 'Your booking was cancelled — Triangle Auto Works',
            heading: 'Booking cancelled',
            paragraphs: [
                `Hi ${first}, your booking below has been cancelled. If you were not expecting this, call or text 732-647-8703 and we will sort it out.`
            ],
            withManageLink: false
        })
    }
    return Promise.resolve(false) // other statuses don't email anyone
}

// ── When the customer changes their own booking ──

function sendCustomerCancelled(booking, req) {
    return Promise.all([
        toCustomer('cancel confirmation', booking, req, {
            subject: 'Your booking is cancelled — Triangle Auto Works',
            heading: 'Booking cancelled',
            paragraphs: ['Your booking below is cancelled. Nothing else is needed from you. You are welcome to book again any time.'],
            withManageLink: false
        }),
        toOwner('customer-cancelled alert', booking, req, {
            subject: `Cancelled by customer: ${(booking.services || []).join(', ')} — ${formatDate(booking.preferredDate)}`,
            heading: 'Customer cancelled a booking',
            paragraphs: ['The customer cancelled this booking themselves from their manage link. Its time window is open again.']
        })
    ])
}

function sendCustomerRescheduled(booking, previous, req) {
    const was = `${formatDate(previous.date)}, ${previous.time}`
    return Promise.all([
        toCustomer('reschedule confirmation', booking, req, {
            subject: 'Your new time is requested — Triangle Auto Works',
            heading: 'Reschedule requested',
            paragraphs: [
                `Your booking was moved from ${was} to the time below.`,
                'We will confirm the new time with you shortly.'
            ]
        }),
        toOwner('customer-rescheduled alert', booking, req, {
            subject: `Rescheduled by customer: ${(booking.services || []).join(', ')} — now ${formatDate(booking.preferredDate)}`,
            heading: 'Customer rescheduled a booking',
            paragraphs: [
                `The customer moved this booking themselves. It was ${was}.`,
                'It is back to "new" so the new time needs confirming.'
            ]
        })
    ])
}

module.exports = {
    sendBookingReceived,
    sendStatusChange,
    sendCustomerCancelled,
    sendCustomerRescheduled,
    formatDate,
    vehicleName
}
