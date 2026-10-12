const router = require('express').Router()
const { ensureAdmin } = require('../config/ensureAuth')
const { loadVehicleData, saveVehicleData, VEHICLE_SIZE_CLASSES, isValidSizeClass, parseYearList, bulkAddVehicles } = require('../vehicleDataStore')
const { loadBlocklist, saveBlocklist } = require('../blocklistStore')
const Booking = require('../models/Booking')
const VehicleSpec = require('../models/VehicleSpec')
const BusinessConfig = require('../models/BusinessConfig')
const PartsCatalog = require('../models/PartsCatalog')
const DiscountCode = require('../models/DiscountCode')
const Review = require('../models/Review')
const TrustedPhone = require('../models/TrustedPhone')
const { phoneKey } = require('../services/trust')
const { findCatalogIssues } = require('../services/partsCheck')
const { inspectVehicle } = require('../services/priceEngine')
const User = require('../models/User')
const bcrypt = require('bcrypt')
const crypto = require('crypto')

function pad2(n) { return String(n).padStart(2, '0') }
function ymd(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}` }

function startOfWeek(date) {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    d.setDate(d.getDate() - d.getDay()) // back up to Sunday
    return d
}

function endOfWeek(date) {
    const d = startOfWeek(date)
    d.setDate(d.getDate() + 6)
    return d
}

function ensureOwner(req, res, next) {
    if (req.user && req.user.role >= 3) {
        return next()
    }
    req.flash('errorMessage', 'Only the owner can access that page.')
    return res.redirect('/admin/site')
}

// --- Admin home / dashboard ---
router.get('/', ensureAdmin, async (req, res) => {
    try {
        const today = new Date()
        const todayStr = ymd(today)
        const weekStartStr = ymd(startOfWeek(today))
        const weekEndStr = ymd(endOfWeek(today))

        const [
            todaysBookingsCount,
            weekRevenueBookings,
            pendingQuotesCount,
            confirmedCount
        ] = await Promise.all([
            Booking.countDocuments({ preferredDate: todayStr }),
            Booking.find({
                preferredDate: { $gte: weekStartStr, $lte: weekEndStr },
                status: { $in: ['confirmed', 'completed'] }
            }).select('pricing.total'),
            Booking.countDocuments({ status: 'new' }),
            Booking.countDocuments({ status: 'confirmed' })
        ])

        const weekRevenue = weekRevenueBookings.reduce((sum, b) => sum + (b.pricing?.total || 0), 0)

        res.render('admin/dashboard', {
            stats: {
                todaysBookings: todaysBookingsCount,
                weekRevenue,
                pendingQuotes: pendingQuotesCount,
                confirmed: confirmedCount
            }
        })
    } catch (err) {
        console.error('Error loading admin dashboard:', err)
        req.flash('errorMessage', 'Failed to load admin dashboard.')
        res.redirect('/')
    }
})

// --- Admin bookings list ---
router.get('/bookings', ensureAdmin, async (req, res) => {
    try {
        const { status } = req.query
        const filter = (status && status !== 'all') ? { status } : {}
        const bookings = await Booking.find(filter).sort({ createdAt: -1 })
        res.render('admin/bookings', { bookings, currentStatus: status || 'all' })
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to load bookings.')
        res.redirect('/admin')
    }
})

// --- Admin single booking detail ---
router.get('/bookings/:id', ensureAdmin, async (req, res) => {
    try {
        const booking = await Booking.findById(req.params.id)
        if (!booking) {
            req.flash('errorMessage', 'Booking not found.')
            return res.redirect('/admin/bookings')
        }
        res.render('admin/booking', { booking })
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to load booking.')
        res.redirect('/admin/bookings')
    }
})

// --- Admin users list ---
router.get('/users', ensureAdmin, async (req, res) => {
    try {
        const { q, role } = req.query
        const filter = {}

        if (role && role !== 'all') {
            filter.role = Number(role)
        }

        if (q && q.trim()) {
            const re = new RegExp(q.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
            filter.$or = [{ name: re }, { email: re }]
        }

        const users = await User.find(filter).sort({ name: 1 })
        res.render('admin/users', {
            users,
            currentRole: role || 'all',
            currentQuery: q || ''
        })
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to load users.')
        res.redirect('/admin')
    }
})

// --- Admin single user detail ---
router.get('/users/:id', ensureAdmin, async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.id)
        if (!targetUser) {
            req.flash('errorMessage', 'User not found.')
            return res.redirect('/admin/users')
        }
        const [trustedByPhone, completedBookings] = await Promise.all([
            TrustedPhone.exists({ phone: phoneKey(targetUser.phone) }),
            Booking.countDocuments({ phoneKey: phoneKey(targetUser.phone) || '-', status: 'completed' })
        ])
        res.render('admin/user-detail', { targetUser, trustedByPhone: !!trustedByPhone, completedBookings })
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to load user.')
        res.redirect('/admin/users')
    }
})

// --- Update user (name/email/phone always; role owner-only; owner accounts locked from staff) ---
router.post('/users/:id', ensureAdmin, async (req, res) => {
    try {
        const { name, email, phone, role } = req.body
        const targetUser = await User.findById(req.params.id)

        if (!targetUser) {
            req.flash('errorMessage', 'User not found.')
            return res.redirect('/admin/users')
        }

        if (targetUser.role >= 3 && req.user.role < 3) {
            req.flash('errorMessage', 'Only the owner can edit an owner account.')
            return res.redirect('/admin/users/' + req.params.id)
        }

        if (!name || !email || !phone) {
            req.flash('errorMessage', 'Name, email, and phone are all required.')
            return res.redirect('/admin/users/' + req.params.id)
        }

        targetUser.name = name
        targetUser.email = email
        targetUser.phone = phone

        if (role !== undefined) {
            const isSelf = String(targetUser._id) === String(req.user._id)
            const requestedRole = Number(role)

            if (req.user.role < 3) {
                req.flash('errorMessage', 'Only the owner can change roles.')
            } else if (isSelf && requestedRole < req.user.role) {
                req.flash('errorMessage', 'You cannot demote your own account.')
            } else if (![1, 2, 3].includes(requestedRole)) {
                req.flash('errorMessage', 'Invalid role.')
            } else {
                targetUser.role = requestedRole
            }
        }

        await targetUser.save()
        req.flash('successMessage', 'User updated successfully.')
        res.redirect('/admin/users/' + req.params.id)
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to update user.')
        res.redirect('/admin/users')
    }
})

// --- Admin-triggered password reset (random temp password, shown once) ---
router.post('/users/:id/reset-password', ensureAdmin, async (req, res) => {
    try {
        const targetUser = await User.findById(req.params.id)
        if (!targetUser) {
            req.flash('errorMessage', 'User not found.')
            return res.redirect('/admin/users')
        }

        if (targetUser.role >= 3 && req.user.role < 3) {
            req.flash('errorMessage', 'Only the owner can reset an owner account\'s password.')
            return res.redirect('/admin/users/' + req.params.id)
        }

        const tempPassword = crypto.randomBytes(6).toString('base64')
            .replace(/[+/=]/g, '').slice(0, 10)

        const salt = await bcrypt.genSalt(10)
        targetUser.password = await bcrypt.hash(tempPassword, salt)
        await targetUser.save()

        req.flash('successMessage', `Temporary password for ${targetUser.email}: ${tempPassword} (shown once — copy it now)`)
        res.redirect('/admin/users/' + req.params.id)
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to reset password.')
        res.redirect('/admin/users')
    }
})

// --- Delete user ---
router.post('/users/:id/delete', ensureAdmin, async (req, res) => {
    try {
        if (String(req.params.id) === String(req.user._id)) {
            req.flash('errorMessage', 'You cannot delete your own account.')
            return res.redirect('/admin/users/' + req.params.id)
        }

        const targetUser = await User.findById(req.params.id)
        if (!targetUser) {
            req.flash('errorMessage', 'User not found.')
            return res.redirect('/admin/users')
        }

        if (targetUser.role >= 3 && req.user.role < 3) {
            req.flash('errorMessage', 'Only the owner can delete an owner account.')
            return res.redirect('/admin/users/' + req.params.id)
        }

        await User.findByIdAndDelete(req.params.id)
        req.flash('successMessage', `Deleted user ${targetUser.email}.`)
        res.redirect('/admin/users')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to delete user.')
        res.redirect('/admin/users')
    }
})

// --- Reviews: moderation (a review shows on the home page only once approved) ---
router.get('/reviews', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        // Waiting reviews first, then published, then hidden; newest first within each.
        const order = { pending: 0, approved: 1, hidden: 2 }
        const reviews = (await Review.find().sort({ createdAt: -1 }))
            .sort((a, b) => order[a.status] - order[b.status])
        res.render('admin/reviews', { reviews })
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to load reviews.')
        res.redirect('/admin/site')
    }
})

router.post('/reviews/:id/status', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        const { status } = req.body
        if (!Review.STATUSES.includes(status)) {
            req.flash('errorMessage', 'Invalid review status.')
            return res.redirect('/admin/reviews')
        }
        const review = await Review.findByIdAndUpdate(req.params.id, { status }, { new: true })
        if (!review) {
            req.flash('errorMessage', 'Review not found.')
            return res.redirect('/admin/reviews')
        }
        const what = status === 'approved' ? 'is now published on the home page' : 'is no longer shown on the site'
        req.flash('successMessage', `Review from ${review.displayName} ${what}.`)
        res.redirect('/admin/reviews')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to update review.')
        res.redirect('/admin/reviews')
    }
})

router.post('/reviews/:id/delete', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        const review = await Review.findByIdAndDelete(req.params.id)
        if (!review) {
            req.flash('errorMessage', 'Review not found.')
            return res.redirect('/admin/reviews')
        }
        req.flash('successMessage', `Deleted the review from ${review.displayName}.`)
        res.redirect('/admin/reviews')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to delete review.')
        res.redirect('/admin/reviews')
    }
})

// --- Site landing page ---
router.get('/site', ensureAdmin, (req, res) => {
    res.render('admin/site-index')
})

// --- Site: vehicle data list ---
router.get('/site/vehicles', ensureAdmin, async (req, res) => {
    try {
        const { VEHICLE_DATA, VEHICLE_SIZES } = loadVehicleData()
        // Left over from a bulk add with problem lines; shown once.
        const bulkErrors = req.session.vehicleBulkErrors || null
        const bulkText = req.session.vehicleBulkText || ''
        delete req.session.vehicleBulkErrors
        delete req.session.vehicleBulkText
        res.render('admin/site-vehicles', {
            vehicleData: VEHICLE_DATA,
            vehicleSizes: VEHICLE_SIZES,
            sizeClasses: VEHICLE_SIZE_CLASSES,
            // Vehicle data lives in a file. On Railway the file is rebuilt
            // from GitHub on every deploy, so edits made on the live site
            // are lost then. See the banner on the page.
            onLiveServer: !!(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID),
            bulkErrors,
            bulkText
        })
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to load vehicle data.')
        // res.redirect('/admin')
    }
})

// --- Add many vehicles at once (pasted lines: Make, Model, Years, Size) ---
router.post('/site/vehicles/bulk', ensureAdmin, async (req, res) => {
    try {
        const text = String(req.body.lines || '')
        if (!text.trim()) {
            req.flash('errorMessage', 'Paste at least one line: Make, Model, Years, Size.')
            return res.redirect('/admin/site/vehicles')
        }
        if (text.length > 100000) {
            req.flash('errorMessage', 'That is too much at once — paste up to about 2,000 lines per batch.')
            return res.redirect('/admin/site/vehicles')
        }

        const { added, errors } = bulkAddVehicles(text)
        const parts = []
        if (added.makes) parts.push(`${added.makes} new make${added.makes === 1 ? '' : 's'}`)
        parts.push(`${added.models} new model${added.models === 1 ? '' : 's'}`)
        parts.push(`${added.years} model year${added.years === 1 ? '' : 's'}`)
        if (added.sizes) parts.push(`${added.sizes} size${added.sizes === 1 ? '' : 's'} set`)
        req.flash('successMessage', `Added ${parts.join(', ')}.`)

        if (errors.length) {
            // Shown above the box, with the lines that failed put back in
            // it so they can be fixed and resubmitted.
            req.session.vehicleBulkErrors = errors.slice(0, 50)
            const failed = new Set(errors.map(e => Number((e.match(/^Line (\d+)/) || [])[1])))
            req.session.vehicleBulkText = text.split(/\r?\n/).filter((l, i) => failed.has(i + 1)).join('\n')
        }
        res.redirect('/admin/site/vehicles')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to add those vehicles.')
        res.redirect('/admin/site/vehicles')
    }
})

// --- Add a model to a make ---
router.post('/site/vehicles/model', ensureAdmin, async (req, res) => {
    try {
        const { make, model } = req.body

        if (!make || !model || !model.trim()) {
            req.flash('errorMessage', 'Model name is required.')
            return res.redirect('/admin/site/vehicles')
        }

        // Every model needs a size class — it sets size-based pricing on
        // the booking form, so customers never pick their own.
        const size = req.body.size
        if (!isValidSizeClass(size)) {
            req.flash('errorMessage', 'Choose a size for the new model.')
            return res.redirect('/admin/site/vehicles')
        }

        const { VEHICLE_DATA, COLORS, VEHICLE_TYPES, VEHICLE_SIZES } = loadVehicleData()

        if (!VEHICLE_DATA[make]) {
            req.flash('errorMessage', 'Unknown make.')
            return res.redirect('/admin/site/vehicles')
        }

        const trimmedModel = model.trim()

        if (VEHICLE_DATA[make][trimmedModel]) {
            req.flash('errorMessage', `${trimmedModel} already exists under ${make}.`)
            return res.redirect('/admin/site/vehicles')
        }

        VEHICLE_DATA[make][trimmedModel] = []
        VEHICLE_SIZES[make] = { ...VEHICLE_SIZES[make], [trimmedModel]: size }
        saveVehicleData(VEHICLE_DATA, COLORS, VEHICLE_TYPES, VEHICLE_SIZES)

        req.flash('successMessage', `Added ${trimmedModel} to ${make}.`)
        res.redirect('/admin/site/vehicles')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to add model.')
        res.redirect('/admin/site/vehicles')
    }
})

// --- Delete a model from a make ---
router.post('/site/vehicles/model/delete', ensureAdmin, async (req, res) => {
    try {
        const { make, model } = req.body
        const { VEHICLE_DATA, COLORS, VEHICLE_TYPES } = loadVehicleData()

        if (!VEHICLE_DATA[make] || !VEHICLE_DATA[make][model]) {
            req.flash('errorMessage', 'Model not found.')
            return res.redirect('/admin/site/vehicles')
        }

        delete VEHICLE_DATA[make][model]
        saveVehicleData(VEHICLE_DATA, COLORS, VEHICLE_TYPES)

        req.flash('successMessage', `Removed ${model} from ${make}.`)
        res.redirect('/admin/site/vehicles')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to delete model.')
        res.redirect('/admin/site/vehicles')
    }
})

// --- Set a model's size class (drives size-based pricing on the booking form) ---
router.post('/site/vehicles/size', ensureAdmin, async (req, res) => {
    try {
        const { make, model, size } = req.body

        if (!isValidSizeClass(size)) {
            req.flash('errorMessage', 'Choose a size.')
            return res.redirect('/admin/site/vehicles')
        }

        const { VEHICLE_DATA, COLORS, VEHICLE_TYPES, VEHICLE_SIZES } = loadVehicleData()

        if (!VEHICLE_DATA[make] || !VEHICLE_DATA[make][model]) {
            req.flash('errorMessage', 'Model not found.')
            return res.redirect('/admin/site/vehicles')
        }

        VEHICLE_SIZES[make] = { ...VEHICLE_SIZES[make], [model]: size }
        saveVehicleData(VEHICLE_DATA, COLORS, VEHICLE_TYPES, VEHICLE_SIZES)

        const label = VEHICLE_SIZE_CLASSES.find(c => c.id === size).label
        req.flash('successMessage', `${make} ${model} is now sized as ${label}.`)
        res.redirect('/admin/site/vehicles')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to set size.')
        res.redirect('/admin/site/vehicles')
    }
})

// --- Add a year to a model ---
router.post('/site/vehicles/year', ensureAdmin, async (req, res) => {
    try {
        const { make, model, year } = req.body
        // One year, a range ("2010-2026") or a list ("2018 2020-2022").
        const parsed = parseYearList(year)
        if (!make || !model || parsed.error) {
            req.flash('errorMessage', `Years: ${parsed.error || 'make and model are required'}.`)
            return res.redirect('/admin/site/vehicles')
        }

        const { VEHICLE_DATA, COLORS, VEHICLE_TYPES } = loadVehicleData()

        if (!VEHICLE_DATA[make] || !VEHICLE_DATA[make][model]) {
            req.flash('errorMessage', 'Model not found.')
            return res.redirect('/admin/site/vehicles')
        }

        const years = new Set(VEHICLE_DATA[make][model].map(Number))
        const before = years.size
        parsed.years.forEach(y => years.add(y))
        const addedCount = years.size - before
        VEHICLE_DATA[make][model] = Array.from(years).sort((a, b) => b - a)

        if (addedCount === 0) {
            req.flash('errorMessage', `${model} already has ${parsed.years.length === 1 ? 'that year' : 'all of those years'}.`)
            return res.redirect('/admin/site/vehicles')
        }

        saveVehicleData(VEHICLE_DATA, COLORS, VEHICLE_TYPES)

        req.flash('successMessage', `Added ${addedCount} year${addedCount === 1 ? '' : 's'} to ${make} ${model}.`)
        res.redirect('/admin/site/vehicles')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to add year.')
        res.redirect('/admin/site/vehicles')
    }
})

// --- Remove a year from a model ---
router.post('/site/vehicles/year/delete', ensureAdmin, async (req, res) => {
    try {
        const { make, model, year } = req.body
        const yearNum = parseInt(year, 10)

        const { VEHICLE_DATA, COLORS, VEHICLE_TYPES } = loadVehicleData()

        if (!VEHICLE_DATA[make] || !VEHICLE_DATA[make][model]) {
            req.flash('errorMessage', 'Model not found.')
            return res.redirect('/admin/site/vehicles')
        }

        VEHICLE_DATA[make][model] = VEHICLE_DATA[make][model].filter(y => y !== yearNum)
        saveVehicleData(VEHICLE_DATA, COLORS, VEHICLE_TYPES)

        req.flash('successMessage', `Removed ${yearNum} from ${model}.`)
        res.redirect('/admin/site/vehicles')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to remove year.')
        res.redirect('/admin/site/vehicles')
    }
})

router.get('/site/specs', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        const specs = await VehicleSpec.find().sort({ make: 1, model: 1, year: 1 })
        res.render('admin/site-specs', { specs })
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to load vehicle specs.')
        res.redirect('/admin/site')
    }
})

// --- New spec form ---
router.get('/site/specs/new', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        const { VEHICLE_DATA } = loadVehicleData()
        res.render('admin/site-spec-form', { spec: null, vehicleData: VEHICLE_DATA })
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to load form.')
        res.redirect('/admin/site/specs')
    }
})

// --- Create spec ---
router.post('/site/specs/new', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        const spec = buildSpecFromBody(req.body)

        if (!spec.make || !spec.model) {
            req.flash('errorMessage', 'Make and model are required.')
            return res.redirect('/admin/site/specs/new')
        }

        await VehicleSpec.create(spec)
        req.flash('successMessage', `Created spec entry for ${spec.make} ${spec.model}${spec.year ? ' ' + spec.year + (spec.yearEnd ? '–' + spec.yearEnd : '') : ' (model default)'}.`)
        res.redirect('/admin/site/specs')
    } catch (err) {
        console.error(err)
        if (err.code === 11000) {
            req.flash('errorMessage', 'A spec entry for this make/model/year already exists.')
        } else {
            req.flash('errorMessage', 'Failed to create spec entry.')
        }
        res.redirect('/admin/site/specs/new')
    }
})

// --- Edit spec form ---
router.get('/site/specs/:id/edit', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        const spec = await VehicleSpec.findById(req.params.id)
        if (!spec) {
            req.flash('errorMessage', 'Spec entry not found.')
            return res.redirect('/admin/site/specs')
        }
        const { VEHICLE_DATA } = loadVehicleData()
        res.render('admin/site-spec-form', { spec, vehicleData: VEHICLE_DATA })
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to load spec entry.')
        res.redirect('/admin/site/specs')
    }
})

// --- Update spec ---
router.post('/site/specs/:id', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        const updates = buildSpecFromBody(req.body)
        // Saving from this form means the owner has looked the figures
        // over, so a seeded "unverified" entry becomes a real one.
        updates.verified = true
        await VehicleSpec.findByIdAndUpdate(req.params.id, updates)
        req.flash('successMessage', 'Spec entry updated.')
        res.redirect('/admin/site/specs')
    } catch (err) {
        console.error(err)
        if (err.code === 11000) {
            req.flash('errorMessage', 'A spec entry for this make/model/year already exists.')
        } else {
            req.flash('errorMessage', 'Failed to update spec entry.')
        }
        res.redirect('/admin/site/specs/' + req.params.id + '/edit')
    }
})

// --- Delete spec ---
router.post('/site/specs/:id/delete', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        await VehicleSpec.findByIdAndDelete(req.params.id)
        req.flash('successMessage', 'Spec entry deleted.')
        res.redirect('/admin/site/specs')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to delete spec entry.')
        res.redirect('/admin/site/specs')
    }
})

// --- Shared helper: build a VehicleSpec-shaped object from form fields ---
function buildSpecFromBody(body) {
    const toolsList = (body.tools || '')
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)

    const year = body.year && body.year.trim() ? parseInt(body.year, 10) : null
    const throughYear = body.yearEnd && body.yearEnd.trim() ? parseInt(body.yearEnd, 10) : null

    return {
        make: body.make,
        model: body.model,
        year,
        // Last year of a run of years (only meaningful after a start year).
        yearEnd: (year && throughYear && throughYear > year) ? throughYear : null,
        oil: {
            viscosity: body.oilViscosity || null,
            capacity: body.oilCapacity ? parseFloat(body.oilCapacity) : null
        },
        filter: {
            brandPartNumber: body.filterPartNumber || null,
            socket: body.filterSocket || null
        },
        drainPlug: body.drainPlug || null,
        tires: {
            size: body.tireSize || null
        },
        tools: {
            oilChange: toolsList
        },
        oilChangeLaborMinutes: body.laborMinutes ? parseInt(body.laborMinutes, 10) : null,
        oilTierOverride: body.oilTierOverride || null,
        notes: body.notes || ''
    }
}

// --- Site: oil change blocklist ---
router.get('/site/blocklist', ensureAdmin, async (req, res) => {
    try {
        const blocklist = loadBlocklist()
        const { VEHICLE_DATA } = loadVehicleData()
        res.render('admin/site-blocklist', { blocklist, vehicleData: VEHICLE_DATA })
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to load oil change blocklist.')
        res.redirect('/admin/site')
    }
})

// --- Add a blocklist entry ---
router.post('/site/blocklist', ensureAdmin, async (req, res) => {
    try {
        const { make, scope, reason } = req.body
        let { models } = req.body

        if (!make || !reason || !reason.trim()) {
            req.flash('errorMessage', 'Make and reason are both required.')
            return res.redirect('/admin/site/blocklist')
        }

        const { VEHICLE_DATA } = loadVehicleData()
        if (!VEHICLE_DATA[make]) {
            req.flash('errorMessage', 'Unknown make — spelling must match vehicle-data.js exactly.')
            return res.redirect('/admin/site/blocklist')
        }

        const blocklist = loadBlocklist()

        if (blocklist.some(e => e.make === make)) {
            req.flash('errorMessage', `${make} already has a blocklist entry. isOilChangeBlocked() only matches the first entry per make — delete the existing one and re-add it with the models you want.`)
            return res.redirect('/admin/site/blocklist')
        }

        let modelsValue
        if (scope === 'all') {
            modelsValue = 'all'
        } else {
            if (!models) {
                req.flash('errorMessage', 'Select at least one model, or choose "All models".')
                return res.redirect('/admin/site/blocklist')
            }
            if (!Array.isArray(models)) models = [models]

            const validModels = Object.keys(VEHICLE_DATA[make])
            const invalid = models.filter(m => !validModels.includes(m))
            if (invalid.length > 0) {
                req.flash('errorMessage', `Unknown model(s) for ${make}: ${invalid.join(', ')}`)
                return res.redirect('/admin/site/blocklist')
            }
            modelsValue = models
        }

        blocklist.push({ make, models: modelsValue, reason: reason.trim() })
        blocklist.sort((a, b) => a.make.localeCompare(b.make))
        saveBlocklist(blocklist)

        req.flash('successMessage', `Blocked oil changes for ${make}${modelsValue === 'all' ? ' (all models)' : ': ' + modelsValue.join(', ')}.`)
        res.redirect('/admin/site/blocklist')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to add blocklist entry.')
        res.redirect('/admin/site/blocklist')
    }
})

// --- Delete a blocklist entry ---
router.post('/site/blocklist/delete', ensureAdmin, async (req, res) => {
    try {
        const { make } = req.body
        const blocklist = loadBlocklist()

        if (!blocklist.some(e => e.make === make)) {
            req.flash('errorMessage', 'Entry not found.')
            return res.redirect('/admin/site/blocklist')
        }

        saveBlocklist(blocklist.filter(e => e.make !== make))
        req.flash('successMessage', `Removed ${make} from the blocklist.`)
        res.redirect('/admin/site/blocklist')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to delete blocklist entry.')
        res.redirect('/admin/site/blocklist')
    }
})

// --- Site: parts & tools check ---
// Lists catalog / spec gaps, and shows exactly what a tech sheet would
// say for one vehicle (same code as the booking form).
router.get('/site/parts-check', ensureAdmin, async (req, res) => {
    try {
        const { VEHICLE_DATA } = loadVehicleData()
        const issues = await findCatalogIssues()

        const make = String(req.query.make || '')
        const model = String(req.query.model || '')
        const year = String(req.query.year || '')
        let inspection = null
        let inspectError = null
        if (make && model) {
            if (!VEHICLE_DATA[make] || !VEHICLE_DATA[make][model]) {
                inspectError = `${make} ${model} isn't in Vehicle Data.`
            } else {
                inspection = await inspectVehicle({ make, model, year })
            }
        }

        res.render('admin/site-parts-check', {
            issues,
            vehicleData: VEHICLE_DATA,
            query: { make, model, year },
            inspection,
            inspectError
        })
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to run the parts check.')
        res.redirect('/admin/site')
    }
})

