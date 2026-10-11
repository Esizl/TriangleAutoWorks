const router = require('express').Router()
const { ensureAuthenticated } = require('../config/ensureAuth')
const version = require('../config/config.json').server.version
const User = require('../models/User')
const Review = require('../models/Review')

// --- Home route ---
router.get('/', async (req, res) => {
    // Reviews are an extra on the home page: if they fail to load, log it
    // loudly but still serve the page (the section just doesn't render).
    let reviewSummary = { count: 0, average: 0, reviews: [] }
    try {
        reviewSummary = await Review.publicSummary()
    } catch (err) {
        console.error('[home] Failed to load reviews:', err)
    }
    res.render('index', { version, reviewSummary })
})

router.get('/booking', async (req, res) => {
    res.render('booking')
})

router.get('/login', (req, res) => {
    res.render('login.ejs')
})

router.get('/signup', (req, res) => {
    res.render('signup.ejs')
})

// Profile and password changes live in routes/settings.js
// (POST /settings/profile and POST /settings/password).

const PartsCatalog = require('../models/PartsCatalog')
const { generatePartsCatalogScript } = require('../services/generatePartsCatalogScript')

router.get('/js/partsCatalog.js', async (req, res) => {
    try {
        const catalog = await PartsCatalog.getCatalog()
        const script = generatePartsCatalogScript(catalog)
        res.type('application/javascript').send(script)
    } catch (err) {
        // Loud failure: a broken catalog should not silently serve an
        // empty/stale script that makes the booking form quietly show no
        // oil brands. Fail the request visibly and log the real cause.
        console.error('[partsCatalog.js] generation failed:', err)
        res.status(500).type('application/javascript')
            .send(`console.error(${JSON.stringify('Parts catalog failed to load: ' + err.message)});`)
    }
})

module.exports = router;