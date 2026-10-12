/**
 * tintCatalog.js
 * -----------------------------------------------------------------------
 * Data-only definition of every Tint service. Tint is priced and
 * configured by the same engine as Detailing (detailingConfigurator.js):
 * same service shape, same size tiers, same estimate — so this file only
 * holds data. See detailingCatalog.js for what each field means.
 *
 * PRICING
 *   Car prices are the ones already published on the home page
 *   ($180 / $250 / $350, windshield $150, removal from $75).
 *   Small SUV (+15%) and large SUV / truck / van (+30%) prices follow
 *   the same size rule as Detailing, rounded to the nearest $5.
 *
 * Load order: after detailingCatalog.js, before configurator.js.
 * -----------------------------------------------------------------------
 */

// The +15% / +30% size prices below were derived from the Detailing rule,
// not set by hand. While this is false, any tint estimate for a mid or
// large vehicle shows the yellow "placeholder pricing" flag. Check the
// numbers in TINT_SERVICES, then set this to true.
const TINT_PRICING_CONFIRMED = false;

/** Asked once per tint booking (mobile install — film hates wind and dust). */
const TINT_SITE_QUESTIONS = [
    {
        key: 'coveredSpace',
        label: 'Garage or Covered Space Available?',
        noteLabel: 'Covered space',
        toolIfNo: 'Pop-Up Canopy'
    }
];

// Tint's required options, added to the shared option sets.
Object.assign(DETAILING_OPTION_SETS, {
    tintShade: {
        label: 'Shade',
        placeholder: 'Select Shade',
        hint: 'North Carolina requires front side windows to be 35% or lighter. We confirm shades by text before the install.',
        choices: [
            { id: '50', label: '50% — light', price: 0, hours: 0 },
            { id: '35', label: '35% — medium', price: 0, hours: 0 },
            { id: '20', label: '20% — dark (rear windows)', price: 0, hours: 0 },
            { id: '5', label: '5% — limo (rear windows)', price: 0, hours: 0 },
            { id: 'unsure', label: 'Not sure — help me choose', price: 0, hours: 0 }
        ]
    },
    oldTint: {
        label: 'Existing Tint On The Windows?',
        placeholder: 'Select one',
        hint: 'Old film has to come off before new film goes on.',
        choices: [
            { id: 'no', label: 'No', price: 0, hours: 0 },
            { id: 'yes', label: 'Yes — remove it first', price: 75, hours: 1.5, lineLabel: 'Old Tint Removal' }
        ]
    }
});

const TINT_TOOLS = ['Tint Install Kit', 'Heat Gun', 'Slip Solution & Squeegees'];
const TINT_TOOLS_REMOVAL = ['Steamer', 'Adhesive Remover', 'Razor Scraper'];
const TINT_FILM_HOURS = { car: 2.5, mid: 3, large: 3.5 };

/** Film tiers and bundles are pick-one (group: 'film'). */
const TINT_SERVICES = [
    {
        id: 'tint_standard',
        name: 'Standard Window Tint',
        desc: 'All side & rear windows',
        pricing: { type: 'sized', prices: { car: 180, mid: 205, large: 235 } },
        hours: TINT_FILM_HOURS,
        options: ['tintShade', 'oldTint'],
        addons: [],
        covers: [],
        group: 'film',
        tools: [...TINT_TOOLS]
    },
    {
        id: 'tint_carbon',
        name: 'Carbon Tint',
        desc: 'Heat reduction, carbon film finish — all side & rear windows',
        pricing: { type: 'sized', prices: { car: 250, mid: 290, large: 325 } },
        hours: TINT_FILM_HOURS,
        options: ['tintShade', 'oldTint'],
        addons: [],
        covers: [],
        group: 'film',
        tools: [...TINT_TOOLS]
    },
    {
        id: 'tint_ceramic',
        name: 'Ceramic Tint',
        desc: 'Superior heat block, no signal interference — all side & rear windows',
        pricing: { type: 'sized', prices: { car: 350, mid: 405, large: 455 } },
        hours: TINT_FILM_HOURS,
        options: ['tintShade', 'oldTint'],
        addons: [],
        covers: [],
        group: 'film',
        tools: [...TINT_TOOLS]
    },
    {
        id: 'tint_windshield',
        name: 'Windshield Tint',
        desc: 'UV & glare reduction on front glass',
        pricing: { type: 'flat', price: 150 },
        hours: { car: 1, mid: 1, large: 1 },
        options: [],
        addons: [],
        covers: [],
        tools: [...TINT_TOOLS]
    },
    {
        id: 'tint_removal',
        name: 'Tint Removal',
        desc: 'Safe film removal + adhesive cleanup',
        pricing: { type: 'from', price: 75 },
        hours: { car: 1.5, mid: 1.75, large: 2 },
        options: [],
        addons: [],
        covers: [],
        configNote: 'Starting price — it depends on how many windows and how baked-on the old film is. We confirm the number before starting.',
        tools: [...TINT_TOOLS_REMOVAL]
    },
    {
        id: 'tint_carbon_bundle',
        name: 'Carbon + Windshield Bundle',
        desc: 'Carbon on all windows + windshield strip',
        pricing: { type: 'quote' },
        hours: { car: 3.5, mid: 4, large: 4.5 },
        options: ['tintShade', 'oldTint'],
        addons: [],
        covers: ['Windshield Tint'],
        group: 'film',
        tools: [...TINT_TOOLS]
    },
    {
        id: 'tint_ceramic_bundle',
        name: 'Ceramic + Windshield Bundle',
        desc: 'Ceramic all around + windshield',
        pricing: { type: 'quote' },
        hours: { car: 3.5, mid: 4, large: 4.5 },
        options: ['tintShade', 'oldTint'],
        addons: [],
        covers: ['Windshield Tint'],
        group: 'film',
        tools: [...TINT_TOOLS]
    }
];

// Sized prices carry the placeholder flag until confirmed (see top of file).
TINT_SERVICES.forEach(svc => { svc.pricingConfirmed = TINT_PRICING_CONFIRMED; });

/** Shape booking.js's serviceOptions list expects: { name, price, desc }. */
function getTintServiceOptions(sizeId) {
    return TINT_SERVICES.map(svc => ({
        name: svc.name,
        price: getDetailingDisplayPrice(svc, sizeId),
        desc: svc.desc
    }));
}

window.TINT_SERVICES = TINT_SERVICES;
window.TINT_SITE_QUESTIONS = TINT_SITE_QUESTIONS;
window.getTintServiceOptions = getTintServiceOptions;
