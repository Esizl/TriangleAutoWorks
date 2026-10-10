/**
 * detailingCatalog.js
 * -----------------------------------------------------------------------
 * Data-only definition of every Detailing service: pricing, time on
 * site, required options, add-ons, overlap rules and tools. This is the
 * Detailing equivalent of services.js + partsCatalog.js for Automotive.
 *
 * Rendering the configurator, building the estimate and the admin
 * payload all happen in detailingConfigurator.js. booking.js builds its
 * Step 3 Detailing checkbox list from getDetailingServiceOptions() below,
 * so names / prices / descriptions live in exactly one place.
 *
 * PRICING
 *   Everything is anchored to one reference job: Basic Detail (soap and
 *   water exterior + basic interior with basic carpet treatment) on a
 *   coupe / sedan = $150.
 *
 *   Vehicle size adds +15% (small SUV) and +30% (large SUV / truck /
 *   van) over the coupe price, rounded to the nearest $5:
 *     - Service base prices are written out per size below.
 *     - Surcharges (soil, pet hair, sealant, polish) and add-ons list
 *       only their coupe price; getDetailingSizedPrice() scales them.
 *       An add-on with `flatAcrossSizes: true` costs the same on every
 *       vehicle (headlights — two lenses whatever the vehicle).
 *
 *   Hours on site are still estimates — adjust them as real jobs come in.
 *
 * Load order: after services.js, before configurator.js / booking.js.
 * -----------------------------------------------------------------------
 */

// While false, estimates using size-scaled or add-on prices show the
// yellow "placeholder pricing" flag. Prices are now set, so it's on.
const DETAILING_PRICING_CONFIRMED = true;

/** Key used in state.selectedParts for the shared Vehicle & Site answers. */
const DETAILING_SITE_KEY = '_detailing';

const DETAILING_SIZES = [
    { id: 'car', label: 'Sedan / Coupe / Hatchback' },
    { id: 'mid', label: 'Small SUV / Crossover / Wagon' },
    { id: 'large', label: 'Large SUV / Truck / Minivan' }
];

/** Size uplift over the coupe price. Change these two numbers to re-tier everything that scales. */
const DETAILING_SIZE_MULTIPLIER = { car: 1, mid: 1.15, large: 1.30 };

/**
 * Coupe price -> price for a given size, rounded to the nearest $5.
 * Used for surcharges and add-ons. Unknown / missing size = coupe price.
 */
function getDetailingSizedPrice(coupePrice, sizeId) {
    const multiplier = DETAILING_SIZE_MULTIPLIER[sizeId] || 1;
    return Math.round((coupePrice * multiplier) / 5) * 5;
}

/**
 * Site questions asked once per booking (mobile service — these decide
 * what has to be loaded on the truck). `toolIfNo` is added to the tech
 * sheet's tool list when the customer answers "no".
 */
const DETAILING_SITE_QUESTIONS = [
    {
        key: 'waterAccess',
        label: 'Water Spigot Within Hose Reach?',
        noteLabel: 'Water on site',
        toolIfNo: 'Water Tank'
    },
    {
        key: 'powerAccess',
        label: 'Outdoor Power Outlet Available?',
        noteLabel: 'Power on site',
        toolIfNo: 'Generator / Power Station'
    }
];

/**
 * Reusable required option sets. Each choice can add to the price and
 * to the time on site. `price` is the COUPE price — it scales with
 * vehicle size (see getDetailingSizedPrice). A choice with price 0 adds
 * no line to the estimate but is still recorded in serviceNotes for the
 * tech sheet.
 */
