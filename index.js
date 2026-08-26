const express = require('express')
const app = express()
const mongoose = require('mongoose')
const flash = require('connect-flash')
const session = require('express-session')
const passport = require('passport')
require('./config/passport')(passport)
const { port, mongoUri, version } = require('./config/config.json').server

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
    secret: 'secret12345',
    resave: true,
    saveUninitialized: true
}))
app.use(passport.initialize())
app.use(passport.session())
app.use(flash())
app.use((req, res, next) => {
    res.locals.successMessage = req.flash('successMessage')
    res.locals.errorMessage = req.flash('errorMessage')
    res.locals.error = req.flash('error')
    res.locals.user = req.user || null
    next()
})

// Routes
app.use('/', require('./routes/index'))
app.use('/auth', require('./routes/auth'))
app.use('/api', require('./routes/api'))
app.use('/api/availability', require('./routes/availability'))
app.use('/settings', require('./routes/settings'))
app.use('/admin', require('./routes/admin'))

try {
    app.listen(process.env.PORT || port)
    console.clear()
    console.log(`Server: Online\nPort: ${port}\nVersion: ${version}`)
} catch (error) {
    console.clear()
    console.error(`Server: Offline\nPort: N/A\nError: ${error}`)
}