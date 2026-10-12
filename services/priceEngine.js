/**
 * priceEngine.js
 * -----------------------------------------------------------------------
 * Prices a booking ON THE SERVER, with the exact same code the booking
 * form runs in the browser.
 *
 * Why: the form used to send its own prices and the server saved them,
 * so anyone could edit the request and book a $1 oil change. Now the
 * server takes only the customer's CHOICES (vehicle, services, options)
 * and works the price out itself. Whatever numbers the browser sends
 * are ignored.
 *
 * How: the pricing scripts in public/js (configurator.js,
 * detailingConfigurator.js, the catalogs…) are loaded into an isolated
 * sandbox, in the same order booking.ejs loads them, with a stand-in
 * `state` object holding the customer's choices. One engine, two places
 * it runs — so the form and the server can never drift apart.
 *
 * Loud-failure rule: if a script is missing or throws, priceBooking()
 * throws. A booking is never saved with unchecked prices.
 * -----------------------------------------------------------------------
 */

const fs = require('fs')
const path = require('path')
const vm = require('vm')

const PartsCatalog = require('../models/PartsCatalog')
const BusinessConfig = require('../models/BusinessConfig')
const VehicleSpec = require('../models/VehicleSpec')
const { generatePartsCatalogScript } = require('./generatePartsCatalogScript')
const { generateBusinessConfigScript } = require('./generateBusinessConfigScript')

const JS_DIR = path.join(__dirname, '..', 'public', 'js')

// Same order as the <script> tags in views/booking.ejs. '@…' entries are
// the two scripts generated from the database rather than read from disk.
const ENGINE_SCRIPTS = [
    'vehicle-data.js',
    'vehicleSpecs.js',
    'oilchangeblocklist.js',
    '@partsCatalog',
    '@businessConfig',
    'services.js',
    'detailingCatalog.js',
    'tintCatalog.js',
    'configurator.js',
    'detailingConfigurator.js'
]

// Compiled scripts, re-read only when the file changes on disk
// (vehicle-data.js and the blocklist are rewritten by the admin panel).
const compiled = {}
function loadScript(file) {
    const fullPath = path.join(JS_DIR, file)
    const mtime = fs.statSync(fullPath).mtimeMs
    if (!compiled[file] || compiled[file].mtime !== mtime) {
        compiled[file] = {
            mtime,
            script: new vm.Script(fs.readFileSync(fullPath, 'utf8'), { filename: file })
        }
    }
    return compiled[file].script
}

/** A page with nothing on it: every lookup comes back empty. */
function fakeDocument() {
    return {
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        addEventListener: () => {}
    }
}

/**
 * Works out the estimate for one booking.
 *
 *   input: { category, services: [names], selections: { … }, locationType,
 *            vehicle: { make, model, year, vinMode, vehicleType } }
 *   locationType 'Drop-off' applies the drop-off discount — only pass it
 *   after checking the customer is allowed to drop off (services/trust.js).
 *
 * Returns the same object computeEstimate() returns in the browser
 * (lineItems, laborItems, toolsNeeded, serviceNotes, subtotal, tax,
 * total, flags…), after the drop-off discount but before any discount code, plus:
 *   taxRate     the rate used
 *   incomplete  names of selected services whose options aren't all
 *               answered (the caller should refuse those bookings)
 *   jobHours    hours of work, for scheduling
 */
async function priceBooking(input) {
    const vehicle = input.vehicle || {}
    const [catalog, settings, spec] = await Promise.all([
        PartsCatalog.getCatalog(),
        BusinessConfig.getPricingSettings(),
        (vehicle.make && vehicle.model)
            ? VehicleSpec.resolveFor(vehicle.make, vehicle.model, vehicle.year)
            : null
    ])

    const generated = {
        '@partsCatalog': generatePartsCatalogScript(catalog),
        '@businessConfig': generateBusinessConfigScript(settings)
    }

    // Deep copy: the engine writes into selections (e.g. the size class),
    // and nothing from the request should be shared with the sandbox.
    const state = {
        vinMode: vehicle.vinMode === 'vin' ? 'vin' : 'manual',
        selectedMake: String(vehicle.make || ''),
        selectedModel: String(vehicle.model || ''),
        selectedYear: vehicle.year || '',
        selectedType: String(vehicle.vehicleType || ''),
        category: String(input.category || ''),
        locationType: String(input.locationType || ''),
        services: Array.isArray(input.services) ? input.services.map(String) : [],
        selectedParts: JSON.parse(JSON.stringify(input.selections || {})),
        discount: null,
        lastEstimate: null
    }

    const sandbox = {
        console,
        document: fakeDocument(),
        __state: state,
        __spec: spec
    }
    sandbox.window = sandbox
    vm.createContext(sandbox)

    // What booking.js provides in the browser: `state`, and the saved
    // spec for the selected vehicle.
    vm.runInContext('const state = __state; function getVehicleSpecs() { return __spec; }', sandbox)

    ENGINE_SCRIPTS.forEach(file => {
        if (generated[file]) {
            vm.runInContext(generated[file], sandbox, { filename: file })
        } else {
            loadScript(file).runInContext(sandbox)
        }
    })

    const estimate = vm.runInContext(
        `(() => {
            const estimate = applyDropOffDiscount(computeBaseEstimate());
            return JSON.stringify(Object.assign(estimate, {
                taxRate: TAX_RATE,
                incomplete: getIncompleteServices(),
                jobHours: getEstimateHours(estimate)
            }));
        })()`,
        sandbox,
        { timeout: 2000 }
    )
    return JSON.parse(estimate)
}

/** Every service name the form offers for a category — used to reject made-up services. */
async function knownServiceNames(category) {
    const settings = await BusinessConfig.getPricingSettings()
    const sandbox = { console, document: fakeDocument() }
    sandbox.window = sandbox
    vm.createContext(sandbox)
    vm.runInContext(generateBusinessConfigScript(settings), sandbox)
    ;['services.js', 'detailingCatalog.js', 'tintCatalog.js'].forEach(file => loadScript(file).runInContext(sandbox))
    const names = vm.runInContext(`JSON.stringify({
        Automotive: Object.keys(SERVICE_NAME_TO_ID).concat(['General Maintenance']),
        Detailing: DETAILING_SERVICES.map(s => s.name),
        Tint: TINT_SERVICES.map(s => s.name)
    })`, sandbox)
    return JSON.parse(names)[category] || null
}

module.exports = { priceBooking, knownServiceNames }
