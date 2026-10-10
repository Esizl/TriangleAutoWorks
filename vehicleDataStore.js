const fs = require('fs')
const path = require('path')
const vm = require('vm')

const VEHICLE_DATA_PATH = path.join(__dirname, 'public', 'js', 'vehicle-data.js')

// Size classes a model can be assigned (Admin → Site → Vehicle Data).
// Drives size-based pricing on the booking form. The ids MUST match
// DETAILING_SIZES in public/js/detailingCatalog.js.
const VEHICLE_SIZE_CLASSES = [
    { id: 'car', label: 'Sedan / Coupe / Hatchback' },
    { id: 'mid', label: 'Small SUV / Crossover / Wagon' },
    { id: 'large', label: 'Large SUV / Truck / Minivan' }
]

function isValidSizeClass(id) {
    return VEHICLE_SIZE_CLASSES.some(c => c.id === id)
}

const MERCEDES_COMMENT = `    /* Standardized to match VEHICLE_SPECS key. Bracket-notation lookups
       (VEHICLE_DATA["Mercedes-Benz"]) work fine in JS regardless of the
       hyphen — the hyphen only breaks things if you try dot-notation
       (VEHICLE_DATA.Mercedes-Benz, which is actually subtraction!) or if a
       display label does something like make.replace() unexpectedly. */
`

// Quote a make/model key only if it's not a valid bare JS identifier
function formatKey(key) {
    const isValidIdentifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key)
    return isValidIdentifier ? key : JSON.stringify(key)
}

// Read vehicle-data.js off disk and safely extract VEHICLE_DATA / COLORS /
// VEHICLE_TYPES / VEHICLE_SIZES without using require() (no caching issues)
// or eval() in the main context.
function loadVehicleData() {
    const src = fs.readFileSync(VEHICLE_DATA_PATH, 'utf8')
    const sandbox = {}
    vm.createContext(sandbox)
    vm.runInContext(
        src + '\nthis.__VEHICLE_DATA = VEHICLE_DATA; this.__COLORS = COLORS; this.__VEHICLE_TYPES = VEHICLE_TYPES;' +
        // VEHICLE_SIZES was added later — a file written before it existed has none.
        '\nthis.__VEHICLE_SIZES = (typeof VEHICLE_SIZES !== "undefined") ? VEHICLE_SIZES : {};',
        sandbox
    )
    return {
        VEHICLE_DATA: sandbox.__VEHICLE_DATA || {},
        COLORS: sandbox.__COLORS || [],
        VEHICLE_TYPES: sandbox.__VEHICLE_TYPES || [],
        VEHICLE_SIZES: sandbox.__VEHICLE_SIZES || {}
    }
}

// Regenerate the full file text from the in-memory object and write it back to disk.
// VEHICLE_SIZES is optional: callers that only touch models/years can leave it
// out and the sizes already on disk are kept. Sizes for models that no longer
// exist in VEHICLE_DATA are dropped.
function saveVehicleData(VEHICLE_DATA, COLORS, VEHICLE_TYPES, VEHICLE_SIZES) {
    if (VEHICLE_SIZES === undefined) {
        VEHICLE_SIZES = loadVehicleData().VEHICLE_SIZES
    }

    const makeEntries = Object.keys(VEHICLE_DATA).map(make => {
        const models = VEHICLE_DATA[make]
        const modelKeys = Object.keys(models)

        const modelLines = modelKeys.map(model => {
            const years = models[model]
            return `        ${JSON.stringify(model)}: [${years.join(', ')}]`
        }).join(',\n')

        const prefix = make === 'Mercedes-Benz' ? MERCEDES_COMMENT : ''
        const body = modelKeys.length > 0 ? `\n${modelLines}\n    ` : ''
        return `${prefix}    ${formatKey(make)}: {${body}}`
    })

    const body = makeEntries.join(',\n\n')

    const sizes = {}
    Object.keys(VEHICLE_DATA).forEach(make => {
        Object.keys(VEHICLE_DATA[make]).forEach(model => {
            const size = (VEHICLE_SIZES[make] || {})[model]
            if (!isValidSizeClass(size)) return
            if (!sizes[make]) sizes[make] = {}
            sizes[make][model] = size
        })
    })

    const fileText =
        `const VEHICLE_DATA = {\n${body}\n};\n\n` +
        `const COLORS = ${JSON.stringify(COLORS, null, 4)};\n\n` +
        `const VEHICLE_TYPES = ${JSON.stringify(VEHICLE_TYPES, null, 4)};\n\n` +
        `// Size class per model: "car" | "mid" | "large". Edited in Admin → Site → Vehicle Data.\n` +
        `const VEHICLE_SIZES = ${JSON.stringify(sizes, null, 4)};\n`

    fs.writeFileSync(VEHICLE_DATA_PATH, fileText, 'utf8')
}

module.exports = { loadVehicleData, saveVehicleData, VEHICLE_SIZE_CLASSES, isValidSizeClass }
