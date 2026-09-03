/**
 * generatePartsCatalogScript.js
 * -----------------------------------------------------------------------
 * Regenerates the exact JS text that used to live as the static file
 * public/js/partsCatalog.js, but sourced from the PartsCatalog Mongo
 * singleton instead of hardcoded data. This is the same "rebuild file
 * text from an in-memory object" approach vehicleDataStore.js uses for
 * vehicle-data.js — same idea, different data shape.
 *
 * CRITICAL: configurator.js and booking.ejs are UNCHANGED by this
 * migration beyond what's documented here. They still expect
 * window.PARTS_CATALOG, window.OIL_PRODUCTS, window.FILTER_COMPATIBILITY,
 * window.FILTER_PART_NUMBERS, window.SUPPLIERS, and the
 * getPartRecord/getAvailableOilBrands/getAvailableFilterBrands/
 * getSupplierInfo functions. getPartRecord gained an optional 5th
 * `filterType` argument (defaults to 'oil'). getAvailableOilBrands gained
 * optional 3rd (`highMileageRequested`, defaults false) and 4th
 * (`recommendedViscosity`, defaults null) arguments — existing call sites
 * that don't pass them keep behaving exactly as before.
 *
 * "unit" labels ("per quart", "per axle set", "per axle pair") and the
 * hardcoded pass-through options under tires.serviceType with price 0
 * are treated as structural constants, not admin-editable catalog data,
 * matching how they were authored in the original file. If you want
 * those editable too, say so and I'll add fields for them — I didn't
 * want to guess you wanted every string editable when the original
 * treated them as fixed labels.
 * -----------------------------------------------------------------------
 */

function jsLiteral(value) {
    // Small wrapper so `undefined` fields serialize as `null` (valid JS)
    // instead of disappearing, which would silently change field
    // presence between admin edits — loud-failure preference over a
    // "some fields might just vanish" surprise.
    return JSON.stringify(value === undefined ? null : value)
}

function renderOilProduct(p) {
    return `makePart({
        partNumber: ${jsLiteral(p.quartPartNumber)},
        jugPartNumber: ${jsLiteral(p.jugPartNumber)},
        price: ${jsLiteral(p.price)},
        jugPrice: ${jsLiteral(p.jugPrice)},
        supplier: ${jsLiteral(p.supplier)},
        url: ${jsLiteral(p.url)},
        oilCategory: ${jsLiteral(p.oilCategory)},
        tier: ${jsLiteral(p.tier)},
        availability: ${jsLiteral(p.availability || 'all')},
        includesFreeFilter: ${jsLiteral(!!p.includesFreeFilter)},
        highMileage: ${jsLiteral(!!p.highMileage)},
        viscosities: ${jsLiteral(p.viscosities || [])}
    })`
}

function renderPriceOption(o) {
    return `makePart({ price: ${jsLiteral(o.price)}, supplier: ${jsLiteral(o.supplier)} })`
}

function renderSuppliers(suppliers) {
    const entries = suppliers.map(s =>
        `    ${jsLiteral(s.key)}: {\n        label: ${jsLiteral(s.label)},\n        baseUrl: ${jsLiteral(s.baseUrl)}\n    }`
    )
    return `{\n${entries.join(',\n')}\n}`
}

function renderOilProducts(oilProducts) {
    const entries = oilProducts.map(p => `    ${jsLiteral(p.name)}: ${renderOilProduct(p)}`)
    return `{\n${entries.join(',\n')}\n}`
}

function renderFilterBrandMap(filterBrands) {
    const entries = filterBrands.map(f => `        ${jsLiteral(f.name)}: ${renderPriceOption(f)}`)
    return `{\n${entries.join(',\n')}\n    }`
}

function renderPadOrRotorMap(items) {
    const entries = items.map(i => `            ${jsLiteral(i.name)}: ${renderPriceOption(i)}`)
    return `{\n${entries.join(',\n')}\n        }`
}

function renderTireServiceMap(tireServiceTypes) {
    const entries = tireServiceTypes.map(t => `            ${jsLiteral(t.name)}: makePart({ price: ${jsLiteral(t.price)} })`)
    return `{\n${entries.join(',\n')}\n        }`
}

