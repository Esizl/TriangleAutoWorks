/**
 * sessionStore.js
 * -----------------------------------------------------------------------
 * Keeps login sessions in MongoDB instead of the server's memory.
 *
 * express-session's default store lives in memory, so every restart or
 * deploy logged everyone out (and it leaks memory over time — Express
 * prints a warning about it at startup). This store puts each session
 * in a `sessions` collection, so logins survive restarts.
 *
 * Built on mongoose, which the app already uses — no extra package.
 * Expired sessions are removed by MongoDB itself (the TTL index on
 * `expires`), usually within a minute of expiring.
 * -----------------------------------------------------------------------
 */

const session = require('express-session')
const mongoose = require('mongoose')

const SessionSchema = new mongoose.Schema({
    _id: String,                                   // the session id from the cookie
    data: { type: String, required: true },         // the session, as JSON
    expires: { type: Date, required: true }
}, { versionKey: false })

// expireAfterSeconds: 0 = delete each document once its own `expires` time passes.
SessionSchema.index({ expires: 1 }, { expireAfterSeconds: 0 })

const SessionModel = mongoose.models.Session || mongoose.model('Session', SessionSchema)

// Used when a session's cookie has no expiry of its own.
const DEFAULT_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000

function expiryOf(sessionData) {
    const cookieExpiry = sessionData && sessionData.cookie && sessionData.cookie.expires
    return cookieExpiry ? new Date(cookieExpiry) : new Date(Date.now() + DEFAULT_LIFETIME_MS)
}

class MongooseSessionStore extends session.Store {
    get(sid, callback) {
        SessionModel.findById(sid).lean()
            .then(doc => {
                // Mongo's cleanup runs about once a minute, so an expired
                // session can still be sitting there — treat it as gone.
                if (!doc || doc.expires <= new Date()) return callback(null, null)
                callback(null, JSON.parse(doc.data))
            })
            .catch(callback)
    }

    set(sid, sessionData, callback) {
        SessionModel.updateOne(
            { _id: sid },
            { $set: { data: JSON.stringify(sessionData), expires: expiryOf(sessionData) } },
            { upsert: true }
        ).then(() => callback && callback(null)).catch(err => callback && callback(err))
    }

    /** Called on requests that didn't change the session: just push the expiry back. */
    touch(sid, sessionData, callback) {
        SessionModel.updateOne({ _id: sid }, { $set: { expires: expiryOf(sessionData) } })
            .then(() => callback && callback(null)).catch(err => callback && callback(err))
    }

    destroy(sid, callback) {
        SessionModel.deleteOne({ _id: sid })
            .then(() => callback && callback(null)).catch(err => callback && callback(err))
    }
}

module.exports = { MongooseSessionStore }