// --- Site: trusted customers ("Bring it to us" drop-off) ---
// Nobody qualifies automatically: you approve an account, or a phone
// number (which also covers someone who hasn't made an account yet).
// Repeat customers are listed to make approving them quick.
const REPEAT_CUSTOMER_MIN_BOOKINGS = 2

router.get('/site/trusted', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        const [trustedAccounts, trustedPhones, completed] = await Promise.all([
            User.find({ trustedCustomer: true }).sort({ name: 1 }),
            TrustedPhone.find().sort({ name: 1 }),
            Booking.find({ status: 'completed' }).select('phoneKey contact user createdAt').sort({ _id: -1 })
        ])

        const trustedPhoneKeys = new Set(trustedPhones.map(p => p.phone))
        const trustedAccountPhones = new Set(trustedAccounts.map(u => phoneKey(u.phone)))

        // Completed bookings per phone number, newest name first.
        const byPhone = {}
        completed.forEach(b => {
            if (!b.phoneKey) return
            if (!byPhone[b.phoneKey]) {
                byPhone[b.phoneKey] = {
                    phone: b.phoneKey,
                    name: `${b.contact?.firstName || ''} ${b.contact?.lastName || ''}`.trim(),
                    count: 0
                }
            }
            byPhone[b.phoneKey].count++
        })

        const repeat = Object.values(byPhone)
            .filter(r => r.count >= REPEAT_CUSTOMER_MIN_BOOKINGS)
            .filter(r => !trustedPhoneKeys.has(r.phone) && !trustedAccountPhones.has(r.phone))
            .sort((a, b) => b.count - a.count)

        // Link each repeat customer to their account, if they have one.
        const accounts = await User.find({}).select('name phone')
        const accountByPhone = {}
        accounts.forEach(u => { const k = phoneKey(u.phone); if (k) accountByPhone[k] = u })
        repeat.forEach(r => { r.account = accountByPhone[r.phone] || null })

        res.render('admin/site-trusted', {
            trustedAccounts,
            trustedPhones,
            repeat,
            minBookings: REPEAT_CUSTOMER_MIN_BOOKINGS,
            phoneHasAccount: Object.fromEntries(trustedPhones.map(p => [p.phone, accountByPhone[p.phone] || null]))
        })
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to load trusted customers.')
        res.redirect('/admin/site')
    }
})

