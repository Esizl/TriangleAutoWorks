// Fills in the 5-quart jug part numbers for the original oil products,
// where they're missing.
//
// Why: the first parts seed stored these numbers under a field name the
// database doesn't have, so they were silently dropped and tech sheets
// showed no part number for the oil. (The seed script is fixed now.)
//
// Run with:  node scripts/fillOilPartNumbers.js
// Only fills EMPTY jug part numbers — anything you've typed in the
// Parts Catalog is left alone. Safe to re-run.

const mongoose = require('mongoose')
const PartsCatalog = require('../models/PartsCatalog')
const mongoUri = require('../config/mongoUri').getMongoUri()

// From the original seed (each is the 5-quart product at Advance Auto).
const JUG_PART_NUMBERS = {
    'ARGOS': 'AR660-5QT',
    'Valvoline Synthetic Blend': '881163',
    'Valvoline Advanced Full Synthetic': '881164',
    'Pennzoil Full Synthetic': '550058602',
    'Pennzoil Platinum Full Synthetic': '550046126',
    'Mobil 1 Advanced Clean Full Synthetic': '128650',
    'Mobil 1 Advanced Full Synthetic': '44899',
    'Mobil 1 European Car Formula Advanced Full Synthetic': '127105'
}

async function run() {
    await mongoose.connect(mongoUri)
    const catalog = await PartsCatalog.findOne({ singleton: 'catalog' })
    if (!catalog) throw new Error('No parts catalog in the database yet.')

    let filled = 0
    catalog.oilProducts.forEach(product => {
        const number = JUG_PART_NUMBERS[product.name]
        if (number && !product.jugPartNumber) {
            product.jugPartNumber = number
            filled++
            console.log(`  ${product.name}: ${number}`)
        }
    })

    if (filled) await catalog.save()
    console.log(filled ? `Filled ${filled} jug part number(s).` : 'Nothing to fill — every listed oil already has a jug part number.')
    console.log('Quart part numbers were never in the seed; add those in Admin > Site > Parts Catalog.')
    await mongoose.disconnect()
}

run().catch(err => {
    console.error('Failed:', err.message)
    process.exit(1)
})
