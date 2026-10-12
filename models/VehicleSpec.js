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
    // Optional last year of a run: an entry with year 2016 and yearEnd 2021
    // covers 2016 through 2021. null = the entry is for `year` only. An
    // entry for one exact year always wins over a run that includes it.
    yearEnd: {
        type: Number,
        default: null
    },
    // false = starting figures nobody has checked against the vehicle or
    // its manual yet (see scripts/seedVehicleSpecEstimates.js). The booking
    // form keeps showing the "Estimated" flag for these. Saving an entry
    // in the admin panel marks it verified.
    verified: {
        type: Boolean,
        default: true
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

/**
 * The spec entry that applies to one vehicle, or null: an entry for the
 * exact year wins, then an entry covering a run of years that includes
 * it (year..yearEnd), then the model-level default (year: null).
 * Used by the booking form (/api/vehicle-specs) and by the server-side
 * price check, so both always price from the same entry.
 */
VehicleSpecSchema.statics.resolveFor = async function (make, model, year) {
    const yearNum = parseInt(year, 10)
    let spec = null
    if (!isNaN(yearNum)) {
        spec = await this.findOne({ make, model, year: yearNum, yearEnd: null }).lean()
        if (!spec) {
            spec = await this.findOne({
                make,
                model,
                year: { $lte: yearNum },
                yearEnd: { $gte: yearNum }
            }).sort({ year: -1 }).lean()
        }
    }
    if (!spec) {
        spec = await this.findOne({ make, model, year: null }).lean()
    }
    return spec
}

const VehicleSpec = mongoose.model('VehicleSpec', VehicleSpecSchema)

module.exports = VehicleSpec