// Seeds starting-point oil specs (viscosity, capacity, synthetic requirement)
// for the most common vehicles, one entry per run of model years.
//
// Run with:   node scripts/seedVehicleSpecEstimates.js
// Dry run:    node scripts/seedVehicleSpecEstimates.js --check   (no database)
//
// IMPORTANT — these figures are UNVERIFIED. They are typical values for
// the engine named in each entry's notes; other engines in the same model
// take different amounts. Every entry is saved with verified: false, so
// the booking form keeps showing the "Estimated" flag for it. Check an
// entry against the owner's manual, fix it in Admin > Site > Vehicle
// Specs, and saving it there marks it verified.
//
// Safe to re-run, and it never changes anything you entered:
//   - an existing entry starting on the same year is left alone
//   - models that already have a model-wide default are skipped entirely

const P = 'premium' // needs full synthetic / synthetic blend
const N = null

// [make, model, first year, last year, viscosity, quarts with filter,
//  oil tier, engine the figures are for, labor minutes (optional)]
const ROWS = [
    ['Toyota', 'Camry', 2010, 2017, '0W-20', 4.6, P, '2.5L 4-cyl (V6 takes 6.4 qt)'],
    ['Toyota', 'Camry', 2018, 2026, '0W-16', 4.8, P, '2.5L 4-cyl'],
    ['Toyota', 'Corolla', 2010, 2019, '0W-20', 4.4, P, '1.8L'],
    ['Toyota', 'Corolla', 2020, 2026, '0W-16', 4.9, P, '2.0L (1.8L takes 4.4 qt of 0W-20)'],
    ['Toyota', 'RAV4', 2010, 2018, '0W-20', 4.6, P, '2.5L 4-cyl'],
    ['Toyota', 'RAV4', 2019, 2026, '0W-16', 4.8, P, '2.5L 4-cyl'],
    ['Toyota', 'Highlander', 2011, 2016, '0W-20', 6.4, P, '3.5L V6'],
    ['Toyota', 'Highlander', 2017, 2022, '0W-20', 5.8, P, '3.5L V6'],
    ['Toyota', 'Sienna', 2011, 2016, '0W-20', 6.4, P, '3.5L V6'],
    ['Toyota', 'Sienna', 2017, 2020, '0W-20', 5.8, P, '3.5L V6'],
    ['Toyota', 'Sienna', 2021, 2026, '0W-16', 4.8, P, '2.5L hybrid'],
    ['Toyota', 'Avalon', 2013, 2018, '0W-20', 6.4, P, '3.5L V6'],
    ['Toyota', 'Prius', 2010, 2015, '0W-20', 4.4, P, '1.8L hybrid'],
    ['Toyota', 'Tacoma', 2016, 2023, '0W-20', 6.2, P, '3.5L V6', 30],
    ['Toyota', 'Tundra', 2010, 2021, '0W-20', 7.9, P, '5.7L V8', 30],
    ['Toyota', 'Sequoia', 2010, 2022, '0W-20', 7.9, P, '5.7L V8', 30],
    ['Toyota', '4Runner', 2010, 2024, '0W-20', 6.6, P, '4.0L V6', 30],

    ['Honda', 'Civic', 2010, 2011, '5W-20', 3.9, N, '1.8L'],
    ['Honda', 'Civic', 2012, 2015, '0W-20', 3.9, P, '1.8L'],
    ['Honda', 'Civic', 2016, 2026, '0W-20', 4.4, P, '2.0L (1.5L turbo takes 3.7 qt)'],
    ['Honda', 'Accord', 2013, 2017, '0W-20', 4.4, P, '2.4L 4-cyl (V6 takes 4.5 qt)'],
    ['Honda', 'Accord', 2018, 2026, '0W-20', 3.4, P, '1.5L turbo'],
    ['Honda', 'CR-V', 2012, 2016, '0W-20', 4.6, P, '2.4L 4-cyl'],
    ['Honda', 'CR-V', 2017, 2026, '0W-20', 3.7, P, '1.5L turbo (2.4L takes 4.6 qt)'],
    ['Honda', 'HR-V', 2016, 2022, '0W-20', 3.9, P, '1.8L'],
    ['Honda', 'HR-V', 2023, 2026, '0W-20', 4.4, P, '2.0L'],
    ['Honda', 'Pilot', 2016, 2022, '0W-20', 5.7, P, '3.5L V6'],
    ['Honda', 'Odyssey', 2011, 2017, '0W-20', 4.5, P, '3.5L V6'],
    ['Honda', 'Odyssey', 2018, 2026, '0W-20', 5.7, P, '3.5L V6'],

    ['Nissan', 'Altima', 2010, 2012, '5W-30', 4.9, N, '2.5L 4-cyl'],
    ['Nissan', 'Altima', 2013, 2018, '0W-20', 4.9, P, '2.5L 4-cyl'],
    ['Nissan', 'Altima', 2019, 2026, '0W-20', 5.4, P, '2.5L 4-cyl'],
    ['Nissan', 'Sentra', 2013, 2019, '0W-20', 4.2, P, '1.8L'],
    ['Nissan', 'Rogue', 2010, 2013, '5W-30', 4.9, N, '2.5L 4-cyl'],
    ['Nissan', 'Rogue', 2014, 2020, '0W-20', 4.9, P, '2.5L 4-cyl'],
    ['Nissan', 'Maxima', 2016, 2023, '0W-20', 5.1, P, '3.5L V6'],
    ['Nissan', 'Frontier', 2010, 2019, '5W-30', 5.4, N, '4.0L V6'],

    ['Ford', 'F-150', 2011, 2017, '5W-20', 7.7, N, '5.0L V8 (EcoBoost engines take 6.0 qt of 5W-30)'],
    ['Ford', 'F-150', 2018, 2026, '5W-30', 6.0, P, '2.7L / 3.5L EcoBoost (5.0L V8 takes 8.8 qt)'],
    ['Ford', 'Escape', 2013, 2019, '5W-20', 4.3, N, '1.5L / 1.6L EcoBoost (2.5L and 2.0L EcoBoost take 5.7 qt)'],
    ['Ford', 'Explorer', 2011, 2019, '5W-20', 6.0, N, '3.5L V6'],
    ['Ford', 'Fusion', 2013, 2020, '5W-20', 5.7, N, '2.5L 4-cyl (1.5L EcoBoost takes 4.3 qt)'],
    ['Ford', 'Focus', 2012, 2018, '5W-20', 4.5, N, '2.0L'],
    ['Ford', 'Edge', 2011, 2014, '5W-20', 6.0, N, '3.5L V6'],
    ['Ford', 'Edge', 2015, 2024, '5W-30', 5.7, P, '2.0L EcoBoost'],
    ['Ford', 'Expedition', 2010, 2014, '5W-20', 7.0, N, '5.4L V8'],
    ['Ford', 'Expedition', 2015, 2026, '5W-30', 6.0, P, '3.5L EcoBoost'],

    ['Chevrolet', 'Silverado 1500', 2010, 2013, '5W-30', 6.0, N, '5.3L V8'],
    ['Chevrolet', 'Silverado 1500', 2014, 2026, '0W-20', 8.0, P, '5.3L V8'],
    ['Chevrolet', 'Tahoe', 2010, 2014, '5W-30', 6.0, N, '5.3L V8'],
    ['Chevrolet', 'Tahoe', 2015, 2026, '0W-20', 8.0, P, '5.3L V8'],
    ['Chevrolet', 'Suburban', 2010, 2014, '5W-30', 6.0, N, '5.3L V8'],
    ['Chevrolet', 'Suburban', 2015, 2026, '0W-20', 8.0, P, '5.3L V8'],
    ['Chevrolet', 'Equinox', 2010, 2017, '5W-30', 5.0, N, '2.4L 4-cyl'],
    ['Chevrolet', 'Equinox', 2018, 2024, '0W-20', 4.2, P, '1.5L turbo'],
    ['Chevrolet', 'Malibu', 2016, 2018, '5W-30', 4.2, P, '1.5L turbo'],
    ['Chevrolet', 'Malibu', 2019, 2025, '0W-20', 4.2, P, '1.5L turbo'],
    ['Chevrolet', 'Cruze', 2011, 2015, '5W-30', 4.2, P, '1.4L turbo (1.8L takes 4.8 qt)'],
    ['Chevrolet', 'Traverse', 2010, 2017, '5W-30', 5.5, N, '3.6L V6'],
    ['Chevrolet', 'Traverse', 2018, 2023, '5W-30', 6.0, N, '3.6L V6'],
    ['Chevrolet', 'Colorado', 2015, 2022, '5W-30', 6.0, N, '3.6L V6 (2.5L 4-cyl takes 5.0 qt)'],

    ['GMC', 'Sierra 1500', 2010, 2013, '5W-30', 6.0, N, '5.3L V8'],
    ['GMC', 'Sierra 1500', 2014, 2026, '0W-20', 8.0, P, '5.3L V8'],
    ['GMC', 'Yukon', 2010, 2014, '5W-30', 6.0, N, '5.3L V8'],
    ['GMC', 'Yukon', 2015, 2026, '0W-20', 8.0, P, '5.3L V8'],
    ['GMC', 'Yukon XL', 2010, 2014, '5W-30', 6.0, N, '5.3L V8'],
    ['GMC', 'Yukon XL', 2015, 2026, '0W-20', 8.0, P, '5.3L V8'],
    ['GMC', 'Terrain', 2010, 2017, '5W-30', 5.0, N, '2.4L 4-cyl'],
    ['GMC', 'Terrain', 2018, 2024, '0W-20', 4.2, P, '1.5L turbo'],
    ['GMC', 'Acadia', 2010, 2016, '5W-30', 5.5, N, '3.6L V6'],
    ['GMC', 'Canyon', 2015, 2022, '5W-30', 6.0, N, '3.6L V6 (2.5L 4-cyl takes 5.0 qt)'],

    ['Cadillac', 'Escalade', 2010, 2014, '5W-30', 6.0, N, '6.2L V8'],
    ['Cadillac', 'Escalade', 2015, 2026, '0W-20', 8.0, P, '6.2L V8'],
    ['Buick', 'Enclave', 2010, 2017, '5W-30', 5.5, N, '3.6L V6'],
    ['Buick', 'Enclave', 2018, 2024, '5W-30', 6.0, N, '3.6L V6'],

    ['Ram', '1500', 2011, 2024, '5W-20', 7.0, N, '5.7L Hemi V8 (3.6L V6 takes 5.0 qt)'],
    ['Jeep', 'Wrangler', 2012, 2013, '5W-30', 6.0, N, '3.6L V6'],
    ['Jeep', 'Wrangler', 2014, 2018, '5W-20', 5.0, N, '3.6L V6'],
    ['Jeep', 'Wrangler', 2019, 2026, '0W-20', 5.0, P, '3.6L V6'],
    ['Jeep', 'Cherokee', 2014, 2023, '0W-20', 5.5, P, '2.4L 4-cyl (3.2L V6 takes 6.0 qt of 5W-20)'],
    ['Jeep', 'Compass', 2017, 2022, '0W-20', 5.5, P, '2.4L 4-cyl'],

    ['Hyundai', 'Elantra', 2011, 2020, '5W-20', 4.2, N, '1.8L / 2.0L'],
    ['Hyundai', 'Sonata', 2011, 2019, '5W-20', 5.1, N, '2.4L 4-cyl'],
    ['Hyundai', 'Tucson', 2016, 2021, '5W-20', 4.2, N, '2.0L (2.4L takes 5.1 qt)'],
    ['Kia', 'Optima', 2011, 2020, '5W-20', 5.1, N, '2.4L 4-cyl'],
    ['Kia', 'Sorento', 2016, 2020, '5W-20', 5.1, N, '2.4L 4-cyl'],
    ['Kia', 'Sportage', 2017, 2022, '5W-20', 5.1, N, '2.4L 4-cyl'],

    ['Subaru', 'Forester', 2011, 2018, '0W-20', 5.1, P, '2.5L'],
    ['Subaru', 'Forester', 2019, 2024, '0W-20', 4.4, P, '2.5L'],
    ['Subaru', 'Outback', 2013, 2019, '0W-20', 5.1, P, '2.5L'],
    ['Subaru', 'Outback', 2020, 2026, '0W-20', 4.4, P, '2.5L'],
    ['Subaru', 'Legacy', 2013, 2019, '0W-20', 5.1, P, '2.5L'],
    ['Subaru', 'Legacy', 2020, 2025, '0W-20', 4.4, P, '2.5L'],
    ['Subaru', 'Crosstrek', 2013, 2017, '0W-20', 5.1, P, '2.0L'],
    ['Subaru', 'Crosstrek', 2018, 2023, '0W-20', 4.4, P, '2.0L'],
    ['Subaru', 'Impreza', 2012, 2016, '0W-20', 5.1, P, '2.0L'],
    ['Subaru', 'Impreza', 2017, 2023, '0W-20', 4.4, P, '2.0L'],

    ['Mazda', 'Mazda3', 2014, 2018, '0W-20', 4.4, P, '2.0L (2.5L takes 4.8 qt)'],
    ['Mazda', 'Mazda3', 2019, 2026, '0W-20', 4.8, P, '2.5L'],
    ['Mazda', 'Mazda6', 2014, 2021, '0W-20', 4.8, P, '2.5L'],
    ['Mazda', 'CX-5', 2014, 2026, '0W-20', 4.8, P, '2.5L'],
    ['Mazda', 'CX-30', 2020, 2026, '0W-20', 4.8, P, '2.5L'],
    ['Mazda', 'CX-50', 2023, 2026, '0W-20', 4.8, P, '2.5L'],
    ['Mazda', 'CX-9', 2016, 2023, '5W-30', 5.1, P, '2.5L turbo'],

    ['Volkswagen', 'Jetta', 2019, 2026, '0W-20', 4.2, P, '1.4L / 1.5L turbo'],
    ['Volkswagen', 'Tiguan', 2018, 2026, '0W-20', 5.9, P, '2.0L turbo'],
    ['BMW', '328i', 2012, 2016, '5W-30', 5.3, P, '2.0L turbo'],
    ['BMW', '330i', 2017, 2026, '0W-20', 5.5, P, '2.0L turbo'],
    ['BMW', 'X3', 2018, 2026, '0W-20', 5.5, P, '2.0L turbo (30i)'],
    ['Audi', 'A4', 2017, 2025, '0W-20', 5.5, P, '2.0L turbo'],
    ['Audi', 'Q5', 2018, 2026, '0W-20', 5.5, P, '2.0L turbo'],
    ['Lexus', 'ES', 2013, 2018, '0W-20', 6.4, P, '3.5L V6 (ES 350)'],
    ['Lexus', 'RX', 2010, 2015, '0W-20', 6.4, P, '3.5L V6 (RX 350)'],
    ['Acura', 'MDX', 2014, 2020, '0W-20', 5.7, P, '3.5L V6'],
    ['Acura', 'RDX', 2013, 2018, '0W-20', 4.5, P, '3.5L V6']
]

