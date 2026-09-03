const router = require('express').Router()
const { ensureAdmin } = require('../config/ensureAuth')
const { loadVehicleData, saveVehicleData } = require('../vehicleDataStore')
const { loadBlocklist, saveBlocklist } = require('../blocklistStore')
const Booking = require('../models/Booking')
const VehicleSpec = require('../models/VehicleSpec')
const BusinessConfig = require('../models/BusinessConfig')
const PartsCatalog = require('../models/PartsCatalog')
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
    req.flash('errorMessage', 'Only the owner can manage vehicle specs.')
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
        res.render('admin/booking-detail', { booking })
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
        res.render('admin/user-detail', { targetUser })
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

// --- Site landing page ---
router.get('/site', ensureAdmin, (req, res) => {
    res.render('admin/site-index')
})

// --- Site: vehicle data list ---
router.get('/site/vehicles', ensureAdmin, async (req, res) => {
    try {
        const { VEHICLE_DATA } = loadVehicleData()
        res.render('admin/site-vehicles', { vehicleData: VEHICLE_DATA })
    } catch (err) {
        console.error(err)
        req.flash('errorMessage', 'Failed to load vehicle data.')
        // res.redirect('/admin')
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

        const { VEHICLE_DATA, COLORS, VEHICLE_TYPES } = loadVehicleData()

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
        saveVehicleData(VEHICLE_DATA, COLORS, VEHICLE_TYPES)

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

// --- Add a year to a model ---
router.post('/site/vehicles/year', ensureAdmin, async (req, res) => {
    try {
        const { make, model, year } = req.body
        const yearNum = parseInt(year, 10)

        if (!make || !model || !year || isNaN(yearNum) || yearNum < 1900 || yearNum > 2100) {
            req.flash('errorMessage', 'A valid year is required.')
            return res.redirect('/admin/site/vehicles')
        }

        const { VEHICLE_DATA, COLORS, VEHICLE_TYPES } = loadVehicleData()

        if (!VEHICLE_DATA[make] || !VEHICLE_DATA[make][model]) {
            req.flash('errorMessage', 'Model not found.')
            return res.redirect('/admin/site/vehicles')
        }

        if (VEHICLE_DATA[make][model].includes(yearNum)) {
            req.flash('errorMessage', `${yearNum} is already listed for ${model}.`)
            return res.redirect('/admin/site/vehicles')
        }

        VEHICLE_DATA[make][model].push(yearNum)
        VEHICLE_DATA[make][model].sort((a, b) => b - a)

        saveVehicleData(VEHICLE_DATA, COLORS, VEHICLE_TYPES)

        req.flash('successMessage', `Added ${yearNum} to ${model}.`)
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
        req.flash('successMessage', `Created spec entry for ${spec.make} ${spec.model}${spec.year ? ' ' + spec.year : ' (model default)'}.`)
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

    return {
        make: body.make,
        model: body.model,
        year: body.year && body.year.trim() ? parseInt(body.year, 10) : null,
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