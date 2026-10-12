// One-time migration script. Run with: node scripts/seedVehicleSpecs.js
// Safe to re-run — uses upsert, so it won't create duplicates.

const mongoose = require('mongoose')
const VehicleSpec = require('../models/VehicleSpec') // adjust path if needed
const mongoUri = require('../config/mongoUri').getMongoUri()

const entries = [
    {
        make: 'Chevrolet',
        model: 'Suburban',
        year: 2008,
        oil: { viscosity: '5W-30', capacity: 6 },
        filter: { brandPartNumber: null, socket: '74mm' },
        drainPlug: '15mm',
        tires: { size: '265/70R17' },
        tools: { oilChange: ['15mm Socket', '74mm Oil Filter Socket', 'Drain Pan', 'Torque Wrench'] },
        oilChangeLaborMinutes: 20,
        oilTierOverride: null,
        notes: 'Filter is top-mounted and easily reached, single drain plug, no skid plate — quick oil change.'
    },
    {
        make: 'Jaguar',
        model: 'XF',
        year: 2018,
        oil: { viscosity: '0W-20', capacity: 7 },
        filter: { brandPartNumber: 'HP-1002', socket: '24mm' },
        drainPlug: '13mm',
        tires: { size: '245/45R18' },
        tools: { oilChange: ['13mm Socket', '24mm Oil Filter Socket', 'Drain Pan', 'Torque Wrench'] },
        oilChangeLaborMinutes: 25,
        oilTierOverride: 'premium',
        notes: 'Tighter engine bay access than a truck, no skid plate to remove though. Jaguar spec calls for full synthetic only — budget/conventional products are not offered for this vehicle regardless of brand default tier.'
    }
]

async function seed() {
    await mongoose.connect(mongoUri)
    console.log('Connected to MongoDB.')

    for (const entry of entries) {
        const result = await VehicleSpec.findOneAndUpdate(
            { make: entry.make, model: entry.model, year: entry.year },
            entry,
            { upsert: true, new: true }
        )
        console.log(`Upserted: ${result.make} ${result.model} ${result.year}`)
    }

    console.log('Done.')
    await mongoose.disconnect()
}

seed().catch(err => {
    console.error('Seed failed:', err)
    process.exit(1)
})