const DEFAULT_LABOR_MINUTES = 20
const GENERIC_TOOLS = ['Drain Pan', 'Oil Filter Wrench', 'Torque Wrench']

function toEntry([make, model, from, to, viscosity, capacity, tier, engine, minutes]) {
    return {
        make,
        model,
        year: from,
        yearEnd: to === from ? null : to,
        oil: { viscosity, capacity },
        tools: { oilChange: GENERIC_TOOLS },
        oilChangeLaborMinutes: minutes || DEFAULT_LABOR_MINUTES,
        oilTierOverride: tier,
        verified: false,
        notes: `UNVERIFIED starting figures for the ${engine}. Check against the owner's manual before relying on them.`
    }
}

// Catches typos in ROWS before anything is written: unknown models,
// year runs that overlap, and years the booking form doesn't offer.
function check(entries) {
    const { loadVehicleData } = require('../vehicleDataStore')
    const { VEHICLE_DATA } = loadVehicleData()
    const problems = []
    const seen = {}

    entries.forEach(e => {
        const label = `${e.make} ${e.model} ${e.year}-${e.yearEnd || e.year}`
        const years = (VEHICLE_DATA[e.make] || {})[e.model]
        if (!years) {
            problems.push(`${label}: not in vehicle-data.js (run seedVehicleData.js first)`)
            return
        }
        const last = e.yearEnd || e.year
        if (last < e.year) problems.push(`${label}: last year is before first year`)
        for (let y = e.year; y <= last; y++) {
            const key = `${e.make}|${e.model}|${y}`
            if (seen[key]) problems.push(`${label}: ${y} is also covered by another row`)
            seen[key] = true
            if (!years.map(Number).includes(y)) problems.push(`${label}: ${y} is not a listed model year`)
        }
        if (!(e.oil.capacity > 2 && e.oil.capacity < 12)) problems.push(`${label}: capacity ${e.oil.capacity} looks wrong`)
        if (!/^\d+W-\d+$/.test(e.oil.viscosity)) problems.push(`${label}: viscosity "${e.oil.viscosity}" looks wrong`)
    })
    return problems
}

