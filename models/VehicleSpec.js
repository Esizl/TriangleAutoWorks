const mongoose = require('mongoose')

const VehicleSpecSchema = new mongoose.Schema({
    make: {
        type: String,
        required: true
    },
    model: {
        type: String,
        required: true
    },
    // null = this is the model-level default, applied to any year without
    // its own specific entry. A non-null year is a full standalone override
    // for that exact year (does not merge with the model default).
    year: {
        type: Number,
        default: null
    },

    oil: {
        viscosity: { type: String, default: null },
        capacity: { type: Number, default: null }
    },
    filter: {
        brandPartNumber: { type: String, default: null },
        socket: { type: String, default: null }
    },
    drainPlug: {
        type: String,
        default: null
    },
    tires: {
        size: { type: String, default: null }
    },
    tools: {
        oilChange: { type: [String], default: [] }
    },
    // Estimated labor time for an oil change on this vehicle, in minutes.
    oilChangeLaborMinutes: {
        type: Number,
        default: null
    },
    // e.g. "premium" — forces a specific oil tier regardless of the
    // brand's normal default tier (used for vehicles that require full
    // synthetic only, etc.)
    oilTierOverride: {
        type: String,
        default: null
    },
    // Free-text rationale/notes. Replaces what used to be inline JS
    // comments in vehicleSpecs.js (e.g. why a labor time is what it is,
    // or why a tier override exists).
    notes: {
        type: String,
        default: ''
    }
}, { timestamps: true })

// One entry per make/model/year combination (year can repeat as null only
// once per make/model, enforced by the unique index below).
VehicleSpecSchema.index({ make: 1, model: 1, year: 1 }, { unique: true })

const VehicleSpec = mongoose.model('VehicleSpec', VehicleSpecSchema)

module.exports = VehicleSpec