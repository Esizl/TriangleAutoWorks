// Fills in public/js/vehicle-data.js with more makes, models and model years
// (back to 2010), plus a size class for every model it adds.
//
// Run with:  node scripts/seedVehicleData.js
//
// Safe to re-run, and it only ever ADDS:
//   - years already listed for a model are kept (older ones too)
//   - a size you set in Admin > Site > Vehicle Data is never overwritten
//   - nothing is removed
//
// Electric-only models are left out on purpose: the booking form would
// offer them an oil change. Add those by hand together with an Oil Change
// Blocklist entry.

const { loadVehicleData, saveVehicleData, isValidSizeClass } = require('../vehicleDataStore')

const OLDEST_YEAR = 2010
const LATEST_YEAR = 2026 // newest model year to list for models still on sale

// Each model: [name, size, ...year ranges]. A range is [first, last];
// last = null means "still on sale". Sizes: car / mid / large — two-row
// SUVs and wagons are mid; three rows, trucks and vans are large.
const CATALOG = {
    Acura: [
        ['ILX', 'car', [2013, 2022]], ['Integra', 'car', [2023, null]], ['TLX', 'car', [2015, null]],
        ['TSX', 'car', [2010, 2014]], ['TL', 'car', [2010, 2014]], ['RDX', 'mid', [2010, null]],
        ['MDX', 'large', [2010, 2020], [2022, null]]
    ],
    'Alfa Romeo': [
        ['Giulia', 'car', [2017, null]], ['Stelvio', 'mid', [2018, null]]
    ],
    Audi: [
        ['A3', 'car', [2010, 2013], [2015, null]], ['A4', 'car', [2010, 2025]], ['A5', 'car', [2010, null]],
        ['A6', 'car', [2010, null]], ['A7', 'car', [2012, null]], ['A8', 'car', [2010, null]],
        ['Q3', 'mid', [2015, null]], ['Q5', 'mid', [2010, null]], ['Q7', 'large', [2010, 2015], [2017, null]],
        ['Q8', 'mid', [2019, null]], ['TT', 'car', [2010, 2023]]
    ],
    BMW: [
        ['228i', 'car', [2014, 2016], [2020, null]], ['230i', 'car', [2017, null]],
        ['320i', 'car', [2013, 2018]], ['328i', 'car', [2010, 2016]], ['330i', 'car', [2017, null]],
        ['335i', 'car', [2010, 2015]], ['340i', 'car', [2016, 2019]], ['M340i', 'car', [2020, null]],
        ['428i', 'car', [2014, 2016]], ['430i', 'car', [2017, null]],
        ['528i', 'car', [2010, 2016]], ['530i', 'car', [2017, null]], ['535i', 'car', [2010, 2016]],
        ['540i', 'car', [2017, null]],
        ['X1', 'mid', [2012, null]], ['X2', 'mid', [2018, null]], ['X3', 'mid', [2010, null]],
        ['X4', 'mid', [2015, null]], ['X5', 'mid', [2010, null]], ['X6', 'mid', [2010, null]],
        ['X7', 'large', [2019, null]]
    ],
    Buick: [
        ['Encore', 'mid', [2013, 2022]], ['Encore GX', 'mid', [2020, null]], ['Envista', 'mid', [2024, null]],
        ['Envision', 'mid', [2016, null]], ['Enclave', 'large', [2010, null]],
        ['LaCrosse', 'car', [2010, 2019]], ['Regal', 'car', [2011, 2020]], ['Verano', 'car', [2012, 2017]]
    ],
    Cadillac: [
        ['Escalade', 'large', [2010, null]], ['XT4', 'mid', [2019, null]], ['XT5', 'mid', [2017, null]],
        ['XT6', 'large', [2020, null]], ['CT4', 'car', [2020, null]], ['CT5', 'car', [2020, null]],
        ['CT6', 'car', [2016, 2020]], ['CTS', 'car', [2010, 2019]], ['ATS', 'car', [2013, 2019]],
        ['XTS', 'car', [2013, 2019]], ['SRX', 'mid', [2010, 2016]]
    ],
    Chevrolet: [
        ['Silverado 1500', 'large', [2010, null]], ['Silverado 2500HD', 'large', [2010, null]],
        ['Silverado 3500HD', 'large', [2010, null]], ['Colorado', 'large', [2010, 2012], [2015, null]],
        ['Suburban', 'large', [2010, null]], ['Tahoe', 'large', [2010, null]], ['Traverse', 'large', [2010, null]],
        ['Equinox', 'mid', [2010, null]], ['Blazer', 'mid', [2019, null]], ['Trailblazer', 'mid', [2021, null]],
        ['Trax', 'mid', [2015, 2022], [2024, null]],
        ['Malibu', 'car', [2010, 2025]], ['Impala', 'car', [2010, 2020]], ['Cruze', 'car', [2011, 2019]],
        ['Sonic', 'car', [2012, 2020]], ['Spark', 'car', [2013, 2022]],
        ['Camaro', 'car', [2010, 2024]], ['Corvette', 'car', [2010, null]], ['Express', 'large', [2010, null]]
    ],
    Chrysler: [
        ['300', 'car', [2010, 2023]], ['200', 'car', [2011, 2017]], ['Pacifica', 'large', [2017, null]],
        ['Voyager', 'large', [2020, null]], ['Town & Country', 'large', [2010, 2016]]
    ],
    Dodge: [
        ['Charger', 'car', [2010, 2023]], ['Challenger', 'car', [2010, 2023]], ['Durango', 'large', [2011, null]],
        ['Hornet', 'mid', [2023, 2025]], ['Grand Caravan', 'large', [2010, 2020]], ['Journey', 'mid', [2010, 2020]],
        ['Dart', 'car', [2013, 2016]], ['Avenger', 'car', [2010, 2014]]
    ],
    Fiat: [
        ['500', 'car', [2012, 2019]]
    ],
    Ford: [
        ['F-150', 'large', [2010, null]], ['F-250', 'large', [2010, null]], ['F-350', 'large', [2010, null]],
        ['Ranger', 'large', [2010, 2011], [2019, null]], ['Maverick', 'large', [2022, null]],
        ['Explorer', 'large', [2010, null]], ['Expedition', 'large', [2010, null]], ['Flex', 'large', [2010, 2019]],
        ['Escape', 'mid', [2010, null]], ['Edge', 'mid', [2010, 2024]], ['Bronco', 'mid', [2021, null]],
        ['Bronco Sport', 'mid', [2021, null]], ['EcoSport', 'mid', [2018, 2022]],
        ['Mustang', 'car', [2010, null]], ['Fusion', 'car', [2010, 2020]], ['Focus', 'car', [2010, 2018]],
        ['Fiesta', 'car', [2011, 2019]], ['Taurus', 'car', [2010, 2019]],
        ['Transit', 'large', [2015, null]], ['Transit Connect', 'mid', [2010, 2023]]
    ],
    Genesis: [
        ['G70', 'car', [2019, null]], ['G80', 'car', [2017, null]], ['G90', 'car', [2017, null]],
        ['GV70', 'mid', [2022, null]], ['GV80', 'mid', [2021, null]]
    ],
    GMC: [
        ['Sierra 1500', 'large', [2010, null]], ['Sierra 2500HD', 'large', [2010, null]],
        ['Sierra 3500HD', 'large', [2010, null]], ['Canyon', 'large', [2010, 2012], [2015, null]],
        ['Terrain', 'mid', [2010, null]], ['Acadia', 'large', [2010, null]], ['Yukon', 'large', [2010, null]],
        ['Yukon XL', 'large', [2010, null]]
    ],
    Honda: [
        ['Accord', 'car', [2010, null]], ['Civic', 'car', [2010, null]], ['Fit', 'car', [2010, 2020]],
        ['Insight', 'car', [2010, 2014], [2019, 2022]],
        ['CR-V', 'mid', [2010, null]], ['HR-V', 'mid', [2016, null]], ['Passport', 'mid', [2019, null]],
        ['Crosstour', 'mid', [2010, 2015]], ['Element', 'mid', [2010, 2011]],
        ['Pilot', 'large', [2010, null]], ['Odyssey', 'large', [2010, null]],
        ['Ridgeline', 'large', [2010, 2014], [2017, null]]
    ],
    Hyundai: [
        ['Elantra', 'car', [2010, null]], ['Sonata', 'car', [2010, null]], ['Accent', 'car', [2010, 2022]],
        ['Veloster', 'car', [2012, 2021]],
        ['Venue', 'mid', [2020, null]], ['Kona', 'mid', [2018, null]], ['Tucson', 'mid', [2010, null]],
        ['Santa Fe', 'mid', [2010, null]], ['Palisade', 'large', [2020, null]], ['Santa Cruz', 'large', [2022, null]]
    ],
    Infiniti: [
        ['G37', 'car', [2010, 2013]], ['Q50', 'car', [2014, 2024]], ['Q60', 'car', [2014, 2022]],
        ['FX35', 'mid', [2010, 2012]], ['QX70', 'mid', [2014, 2017]], ['QX50', 'mid', [2014, null]],
        ['QX60', 'large', [2014, null]], ['QX56', 'large', [2010, 2013]], ['QX80', 'large', [2014, null]]
    ],
    Jaguar: [
        ['XF', 'car', [2010, 2024]], ['XE', 'car', [2017, 2020]], ['XJ', 'car', [2010, 2019]],
        ['F-TYPE', 'car', [2014, 2024]], ['F-PACE', 'mid', [2017, null]], ['E-PACE', 'mid', [2018, 2024]]
    ],
    Jeep: [
        ['Wrangler', 'mid', [2010, null]], ['Gladiator', 'large', [2020, null]], ['Cherokee', 'mid', [2014, 2023]],
        ['Grand Cherokee', 'mid', [2010, null]], ['Grand Cherokee L', 'large', [2021, null]],
        ['Compass', 'mid', [2010, null]], ['Renegade', 'mid', [2015, 2023]], ['Patriot', 'mid', [2010, 2017]],
        ['Liberty', 'mid', [2010, 2012]], ['Wagoneer', 'large', [2022, null]], ['Grand Wagoneer', 'large', [2022, null]]
    ],
    Kia: [
        ['Forte', 'car', [2010, 2024]], ['K4', 'car', [2025, null]], ['K5', 'car', [2021, null]],
        ['Optima', 'car', [2010, 2020]], ['Rio', 'car', [2010, 2023]], ['Soul', 'car', [2010, 2025]],
        ['Stinger', 'car', [2018, 2023]],
        ['Seltos', 'mid', [2021, null]], ['Sportage', 'mid', [2010, null]], ['Niro', 'mid', [2017, null]],
        ['Sorento', 'large', [2011, null]], ['Telluride', 'large', [2020, null]],
        ['Sedona', 'large', [2010, 2012], [2014, 2021]], ['Carnival', 'large', [2022, null]]
    ],
    'Land Rover': [
        ['Range Rover', 'large', [2010, null]], ['Range Rover Sport', 'mid', [2010, null]],
        ['Range Rover Evoque', 'mid', [2012, null]], ['Range Rover Velar', 'mid', [2018, null]],
        ['Defender', 'large', [2020, null]], ['Discovery', 'large', [2017, null]],
        ['Discovery Sport', 'mid', [2015, null]], ['LR4', 'large', [2010, 2016]], ['LR2', 'mid', [2010, 2015]]
    ],
    Lexus: [
        ['IS', 'car', [2010, null]], ['ES', 'car', [2010, null]], ['GS', 'car', [2010, 2020]],
        ['LS', 'car', [2010, null]], ['RC', 'car', [2015, null]],
        ['UX', 'mid', [2019, null]], ['NX', 'mid', [2015, null]], ['RX', 'mid', [2010, null]],
        ['GX', 'large', [2010, null]], ['LX', 'large', [2010, null]], ['TX', 'large', [2024, null]]
    ],
    Lincoln: [
        ['MKZ', 'car', [2010, 2020]], ['MKS', 'car', [2010, 2016]], ['Continental', 'car', [2017, 2020]],
        ['MKC', 'mid', [2015, 2019]], ['Corsair', 'mid', [2020, null]], ['MKX', 'mid', [2010, 2018]],
        ['Nautilus', 'mid', [2019, null]], ['MKT', 'large', [2010, 2019]], ['Aviator', 'large', [2020, null]],
        ['Navigator', 'large', [2010, null]]
    ],
    Mazda: [
        ['Mazda2', 'car', [2011, 2014]], ['Mazda3', 'car', [2010, null]], ['Mazda6', 'car', [2010, 2021]],
        ['MX-5 Miata', 'car', [2010, null]], ['Mazda5', 'mid', [2010, 2010], [2012, 2015]],
        ['CX-3', 'mid', [2016, 2021]], ['CX-30', 'mid', [2020, null]], ['CX-5', 'mid', [2013, null]],
        ['CX-50', 'mid', [2023, null]], ['CX-7', 'mid', [2010, 2012]],
        ['CX-9', 'large', [2010, 2023]], ['CX-90', 'large', [2024, null]]
    ],
    'Mercedes-Benz': [
        ['A-Class', 'car', [2019, 2022]], ['C-Class', 'car', [2010, null]], ['CLA', 'car', [2014, null]],
        ['E-Class', 'car', [2010, null]], ['S-Class', 'car', [2010, null]],
        ['GLA', 'mid', [2015, null]], ['GLB', 'mid', [2020, null]], ['GLK', 'mid', [2010, 2015]],
        ['GLC', 'mid', [2016, null]], ['M-Class', 'mid', [2010, 2015]], ['GLE', 'mid', [2016, null]],
        ['GL-Class', 'large', [2010, 2016]], ['GLS', 'large', [2017, null]],
        ['Sprinter', 'large', [2010, null]], ['Metris', 'large', [2016, 2023]]
    ],
    Mini: [
        ['Cooper', 'car', [2010, null]], ['Clubman', 'car', [2010, 2024]], ['Countryman', 'mid', [2011, null]]
    ],
    Mitsubishi: [
        ['Mirage', 'car', [2014, null]], ['Lancer', 'car', [2010, 2017]],
        ['Outlander Sport', 'mid', [2011, null]], ['Eclipse Cross', 'mid', [2018, null]],
        ['Outlander', 'large', [2010, null]]
    ],
    Nissan: [
        ['Altima', 'car', [2010, null]], ['Sentra', 'car', [2010, null]], ['Versa', 'car', [2010, 2025]],
        ['Maxima', 'car', [2010, 2023]], ['370Z', 'car', [2010, 2020]], ['Z', 'car', [2023, null]],
        ['Kicks', 'mid', [2018, null]], ['Juke', 'mid', [2011, 2017]], ['Rogue', 'mid', [2010, null]],
        ['Rogue Sport', 'mid', [2017, 2022]], ['Murano', 'mid', [2010, null]], ['Xterra', 'mid', [2010, 2015]],
        ['Pathfinder', 'large', [2010, null]], ['Armada', 'large', [2010, null]], ['Quest', 'large', [2011, 2017]],
        ['Titan', 'large', [2010, 2024]], ['Frontier', 'large', [2010, null]]
    ],
    Porsche: [
        ['911', 'car', [2010, null]], ['Panamera', 'car', [2010, null]],
        ['Macan', 'mid', [2015, null]], ['Cayenne', 'mid', [2010, null]]
    ],
    Ram: [
        ['1500', 'large', [2011, null]], ['2500', 'large', [2011, null]], ['3500', 'large', [2011, null]],
        ['ProMaster', 'large', [2014, null]], ['ProMaster City', 'mid', [2015, 2022]]
    ],
    Subaru: [
        ['Impreza', 'car', [2010, null]], ['Legacy', 'car', [2010, 2025]], ['WRX', 'car', [2015, null]],
        ['BRZ', 'car', [2013, null]],
        ['Crosstrek', 'mid', [2013, null]], ['Forester', 'mid', [2010, null]], ['Outback', 'mid', [2010, null]],
        ['Ascent', 'large', [2019, null]], ['Tribeca', 'large', [2010, 2014]]
    ],
    Toyota: [
        ['Camry', 'car', [2010, null]], ['Corolla', 'car', [2010, null]], ['Avalon', 'car', [2010, 2022]],
        ['Prius', 'car', [2010, null]], ['Yaris', 'car', [2010, 2020]], ['Matrix', 'car', [2010, 2013]],
        ['Crown', 'car', [2023, null]], ['GR86', 'car', [2022, null]],
        ['RAV4', 'mid', [2010, null]], ['Corolla Cross', 'mid', [2022, null]], ['C-HR', 'mid', [2018, 2022]],
        ['Venza', 'mid', [2010, 2015], [2021, 2024]], ['4Runner', 'mid', [2010, null]],
        ['FJ Cruiser', 'mid', [2010, 2014]],
        ['Highlander', 'large', [2010, null]], ['Grand Highlander', 'large', [2024, null]],
        ['Sequoia', 'large', [2010, null]], ['Land Cruiser', 'large', [2010, 2021], [2024, null]],
        ['Sienna', 'large', [2010, null]], ['Tacoma', 'large', [2010, null]], ['Tundra', 'large', [2010, null]]
    ],
    Volkswagen: [
        ['Jetta', 'car', [2010, null]], ['Passat', 'car', [2010, 2010], [2012, 2022]], ['Golf', 'car', [2010, 2021]],
        ['Golf GTI', 'car', [2010, null]], ['Beetle', 'car', [2012, 2019]], ['CC', 'car', [2010, 2017]],
        ['Arteon', 'car', [2019, 2023]],
        ['Taos', 'mid', [2022, null]], ['Tiguan', 'mid', [2010, null]], ['Touareg', 'mid', [2010, 2017]],
        ['Atlas Cross Sport', 'mid', [2020, null]], ['Atlas', 'large', [2018, null]]
    ],
    Volvo: [
        ['S60', 'car', [2010, null]], ['S90', 'car', [2017, null]],
        ['V60', 'mid', [2015, null]], ['XC40', 'mid', [2019, null]], ['XC60', 'mid', [2010, null]],
        ['XC70', 'mid', [2010, 2016]], ['XC90', 'large', [2010, 2014], [2016, null]]
    ]
}

