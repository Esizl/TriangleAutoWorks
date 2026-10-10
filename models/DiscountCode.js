const mongoose = require('mongoose')

/**
 * DiscountCode
 * -----------------------------------------------------------------------
 * A code a customer types on the Review step of the booking form. It is
 * not tied to one service section — by default it applies to the whole
 * booking, in any category. Optional limits narrow that down.
 *
 * ALL rule checking lives in this file (check / redeem) so the public
 * "is this code good?" endpoint and the booking submission can never
 * disagree about what a code is worth.
 * -----------------------------------------------------------------------
 */

const CATEGORIES = ['Automotive', 'Detailing', 'Tint']
const CODE_PATTERN = /^[A-Z0-9-]{3,24}$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

const DiscountCodeSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
        match: CODE_PATTERN
    },
    description: { type: String, trim: true, default: '' }, // internal note, never shown to customers

    type: { type: String, enum: ['percent', 'fixed'], required: true },
    value: { type: Number, required: true, min: 0.01 },      // percent: 1–100, fixed: dollars

    // ── Limits (all optional) ──
    categories: { type: [String], enum: CATEGORIES, default: [] }, // empty = every category
    minSubtotal: { type: Number, default: 0, min: 0 },             // pre-tax, pre-discount
    maxUses: { type: Number, default: null, min: 1 },              // null = unlimited
    firstTimeOnly: { type: Boolean, default: false },
    startsOn: { type: String, default: '', match: /^$|^\d{4}-\d{2}-\d{2}$/ },   // yyyy-mm-dd, inclusive
    expiresOn: { type: String, default: '', match: /^$|^\d{4}-\d{2}-\d{2}$/ },  // yyyy-mm-dd, inclusive

    active: { type: Boolean, default: true },
    usedCount: { type: Number, default: 0, min: 0 }
}, { timestamps: true })

DiscountCodeSchema.path('value').validate(function (v) {
    return this.type !== 'percent' || v <= 100
}, 'A percent discount cannot be more than 100.')

function normalizeCode(raw) {
    return String(raw || '').trim().toUpperCase()
}

/** Today's date in the business's timezone, as yyyy-mm-dd (string-comparable). */
function todayEastern() {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

function roundCents(n) {
    return Math.round(n * 100) / 100
}

/** "10% off" / "$25 off" */
DiscountCodeSchema.methods.label = function () {
    return this.type === 'percent' ? `${this.value}% off` : `$${this.value} off`
}

/** Admin-facing lifecycle status, derived (never stored). */
DiscountCodeSchema.methods.status = function () {
    const today = todayEastern()
    if (!this.active) return 'disabled'
    if (this.expiresOn && today > this.expiresOn) return 'expired'
    if (this.maxUses != null && this.usedCount >= this.maxUses) return 'used up'
    if (this.startsOn && today < this.startsOn) return 'scheduled'
    return 'active'
}

/** Dollars off a given pre-tax subtotal. Never more than the subtotal. */
DiscountCodeSchema.methods.amountFor = function (subtotal) {
    if (typeof subtotal !== 'number' || !(subtotal > 0)) return 0
    const raw = this.type === 'percent' ? subtotal * (this.value / 100) : this.value
    return roundCents(Math.min(raw, subtotal))
}

/** What the booking form is allowed to know about a valid code. */
DiscountCodeSchema.methods.toPublic = function () {
    return {
        code: this.code,
        type: this.type,
        value: this.value,
        label: this.label(),
        categories: this.categories,
        minSubtotal: this.minSubtotal
    }
}

/**
 * Check a typed code against a booking-in-progress.
 * ctx: { category, subtotal (number, or null when the category has no
 *        online pricing), firstTimeCustomer, phone }
 * Returns { ok: true, doc } or { ok: false, message } — message is
 * written for the customer.
 */
DiscountCodeSchema.statics.check = async function (rawCode, ctx = {}) {
    const code = normalizeCode(rawCode)
    const invalid = { ok: false, message: "That code isn't valid." }
    if (!CODE_PATTERN.test(code)) return invalid

    const doc = await this.findOne({ code })
    // Unknown, disabled and not-yet-started codes all read the same, so
    // the form can't be used to discover which codes exist.
    if (!doc || !doc.active) return invalid

    const today = todayEastern()
    if (doc.startsOn && today < doc.startsOn) return invalid
    if (doc.expiresOn && today > doc.expiresOn) {
        return { ok: false, message: 'That code has expired.' }
    }
    if (doc.maxUses != null && doc.usedCount >= doc.maxUses) {
        return { ok: false, message: 'That code has already been used the maximum number of times.' }
    }
    if (doc.categories.length > 0 && !doc.categories.includes(ctx.category)) {
        return { ok: false, message: `That code is only good for ${doc.categories.join(' or ')} bookings.` }
    }
    if (doc.minSubtotal > 0 && typeof ctx.subtotal === 'number' && ctx.subtotal < doc.minSubtotal) {
        return { ok: false, message: `That code needs a subtotal of at least $${doc.minSubtotal.toFixed(2)}.` }
    }
    if (doc.firstTimeOnly) {
        if (!ctx.firstTimeCustomer) {
            return { ok: false, message: 'That code is for first-time customers only.' }
        }
        const digits = String(ctx.phone || '').replace(/\D/g, '')
        if (digits.length >= 10) {
            const Booking = mongoose.model('Booking')
            const phonePattern = new RegExp(digits.slice(-10).split('').join('\\D*'))
            const seenBefore = await Booking.exists({ 'contact.phone': phonePattern })
            if (seenBefore) {
                return { ok: false, message: 'That code is for first-time customers only, and this phone number already has a booking with us.' }
            }
        }
    }

    return { ok: true, doc }
}

/**
 * check() + claim one use, atomically — two people submitting the last
 * use of a code at the same moment can't both get it. Call release()
 * if the booking then fails to save.
 */
DiscountCodeSchema.statics.redeem = async function (rawCode, ctx = {}) {
    const result = await this.check(rawCode, ctx)
    if (!result.ok) return result

    const claimed = await this.findOneAndUpdate(
        {
            _id: result.doc._id,
            active: true,
            $or: [{ maxUses: null }, { $expr: { $lt: ['$usedCount', '$maxUses'] } }]
        },
        { $inc: { usedCount: 1 } },
        { new: true }
    )
    if (!claimed) {
        return { ok: false, message: 'That code has already been used the maximum number of times.' }
    }
    return { ok: true, doc: claimed }
}

DiscountCodeSchema.statics.release = async function (id) {
    await this.updateOne({ _id: id, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } })
}

DiscountCodeSchema.statics.CATEGORIES = CATEGORIES
DiscountCodeSchema.statics.CODE_PATTERN = CODE_PATTERN
DiscountCodeSchema.statics.DATE_PATTERN = DATE_PATTERN
DiscountCodeSchema.statics.normalizeCode = normalizeCode

module.exports = mongoose.model('DiscountCode', DiscountCodeSchema)
