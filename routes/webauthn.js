const router = require('express').Router()
const {
    generateRegistrationOptions,
    verifyRegistrationResponse,
    generateAuthenticationOptions,
    verifyAuthenticationResponse
} = require('@simplewebauthn/server')

const User = require('../models/User')
const { ensureAuthenticated } = require('../config/ensureAuth')

// Config lives in config.json alongside your other server config —
// update these once you're on a real domain. rpID must be exactly your
// domain (no scheme, no port) or a suffix of it; origin must be an exact
// match of window.location.origin including scheme and port.
// "localhost" works for rpID in dev regardless of port.
const { rpID, rpName, origin } = require('../config/config.json').webauthn

// ---- Registration (adding a passkey to an already-logged-in account) --

router.get('/register-options', ensureAuthenticated, async (req, res) => {
    try {
        const user = await User.findById(req.user.id)

        const options = await generateRegistrationOptions({
            rpName,
            rpID,
            userName: user.email,
            userDisplayName: user.name,
            attestationType: 'none',
            // Don't let someone register the same physical key/passkey twice
            excludeCredentials: user.passkeys.map(pk => ({
                id: pk.credentialID,
                transports: pk.transports
            })),
            authenticatorSelection: {
                residentKey: 'required', // discoverable credential — required for usernameless login
                userVerification: 'preferred'
            }
        })

        req.session.currentRegChallenge = options.challenge
        res.json(options)
    } catch (err) {
        console.error('[webauthn] register-options failed:', err)
        res.status(500).json({ error: 'Failed to start passkey registration', detail: err.message })
    }
})

router.post('/register-verify', ensureAuthenticated, async (req, res) => {
    try {
        const expectedChallenge = req.session.currentRegChallenge
        if (!expectedChallenge) {
            return res.status(400).json({ error: 'No registration in progress. Try again.' })
        }

        const verification = await verifyRegistrationResponse({
            response: req.body,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID
        })

        if (!verification.verified || !verification.registrationInfo) {
            return res.status(400).json({ error: 'Passkey verification failed.' })
        }

        const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo

        const user = await User.findById(req.user.id)
        user.passkeys.push({
            credentialID: credential.id,
            publicKey: Buffer.from(credential.publicKey),
            counter: credential.counter,
            transports: credential.transports || [],
            deviceType: credentialDeviceType,
            backedUp: credentialBackedUp,
            nickname: req.body.nickname || null
        })
        await user.save()

        delete req.session.currentRegChallenge
        res.json({ verified: true })
    } catch (err) {
        console.error('[webauthn] register-verify failed:', err)
        res.status(500).json({ error: 'Failed to save passkey', detail: err.message })
    }
})

// List / remove passkeys — for the Settings page
router.get('/list', ensureAuthenticated, async (req, res) => {
    const user = await User.findById(req.user.id)
    res.json(user.passkeys.map(pk => ({
        credentialID: pk.credentialID,
        nickname: pk.nickname,
        deviceType: pk.deviceType,
        createdAt: pk.createdAt
    })))
})

router.delete('/:credentialID', ensureAuthenticated, async (req, res) => {
    const user = await User.findById(req.user.id)
    const before = user.passkeys.length
    user.passkeys = user.passkeys.filter(pk => pk.credentialID !== req.params.credentialID)

    if (user.passkeys.length === before) {
        return res.status(404).json({ error: 'Passkey not found on your account.' })
    }

    await user.save()
    res.json({ success: true })
})

// ---- Login (usernameless — no email typed, browser shows account picker) --

router.get('/login-options', async (req, res) => {
    try {
        const options = await generateAuthenticationOptions({
            rpID,
            userVerification: 'preferred'
            // allowCredentials intentionally omitted — this is what makes it
            // usernameless. The browser looks at every discoverable
            // credential it has for this rpID and lets the user pick.
        })

        req.session.currentAuthChallenge = options.challenge
        res.json(options)
    } catch (err) {
        console.error('[webauthn] login-options failed:', err)
        res.status(500).json({ error: 'Failed to start passkey login', detail: err.message })
    }
})

router.post('/login-verify', async (req, res) => {
    try {
        const expectedChallenge = req.session.currentAuthChallenge
        if (!expectedChallenge) {
            return res.status(400).json({ error: 'No login in progress. Try again.' })
        }

        // The credential ID the browser used is how we find WHICH user is
        // logging in — this is the whole trick behind usernameless login.
        const credentialID = req.body.id
        const user = await User.findOne({ 'passkeys.credentialID': credentialID })
        if (!user) {
            return res.status(400).json({ error: 'Passkey not recognized.' })
        }

        const passkey = user.passkeys.find(pk => pk.credentialID === credentialID)

        const verification = await verifyAuthenticationResponse({
            response: req.body,
            expectedChallenge,
            expectedOrigin: origin,
            expectedRPID: rpID,
            credential: {
                id: passkey.credentialID,
                publicKey: passkey.publicKey,
                counter: passkey.counter,
                transports: passkey.transports
            }
        })

        if (!verification.verified) {
            return res.status(400).json({ error: 'Passkey verification failed.' })
        }

        // Update the stored counter — this is a real security check, not
        // bookkeeping: a counter that goes backward or repeats means the
        // credential may have been cloned, and some authenticators
        // (especially cheap/DIY ones) always report 0. Don't silently
        // accept a same-or-lower counter without at least logging it.
        const { newCounter } = verification.authenticationInfo
        if (newCounter !== 0 && newCounter <= passkey.counter) {
            console.warn(`[webauthn] counter did not advance for user ${user.email} — possible cloned credential`)
        }
        passkey.counter = newCounter
        await user.save()

        delete req.session.currentAuthChallenge

        req.login(user, (err) => {
            if (err) {
                console.error('[webauthn] req.login failed:', err)
                return res.status(500).json({ error: 'Login failed after verification.' })
            }
            res.json({ verified: true, redirect: '/' })
        })
    } catch (err) {
        console.error('[webauthn] login-verify failed:', err)
        res.status(500).json({ error: 'Passkey login failed', detail: err.message })
    }
})

module.exports = router
