const router = require('express').Router()
const { ensureAdmin } = require('../config/ensureAuth')
const Booking = require('../models/Booking')
const { loadVehicleData } = require('../vehicleDataStore')
const VehicleSpec = require('../models/VehicleSpec')
const DiscountCode = require('../models/DiscountCode')
const { priceBooking, knownServiceNames } = require('../services/priceEngine')
const scheduling = require('../services/scheduling')
const bookingEmails = require('../services/bookingEmails')
const { limitApi } = require('../config/rateLimits')
const BusinessConfig = require('../models/BusinessConfig')
const { isTrustedCustomer } = require('../services/trust')

// What a discount PREVIEW needs from a booking-in-progress (the Review
// step's "Apply" button). The subtotal here is the browser's own figure,
// which is fine for a preview: when the booking is submitted the code is
// checked again against the server's price. subtotal is null when
// nothing is priced online — the code is then applied to the quote.
function discountContext(b) {
    const subtotal = (b.pricing && typeof b.pricing.subtotal === 'number') ? b.pricing.subtotal : null
    return {
        category: b.category,
        subtotal,
        firstTimeCustomer: !!b.firstTimeCustomer,
        phone: b.contact?.phone
    }
}

// --- Public: check a discount code from the booking form's Review step ---
// Read-only: a use is only claimed when the booking is actually submitted.
router.post('/discount/validate', limitApi('discount'), async (req, res) => {
    try {
        const b = req.body || {}
        const ctx = discountContext(b)
        const result = await DiscountCode.check(b.code, ctx)
        if (!result.ok) return res.json({ valid: false, message: result.message })
        res.json({ valid: true, discount: result.doc.toPublic() })
    } catch (err) {
        console.error('Discount validate failed:', err)
        res.status(500).json({ valid: false, message: 'Could not check that code right now. Please try again.' })
    }
})

/** "CR-V" / "Cr-V" / "crv" all compare equal. */
function looseKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * NHTSA spells makes and models its own way ("BMW" arrives fine, but the
 * form used to re-case it to "Bmw", and "CR-V" to "Cr-V"), which then
 * missed the saved specs and size class for that vehicle. Match what
 * NHTSA returned against the site's own vehicle list and hand back the
 * site's spelling. inVehicleList says whether both were found.
 */
function matchToVehicleList(make, model) {
    const { VEHICLE_DATA } = loadVehicleData()
    const makeName = Object.keys(VEHICLE_DATA).find(m => looseKey(m) === looseKey(make))
    if (!makeName) return { make, model, inVehicleList: false }
    const modelName = Object.keys(VEHICLE_DATA[makeName]).find(m => looseKey(m) === looseKey(model))
    return { make: makeName, model: modelName || model, inVehicleList: !!modelName }
}

// --- VIN decode (NHTSA) ---
router.get('/vin/:vin', limitApi('vin'), async (req, res) => {
    try {
        const vin = String(req.params.vin).toUpperCase()

        // 17 characters, no I, O or Q — anything else never reaches NHTSA.
        if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
            return res.status(400).json({ error: 'That is not a valid 17-character VIN.' })
        }

        const response = await fetch(
            `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`
        )
        if (!response.ok) {
            throw new Error(`NHTSA answered HTTP ${response.status}`)
        }

        const data = await response.json()
        const vehicle = data.Results?.[0]

        if (!vehicle || !vehicle.Make) {
            return res.status(404).json({ error: 'VIN not found' })
        }

        const matched = matchToVehicleList(vehicle.Make, vehicle.Model)

        res.json({
            vin,
            year: vehicle.ModelYear,
            make: matched.make,
            model: matched.model,
            inVehicleList: matched.inVehicleList,
            trim: vehicle.Trim,
            engine: vehicle.DisplacementL
                ? `${vehicle.DisplacementL}L ${vehicle.EngineCylinders || ''} cyl`
                : '',
            bodyClass: vehicle.BodyClass,
            vehicleType: vehicle.VehicleType
        })
    } catch (err) {
        console.error('VIN lookup failed:', err)
        res.status(500).json({ error: 'VIN lookup failed' })
    }
})

// The fields a customer types, trimmed and capped so nobody can store a
// novel in a booking.
function cleanText(value, max) {
    return String(value == null ? '' : value).trim().slice(0, max)
}

const CATEGORIES = ['Automotive', 'Detailing', 'Tint']
const LOCATION_TYPES = ['Home', 'Office / Work', 'Other', scheduling.DROP_OFF]