const DETAILING_OPTION_SETS = {
    condition: {
        label: 'Interior Condition',
        placeholder: 'Select Condition',
        hint: 'Sets how much time we block out for your vehicle.',
        choices: [
            { id: 'light', label: 'Light — regular upkeep, mostly dust', price: 0, hours: 0 },
            { id: 'moderate', label: 'Moderate — visible dirt, a few stains', price: 25, hours: 0.5, lineLabel: 'Moderate Soil Surcharge' },
            { id: 'heavy', label: 'Heavy — ground-in dirt, spills, neglected', price: 60, hours: 1.5, lineLabel: 'Heavy Soil Surcharge' }
        ]
    },
    petHair: {
        label: 'Pet Hair?',
        placeholder: 'Select one',
        choices: [
            { id: 'no', label: 'No', price: 0, hours: 0 },
            { id: 'yes', label: 'Yes', price: 40, hours: 0.75, lineLabel: 'Pet Hair Removal' }
        ]
    },
    protection: {
        label: 'Paint Protection',
        placeholder: 'Select Protection',
        choices: [
            // Protection is NOT included in any base price — both are paid add-ons.
            { id: 'none', label: 'None', price: 0, hours: 0 },
            { id: 'wax', label: 'Carnauba Wax', price: 40, hours: 0.5, lineLabel: 'Carnauba Wax' },
            { id: 'sealant', label: 'Paint Sealant — longer lasting', price: 70, hours: 0.75, lineLabel: 'Paint Sealant' }
        ]
    },
    paintCondition: {
        label: 'Paint Condition',
        placeholder: 'Select Paint Condition',
        hint: 'Coating locks in whatever is underneath it, so swirls get polished out first.',
        choices: [
            { id: 'new', label: 'New or near-perfect', price: 0, hours: 0 },
            { id: 'light', label: 'Light swirls — 1-step polish', price: 150, hours: 2, lineLabel: '1-Step Paint Polish' },
            { id: 'heavy', label: 'Heavy swirls / scratches — 2-step correction', price: 300, hours: 4, lineLabel: '2-Step Paint Correction' }
        ]
    }
};

/** `price` is the COUPE price; it scales with size unless flatAcrossSizes is set. */
const DETAILING_ADDONS = {
    engine_bay: { label: 'Engine Bay Cleaning', price: 40, hours: 0.5, tools: ['Degreaser & Detail Brushes'] },
    headlights: { label: 'Headlight Restoration', price: 60, hours: 1, flatAcrossSizes: true, tools: ['Headlight Restoration Kit'] },
    leather: { label: 'Leather Clean & Condition', price: 35, hours: 0.5, tools: [] },
    fabric_guard: { label: 'Fabric Protectant', price: 30, hours: 0.25, tools: [] },
    wheel_coating: { label: 'Wheel Ceramic Coating', price: 100, hours: 1, tools: [] },
    glass_coating: { label: 'Glass Ceramic Coating', price: 80, hours: 0.5, tools: [] }
};

/** What an add-on costs on a given size of vehicle. */
function getDetailingAddonPrice(addon, sizeId) {
    return addon.flatAcrossSizes ? addon.price : getDetailingSizedPrice(addon.price, sizeId);
}

const DT_TOOLS_WASH = ['Pressure Washer', 'Foam Cannon', 'Wash Buckets & Mitts', 'Drying Towels'];
const DT_TOOLS_INTERIOR_BASIC = ['Vacuum', 'Interior Brushes', 'Carpet Cleaner'];
const DT_TOOLS_INTERIOR = ['Vacuum', 'Steamer', 'Carpet Extractor', 'Interior Brushes'];
const DT_TOOLS_DECON = ['Iron Remover', 'Clay Bar Kit'];
const DT_TOOLS_POLISH = ['DA Polisher & Pads'];
const DT_TOOLS_COATING = ['Ceramic Coating Kit', 'IPA Panel Wipe'];

/**
 * pricing.type:
 *   'sized' — price depends on vehicle size (shown as "From $X")
 *   'flat'  — one price for every vehicle (shown as "$X")
 *   'from'  — starting price, final confirmed on site (shown as "$X+")
 *   'quote' — no number online, quoted on site (shown as "Custom quote")
 *
 * covers: other services this one already includes. Selecting this one
 *   disables (and unselects) those, so nobody pays twice for overlap.
 * group:  services sharing a group are pick-one (selecting one swaps
 *   out the other).
 * includesOilChange: disabled for vehicles on the oil change blocklist.
 */
