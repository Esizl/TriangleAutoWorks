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

const OLDEST_YEAR = 1980
const NEWEST_YEAR = new Date().getFullYear() + 2

/**
 * "2010-2026", "2015 2018 2020-2022", "2019,2021" -> sorted list of years
 * (newest first). Returns { years } or { error } with a readable reason.
 */
function parseYearList(text) {
    const parts = String(text || '').split(/[\s,;/]+/).filter(Boolean)
    if (parts.length === 0) return { error: 'no years given' }
    const years = new Set()
    for (const part of parts) {
        const range = part.match(/^(\d{4})\s*[-–]\s*(\d{4})$/)
        const single = part.match(/^(\d{4})$/)
        let from, to
        if (range) { from = Number(range[1]); to = Number(range[2]) }
        else if (single) { from = to = Number(single[1]) }
        else return { error: `"${part}" isn't a year or a range like 2010-2026` }
        if (from > to) [from, to] = [to, from]
        if (from < OLDEST_YEAR || to > NEWEST_YEAR) return { error: `years must be between ${OLDEST_YEAR} and ${NEWEST_YEAR}` }
        for (let y = from; y <= to; y++) years.add(y)
    }
    return { years: Array.from(years).sort((a, b) => b - a) }
}

// Words people naturally type for each size class.
const SIZE_WORDS = {
    car: ['car', 'sedan', 'coupe', 'hatchback', 'hatch', 'convertible', 'small', 's'],
    mid: ['mid', 'suv', 'crossover', 'wagon', 'small suv', '2-row', 'two-row', 'medium', 'm'],
    large: ['large', 'truck', 'pickup', 'van', 'minivan', '3-row', 'three-row', 'large suv', 'big', 'l']
}

/** "Sedan" -> "car", "truck" -> "large"; '' if blank, null if not recognised. */
function normalizeSizeWord(word) {
    const w = String(word || '').trim().toLowerCase()
    if (!w) return ''
    const match = Object.entries(SIZE_WORDS).find(([, words]) => words.includes(w))
    return match ? match[0] : null
}

/** Existing key matched ignoring case ("toyota" finds "Toyota"), else null. */
function findKey(obj, name) {
    const wanted = String(name || '').trim().toLowerCase()
    return Object.keys(obj || {}).find(k => k.toLowerCase() === wanted) || null
}

/**
 * Adds many vehicles at once from pasted text, one per line:
 *     Make, Model, Years, Size
 *     Toyota, Camry, 2010-2026, car
 *     Ford, F-150, 2015-2020 2022, truck
 * Fields can be separated by commas or tabs (so rows pasted straight from
 * a spreadsheet work). Size is optional for a model that already has one.
 * A make or model that doesn't exist yet is created. Years are added to
 * what's there, never removed. Lines starting with # are ignored.
 *
 * Returns { added: {makes, models, years, sizes}, errors: ["line 3: …"] }
 * and saves only if at least one line was valid.
 */
function bulkAddVehicles(text) {
    const { VEHICLE_DATA, COLORS, VEHICLE_TYPES, VEHICLE_SIZES } = loadVehicleData()
    const added = { makes: 0, models: 0, years: 0, sizes: 0 }
    const errors = []
    let changed = false

    String(text || '').split(/\r?\n/).forEach((rawLine, index) => {
        const line = rawLine.trim()
        if (!line || line.startsWith('#')) return
        const label = `Line ${index + 1} ("${line.length > 60 ? line.slice(0, 57) + '…' : line}")`

        const fields = line.split(line.includes('\t') ? '\t' : ',').map(f => f.trim())
        if (fields.length < 3) {
            errors.push(`${label}: needs at least Make, Model, Years`)
            return
        }
        const [makeIn, modelIn, yearsIn, sizeIn = ''] = fields
        if (!makeIn || !modelIn) {
            errors.push(`${label}: make and model can't be blank`)
            return
        }
        if (makeIn.length > 40 || modelIn.length > 60) {
            errors.push(`${label}: make or model name is too long`)
            return
        }

        const parsedYears = parseYearList(yearsIn)
        if (parsedYears.error) {
            errors.push(`${label}: ${parsedYears.error}`)
            return
        }
        const size = normalizeSizeWord(sizeIn)
        if (size === null) {
            errors.push(`${label}: size "${sizeIn}" isn't one of car / mid / large (sedan, SUV, truck… also work)`)
            return
        }

        // A brand-new make typed all lowercase gets capitalised ("rivian" ->
        // "Rivian"); anything else is kept exactly as typed ("BMW", "McLaren").
        const tidyMake = makeIn === makeIn.toLowerCase() ? makeIn.replace(/\b\w/g, c => c.toUpperCase()) : makeIn
        const make = findKey(VEHICLE_DATA, makeIn) || tidyMake
        const model = findKey(VEHICLE_DATA[make], modelIn) || modelIn
        const existingSize = (VEHICLE_SIZES[make] || {})[model]
        if (!size && !existingSize) {
            errors.push(`${label}: ${make} ${model} is new, so it needs a size (car / mid / large)`)
            return
        }

        if (!VEHICLE_DATA[make]) { VEHICLE_DATA[make] = {}; added.makes++ }
        if (!VEHICLE_DATA[make][model]) { VEHICLE_DATA[make][model] = []; added.models++ }

        const years = new Set(VEHICLE_DATA[make][model].map(Number))
        const before = years.size
        parsedYears.years.forEach(y => years.add(y))
        added.years += years.size - before
        VEHICLE_DATA[make][model] = Array.from(years).sort((a, b) => b - a)

        if (size && size !== existingSize) {
            VEHICLE_SIZES[make] = { ...VEHICLE_SIZES[make], [model]: size }
            added.sizes++
        }
        changed = true
    })

    if (changed) saveVehicleData(VEHICLE_DATA, COLORS, VEHICLE_TYPES, VEHICLE_SIZES)
    return { added, errors }
}

module.exports = {
    loadVehicleData,
    saveVehicleData,
    VEHICLE_SIZE_CLASSES,
    isValidSizeClass,
    parseYearList,
    normalizeSizeWord,
    bulkAddVehicles
}