// --- Create a booking (called from booking.js submitBooking()) ---
//
// The browser sends the customer's CHOICES. Everything that costs money
// or takes time is worked out here: prices (services/priceEngine.js),
// the discount, tax, the job length and whether the time window is still
// free (services/scheduling.js). Any prices in the request are ignored.
router.post('/booking', limitApi('booking'), async (req, res) => {
    try {
        const b = req.body || {}
        const isDropOff = b.locationType === scheduling.DROP_OFF

        // Mirrors the client-side validateStep() checks, since the client
        // can't be trusted.
        const missing = []
        if (!b.category) missing.push('category')
        if (!Array.isArray(b.services) || b.services.length === 0) missing.push('services')
        if (!b.locationType) missing.push('locationType')
        if (!isDropOff && !cleanText(b.serviceAddress, 300)) missing.push('serviceAddress')
        if (!b.preferredDate) missing.push('preferredDate')
        if (!b.preferredTime) missing.push('preferredTime')
        if (!cleanText(b.contact?.firstName, 60)) missing.push('contact.firstName')
        if (!cleanText(b.contact?.lastName, 60)) missing.push('contact.lastName')
        if (String(b.contact?.phone || '').replace(/\D/g, '').length < 10) missing.push('contact.phone')
        if (!['manual', 'vin'].includes(b.vehicle?.vinMode)) missing.push('vehicle.vinMode')

        if (missing.length > 0) {
            return res.status(400).json({ error: 'Missing required fields', missing })
        }

        if (!CATEGORIES.includes(b.category)) {
            return res.status(400).json({ error: 'Unknown service category.' })
        }
        const offered = await knownServiceNames(b.category)
        const services = [...new Set(b.services.map(String))]
        const unknown = services.filter(name => !offered.includes(name))
        if (unknown.length > 0) {
            return res.status(400).json({ error: `Unknown service: ${unknown.join(', ')}` })
        }

        // ── "Bring it to us": approved, logged-in customers only. ──
        let dropOffAddress = ''
        if (isDropOff) {
            if (!(await isTrustedCustomer(req.user))) {
                return res.status(403).json({ error: 'Drop-off is only available to approved customers. Please pick a service location.' })
            }
            const config = await BusinessConfig.getConfig()
            dropOffAddress = config.dropOffAddress + (config.dropOffNotes ? ` — ${config.dropOffNotes}` : '')
            if (!config.dropOffAddress) {
                return res.status(400).json({ error: 'Drop-off is not available right now. Please pick a service location.' })
            }
        }

        const email = cleanText(b.contact?.email, 200)
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({ error: 'That email address does not look right.' })
        }

        const vehicle = {
            vinMode: b.vehicle.vinMode,
            make: cleanText(b.vehicle.make, 60),
            model: cleanText(b.vehicle.model, 80),
            year: cleanText(b.vehicle.year, 4),
            vin: cleanText(b.vehicle.vin, 17),
            vehicleType: cleanText(b.vehicle.vehicleType, 80)
        }

        // ── Price it here. Nothing from b.pricing / b.parts / b.labor is used. ──
        const estimate = await priceBooking({
            category: b.category,
            services,
            selections: b.selections,
            locationType: isDropOff ? scheduling.DROP_OFF : '',
            vehicle
        })

        if (estimate.incomplete.length > 0) {
            return res.status(400).json({
                error: `Please finish configuring: ${estimate.incomplete.join(', ')}`
            })
        }

        // A page left open while prices changed, or a tampered request:
        // either way the server's number is the one that's saved.
        const claimed = b.pricing && typeof b.pricing.subtotal === 'number' ? b.pricing.subtotal : null
        if (claimed !== null && Math.abs(claimed - estimate.subtotal) > 0.01) {
            console.warn(`[booking] Submitted subtotal $${claimed} does not match server price $${estimate.subtotal} — saving the server price.`)
        }

        // ── Is the time window still free for a job this long? ──
        const jobHours = estimate.jobHours || null
        const slot = await scheduling.checkSlot(b.preferredDate, b.preferredTime, jobHours, { dropOff: isDropOff })
        if (!slot.ok) {
            return res.status(409).json({ error: slot.message, slotTaken: true })
        }

        // ── Discount: checked and claimed against the server's subtotal. ──
        // With nothing priced online (a quote-only service) the code is
        // still recorded and applied to the quote.
        const hasPricedLines = estimate.lineItems.length + estimate.laborItems.length > 0
        const subtotal = estimate.subtotal
        let discountDoc = null
        let discount
        let discountAmount = 0
        if (b.discountCode) {
            const ctx = {
                category: b.category,
                subtotal: hasPricedLines ? subtotal : null,
                firstTimeCustomer: !!b.firstTimeCustomer,
                phone: b.contact.phone
            }
            const result = await DiscountCode.redeem(b.discountCode, ctx)
            if (!result.ok) {
                return res.status(409).json({ error: result.message, discountInvalid: true })
            }
            discountDoc = result.doc
            const amount = hasPricedLines ? discountDoc.amountFor(subtotal) : null
            discount = {
                code: discountDoc.code,
                type: discountDoc.type,
                value: discountDoc.value,
                label: discountDoc.label(),
                amount
            }
            discountAmount = amount || 0
        }

        const tax = (subtotal - discountAmount) * estimate.taxRate
        const pricing = {
            partsSubtotal: estimate.partsSubtotal,
            laborSubtotal: estimate.laborSubtotal,
            subtotal,
            discount: discountAmount,
            taxRate: estimate.taxRate,
            tax,
            total: subtotal - discountAmount + tax,
            estimatedHours: jobHours
        }

        if (estimate.vehicle.specs) {
            vehicle.specs = estimate.vehicle.specs
            vehicle.isEstimateSpecs = !!estimate.vehicle.isEstimateSpecs
        }

        let booking
        try {
            booking = await Booking.create({
                discount,
                vehicle,
                category: b.category,
                services,
                selections: b.selections,
                serviceNotes: estimate.serviceNotes,
                parts: estimate.lineItems,
                labor: estimate.laborItems,
                toolsNeeded: estimate.toolsNeeded,
                pricing,
                flags: {
                    hasPlaceholderPricing: !!estimate.hasPlaceholderPricing,
                    isEstimateSpecs: !!estimate.vehicle.isEstimateSpecs,
                    hasQuoteItems: !!estimate.hasQuoteItems,
                    isStartingPrice: !!estimate.isStartingPrice
                },
                locationType: LOCATION_TYPES.includes(b.locationType) ? b.locationType : 'Other',
                serviceAddress: isDropOff ? `Drop-off at ${dropOffAddress}` : cleanText(b.serviceAddress, 300),
                preferredDate: b.preferredDate,
                preferredTime: b.preferredTime,
                firstTimeCustomer: !!b.firstTimeCustomer,
                contact: {
                    firstName: cleanText(b.contact.firstName, 60),
                    lastName: cleanText(b.contact.lastName, 60),
                    phone: cleanText(b.contact.phone, 30),
                    email
                },
                notes: cleanText(b.notes, 2000),
                hearAbout: cleanText(b.hearAbout, 100),
                // Logged-in customers get the booking in their order history.
                user: req.user ? req.user._id : null
            })
        } catch (err) {
            // Booking didn't save — give the claimed use back.
            if (discountDoc) await DiscountCode.release(discountDoc._id)
            throw err
        }

        // Confirmation to the customer + alert to the owner. Not awaited:
        // the booking is saved, and email trouble is logged, not shown.
        bookingEmails.sendBookingReceived(booking, req)

        res.status(201).json({
            success: true,
            bookingId: booking._id,
            total: pricing.total,
            emailed: !!email
        })

    } catch (err) {
        console.error('Failed to save booking:', err)
        res.status(500).json({ error: 'Failed to save booking' })
    }
})

