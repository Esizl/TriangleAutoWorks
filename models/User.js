const mongoose = require('mongoose')
const currentTime = Date.now();
const date = new Date(currentTime);
const estOffset = -5 * 60; // EST is UTC-5, in minutes
const estDate = new Date(date.getTime() + (estOffset * 60 * 1000));

// One entry per registered passkey/security key (including a future
// ESP32 hardware authenticator — same credential shape, same verification
// path, since both speak WebAuthn). credentialID is stored as the
// base64url string simplewebauthn already gives us; publicKey is stored
// as a Buffer since that's what verifyAuthenticationResponse expects back.
const PasskeySchema = new mongoose.Schema({
    credentialID: { type: String, required: true },
    publicKey: { type: Buffer, required: true },
    counter: { type: Number, required: true, default: 0 },
    transports: { type: [String], default: [] },
    deviceType: { type: String, default: null }, // 'singleDevice' | 'multiDevice'
    backedUp: { type: Boolean, default: false },
    nickname: { type: String, default: null }, // e.g. "iPhone", "ESP32 key" — set by the user, shown in Settings
    createdAt: { type: Date, default: Date.now }
}, { _id: false })

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true
    },
    phone: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: Number,
        default: 1
    },
    passkeys: {
        type: [PasskeySchema],
        default: []
    },
    // Forgot-password (routes/password.js). Only a SHA-256 hash of the
    // emailed token is stored, and it is cleared once used.
    resetTokenHash: { type: String, default: null },
    resetTokenExpires: { type: Date, default: null },
    resetRequestedAt: { type: Date, default: null }, // throttles repeat reset emails
    date: {
        type: Date,
        default: estDate.toLocaleString("en-US", { timeZone: "America/New_York" })
    }
})

// ── One account per email and per phone number ──
// Emails and phones are stored as typed, so every comparison here ignores
// formatting: "Me@Mail.com" = "me@mail.com", and "(919) 555-0100" =
// "919-555-0100" = "+1 919 555 0100" (last 10 digits).

function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function emailPattern(email) {
    return new RegExp(`^${escapeRegex(String(email || '').trim())}$`, 'i')
}

/** Just the digits of a phone number. */
UserSchema.statics.phoneDigits = function (phone) {
    return String(phone || '').replace(/\D/g, '')
}

/** The account with this email, ignoring upper/lower case. */
UserSchema.statics.findByEmail = function (email) {
    return this.findOne({ email: emailPattern(email) })
}

/** Is this email on an account already? Pass exceptUserId to ignore the user's own account. */
UserSchema.statics.emailTaken = async function (email, exceptUserId) {
    const filter = { email: emailPattern(email) }
    if (exceptUserId) filter._id = { $ne: exceptUserId }
    return !!(await this.exists(filter))
}

/** Is this phone number on an account already? Pass exceptUserId to ignore the user's own account. */
UserSchema.statics.phoneTaken = async function (phone, exceptUserId) {
    const last10 = this.phoneDigits(phone).slice(-10)
    if (last10.length < 10) return false
    // The same 10 digits at the end of the stored number, with any
    // punctuation or spaces between them.
    const filter = { phone: new RegExp(last10.split('').join('\\D*') + '\\D*$') }
    if (exceptUserId) filter._id = { $ne: exceptUserId }
    return !!(await this.exists(filter))
}

const User = mongoose.model('User', UserSchema)

module.exports = User