function yearsFor(ranges) {
    const years = new Set()
    ranges.forEach(([first, last]) => {
        const from = Math.max(first, OLDEST_YEAR)
        const to = Math.min(last === null ? LATEST_YEAR : last, LATEST_YEAR)
        for (let year = from; year <= to; year++) years.add(year)
    })
    return years
}

function seed() {
    const { VEHICLE_DATA, COLORS, VEHICLE_TYPES, VEHICLE_SIZES } = loadVehicleData()
    const added = { makes: 0, models: 0, years: 0, sizes: 0 }

    Object.entries(CATALOG).forEach(([make, models]) => {
        if (!VEHICLE_DATA[make]) {
            VEHICLE_DATA[make] = {}
            added.makes++
        }
        if (!VEHICLE_SIZES[make]) VEHICLE_SIZES[make] = {}

        models.forEach(([model, size, ...ranges]) => {
            if (!isValidSizeClass(size)) {
                throw new Error(`Bad size "${size}" for ${make} ${model} in CATALOG.`)
            }

            const existing = VEHICLE_DATA[make][model]
            if (!existing) added.models++

            const years = new Set((existing || []).map(Number))
            const before = years.size
            yearsFor(ranges).forEach(year => years.add(year))
            added.years += years.size - before
            VEHICLE_DATA[make][model] = Array.from(years).sort((a, b) => b - a)

            if (!VEHICLE_SIZES[make][model]) {
                VEHICLE_SIZES[make][model] = size
                added.sizes++
            }
        })
    })

    saveVehicleData(VEHICLE_DATA, COLORS, VEHICLE_TYPES, VEHICLE_SIZES)

    const makeCount = Object.keys(VEHICLE_DATA).length
    const modelCount = Object.values(VEHICLE_DATA).reduce((n, models) => n + Object.keys(models).length, 0)
    console.log(`Added ${added.makes} makes, ${added.models} models, ${added.years} model years, ${added.sizes} sizes.`)
    console.log(`Vehicle data now has ${makeCount} makes and ${modelCount} models.`)

    const unsized = []
    Object.entries(VEHICLE_DATA).forEach(([make, models]) => {
        Object.keys(models).forEach(model => {
            if (!(VEHICLE_SIZES[make] || {})[model]) unsized.push(`${make} ${model}`)
        })
    })
    if (unsized.length) console.log(`No size set for: ${unsized.join(', ')}`)
}

seed()