// --- Admin: list bookings (JSON) ---
router.get('/booking', ensureAdmin, async (req, res) => {
    try {
        const bookings = await Booking.find().sort({ createdAt: -1 })
        res.json(bookings)
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Failed to fetch bookings' })
    }
})

// --- Admin: update a booking's status ---
// Confirming is what takes a time window off the calendar, so that is
// where overlaps are caught: confirming a booking that runs into another
// confirmed one comes back as a 409 with the reason. Sending
// { force: true } confirms it anyway (your call to double up).
router.patch('/booking/:id/status', ensureAdmin, async (req, res) => {
    try {
        const { status, force } = req.body
        const allowed = ['new', 'contacted', 'confirmed', 'completed', 'cancelled']
        if (!allowed.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' })
        }

        const booking = await Booking.findById(req.params.id)
        if (!booking) return res.status(404).json({ error: 'Booking not found' })

        const previous = booking.status
        if (status === 'confirmed' && previous !== 'confirmed' && !force) {
            const hours = scheduling.bookingHours(booking)
            const { unavailable } = await scheduling.getAvailability(booking.preferredDate, booking.preferredDate, hours, {
                excludeId: booking._id,
                dropOff: booking.locationType === scheduling.DROP_OFF
            })
            if ((unavailable[booking.preferredDate] || []).includes(booking.preferredTime)) {
                return res.status(409).json({
                    conflict: true,
                    error: `This job (about ${Math.round(hours * 2) / 2} hrs) overlaps another confirmed booking on ${booking.preferredDate}.`
                })
            }
        }

        booking.status = status
        await booking.save()

        // Tell the customer when it becomes confirmed or cancelled.
        if (status !== previous) bookingEmails.sendStatusChange(booking, status, req)

        res.json({ success: true, booking })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Failed to update booking' })
    }
})

// --- Public: resolve vehicle specs for the booking form ---
// An entry for the exact year wins, then an entry covering a run of years
// that includes it (year..yearEnd), then the model-level default
// (year: null). Returns { spec: null } if none exist so the client falls
// back to GENERIC_FALLBACK_SPECS.
//
// (An older copy of this route used to sit above this one and answer
// first with a different response shape, so the booking form never saw
// any saved spec and always used the generic fallback. It's gone.)
router.get('/vehicle-specs', async (req, res) => {
    try {
        const { make, model, year } = req.query

        if (!make || !model) {
            return res.status(400).json({ error: 'make and model are required' })
        }

        res.json({ spec: await VehicleSpec.resolveFor(String(make), String(model), year) })
    } catch (err) {
        console.error('Error resolving vehicle specs:', err)
        res.status(500).json({ error: 'Failed to resolve specs' })
    }
})

module.exports = router;