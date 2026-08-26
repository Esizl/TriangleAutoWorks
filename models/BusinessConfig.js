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
    bookingCapacityPerWindow: {
        type: Number,
        default: 2,
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

module.exports = mongoose.model('BusinessConfig', BusinessConfigSchema)