async function seed() {
    const entries = ROWS.map(toEntry)
    const problems = check(entries)
    if (problems.length) {
        problems.forEach(p => console.error('  ' + p))
        throw new Error(`${problems.length} problem(s) in ROWS — nothing was written.`)
    }

    const models = new Set(entries.map(e => `${e.make} ${e.model}`))
    console.log(`${entries.length} entries covering ${models.size} models passed the checks.`)
    if (process.argv.includes('--check')) return

    const mongoose = require('mongoose')
    const VehicleSpec = require('../models/VehicleSpec')
    const { mongoUri } = require('../config/config.json').server

    await mongoose.connect(mongoUri)
    console.log('Connected to MongoDB.')

    let created = 0
    let skipped = 0
    for (const entry of entries) {
        const { make, model, year, ...rest } = entry

        // Your own model-wide default wins — don't seed over the top of it.
        if (await VehicleSpec.exists({ make, model, year: null })) {
            skipped++
            continue
        }

        const result = await VehicleSpec.updateOne(
            { make, model, year },
            { $setOnInsert: rest },
            { upsert: true }
        )
        if (result.upsertedCount) created++
        else skipped++
    }

    console.log(`Created ${created} unverified entries, left ${skipped} existing ones alone.`)
    await mongoose.disconnect()
}

seed().catch(err => {
    console.error('Seed failed:', err.message)
    process.exit(1)
})
