// Where the MongoDB connection string comes from.
//
// It is a password, so it belongs in the MONGO_URI environment variable
// (the .env file locally, the Variables tab on Railway) and NOT in
// config.json, which is committed to a public repo. server.mongoUri in
// config.json is still read as a fallback so nothing breaks mid-move —
// delete that line once MONGO_URI is set in both places.

const fs = require('fs')
const path = require('path')

// Scripts in scripts/ don't go through index.js, so load .env here too.
// (Variables that are already set are left alone.)
const envFile = path.join(__dirname, '..', '.env')
if (typeof process.loadEnvFile === 'function' && fs.existsSync(envFile)) {
    process.loadEnvFile(envFile)
}

function getMongoUri() {
    const uri = process.env.MONGO_URI || require('./config.json').server.mongoUri
    if (!uri) {
        throw new Error('No database connection string. Set MONGO_URI in .env (locally) or in Railway\'s Variables.')
    }
    return uri
}

module.exports = { getMongoUri }
