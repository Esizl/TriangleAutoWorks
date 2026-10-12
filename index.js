// Load a local .env file (if there is one) into process.env before anything
// reads settings. Built into Node 20.12+, so no package is needed. Railway
// has no .env file and supplies its variables directly.
if (typeof process.loadEnvFile === 'function' && require('fs').existsSync('.env')) {
    process.loadEnvFile('.env')
}

const express = require('express')
const app = express()
const mongoose = require('mongoose')
const flash = require('connect-flash')
const session = require('express-session')
const passport = require('passport')
require('./config/passport')(passport)
const crypto = require('crypto')
const { MongooseSessionStore } = require('./config/sessionStore')
const { port, version, sessionSecret: configuredSessionSecret } = require('./config/config.json').server
// The connection string is a password: it comes from MONGO_URI, not config.json.
const mongoUri = require('./config/mongoUri').getMongoUri()

// Login cookies are signed with this secret, so it must be private and
// hard to guess. Set SESSION_SECRET (or server.sessionSecret in
// config/config.json) to a long random string. With neither set, a random
// one is generated at startup: still safe, but everyone is logged out on
// each restart (the saved sessions can no longer be matched to cookies).
const sessionSecret = process.env.SESSION_SECRET || configuredSessionSecret || crypto.randomBytes(32).toString('hex')

mongoose.connect(mongoUri)
    .then(() => console.log('Database: Connected'))
    .catch(err => {
        if (err.code === 'ENOTFOUND') {
            console.error("MongoDB cluster unreachable (possibly paused)");
        } else {
            console.error(err);
        }
        console.log(err)
    })

// The live site sits behind Railway's proxy. Trusting one proxy hop makes
// req.ip the visitor's real address (the rate limits count per address)
// and lets Express see that the original request was HTTPS.
app.set('trust proxy', 1)

app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use(express.urlencoded({ extended: true, limit: '100kb' }))
app.use(express.json({ limit: '200kb' }))
app.use(session({
    secret: sessionSecret,
    // Sessions live in MongoDB, so logins survive restarts and deploys.
    store: new MongooseSessionStore(),
    // Only write to the database when a session actually changes, and
    // don't create one for visitors who never log in or fill in a form.
    resave: false,
    saveUninitialized: false,
    // Each visit pushes the expiry back, so people who keep using the
    // site stay logged in; 30 days without a visit logs them out.
    rolling: true,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        // Don't send the login cookie on form posts coming from other sites.
        sameSite: 'lax',
        httpOnly: true,
        // HTTPS-only on the live site, plain HTTP still works on localhost.
        secure: 'auto'
    }
}))
app.use(passport.initialize())
app.use(passport.session())
app.use(flash())
app.use((req, res, next) => {
    // Reading a flash list creates an (empty) one on the session, which
    // would save a session for every anonymous visitor and crawler. So
    // only read when something has actually been flashed.
    const pending = req.session && req.session.flash && Object.keys(req.session.flash).length > 0
    res.locals.successMessage = pending ? req.flash('successMessage') : []
    res.locals.errorMessage = pending ? req.flash('errorMessage') : []
    res.locals.error = pending ? req.flash('error') : []
    if (pending && Object.keys(req.session.flash).length === 0) delete req.session.flash
    res.locals.user = req.user || null
    res.locals.version = version
    next()
})

// Routes
app.use('/', require('./routes/index'))
app.use('/', require('./routes/password'))
app.use('/', require('./routes/verify'))
app.use('/auth', require('./routes/auth'))
app.use('/api', require('./routes/api'))
app.use('/api/availability', require('./routes/availability'))
app.use('/settings', require('./routes/settings'))
app.use('/account', require('./routes/account'))
app.use('/booking/manage', require('./routes/manage'))
app.use('/admin', require('./routes/admin'))
app.use('/auth/webauthn', require('./routes/webauthn'))

try {
    app.listen(process.env.PORT || port)
    console.clear()
    console.log(`Server: Online\nPort: ${port}\nVersion: ${version}`)
    if (!process.env.SESSION_SECRET && !configuredSessionSecret) {
        console.warn('Session secret: not configured, using a random one for this run. Set SESSION_SECRET to keep logins across restarts.')
    }
} catch (error) {
    console.clear()
    console.error(`Server: Offline\nPort: N/A\nError: ${error}`)
}