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
const { port, mongoUri, version, sessionSecret: configuredSessionSecret } = require('./config/config.json').server

// Login cookies are signed with this secret, so it must be private and
// hard to guess. Set SESSION_SECRET (or server.sessionSecret in
// config/config.json) to a long random string. With neither set, a random
// one is generated at startup: still safe, but everyone is logged out on
// each restart.
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

app.set('view engine', 'ejs')
app.use(express.static('public'))
app.use(express.urlencoded({ extended: true }))
app.use(express.json())
app.use(session({
    secret: sessionSecret,
    resave: true,
    saveUninitialized: true,
    // Don't send the login cookie on form posts coming from other sites.
    cookie: { sameSite: 'lax' }
}))
app.use(passport.initialize())
app.use(passport.session())
app.use(flash())
app.use((req, res, next) => {
    res.locals.successMessage = req.flash('successMessage')
    res.locals.errorMessage = req.flash('errorMessage')
    res.locals.error = req.flash('error')
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