// Approve or un-approve an account. Comes from this page and from the
// user's own admin page (back to wherever it came from).
router.post('/site/trusted/account/:id', ensureAdmin, ensureOwner, async (req, res) => {
    const back = req.body.back === 'user' ? `/admin/users/${req.params.id}` : '/admin/site/trusted'
    try {
        const trusted = req.body.trusted === 'yes'
        const user = await User.findByIdAndUpdate(req.params.id, { trustedCustomer: trusted }, { new: true })
        if (!user) {
            req.flash('errorMessage', 'User not found.')
            return res.redirect('/admin/site/trusted')
        }
        req.flash('successMessage', trusted
            ? `${user.name} can now choose "Bring it to us" when logged in.`
            : `${user.name}'s account is no longer approved for drop-off.` +
              (await TrustedPhone.exists({ phone: phoneKey(user.phone) }) ? ' (Their phone number is still on the list, so they still qualify — remove it there too.)' : ''))
        res.redirect(back)
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to update that account.')
        res.redirect(back)
    }
})

router.post('/site/trusted/phone', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        const phone = phoneKey(req.body.phone)
        if (!phone) {
            req.flash('errorMessage', 'Enter a 10-digit phone number.')
            return res.redirect('/admin/site/trusted')
        }
        if (await TrustedPhone.exists({ phone })) {
            req.flash('errorMessage', 'That number is already on the list.')
            return res.redirect('/admin/site/trusted')
        }
        await TrustedPhone.create({
            phone,
            name: String(req.body.name || '').trim().slice(0, 80),
            note: String(req.body.note || '').trim().slice(0, 200)
        })
        req.flash('successMessage', 'Added. Whoever logs in with an account using that number can now choose "Bring it to us".')
        res.redirect('/admin/site/trusted')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to add that number.')
        res.redirect('/admin/site/trusted')
    }
})

