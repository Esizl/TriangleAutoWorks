const mongoose = require('mongoose')

/**
 * EmailVerification
 * -----------------------------------------------------------------------
 * One pending "enter the 6-digit code we emailed you" step. Used for:
 *   - 'signup'        the account is only created once the code is entered
 *                     (payload holds the name / email / phone / password hash)
 *   - 'email-change'  an existing user's email only changes once the code
 *                     sent to the NEW address is entered
 *
 * Only a hash of the code is stored. MongoDB deletes the document by
 * itself shortly after expiresAt (TTL index), so abandoned signups clean
 * themselves up. All logic lives in services/emailVerification.js.
 * -----------------------------------------------------------------------
 */
const EmailVerificationSchema = new mongoose.Schema({
    purpose: { type: String, enum: ['signup', 'email-change'], required: true },
    email: { type: String, required: true },               // where the code was sent, as typed
    emailKey: { type: String, required: true, index: true }, // lower-cased, for throttling
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },                // wrong codes entered so far
    lastSentAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },

    payload: mongoose.Schema.Types.Mixed,                  // signup: the account to create
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null } // email-change: whose email
})

module.exports = mongoose.model('EmailVerification', EmailVerificationSchema)
