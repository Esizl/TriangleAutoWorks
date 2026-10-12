/**
 * scripts/seedPartsCatalog.js
 * -----------------------------------------------------------------------
 * ONE-TIME migration: populates the PartsCatalog singleton with the exact
 * data currently hardcoded in public/js/partsCatalog.js, so cutting over
 * to the DB-backed version doesn't wipe out real pricing/compatibility
 * data the booking flow depends on.
 *
 * Run once, after models/PartsCatalog.js exists and mongoose is
 * connected, and BEFORE you delete the static public/js/partsCatalog.js
 * file:
 *
 *     node scripts/seedPartsCatalog.js
 *
 * Safe to re-run — it upserts the singleton rather than duplicating data,
 * but re-running will OVERWRITE any admin edits made through the new page
 * with these original static values. Run it once, verify the admin page
 * shows everything correctly, then don't run it again.
 * -----------------------------------------------------------------------
 */

const mongoose = require('mongoose')
const mongoUri = require('../config/mongoUri').getMongoUri()
const PartsCatalog = require('../models/PartsCatalog')

async function seed() {
    await mongoose.connect(mongoUri)
    console.log('Connected to MongoDB')

    const data = {
        singleton: 'catalog',
        suppliers: [
            { key: 'rockauto', label: 'RockAuto', baseUrl: 'https://www.rockauto.com/' },
            { key: 'detroitAxle', label: 'Detroit Axle', baseUrl: 'https://www.detroitaxle.com/' },
            { key: 'advanceAuto', label: 'Advance Auto Parts', baseUrl: 'https://shop.advanceautoparts.com/' },
        ],
        oilProducts: [
            {
                name: 'ARGOS', jugPartNumber: 'AR660-5QT', price: 8.99, jugPrice: 30.99,
                supplier: 'advanceAuto',
                url: 'https://shop.advanceautoparts.com/p/argos-high-mileage-5w-30-conventional-motor-oil-restores-seals-5-quart-ar660-5qt/50313883-P?selectedStore=4920&searchTerm=argos+motor+oil+conventional+5w-30&selectedFulfillment=store_pickup',
                oilCategory: 'Conventional', tier: 'budget', availability: 'all', includesFreeFilter: true,
            },
            {
                name: 'Valvoline Synthetic Blend', jugPartNumber: '881163', price: 9.49, jugPrice: 34.99,
                supplier: 'advanceAuto',
                url: 'https://shop.advanceautoparts.com/p/valvoline-high-mileage-5w-30-synthetic-blend-motor-oil-prevents-engine-breakdown-5-quart-881163/11706057-P?selectedStore=4920&searchTerm=Valvoline+synthetic+blend+5w-30&selectedFulfillment=store_pickup',
                oilCategory: 'Synthetic', tier: 'premium', availability: 'all', includesFreeFilter: true,
            },
            {
                name: 'Valvoline Advanced Full Synthetic', jugPartNumber: '881164', price: 12.49, jugPrice: 39.99,
                supplier: 'advanceAuto',
                url: 'https://shop.advanceautoparts.com/p/valvoline-advanced-full-synthetic-5w-30-motor-oil-maximizes-engine-life-5-quart-881164/11707038-P?selectedStore=4920&searchTerm=Valvoline+Advanced+Full+Synthetic+5w-30&selectedFulfillment=store_pickup',
                oilCategory: 'Synthetic', tier: 'premium', availability: 'all', includesFreeFilter: true,
            },
            {
                name: 'Pennzoil Full Synthetic', jugPartNumber: '550058602', price: 10.49, jugPrice: 37.99,
                supplier: 'advanceAuto',
                url: 'https://shop.advanceautoparts.com/p/pennzoil-5w-30-full-synthetic-motor-oil-helps-prevent-sludge-build-up-5-quart-550058602/50018436-P?selectedStore=4920&searchTerm=Pennzoil+Conventional+5w-30&selectedFulfillment=store_pickup',
                oilCategory: 'Synthetic', tier: 'premium', availability: 'all', includesFreeFilter: true,
            },
            {
                name: 'Pennzoil Platinum Full Synthetic', jugPartNumber: '550046126', price: 12.49, jugPrice: 42.99,
                supplier: 'advanceAuto',
                url: 'https://shop.advanceautoparts.com/p/pennzoil-platinum-5w-30-full-synthetic-motor-oil-maximizes-engine-protection-5-quart-550046126/11499296-P?selectedStore=4920&searchTerm=Pennzoil+Platinum+Full+Synthetic+5w-30&selectedFulfillment=store_pickup',
                oilCategory: 'Synthetic', tier: 'premium', availability: 'all', includesFreeFilter: true,
            },
            {
                name: 'Mobil 1 Advanced Clean Full Synthetic', jugPartNumber: '128650', price: 13.49, jugPrice: 43.99,
                supplier: 'advanceAuto',
                url: 'https://shop.advanceautoparts.com/p/mobil-1-advanced-clean-full-synthetic-motor-oil-5w-30-5-quarts-128650/50294546-P?selectedStore=4920&searchTerm=Mobil+1+Full+Synthetic+5w-30&selectedFulfillment=store_pickup',
                oilCategory: 'Synthetic', tier: 'premium', availability: 'all', includesFreeFilter: true,
            },
            {
                name: 'Mobil 1 Advanced Full Synthetic', jugPartNumber: '44899', price: 12.99, jugPrice: 42.99,
                supplier: 'advanceAuto',
                url: 'https://shop.advanceautoparts.com/p/mobil-1-advanced-full-synthetic-engine-oil-5w-30-extends-engine-life-5-quart-44899/10069908-P?selectedStore=4920&searchTerm=Mobil+1+Full+Synthetic+5w-30&selectedFulfillment=store_pickup',
                oilCategory: 'Synthetic', tier: 'premium', availability: 'all', includesFreeFilter: true,
            },
            {
                name: 'Mobil 1 European Car Formula Advanced Full Synthetic', jugPartNumber: '127105', price: 12.99, jugPrice: 42.99,
                supplier: 'advanceAuto',
                url: 'https://shop.advanceautoparts.com/p/mobil-1-european-car-formula-advanced-full-synthetic-motor-oil-5w-30-5-quart-127105/50039689-P?selectedStore=4920&searchTerm=Mobil+1+European+Car+Formula+Advanced+Full+Synthetic+Motor+Oil+5W-30',
                oilCategory: 'Synthetic', tier: 'premium', availability: 'all', includesFreeFilter: true,
            },
        ],
        filterBrands: [
            { name: 'Carquest', price: 8.99, supplier: 'advanceAuto', compatibleMakes: [] },
            { name: 'FRAM', price: 9.99, supplier: 'advanceAuto', compatibleMakes: [] },
            { name: 'K&N', price: 11.49, supplier: 'advanceAuto', compatibleMakes: [] },
            { name: 'Mobil 1', price: 13.99, supplier: 'advanceAuto', compatibleMakes: [] },
            { name: 'AC Delco', price: 10.49, supplier: 'advanceAuto', compatibleMakes: ['Chevrolet', 'GMC', 'Buick', 'Cadillac'] },
            { name: 'Motorcraft', price: 10.99, supplier: 'rockauto', compatibleMakes: ['Ford', 'Lincoln', 'Mercury'] },
            { name: 'OEM', price: 14.99, supplier: null, compatibleMakes: [] },
        ],
        filterOverrides: [], // FILTER_PART_NUMBERS was empty in the original file
        brakePadTypes: [
            { name: 'Economy', price: 34.99, supplier: 'rockauto' },
            { name: 'Ceramic', price: 54.99, supplier: 'detroitAxle' },
            { name: 'Premium Ceramic', price: 79.99, supplier: 'detroitAxle' },
            { name: 'OEM', price: 94.99, supplier: 'advanceAuto' },
        ],
        rotorOptions: [
            { name: 'Reuse Existing', price: 0, supplier: null },
            { name: 'Replace Rotors', price: 64.99, supplier: 'detroitAxle' },
        ],
        tireServiceTypes: [
            { name: 'Rotate', price: 0 },
            { name: 'Balance', price: 0 },
            { name: 'Rotate & Balance', price: 0 },
            { name: 'Mount & Balance', price: 0 },
        ],
    }

    const existing = await PartsCatalog.findOne({ singleton: 'catalog' })
    if (existing) {
        console.log('Existing catalog found — overwriting with static-file data.')
        Object.assign(existing, data)
        await existing.save()
    } else {
        await PartsCatalog.create(data)
        console.log('Created new catalog document.')
    }

    console.log('Seed complete.')
    await mongoose.disconnect()
}

seed().catch(err => {
    console.error('Seed failed:', err)
    process.exit(1)
})