router.post('/site/trusted/phone/:id/delete', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        await TrustedPhone.findByIdAndDelete(req.params.id)
        req.flash('successMessage', 'Removed from the trusted list.')
        res.redirect('/admin/site/trusted')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to remove that number.')
        res.redirect('/admin/site/trusted')
    }
})

// --- Site: business config ---
router.get('/site/config', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        const config = await BusinessConfig.getConfig()
        res.render('admin/site-config', { config })
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to load business config.')
        res.redirect('/admin/site')
    }
})

// --- Update business config ---
router.post('/site/config', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        const laborRate = parseFloat(req.body.laborRatePerHour)
        const diagFee = parseFloat(req.body.diagnosticStandaloneFee)
        const capacity = parseInt(req.body.bookingCapacityPerWindow, 10)
        const taxPercent = parseFloat(req.body.taxRatePercent)
        const dropOffValue = parseFloat(req.body.dropOffDiscountValue)
        const dropOffType = req.body.dropOffDiscountType

        if (!['percent', 'fixed'].includes(dropOffType)) {
            req.flash('errorMessage', 'Pick % off or $ off for the drop-off discount.')
            return res.redirect('/admin/site/config')
        }
        if (isNaN(dropOffValue) || dropOffValue < 0 || (dropOffType === 'percent' && dropOffValue > 100)) {
            req.flash('errorMessage', 'Drop-off discount must be 0 or more (and at most 100%).')
            return res.redirect('/admin/site/config')
        }

        if (isNaN(taxPercent) || taxPercent < 0 || taxPercent > 25) {
            req.flash('errorMessage', 'Sales tax must be a percentage between 0 and 25.')
            return res.redirect('/admin/site/config')
        }
        if (isNaN(laborRate) || laborRate < 0) {
            req.flash('errorMessage', 'Labor rate must be a number of at least 0.')
            return res.redirect('/admin/site/config')
        }
        if (isNaN(diagFee) || diagFee < 0) {
            req.flash('errorMessage', 'Diagnostic fee must be a number of at least 0.')
            return res.redirect('/admin/site/config')
        }
        if (isNaN(capacity) || capacity < 1) {
            req.flash('errorMessage', 'Booking capacity must be a whole number of at least 1.')
            return res.redirect('/admin/site/config')
        }

        await BusinessConfig.updateConfig({
            laborRatePerHour: laborRate,
            diagnosticStandaloneFee: diagFee,
            taxRatePercent: taxPercent,
            dropOffAddress: String(req.body.dropOffAddress || '').trim().slice(0, 200),
            dropOffNotes: String(req.body.dropOffNotes || '').trim().slice(0, 300),
            dropOffDiscountType: dropOffType,
            dropOffDiscountValue: dropOffValue,
            bookingCapacityPerWindow: capacity
        })

        req.flash('successMessage', 'Business config saved.')
        res.redirect('/admin/site/config')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to save business config.')
        res.redirect('/admin/site/config')
    }
})

