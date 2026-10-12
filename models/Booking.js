const mongoose = require('mongoose')
const crypto = require('crypto')

// ── Sub-schemas mirroring buildAdminPayload() in configurator.js ──

const PartLineItemSchema = new mongoose.Schema({
    label: String,
    partNumber: String,
    supplier: mongoose.Schema.Types.Mixed, // result of getSupplierInfo(), shape owned by partsCatalog.js
    unitPrice: Number,
    qty: Number,
    unitLabel: String,
    lineTotal: Number,
    isPlaceholder: Boolean,
    url: String,               // product page to order from
    fitment: String            // 'vehicle' | 'default' | 'product' | 'missing' | 'none' — see getPartRecord()
}, { _id: false })

const LaborLineItemSchema = new mongoose.Schema({
    label: String,
    hours: Number,
    rate: Number,
    cost: Number,
    actualLaborCost: Number,   // present on bundled/complimentary diagnostic
    isComplimentary: Boolean,
    isTripCharge: Boolean,
    isQuote: Boolean,          // Detailing: priced on site, cost is 0 here
    isFromPrice: Boolean       // Detailing: starting price ("$799+")
}, { _id: false })

const BookingSchema = new mongoose.Schema({
    // ── Vehicle ──
    vehicle: {
        vinMode: { type: String, enum: ['manual', 'vin'], required: true },
        make: String,
        model: String,
        year: String,
        vin: String,
        vehicleType: String,
        specs: mongoose.Schema.Types.Mixed,       // resolveVehicleSpecs() snapshot at booking time
        isEstimateSpecs: Boolean
    },

    // ── Service ──
    category: { type: String, required: true }, // 'Detailing' | 'Tint' | 'Automotive'
    services: [String],                          // display names, e.g. "Premium Oil Change"
    selections: mongoose.Schema.Types.Mixed,      // state.selectedParts — per-service configurator choices
    serviceNotes: mongoose.Schema.Types.Mixed,    // e.g. { "Oil Change": { highMileage: true } }

    // ── Discount code (any category) ──
    // Snapshot of the code as redeemed, so later edits/deletes of the
    // code never change what this booking was promised. `amount` is
    // null when the category has no online pricing (applied to the quote).
    discount: {
        code: String,
        type: { type: String, enum: ['percent', 'fixed'] },
        value: Number,
        label: String,
        amount: Number
    },

    // ── Pricing (Automotive + Detailing — null/empty for Tint) ──
    // Detailing has no parts; every charge is a labor line.
    parts: [PartLineItemSchema],
    labor: [LaborLineItemSchema],
    toolsNeeded: [String],
    pricing: {
        partsSubtotal: Number,
        laborSubtotal: Number,
        subtotal: Number,           // before discount
        discount: Number,           // dollars off the subtotal (0 / unset = none)
        taxRate: Number,
        tax: Number,                // charged on subtotal minus discount
        total: Number,
        estimatedHours: Number      // hours of work — also drives which time windows the job blocks
    },
    flags: {
        hasPlaceholderPricing: Boolean,
        isEstimateSpecs: Boolean,
        hasQuoteItems: Boolean,     // Detailing: total excludes on-site quotes
        isStartingPrice: Boolean    // Detailing: total is a "from" price
    },

    // ── Logistics ──
    locationType: { type: String, required: true }, // 'Home' | 'Office / Work' | 'Other'
    serviceAddress: { type: String, required: true },
    preferredDate: { type: String, required: true },  // raw yyyy-mm-dd from <input type="date">
    preferredTime: { type: String, required: true },
    firstTimeCustomer: Boolean,

    // ── Contact ──
    contact: {
        firstName: { type: String, required: true },
        lastName: { type: String, required: true },
        phone: { type: String, required: true },
        email: String
    },
    notes: String,
    hearAbout: String,

    // ── Account ──
    // Set when the booking was made while logged in; null for guests.
    // Drives Account → Order History and who may review the booking.
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    // Last 10 digits of contact.phone, set automatically on save. Lets a
    // GUEST booking show up for an account with the same phone number.
    phoneKey: { type: String, default: '', index: true },

    // ── Admin workflow ──
    status: {
        type: String,
        enum: ['new', 'contacted', 'confirmed', 'completed', 'cancelled'],
        default: 'new'
    },

    // ── Customer self-service ──
    // Random secret behind the "Manage your booking" link in the
    // confirmation email (/booking/manage/<token>). Whoever has the link
    // can view, cancel or reschedule this one booking — no login needed.
    manageToken: { type: String, index: true, sparse: true },
    // Cancels / reschedules the customer made themselves, newest last.
    customerChanges: [{
        _id: false,
        at: { type: Date, default: Date.now },
        action: String,   // 'cancelled' | 'rescheduled'
        detail: String
    }],

    // When the booking was submitted. (This used to be worked out once,
    // when the server started, so every booking got the server's start
    // time instead of its own.)
    createdAt: {
        type: Date,
        default: Date.now
    }
})

/** "(919) 555-0100" / "+1 919 555 0100" -> "9195550100"; '' if there aren't 10 digits. */
function phoneKeyOf(phone) {
    const digits = String(phone || '').replace(/\D/g, '')
    return digits.length >= 10 ? digits.slice(-10) : ''
}

BookingSchema.pre('validate', function () {
    this.phoneKey = phoneKeyOf(this.contact && this.contact.phone)
    if (!this.manageToken) this.manageToken = crypto.randomBytes(24).toString('hex')
})

/** Statuses a customer may still cancel or reschedule from. */
BookingSchema.statics.OPEN_STATUSES = ['new', 'contacted', 'confirmed']

/**
 * Gives a booking saved before manage links existed its token.
 * Returns the token either way.
 */
BookingSchema.methods.ensureManageToken = async function () {
    if (!this.manageToken) {
        this.manageToken = crypto.randomBytes(24).toString('hex')
        await this.constructor.updateOne({ _id: this._id }, { $set: { manageToken: this.manageToken } })
    }
    return this.manageToken
}

/**
 * Mongo filter for "this account's bookings": ones made while logged in,
 * plus guest bookings whose phone number matches the account's.
 * Phone numbers aren't verified, so a guest match is weaker proof of
 * ownership than a logged-in booking — the order history page hides the
 * street address on guest matches for that reason.
 */
BookingSchema.statics.accountFilter = function (user) {
    const own = { user: user._id }
    const key = phoneKeyOf(user.phone)
    return key ? { $or: [own, { user: null, phoneKey: key }] } : own
}

const Booking = mongoose.model('Booking', BookingSchema)

module.exports = Booking