function renderFilterCompatibility(filterBrands) {
    // Mirrors the original rule exactly: brands with no compatibility
    // restriction get no entry at all (universal), not an empty array.
    const restricted = filterBrands.filter(f => f.compatibleMakes && f.compatibleMakes.length > 0)
    if (restricted.length === 0) return '{}'
    const entries = restricted.map(f =>
        `    ${jsLiteral(f.name)}: {\n        makes: ${jsLiteral(f.compatibleMakes)}\n    }`
    )
    return `{\n${entries.join(',\n')}\n}`
}

function renderFilterPartNumbers(filterOverrides) {
    // Reconstruct the nested brand -> filterType -> make -> model ->
    // (year | _default) structure from the flat list of override
    // documents. filterType defaults to 'oil' for any legacy override
    // rows that predate the field.
    const tree = {}
    for (const o of filterOverrides) {
        const filterType = o.filterType || 'oil'
        tree[o.brand] = tree[o.brand] || {}
        tree[o.brand][filterType] = tree[o.brand][filterType] || {}
        tree[o.brand][filterType][o.make] = tree[o.brand][filterType][o.make] || {}
        tree[o.brand][filterType][o.make][o.model] = tree[o.brand][filterType][o.make][o.model] || {}
        const key = o.year != null ? String(o.year) : '_default'
        tree[o.brand][filterType][o.make][o.model][key] = {
            partNumber: o.partNumber,
            price: o.price,
            url: o.url
        }
    }

    if (Object.keys(tree).length === 0) return '{}'

    const brandEntries = Object.entries(tree).map(([brand, types]) => {
        const typeEntries = Object.entries(types).map(([filterType, makes]) => {
            const makeEntries = Object.entries(makes).map(([make, models]) => {
                const modelEntries = Object.entries(models).map(([model, years]) => {
                    const yearEntries = Object.entries(years).map(([yearKey, override]) => {
                        const cleaned = {}
                        if (override.partNumber != null) cleaned.partNumber = override.partNumber
                        if (override.price != null) cleaned.price = override.price
                        if (override.url != null) cleaned.url = override.url
                        return `                    ${yearKey === '_default' ? '_default' : jsLiteral(yearKey)}: ${jsLiteral(cleaned)}`
                    })
                    return `                ${jsLiteral(model)}: {\n${yearEntries.join(',\n')}\n                }`
                })
                return `            ${jsLiteral(make)}: {\n${modelEntries.join(',\n')}\n            }`
            })
            return `        ${jsLiteral(filterType)}: {\n${makeEntries.join(',\n')}\n        }`
        })
        return `    ${jsLiteral(brand)}: {\n${typeEntries.join(',\n')}\n    }`
    })

    return `{\n${brandEntries.join(',\n')}\n}`
}