// --- Site: discount codes ---
// Turns the create/edit form body into a clean DiscountCode field set.
// Returns { fields } or { error } — the error is shown to the admin as-is.
function parseDiscountForm(body) {
    const code = DiscountCode.normalizeCode(body.code)
    if (!DiscountCode.CODE_PATTERN.test(code)) {
        return { error: 'Code must be 3–24 characters: letters, numbers and dashes only.' }
    }

    const type = body.type
    if (!['percent', 'fixed'].includes(type)) return { error: 'Choose percent or dollar amount.' }

    const value = parseFloat(body.value)
    if (isNaN(value) || value <= 0) return { error: 'Discount value must be more than 0.' }
    if (type === 'percent' && value > 100) return { error: 'A percent discount cannot be more than 100.' }

    const picked = [].concat(body.categories || [])
    if (picked.some(c => !DiscountCode.CATEGORIES.includes(c))) return { error: 'Unknown service category.' }
    // Every box ticked means the same as none ticked: no restriction.
    const categories = picked.length === DiscountCode.CATEGORIES.length ? [] : picked

    const minSubtotal = body.minSubtotal === '' || body.minSubtotal == null ? 0 : parseFloat(body.minSubtotal)
    if (isNaN(minSubtotal) || minSubtotal < 0) return { error: 'Minimum subtotal must be 0 or more.' }

    let maxUses = null
    if (body.maxUses !== '' && body.maxUses != null) {
        maxUses = parseInt(body.maxUses, 10)
        if (isNaN(maxUses) || maxUses < 1) return { error: 'Max uses must be a whole number of at least 1, or blank for unlimited.' }
    }

    const startsOn = (body.startsOn || '').trim()
    const expiresOn = (body.expiresOn || '').trim()
    if (startsOn && !DiscountCode.DATE_PATTERN.test(startsOn)) return { error: 'Start date is not a valid date.' }
    if (expiresOn && !DiscountCode.DATE_PATTERN.test(expiresOn)) return { error: 'End date is not a valid date.' }
    if (startsOn && expiresOn && expiresOn < startsOn) return { error: 'End date cannot be before the start date.' }

    return {
        fields: {
            code,
            description: (body.description || '').trim(),
            type,
            value,
            categories,
            minSubtotal,
            maxUses,
            firstTimeOnly: body.firstTimeOnly === 'on',
            startsOn,
            expiresOn
        }
    }
}

