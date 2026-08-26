const router = require('express').Router()
const { ensureAuthenticated, ensureAdmin } = require('../config/ensureAuth')
const User = require('../models/User')
const Booking = require('../models/Booking')
const axios = require('axios')
const VehicleSpec = require('../models/VehicleSpec')

// --- Home route ---
router.get('/vin/:vin', async (req, res) => {
    try {
        const vin = req.params.vin;

        const response = await fetch(
            `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`
        );

        const data = await response.json();

        const vehicle = data.Results?.[0];

        if (!vehicle || !vehicle.Make) {
            return res.status(404).json({
                error: 'VIN not found'
            });
        }

        res.json({
            vin,
            year: vehicle.ModelYear,
            make: vehicle.Make,
            model: vehicle.Model,
            trim: vehicle.Trim,
            engine: vehicle.DisplacementL
                ? `${vehicle.DisplacementL}L ${vehicle.EngineCylinders || ''} cyl`
                : '',
            bodyClass: vehicle.BodyClass,
            vehicleType: vehicle.VehicleType
        });

    } catch (err) {
        console.error(err);

        res.status(500).json({
            error: 'VIN lookup failed'
        });
    }
})

router.get('/vehicle/:year/:make/:model', async (req, res) => {

})

router.get('/services', async (req, res) => {

})

// --- Create a booking (called from booking.js submitBooking()) ---
router.post('/booking', async (req, res) => {
    try {
        const b = req.body || {}

        // Minimal server-side validation — mirrors the client-side
        // validateStep() checks, since the client can't be trusted.
        const missing = []
        if (!b.category) missing.push('category')
        if (!Array.isArray(b.services) || b.services.length === 0) missing.push('services')
        if (!b.locationType) missing.push('locationType')
        if (!b.serviceAddress) missing.push('serviceAddress')
        if (!b.preferredDate) missing.push('preferredDate')
        if (!b.preferredTime) missing.push('preferredTime')
        if (!b.contact?.firstName) missing.push('contact.firstName')
        if (!b.contact?.lastName) missing.push('contact.lastName')
        if (!b.contact?.phone) missing.push('contact.phone')
        if (!b.vehicle?.vinMode) missing.push('vehicle.vinMode')

        if (missing.length > 0) {
            return res.status(400).json({ error: 'Missing required fields', missing })
        }

        const booking = await Booking.create({
            vehicle: b.vehicle,
            category: b.category,
            services: b.services,
            selections: b.selections,
            serviceNotes: b.serviceNotes,
            parts: b.parts,
            labor: b.labor,
            toolsNeeded: b.toolsNeeded,
            pricing: b.pricing,
            flags: b.flags,
            locationType: b.locationType,
            serviceAddress: b.serviceAddress,
            preferredDate: b.preferredDate,
            preferredTime: b.preferredTime,
            firstTimeCustomer: b.firstTimeCustomer,
            contact: b.contact,
            notes: b.notes,
            hearAbout: b.hearAbout
        })

        res.status(201).json({ success: true, bookingId: booking._id })

    } catch (err) {
        console.error(err)
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
router.patch('/booking/:id/status', ensureAdmin, async (req, res) => {
    try {
        const { status } = req.body
        const allowed = ['new', 'contacted', 'confirmed', 'completed', 'cancelled']
        if (!allowed.includes(status)) {
            return res.status(400).json({ error: 'Invalid status' })
        }
        const booking = await Booking.findByIdAndUpdate(req.params.id, { status }, { new: true })
        if (!booking) return res.status(404).json({ error: 'Booking not found' })
        res.json({ success: true, booking })
    } catch (err) {
        console.error(err)
        res.status(500).json({ error: 'Failed to update booking' })
    }
})

const GENERIC_FALLBACK_SPECS = {
    oil: {
        viscosity: '5W-30',
        capacity: 5
    },
    filter: {
        brandPartNumber: null,
        socket: 'Standard wrench/cap'
    },
    drainPlug: 'Standard',
    tires: {
        size: null
    },
    tools: {
        oilChange: ['Drain Pan', 'Oil Filter Wrench', 'Torque Wrench']
    },
    oilChangeLaborMinutes: 20,
    oilTierOverride: null,
    isEstimate: true,
    notes: ''
}

// --- Resolve vehicle specs: year-specific entry -> model default -> generic fallback ---
router.get('/vehicle-specs', async (req, res) => {
    try {
        const { make, model, year } = req.query

        if (!make || !model) {
            return res.status(400).json({ error: 'make and model are required' })
        }

        const yearNum = year ? parseInt(year, 10) : null

        // 1. Look for an exact year-specific entry
        if (yearNum) {
            const yearSpec = await VehicleSpec.findOne({ make, model, year: yearNum })
            if (yearSpec) {
                return res.json({ ...yearSpec.toObject(), isEstimate: false })
            }
        }

        // 2. Fall back to the model-level default (year: null)
        const modelDefault = await VehicleSpec.findOne({ make, model, year: null })
        if (modelDefault) {
            return res.json({ ...modelDefault.toObject(), isEstimate: false })
        }

        // 3. Fall back to the generic estimate
        return res.json({ make, model, year: yearNum, ...GENERIC_FALLBACK_SPECS })
    } catch (err) {
        console.error('Error resolving vehicle specs:', err)
        res.status(500).json({ error: 'Failed to resolve vehicle specs' })
    }
})

// --- Public: resolve vehicle specs for the booking form ---
// Year-specific entry wins; falls back to the model-level default
// (year: null); returns { spec: null } if neither exists so the client
// falls back to GENERIC_FALLBACK_SPECS.
router.get('/vehicle-specs', async (req, res) => {
    try {
        const { make, model } = req.query
        const year = parseInt(req.query.year, 10)

        if (!make || !model) {
            return res.status(400).json({ error: 'make and model are required' })
        }

        let spec = null
        if (!isNaN(year)) {
            spec = await VehicleSpec.findOne({ make, model, year }).lean()
        }
        if (!spec) {
            spec = await VehicleSpec.findOne({ make, model, year: null }).lean()
        }

        res.json({ spec })
    } catch (err) {
        console.error('Error resolving vehicle specs:', err)
        res.status(500).json({ error: 'Failed to resolve specs' })
    }
})

module.exports = router;