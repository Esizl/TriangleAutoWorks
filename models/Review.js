const mongoose = require('mongoose')

/**
 * Review
 * -----------------------------------------------------------------------
 * A star rating + optional comment a customer leaves on one of their own
 * COMPLETED bookings (Account → Order History). One review per booking.
 *
 * New reviews start as 'pending' and only appear on the home page once
 * approved in Admin → Site → Reviews.
 * -----------------------------------------------------------------------
 */

const STATUSES = ['pending', 'approved', 'hidden']
const MAX_TEXT_LENGTH = 1000

const ReviewSchema = new mongoose.Schema({
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Snapshots taken when the review is written, so the public card
    // doesn't change if the account or booking is edited later.
    displayName: { type: String, required: true, trim: true }, // "Hayden F."
    category: String,
    services: [String],
    vehicle: String,                                           // "2019 Honda Civic"

    rating: {
        type: Number,
        required: true,
        min: 1,
        max: 5,
        validate: { validator: Number.isInteger, message: 'Rating must be a whole number of stars.' }
    },
    text: { type: String, trim: true, maxlength: MAX_TEXT_LENGTH, default: '' },

    status: { type: String, enum: STATUSES, default: 'pending', index: true }
}, { timestamps: true })

/** "Hayden Fish" -> "Hayden F." — what the public sees instead of a full name. */
ReviewSchema.statics.displayNameFor = function (fullName) {
    const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return 'Customer'
    if (parts.length === 1) return parts[0]
    return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`
}

/**
 * What the home page shows: the count and average of every approved
 * review, plus the newest approved ones that have a written comment.
 */
ReviewSchema.statics.publicSummary = async function (limit = 6) {
    const [stats] = await this.aggregate([
        { $match: { status: 'approved' } },
        { $group: { _id: null, count: { $sum: 1 }, average: { $avg: '$rating' } } }
    ])
    const reviews = await this.find({ status: 'approved', text: { $ne: '' } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()

    return {
        count: stats ? stats.count : 0,
        average: stats ? stats.average : 0,
        reviews
    }
}

ReviewSchema.statics.STATUSES = STATUSES
ReviewSchema.statics.MAX_TEXT_LENGTH = MAX_TEXT_LENGTH

module.exports = mongoose.model('Review', ReviewSchema)