router.get('/site/discounts', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        const codes = await DiscountCode.find().sort({ createdAt: -1 })
        res.render('admin/site-discounts', { codes, categories: DiscountCode.CATEGORIES })
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to load discount codes.')
        res.redirect('/admin/site')
    }
})

router.post('/site/discounts', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        const parsed = parseDiscountForm(req.body)
        if (parsed.error) {
            req.flash('errorMessage', parsed.error)
            return res.redirect('/admin/site/discounts')
        }
        if (await DiscountCode.exists({ code: parsed.fields.code })) {
            req.flash('errorMessage', `Code "${parsed.fields.code}" already exists.`)
            return res.redirect('/admin/site/discounts')
        }
        await DiscountCode.create(parsed.fields)
        req.flash('successMessage', `Code "${parsed.fields.code}" created.`)
        res.redirect('/admin/site/discounts')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to create discount code.')
        res.redirect('/admin/site/discounts')
    }
})

router.post('/site/discounts/:id', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        const parsed = parseDiscountForm(req.body)
        if (parsed.error) {
            req.flash('errorMessage', parsed.error)
            return res.redirect('/admin/site/discounts')
        }
        if (await DiscountCode.exists({ code: parsed.fields.code, _id: { $ne: req.params.id } })) {
            req.flash('errorMessage', `Code "${parsed.fields.code}" already exists.`)
            return res.redirect('/admin/site/discounts')
        }
        const updated = await DiscountCode.findByIdAndUpdate(req.params.id, { $set: parsed.fields }, { new: true })
        if (!updated) {
            req.flash('errorMessage', 'Discount code not found.')
            return res.redirect('/admin/site/discounts')
        }
        req.flash('successMessage', `Code "${updated.code}" saved.`)
        res.redirect('/admin/site/discounts')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to save discount code.')
        res.redirect('/admin/site/discounts')
    }
})

