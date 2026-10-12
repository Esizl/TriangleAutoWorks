/**
 * trust.js — who may use "Bring it to us" (drop-off at a lower price).
 *
 * Only logged-in customers you've approved by hand, either:
 *   - their account is marked trusted (User.trustedCustomer), or
 *   - their account's phone number is on the trusted phone list.
 * Nobody qualifies automatically. Admin > Site > Trusted Customers lists
 * repeat customers to make approving them quick.
 */

const TrustedPhone = require('../models/TrustedPhone')

/** "(919) 555-0100" -> "9195550100"; '' without 10 digits. Same rule bookings use. */
function phoneKey(phone) {
    const digits = String(phone || '').replace(/\D/g, '')
    return digits.length >= 10 ? digits.slice(-10) : ''
}

/** Can this logged-in user book a drop-off? false for guests. */
async function isTrustedCustomer(user) {
    if (!user) return false
    if (user.trustedCustomer) return true
    const key = phoneKey(user.phone)
    return key ? !!(await TrustedPhone.exists({ phone: key })) : false
}

module.exports = { phoneKey, isTrustedCustomer }
