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
    try {
        // "Bring it to us" is shown only to approved, logged-in customers,
        // and only once a drop-off address is set in Business Config.
        let dropOff = null
        if (await isTrustedCustomer(req.user)) {
            const config = await BusinessConfig.getConfig()
            if (config.dropOffAddress) {
                const value = config.dropOffDiscountValue
                dropOff = {
                    address: config.dropOffAddress,
                    notes: config.dropOffNotes,
                    saving: config.dropOffDiscountType === 'percent' ? `${value}% off` : `$${value} off`
                }
            }
        }
        res.render('booking', { dropOff })
    } catch (err) {
        console.error('[booking] Could not check drop-off eligibility:', err)
        res.render('booking', { dropOff: null })
    }
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
const BusinessConfig = require('../models/BusinessConfig')
const { isTrustedCustomer } = require('../services/trust')
const { generateBusinessConfigScript } = require('../services/generateBusinessConfigScript')

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

// Labor rate, tax rate and diagnostic fee from Admin > Site > Business
// Config, for the booking form's pricing (configurator.js refuses to run
// without it rather than guess a rate).
router.get('/js/businessConfig.js', async (req, res) => {
    try {
        const script = generateBusinessConfigScript(await BusinessConfig.getPricingSettings())
        res.set('Cache-Control', 'no-store').type('application/javascript').send(script)
    } catch (err) {
        console.error('[businessConfig.js] generation failed:', err)
        res.status(500).type('application/javascript')
            .send(`console.error(${JSON.stringify('Business config failed to load: ' + err.message)});`)
    }
})

// --- Legal pages ---
router.get('/privacy', (req, res) => {
    res.render('legal', { page: 'privacy' })
})

router.get('/terms', (req, res) => {
    res.render('legal', { page: 'terms' })
})

module.exports = router;