router.post('/site/discounts/:id/toggle', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        const code = await DiscountCode.findById(req.params.id)
        if (!code) {
            req.flash('errorMessage', 'Discount code not found.')
            return res.redirect('/admin/site/discounts')
        }
        code.active = !code.active
        await code.save()
        req.flash('successMessage', `Code "${code.code}" ${code.active ? 'enabled' : 'disabled'}.`)
        res.redirect('/admin/site/discounts')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to update discount code.')
        res.redirect('/admin/site/discounts')
    }
})

router.post('/site/discounts/:id/delete', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        const deleted = await DiscountCode.findByIdAndDelete(req.params.id)
        if (!deleted) {
            req.flash('errorMessage', 'Discount code not found.')
            return res.redirect('/admin/site/discounts')
        }
        req.flash('successMessage', `Code "${deleted.code}" deleted. Bookings that already used it keep their discount.`)
        res.redirect('/admin/site/discounts')
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to delete discount code.')
        res.redirect('/admin/site/discounts')
    }
})

// Section name -> the doc's array field name. Kept as an explicit
// allow-list so a typo'd section in a request 404s loudly instead of
// silently touching the wrong array.
const SECTIONS = {
    suppliers: 'suppliers',
    'oil-products': 'oilProducts',
    'filter-brands': 'filterBrands',
    'filter-overrides': 'filterOverrides',
    'brake-pads': 'brakePadTypes',
    rotors: 'rotorOptions',
    'tire-services': 'tireServiceTypes'
}

