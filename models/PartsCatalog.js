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
    partNumber: { type: String, default: null },
    price: { type: Number, default: null },                   // per-quart top-off price
    jugPrice: { type: Number, default: null },                 // 5-quart jug price
    supplier: { type: String, default: null },                 // references a Supplier.key
    url: { type: String, default: null },
    oilCategory: { type: String, enum: ['Conventional', 'Synthetic', null], default: null },
    tier: { type: String, enum: ['budget', 'premium', null], default: null },
    availability: { type: String, default: 'all' },
    includesFreeFilter: { type: Boolean, default: false }
})

const filterBrandSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },       // e.g. "Carquest", "AC Delco"
    price: { type: Number, required: true, min: 0 },
    supplier: { type: String, default: null },
    // Empty array = universal / all makes (mirrors the original
    // FILTER_COMPATIBILITY rule: "no entry = universal"). Only populate
    // this for brands that are genuinely make-restricted in real life.
    compatibleMakes: { type: [String], default: [] }
})

// Per-vehicle part-number/price/url override for a filter brand.
// year: null means "_default" (applies to every year of that model
// unless a more specific year entry also exists).
const filterOverrideSchema = new mongoose.Schema({
    brand: { type: String, required: true, trim: true },
    make: { type: String, required: true, trim: true },
    model: { type: String, required: true, trim: true },
    year: { type: Number, default: null },
    partNumber: { type: String, default: null },
    price: { type: Number, default: null },
    url: { type: String, default: null }
})

// Shared shape for brake pad types and rotor options — both are just
// named price points with an optional supplier.
const priceOptionSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    supplier: { type: String, default: null }
})

const tireServiceSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
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
