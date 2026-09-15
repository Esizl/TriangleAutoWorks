const mongoose = require('mongoose')

// Sub-schemas. All allow default _id (unlike a plain lookup table) because
// the admin UI needs a stable per-item id to target for edit/delete inside
// the singleton document's arrays.

const supplierSchema = new mongoose.Schema({
    key: { type: String, required: true, trim: true },       // e.g. "rockauto" — referenced by other entries' `supplier` field
    label: { type: String, required: true, trim: true },      // e.g. "RockAuto"
    baseUrl: { type: String, required: true, trim: true }
})

const oilProductSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },       // e.g. "ARGOS", "Valvoline Synthetic Blend" — the brand+grade display name
    quartPartNumber: { type: String, default: null },         // part number for a single quart
    jugPartNumber: { type: String, default: null },           // part number for the 5-quart jug
    price: { type: Number, default: null },                   // per-quart top-off price
    jugPrice: { type: Number, default: null },                 // 5-quart jug price
    supplier: { type: String, default: null },                 // references a Supplier.key
    url: { type: String, default: null },
    oilCategory: { type: String, enum: ['Conventional', 'Synthetic', null], default: null },
    tier: { type: String, enum: ['budget', 'premium', null], default: null },
    availability: { type: String, default: 'all' },
    includesFreeFilter: { type: Boolean, default: false },
    highMileage: { type: Boolean, default: false },            // true = formulated for 75k+ mile vehicles
    // Empty array = universal (this product is offered regardless of the
    // vehicle's recommended viscosity) — mirrors the compatibleMakes
    // "no restriction listed = universal" convention on filterBrandSchema.
    // Populate it only for products that are genuinely sold in specific
    // viscosities you want to gate on.
    viscosities: { type: [String], default: [] }
})

const filterBrandSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },       // e.g. "Carquest", "AC Delco"
    partNumber: { type: String, default: null },               // generic/default part number for this brand's oil filter — shown on tech sheets whenever a more specific per-vehicle Filter Overrides entry doesn't already supply one
    price: { type: Number, required: true, min: 0 },
    supplier: { type: String, default: null },
    // Empty array = universal / all makes (mirrors the original
    // FILTER_COMPATIBILITY rule: "no entry = universal"). Only populate
    // this for brands that are genuinely make-restricted in real life.
    compatibleMakes: { type: [String], default: [] }
})

// Per-vehicle part-number/price/url override for a filter brand.
// filterType distinguishes oil/engine/cabin filters — the same brand can
// have a different part number for each type on the same vehicle.
// year: null means "_default" (applies to every year of that model
// unless a more specific year entry also exists).
const filterOverrideSchema = new mongoose.Schema({
    brand: { type: String, required: true, trim: true },
    filterType: { type: String, enum: ['oil', 'engine', 'cabin'], required: true, default: 'oil' },
    make: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    year: { type: Number, default: null },
    partNumber: { type: String, default: null },
    price: { type: Number, default: null },
    url: { type: String, default: null }
})

// Shared shape for brake pad types and rotor options — both are just
// named price points with an optional supplier and an optional generic
// part number (shown on tech sheets; there's no per-vehicle override
// mechanism for these like filters have, since pad/rotor part numbers
// don't typically vary by vehicle the way filter part numbers do).
const priceOptionSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    partNumber: { type: String, default: null },
    price: { type: Number, required: true, min: 0 },
    supplier: { type: String, default: null }
})

const tireServiceSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    partNumber: { type: String, default: null },
    price: { type: Number, required: true, min: 0, default: 0 }
})

const partsCatalogSchema = new mongoose.Schema({
    singleton: {
        type: String,
        default: 'catalog',
        unique: true,
        immutable: true
    },
    suppliers: { type: [supplierSchema], default: [] },
    oilProducts: { type: [oilProductSchema], default: [] },
    filterBrands: { type: [filterBrandSchema], default: [] },
    filterOverrides: { type: [filterOverrideSchema], default: [] },
    brakePadTypes: { type: [priceOptionSchema], default: [] },
    rotorOptions: { type: [priceOptionSchema], default: [] },
    tireServiceTypes: { type: [tireServiceSchema], default: [] }
}, { timestamps: true })

let cachedCatalog = null

// Read path — used by the /js/partsCatalog.js generator route on every
// booking page load, so it's cached the same way BusinessConfig is.
partsCatalogSchema.statics.getCatalog = async function () {
    if (cachedCatalog) return cachedCatalog
    cachedCatalog = await this.findOneAndUpdate(
        { singleton: 'catalog' },
        { $setOnInsert: { singleton: 'catalog' } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    return cachedCatalog
}

// Write path — used only by the admin editor routes. Busts the cache so
// the next getCatalog() (and therefore the next /js/partsCatalog.js
// request) picks up the change immediately.
partsCatalogSchema.statics.saveCatalog = async function (doc) {
    await doc.save()
    cachedCatalog = doc
    return doc
}

module.exports = mongoose.model('PartsCatalog', partsCatalogSchema)