function resolveSection(req, res) {
    const field = SECTIONS[req.params.section]
    if (!field) {
        res.status(404).json({ error: `Unknown catalog section "${req.params.section}"` })
        return null
    }
    return field
}

// --- Page ---------------------------------------------------------------

router.get('/site/parts', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        const catalog = await PartsCatalog.getCatalog()
        const { VEHICLE_DATA } = loadVehicleData()
        res.render('admin/parts', { catalog, vehicleData: VEHICLE_DATA })
    } catch (err) {
        console.error('[parts admin] failed to load catalog:', err)
        req.flash('errorMessage', 'Failed to load parts catalog.')
        res.redirect('/admin/site')
    }
})

// --- API: read the whole catalog (used by the admin page's JS) ---------

router.get('/api/parts-catalog', ensureAdmin, ensureOwner, async (req, res) => {
    try {
        const catalog = await PartsCatalog.getCatalog()
        res.json(catalog)
    } catch (err) {
        console.error('[parts admin] failed to load catalog:', err)
        res.status(500).json({ error: 'Failed to load parts catalog', detail: err.message })
    }
})

// --- API: add an item to a section --------------------------------------

router.post('/api/parts-catalog/:section', ensureAdmin, ensureOwner, async (req, res) => {
    const field = resolveSection(req, res)
    if (!field) return

    try {
        const catalog = await PartsCatalog.getCatalog()
        catalog[field].push(req.body)
        await PartsCatalog.saveCatalog(catalog)
        res.status(201).json(catalog[field][catalog[field].length - 1])
    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(400).json({ error: 'Invalid entry', detail: err.message })
        }
        console.error('[parts admin] add failed:', err)
        res.status(500).json({ error: 'Failed to add entry', detail: err.message })
    }
})

// --- API: update one item in a section by its subdocument _id ----------

router.put('/api/parts-catalog/:section/:itemId', ensureAdmin, ensureOwner, async (req, res) => {
    const field = resolveSection(req, res)
    if (!field) return

    try {
        const catalog = await PartsCatalog.getCatalog()
        const item = catalog[field].id(req.params.itemId)
        if (!item) {
            return res.status(404).json({ error: 'Entry not found' })
        }
        item.set(req.body)
        await PartsCatalog.saveCatalog(catalog)
        res.json(item)
    } catch (err) {
        if (err.name === 'ValidationError') {
            return res.status(400).json({ error: 'Invalid entry', detail: err.message })
        }
        console.error('[parts admin] update failed:', err)
        res.status(500).json({ error: 'Failed to update entry', detail: err.message })
    }
})

// --- API: delete one item from a section --------------------------------

router.delete('/api/parts-catalog/:section/:itemId', ensureAdmin, ensureOwner, async (req, res) => {
    const field = resolveSection(req, res)
    if (!field) return

    try {
        const catalog = await PartsCatalog.getCatalog()
        const item = catalog[field].id(req.params.itemId)
        if (!item) {
            return res.status(404).json({ error: 'Entry not found' })
        }
        item.deleteOne()
        await PartsCatalog.saveCatalog(catalog)
        res.json({ success: true })
    } catch (err) {
        console.error('[parts admin] delete failed:', err)
        res.status(500).json({ error: 'Failed to delete entry', detail: err.message })
    }
})

module.exports = router