// The helper functions below are copied verbatim from the original
// public/js/partsCatalog.js, plus jugPartNumber/highMileage/viscosities
// and the filterType parameter on getPartRecord. They contain no catalog
// data themselves — they only read the data variables generated above —
// so they never need to change when the admin edits the catalog.
const HELPER_FUNCTIONS_SOURCE = `
function makePart({
    partNumber = null,
    jugPartNumber = null,
    price = null,
    jugPrice = null,
    supplier = null,
    url = null,
    oilCategory = null,
    tier = null,
    availability = "all",
    includesFreeFilter = false,
    highMileage = false,
    viscosities = []
} = {}) {
    return {
        partNumber,
        jugPartNumber,
        price,
        jugPrice,
        supplier,
        url,
        oilCategory,
        tier,
        availability,
        includesFreeFilter,
        highMileage,
        viscosities,
        isPlaceholder: partNumber === null && price === null
    };
}

const OIL_JUG_SIZE_QTS = 5;

// highMileageRequested defaults to false, recommendedViscosity defaults
// to null — every existing call site keeps behaving exactly as before.
// viscosities filtering follows the same "empty list = universal"
// convention as FILTER_COMPATIBILITY: a product with no viscosities
// listed is never excluded by this check, only products that DO list
// viscosities get filtered against the vehicle's recommended one.
function getAvailableOilBrands(requestedTier, vehicleRequiredTier, highMileageRequested, recommendedViscosity) {
    return Object.entries(OIL_PRODUCTS)
        .filter(([, product]) => {
            if (product.availability !== "all") return false;
            if (vehicleRequiredTier === "premium" && product.tier === "budget") return false;
            if (requestedTier && product.tier !== requestedTier) return false;
            if (highMileageRequested && !product.highMileage) return false;
            if (recommendedViscosity && product.viscosities && product.viscosities.length > 0 && !product.viscosities.includes(recommendedViscosity)) return false;
            return true;
        })
        .map(([name]) => name);
}

function getAvailableFilterBrands(make) {
    const allBrands = Object.keys(PARTS_CATALOG.oilChange.filterBrand);
    if (!make) return allBrands;

    return allBrands.filter(brand => {
        const compat = FILTER_COMPATIBILITY[brand];
        if (!compat) return true;
        return compat.makes.includes(make);
    });
}

// filterType defaults to "oil" so every existing call site (oil-change
// filter selection) keeps working unchanged. Pass "engine" or "cabin"
// explicitly for those add-on pickers.
function getPartRecord(serviceKey, optionGroup, optionValue, vehicle = null, filterType = "oil") {
    const record = PARTS_CATALOG?.[serviceKey]?.[optionGroup]?.[optionValue];
    const base = record || makePart();

    if (serviceKey === 'oilChange' && optionGroup === 'filterBrand' && vehicle?.make && vehicle?.model) {
        const override = FILTER_PART_NUMBERS?.[optionValue]?.[filterType]?.[vehicle.make]?.[vehicle.model];
        if (override) {
            const yearOverride = vehicle.year ? override[String(vehicle.year)] : null;
            const chosen = yearOverride || override._default;
            if (chosen) {
                return {
                    ...base,
                    partNumber: chosen.partNumber ?? base.partNumber,
                    price: chosen.price ?? base.price,
                    url: chosen.url ?? base.url,
                    isPlaceholder: false
                };
            }
        }
    }

    return base;
}

function getSupplierInfo(supplierKey) {
    return SUPPLIERS[supplierKey] || null;
}

window.PARTS_CATALOG = PARTS_CATALOG;
window.OIL_PRODUCTS = OIL_PRODUCTS;
window.OIL_JUG_SIZE_QTS = OIL_JUG_SIZE_QTS;
window.SUPPLIERS = SUPPLIERS;
window.FILTER_COMPATIBILITY = FILTER_COMPATIBILITY;
window.FILTER_PART_NUMBERS = FILTER_PART_NUMBERS;
window.getPartRecord = getPartRecord;
window.getSupplierInfo = getSupplierInfo;
window.getAvailableOilBrands = getAvailableOilBrands;
window.getAvailableFilterBrands = getAvailableFilterBrands;
`

function generatePartsCatalogScript(catalog) {
    const suppliers = catalog.suppliers || []
    const oilProducts = catalog.oilProducts || []
    const filterBrands = catalog.filterBrands || []
    const filterOverrides = catalog.filterOverrides || []
    const brakePadTypes = catalog.brakePadTypes || []
    const rotorOptions = catalog.rotorOptions || []
    const tireServiceTypes = catalog.tireServiceTypes || []

    return `/* AUTO-GENERATED from the PartsCatalog database record. Do not hand-edit —
   edit via /admin/site/parts instead; this file is regenerated on every
   request to /js/partsCatalog.js. */

const SUPPLIERS = ${renderSuppliers(suppliers)};

const OIL_PRODUCTS = ${renderOilProducts(oilProducts)};

const PARTS_CATALOG = {
    oilChange: {
        oilProducts: OIL_PRODUCTS,
        unit: "per quart",
        filterBrand: ${renderFilterBrandMap(filterBrands)}
    },
    brakes: {
        padType: ${renderPadOrRotorMap(brakePadTypes)},
        padUnit: "per axle set",
        rotors: ${renderPadOrRotorMap(rotorOptions)},
        rotorUnit: "per axle pair"
    },
    tires: {
        serviceType: ${renderTireServiceMap(tireServiceTypes)}
    }
};

const FILTER_COMPATIBILITY = ${renderFilterCompatibility(filterBrands)};

const FILTER_PART_NUMBERS = ${renderFilterPartNumbers(filterOverrides)};
${HELPER_FUNCTIONS_SOURCE}`
}

module.exports = { generatePartsCatalogScript }