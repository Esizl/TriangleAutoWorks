/**
 * partsCheck.js — finds gaps in the parts catalog and vehicle specs that
 * would make a tech sheet show a missing or wrong part number, or a
 * spec entry that can never be used. Shown on Admin > Site > Parts &
 * Tools Check. Read-only: it never changes anything.
 */

const PartsCatalog = require('../models/PartsCatalog')
const VehicleSpec = require('../models/VehicleSpec')
const { loadVehicleData } = require('../vehicleDataStore')

function yearLabel(entry) {
    if (entry.year == null) return 'model default'
    return entry.yearEnd ? `${entry.year}–${entry.yearEnd}` : String(entry.year)
}

/**
 * Returns a list of { area, severity, message } — severity 'problem'
 * (shows wrong or missing info on a real job) or 'note' (worth a look).
 */
async function findCatalogIssues() {
    const [catalog, specs] = await Promise.all([PartsCatalog.getCatalog(), VehicleSpec.find().lean()])
    const { VEHICLE_DATA } = loadVehicleData()
    const issues = []
    const add = (area, severity, message) => issues.push({ area, severity, message })

    const supplierKeys = new Set((catalog.suppliers || []).map(s => s.key))
    const checkSupplier = (area, name, key) => {
        if (key && !supplierKeys.has(key)) add(area, 'problem', `${name}: supplier "${key}" doesn't exist under Suppliers, so no supplier shows on the tech sheet.`)
    }
    const inVehicleList = (make, model) => !!(VEHICLE_DATA[make] && VEHICLE_DATA[make][model])

    // Oil
    ;(catalog.oilProducts || []).forEach(o => {
        const missing = []
        if (!o.jugPartNumber) missing.push('5qt jug part #')
        if (!o.quartPartNumber) missing.push('quart part #')
        if (o.jugPrice == null) missing.push('jug price')
        if (o.price == null) missing.push('quart price')
        if (missing.length) add('Oil', 'problem', `${o.name}: no ${missing.join(', ')}.`)
        checkSupplier('Oil', o.name, o.supplier)
    })

    // Filters
    const brandNames = new Set((catalog.filterBrands || []).map(f => f.name))
    ;(catalog.filterBrands || []).forEach(f => {
        if (!f.partNumber) add('Filters', 'note', `${f.name}: no default oil filter part # — vehicles without a Filter Override for this brand show "Part # needed".`)
        checkSupplier('Filters', f.name, f.supplier)
    })
    const seen = {}
    ;(catalog.filterOverrides || []).forEach(o => {
        const label = `${o.brand} ${o.filterType || 'oil'} filter for ${o.make} ${o.model} ${o.year || '(all years)'}`
        if (!brandNames.has(o.brand)) add('Filter overrides', 'problem', `${label}: brand "${o.brand}" isn't in Filter Brands, so this is never used.`)
        if (!inVehicleList(o.make, o.model)) add('Filter overrides', 'problem', `${label}: "${o.make} ${o.model}" isn't spelled the way it is in Vehicle Data, so it never matches a booking.`)
        if (!o.partNumber) add('Filter overrides', 'note', `${label}: no part number.`)
        const key = [o.brand, o.filterType || 'oil', o.make, o.model, o.year == null ? '' : o.year].join('|')
        if (seen[key]) add('Filter overrides', 'problem', `${label}: entered twice — only one of them is used.`)
        seen[key] = true
    })

    // Brakes
    ;(catalog.brakePadTypes || []).forEach(p => {
        if (!p.partNumber) add('Brakes', 'note', `Pads "${p.name}": no part number (pads are per vehicle anyway — the tech sheet says to look them up).`)
        checkSupplier('Brakes', `Pads "${p.name}"`, p.supplier)
    })
    ;(catalog.rotorOptions || []).forEach(r => checkSupplier('Brakes', `Rotors "${r.name}"`, r.supplier))
    ;(catalog.suppliers || []).forEach(s => {
        if (!s.baseUrl) add('Suppliers', 'note', `${s.label}: no website, so the tech sheet can't link to it.`)
    })

    // Vehicle specs
    let unverified = 0
    specs.forEach(sp => {
        const label = `${sp.make} ${sp.model} (${yearLabel(sp)})`
        if (!inVehicleList(sp.make, sp.model)) add('Vehicle specs', 'problem', `${label}: "${sp.make} ${sp.model}" isn't spelled the way it is in Vehicle Data, so this spec is never used.`)
        if (!sp.oil || !sp.oil.viscosity || !sp.oil.capacity) add('Vehicle specs', 'problem', `${label}: missing oil ${!sp.oil || !sp.oil.viscosity ? 'viscosity' : 'capacity'} — quotes fall back to 5 qt of 5W-30.`)
        if (!sp.tools || !sp.tools.oilChange || sp.tools.oilChange.length === 0) add('Vehicle specs', 'note', `${label}: no tools listed — the generic tool set is used, plus its drain plug / filter socket sizes.`)
        if (!sp.oilChangeLaborMinutes) add('Vehicle specs', 'note', `${label}: no labor time — 20 minutes is used.`)
        if (sp.verified === false) unverified++
    })
    if (unverified) add('Vehicle specs', 'note', `${unverified} spec entr${unverified === 1 ? 'y is' : 'ies are'} still marked Unverified.`)

    return issues
}

module.exports = { findCatalogIssues }
