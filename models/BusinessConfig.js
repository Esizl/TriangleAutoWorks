const mongoose = require('mongoose')

const BusinessConfigSchema = new mongoose.Schema({
    singleton: {
        type: String,
        default: 'config',
        unique: true,
        immutable: true
    },
    laborRatePerHour: {
        type: Number,
        default: 40,
        min: 0
    },
    diagnosticStandaloneFee: {
        type: Number,
        default: 100,
        min: 0
    },
    // Sales tax charged on estimates, as a percent (7.75 = 7.75%).
    taxRatePercent: {
        type: Number,
        default: 7.75,
        min: 0,
        max: 25
    },
    // ── "Bring it to us" (drop-off), for approved customers only ──
    // Where approved customers bring the vehicle. Shown to them on the
    // booking form and in their emails. Leave empty to turn drop-off off.
    dropOffAddress: { type: String, trim: true, default: '' },
    // Optional directions: "Park in the driveway, keys in the lockbox".
    dropOffNotes: { type: String, trim: true, default: '' },
    // How much cheaper a drop-off is than us driving out.
    dropOffDiscountType: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
    dropOffDiscountValue: { type: Number, default: 10, min: 0 },

    // How many confirmed jobs may overlap the same time window. 1 = one
    // job at a time (a second booking can't land on a window that a
    // confirmed job is already using).
    bookingCapacityPerWindow: {
        type: Number,
        default: 1,
        min: 1
    }
}, { timestamps: true })

let cachedConfig = null

// Read path used everywhere in the app. Cached after first load so
// routes like /api/availability don't hit Mongo on every request.
BusinessConfigSchema.statics.getConfig = async function () {
    if (cachedConfig) return cachedConfig
    cachedConfig = await this.findOneAndUpdate(
        { singleton: 'config' },
        { $setOnInsert: { singleton: 'config' } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    return cachedConfig
}

// Write path used only by the admin editor. Busts the cache so the
// next getConfig() picks up new values immediately.
BusinessConfigSchema.statics.updateConfig = async function (updates) {
    cachedConfig = await this.findOneAndUpdate(
        { singleton: 'config' },
        { $set: updates, $setOnInsert: { singleton: 'config' } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true }
    )
    return cachedConfig
}

// The pricing numbers the booking form and the server-side price check
// both run on. taxRate is a fraction (0.0775), ready to multiply by.
BusinessConfigSchema.statics.getPricingSettings = async function () {
    const config = await this.getConfig()
    const taxPercent = (typeof config.taxRatePercent === 'number') ? config.taxRatePercent : 7.75
    return {
        laborRatePerHour: config.laborRatePerHour,
        diagnosticStandaloneFee: config.diagnosticStandaloneFee,
        taxRate: taxPercent / 100,
        dropOffDiscountType: config.dropOffDiscountType || 'percent',
        dropOffDiscountValue: (typeof config.dropOffDiscountValue === 'number') ? config.dropOffDiscountValue : 10
    }
}

module.exports = mongoose.model('BusinessConfig', BusinessConfigSchema)