const DETAILING_SERVICES = [
    {
        id: 'basic_wash',
        name: 'Basic Wash',
        desc: 'Exterior soap & water hand wash, tire shine, window cleaning',
        pricing: { type: 'sized', prices: { car: 50, mid: 60, large: 70 } },
        hours: { car: 1, mid: 1.25, large: 1.5 },
        options: [],
        addons: [],
        covers: [],
        tools: [...DT_TOOLS_WASH]
    },
    {
        id: 'basic_interior',
        name: 'Basic Interior',
        desc: 'Vacuum, wipe-down, interior glass, basic carpet treatment',
        pricing: { type: 'sized', prices: { car: 110, mid: 125, large: 145 } },
        hours: { car: 1.5, mid: 1.75, large: 2 },
        options: ['condition', 'petHair'],
        addons: ['leather', 'fabric_guard'],
        covers: [],
        tools: [...DT_TOOLS_INTERIOR_BASIC]
    },
    {
        // THE PRICING BASELINE: $150 on a coupe.
        id: 'basic_detail',
        name: 'Basic Detail',
        desc: 'Basic Wash + Basic Interior — soap & water outside, basic clean and carpet treatment inside',
        pricing: { type: 'sized', prices: { car: 150, mid: 175, large: 200 } },
        hours: { car: 2.5, mid: 3, large: 3.5 },
        options: ['condition', 'petHair'],
        addons: ['engine_bay', 'headlights', 'leather', 'fabric_guard'],
        covers: ['Basic Wash', 'Basic Interior'],
        tools: [...DT_TOOLS_WASH, ...DT_TOOLS_INTERIOR_BASIC]
    },
    {
        id: 'interior_detail',
        name: 'Interior Detail',
        desc: 'Deep clean, steam cleaning, carpet extraction, odor treatment',
        pricing: { type: 'sized', prices: { car: 170, mid: 195, large: 225 } },
        hours: { car: 2.5, mid: 3, large: 3.5 },
        options: ['condition', 'petHair'],
        addons: ['leather', 'fabric_guard'],
        covers: ['Basic Interior'],
        tools: [...DT_TOOLS_INTERIOR]
    },
    {
        id: 'exterior_detail',
        name: 'Exterior Detail',
        desc: 'Wash, iron removal, clay bar, tire & trim shine — wax or sealant optional',
        pricing: { type: 'sized', prices: { car: 170, mid: 195, large: 225 } },
        hours: { car: 3, mid: 3.5, large: 4 },
        options: ['protection'],
        addons: ['engine_bay', 'headlights'],
        covers: ['Basic Wash', 'Paint Decontamination'],
        tools: [...DT_TOOLS_WASH, ...DT_TOOLS_DECON]
    },
    {
        id: 'full_detail',
        name: 'Full Detail',
        desc: 'Interior Detail + Exterior Detail — deep clean inside, wash and decon outside',
        pricing: { type: 'sized', prices: { car: 300, mid: 345, large: 395 } },
        hours: { car: 5, mid: 5.5, large: 6.5 },
        options: ['condition', 'petHair', 'protection'],
        addons: ['engine_bay', 'headlights', 'leather', 'fabric_guard'],
        covers: ['Basic Wash', 'Basic Interior', 'Basic Detail', 'Interior Detail', 'Exterior Detail', 'Paint Decontamination'],
        tools: [...DT_TOOLS_WASH, ...DT_TOOLS_INTERIOR, ...DT_TOOLS_DECON]
    },
    {
        id: 'ceramic_coating',
        name: 'Ceramic Coating',
        desc: '1-year protection, high gloss, hydrophobic finish',
        pricing: { type: 'sized', prices: { car: 499, mid: 599, large: 699 } },
        hours: { car: 5, mid: 6, large: 7 },
        options: ['paintCondition'],
        addons: ['wheel_coating', 'glass_coating'],
        covers: ['Basic Wash', 'Paint Decontamination'],
        tools: [...DT_TOOLS_WASH, ...DT_TOOLS_DECON, ...DT_TOOLS_POLISH, ...DT_TOOLS_COATING]
    },
    {
        id: 'paint_decon',
        name: 'Paint Decontamination',
        desc: 'Iron fallout removal, clay treatment',
        pricing: { type: 'quote' },
        hours: { car: 1.5, mid: 1.75, large: 2 },
        options: [],
        addons: [],
        covers: [],
        configNote: 'Priced after we see the paint in person — nothing is charged for this until you approve the quote.',
        tools: [...DT_TOOLS_WASH, ...DT_TOOLS_DECON]
    },
    {
        id: 'bronze_package',
        name: 'Bronze Package',
        desc: 'Basic Detail + interior fabric protection',
        pricing: { type: 'flat', price: 225 },
        hours: { car: 2.75, mid: 3.25, large: 3.75 },
        group: 'package',
        options: [],
        addons: ['engine_bay', 'headlights', 'leather'],
        covers: ['Basic Wash', 'Basic Interior', 'Basic Detail'],
        tools: [...DT_TOOLS_WASH, ...DT_TOOLS_INTERIOR_BASIC]
    },
    {
        id: 'gold_package',
        name: 'Gold Package',
        desc: 'Full detail + ceramic tint + premium oil change',
        pricing: { type: 'flat', price: 549 },
        hours: { car: 8.5, mid: 9, large: 10 },
        group: 'package',
        includesOilChange: true,
        options: [],
        addons: ['engine_bay', 'headlights'],
        covers: ['Basic Wash', 'Basic Interior', 'Basic Detail', 'Interior Detail', 'Exterior Detail', 'Full Detail', 'Paint Decontamination'],
        configNote: 'Tint shade and oil brand are confirmed by text before your appointment.',
        tools: [...DT_TOOLS_WASH, ...DT_TOOLS_INTERIOR, ...DT_TOOLS_DECON, 'Tint Install Kit', 'Drain Pan', 'Oil Filter Wrench']
    },
    {
        id: 'ultimate_package',
        name: 'Ultimate Package',
        desc: 'Ceramic coating, ceramic tint, premium oil change, tire rotation',
        pricing: { type: 'from', price: 799 },
        hours: { car: 10, mid: 11, large: 12 },
        group: 'package',
        includesOilChange: true,
        options: ['paintCondition'],
        addons: ['wheel_coating', 'glass_coating'],
        covers: ['Basic Wash', 'Ceramic Coating', 'Paint Decontamination'],
        configNote: 'Starting price — the final number, tint shade and oil brand are confirmed by text before your appointment.',
        tools: [...DT_TOOLS_WASH, ...DT_TOOLS_DECON, ...DT_TOOLS_POLISH, ...DT_TOOLS_COATING, 'Tint Install Kit', 'Drain Pan', 'Oil Filter Wrench', 'Jack & Jack Stands']
    }
];

