const mongoose = require('mongoose')

/**
 * Phone numbers you've approved as trusted customers ("Admin > Site >
 * Trusted Customers"). Whoever logs in with an account that has one of
 * these numbers gets the "Bring it to us" drop-off option — so you can
 * approve someone before they've even made an account.
 *
 * Accounts can also be approved directly (User.trustedCustomer).
 */
const TrustedPhoneSchema = new mongoose.Schema({
    // Last 10 digits only, e.g. "9195550100" — the same key bookings use.
    phone: { type: String, required: true, unique: true, match: /^\d{10}$/ },
    name: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, default: '' }
}, { timestamps: true })

module.exports = mongoose.model('TrustedPhone', TrustedPhoneSchema)
