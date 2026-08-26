const mongoose = require('mongoose')
const currentTime = Date.now();
const date = new Date(currentTime);
const estOffset = -5 * 60; // EST is UTC-5, in minutes
const estDate = new Date(date.getTime() + (estOffset * 60 * 1000));

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
    date: {
        type: Date,
        default: estDate.toLocaleString("en-US", { timeZone: "America/New_York" })
    }
})

const User = mongoose.model('User', UserSchema)

module.exports = User