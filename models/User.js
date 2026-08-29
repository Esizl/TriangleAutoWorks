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
    date: {
        type: Date,
        default: estDate.toLocaleString("en-US", { timeZone: "America/New_York" })
    }
})

const User = mongoose.model('User', UserSchema)

module.exports = User