function getDetailingService(name) {
    return DETAILING_SERVICES.find(s => s.name === name) || null;
}

/**
 * The Step 3 card price line: "$225" / "$799+" / "Custom quote", and for
 * size-priced services the exact price for the vehicle's size ("$200")
 * or "From $150" when the size isn't known yet.
 */
function getDetailingDisplayPrice(svc, sizeId) {
    const p = svc.pricing;
    if (p.type === 'sized') {
        return p.prices[sizeId] != null
            ? `$${p.prices[sizeId]}`
            : `From $${Math.min(...Object.values(p.prices))}`;
    }
    if (p.type === 'flat') return `$${p.price}`;
    if (p.type === 'from') return `$${p.price}+`;
    return 'Custom quote';
}

/**
 * Shape booking.js's serviceOptions list expects: { name, price, desc }.
 * Pass the vehicle's size id to get exact prices instead of "From" prices.
 */
function getDetailingServiceOptions(sizeId) {
    return DETAILING_SERVICES.map(svc => ({
        name: svc.name,
        price: getDetailingDisplayPrice(svc, sizeId),
        desc: svc.desc
    }));
}

window.DETAILING_SERVICES = DETAILING_SERVICES;
window.DETAILING_SIZES = DETAILING_SIZES;
window.DETAILING_SIZE_MULTIPLIER = DETAILING_SIZE_MULTIPLIER;
window.DETAILING_OPTION_SETS = DETAILING_OPTION_SETS;
window.DETAILING_ADDONS = DETAILING_ADDONS;
window.DETAILING_SITE_QUESTIONS = DETAILING_SITE_QUESTIONS;
window.DETAILING_SITE_KEY = DETAILING_SITE_KEY;
window.getDetailingService = getDetailingService;
window.getDetailingSizedPrice = getDetailingSizedPrice;
window.getDetailingAddonPrice = getDetailingAddonPrice;
window.getDetailingServiceOptions = getDetailingServiceOptions;
