/**
 * partsCatalog.js
 * -----------------------------------------------------------------------
 * Central catalog of parts, prices, and supplier links for Triangle Auto
 * Works' Automotive services. This is the single source of truth that
 * services.js option lists (oil brand, filter brand, pad brand, etc.)
 * resolve into for pricing + admin tech-sheet purposes.
 *
 * STATUS: stubbed with placeholder structure now; real part numbers /
 * prices / links to be filled in per brand over time. Every entry has the
 * full shape so the configurator and admin payload never have to guess
 * at missing fields.
 *
 * SUPPLIERS (primary): RockAuto, Detroit Axle, Advance Auto Parts.
 * Add more under SUPPLIERS as needed — keys are referenced by `supplier`
 * fields below so swapping a supplier's base URL only needs one edit.
 * -----------------------------------------------------------------------
 */

const SUPPLIERS = {
    rockauto: {
        label: "RockAuto",
        baseUrl: "https://www.rockauto.com/"
    },
    detroitAxle: {
        label: "Detroit Axle",
        baseUrl: "https://www.detroitaxle.com/"
    },
    advanceAuto: {
        label: "Advance Auto Parts",
        baseUrl: "https://shop.advanceautoparts.com/"
    }
};

/**
 * Helper to build a part record with consistent shape.
 * partNumber / price / supplier / url are placeholders (null/0) until
 * real catalog data is entered — isPlaceholder flags that clearly so the
 * UI and admin payload can warn instead of silently showing $0.00.
 *
 * oilCategory / tier / availability / jugPrice / includesFreeFilter are
 * only meaningful for oil products (see OIL_PRODUCTS below) but live on
 * the same shape so getPartRecord() doesn't need a special case.
 *
 * jugPrice: price for a 5-quart jug (how oil is actually purchased at
 * retail). `price` remains the per-quart price used for topping off
 * past a full jug. Bulk jug pricing is cheaper per-quart than buying
 * loose quarts, same as real retail pricing.
 *
 * includesFreeFilter: true if buying a 5qt jug of this brand comes with
 * a free Carquest filter (per current supplier promos — ARGOS, Valvoline,
 * Pennzoil, Mobil 1 all currently do this). Applies once per 5qt jug
 * purchased, regardless of how many total quarts the job needs.
 */
function makePart({
    partNumber = null,
    price = null,
    jugPrice = null,
    supplier = null,
    url = null,
    oilCategory = null,
    tier = null,
    availability = "all",
    includesFreeFilter = false
} = {}) {
    return {
        partNumber,
        price,
        jugPrice,
        supplier,
        url,
        oilCategory,
        tier,
        availability,
        includesFreeFilter,
        isPlaceholder: partNumber === null && price === null
    };
}

const OIL_JUG_SIZE_QTS = 5;

/**
 * OIL PRODUCTS — brand + grade combos.
 *
 * Each entry is a real product (what the customer actually buys), not a
 * separate "type" selector. The configurator only shows a Brand dropdown;
 * the oilCategory (Conventional / Synthetic Blend / Full Synthetic) and
 * tier (budget / premium) are inherent to the product, not picked by the
 * customer.
 *
 * tier:
 *   "budget"   — ARGOS shop oil + the Conventional grade of name brands.
 *   "premium"  — Synthetic Blend / Full Synthetic grades of name brands.
 *
 * A vehicle's spec (oilTierOverride in VEHICLE_SPECS, see vehicleSpecs.js)
 * can force "premium" regardless of brand default — e.g. an engine that
 * requires full synthetic won't offer budget/conventional products even
 * though ARGOS conventional exists in the catalog.
 *
 * availability: "all" means offered for every vehicle. ARGOS is the only
 * true budget/house-brand option right now per ops decision; everything
 * else is available everywhere until we build out a real per-vehicle
 * compatibility list.
 *
 * includesFreeFilter: ARGOS, Valvoline, Pennzoil, and Mobil 1 currently
 * bundle a free Carquest filter with each 5qt jug purchased (current
 * supplier promo). The discount is only applied in computeEstimate() if
 * the customer (a) buys at least one full jug and (b) picks Carquest as
 * their filter brand — see the promoApplies check there.
 *
 * PRICING STATUS: jugPrice for ARGOS ($28) and Valvoline (all 3 grades,
 * $38) are real confirmed prices. Pennzoil and Mobil 1 jugPrice are
 * placeholders (matching Valvoline's $38) until exact numbers are
 * entered. Per-quart top-off price ($10 flat) is also a placeholder —
 * real range is $7-$12 and varies by brand; update individually once
 * confirmed.
 */
const OIL_PRODUCTS = {
    "ARGOS": makePart({
        price: 8.99,
        jugPrice: 30.99,
        partNumber: "AR660-5QT",
        url: "https://shop.advanceautoparts.com/p/argos-high-mileage-5w-30-conventional-motor-oil-restores-seals-5-quart-ar660-5qt/50313883-P?selectedStore=4920&searchTerm=argos+motor+oil+conventional+5w-30&selectedFulfillment=store_pickup",
        oilCategory: "Conventional",
        tier: "budget",
        availability: "all",
        supplier: "advanceAuto",
        includesFreeFilter: true
    }),
    "Valvoline Synthetic Blend": makePart({
        price: 9.49,
        jugPrice: 34.99,
        partNumber: "881163",
        url: "https://shop.advanceautoparts.com/p/valvoline-high-mileage-5w-30-synthetic-blend-motor-oil-prevents-engine-breakdown-5-quart-881163/11706057-P?selectedStore=4920&searchTerm=Valvoline+synthetic+blend+5w-30&selectedFulfillment=store_pickup",
        oilCategory: "Synthetic",
        tier: "premium",
        availability: "all",
        supplier: "advanceAuto",
        includesFreeFilter: true
    }),
    "Valvoline Advanced Full Synthetic": makePart({
        price: 12.49,
        jugPrice: 39.99,
        partNumber: "881164",
        url: "https://shop.advanceautoparts.com/p/valvoline-advanced-full-synthetic-5w-30-motor-oil-maximizes-engine-life-5-quart-881164/11707038-P?selectedStore=4920&searchTerm=Valvoline+Advanced+Full+Synthetic+5w-30&selectedFulfillment=store_pickup",
        oilCategory: "Synthetic",
        tier: "premium",
        availability: "all",
        supplier: "advanceAuto",
        includesFreeFilter: true
    }),
    "Pennzoil Full Synthetic": makePart({
        price: 10.49,
        jugPrice: 37.99,
        partNumber: "550058602",
        url: "https://shop.advanceautoparts.com/p/pennzoil-5w-30-full-synthetic-motor-oil-helps-prevent-sludge-build-up-5-quart-550058602/50018436-P?selectedStore=4920&searchTerm=Pennzoil+Conventional+5w-30&selectedFulfillment=store_pickup",
        oilCategory: "Synthetic",
        tier: "premium",
        availability: "all",
        supplier: "advanceAuto",
        includesFreeFilter: true
    }),
    "Pennzoil Platinum Full Synthetic": makePart({
        price: 12.49,
        jugPrice: 42.99,
        partNumber: "550046126",
        url: "https://shop.advanceautoparts.com/p/pennzoil-platinum-5w-30-full-synthetic-motor-oil-maximizes-engine-protection-5-quart-550046126/11499296-P?selectedStore=4920&searchTerm=Pennzoil+Platinum+Full+Synthetic+5w-30&selectedFulfillment=store_pickup",
        oilCategory: "Synthetic",
        tier: "premium",
        availability: "all",
        supplier: "advanceAuto",
        includesFreeFilter: true
    }),
    "Mobil 1 Advanced Clean Full Synthetic": makePart({
        price: 13.49,
        jugPrice: 43.99,
        partNumber: "128650",
        url: "https://shop.advanceautoparts.com/p/mobil-1-advanced-clean-full-synthetic-motor-oil-5w-30-5-quarts-128650/50294546-P?selectedStore=4920&searchTerm=Mobil+1+Full+Synthetic+5w-30&selectedFulfillment=store_pickup",
        oilCategory: "Synthetic",
        tier: "premium",
        availability: "all",
        supplier: "advanceAuto",
        includesFreeFilter: true
    }),
    "Mobil 1 Advanced Full Synthetic": makePart({
        price: 12.99,
        jugPrice: 42.99,
        partNumber: "44899",
        url: "https://shop.advanceautoparts.com/p/mobil-1-advanced-full-synthetic-engine-oil-5w-30-extends-engine-life-5-quart-44899/10069908-P?selectedStore=4920&searchTerm=Mobil+1+Full+Synthetic+5w-30&selectedFulfillment=store_pickup",
        oilCategory: "Synthetic",
        tier: "premium",
        availability: "all",
        supplier: "advanceAuto",
        includesFreeFilter: true
    }),
    "Mobil 1 European Car Formula Advanced Full Synthetic": makePart({
        price: 12.99,
        jugPrice: 42.99,
        partNumber: "127105",
        url: "https://shop.advanceautoparts.com/p/mobil-1-european-car-formula-advanced-full-synthetic-motor-oil-5w-30-5-quart-127105/50039689-P?selectedStore=4920&searchTerm=Mobil+1+European+Car+Formula+Advanced+Full+Synthetic+Motor+Oil+5W-30",
        oilCategory: "Synthetic",
        tier: "premium",
        availability: "all",
        supplier: "advanceAuto",
        includesFreeFilter: true
    })
};

const PARTS_CATALOG = {
    oilChange: {
        oilProducts: OIL_PRODUCTS,
        // priced as a flat per-unit cost regardless of vehicle (qty comes from VEHICLE_SPECS)
        unit: "per quart",

        // Generic/fallback filter records. Carquest is an aftermarket
        // universal brand and makes a filter for essentially every
        // vehicle, so it stays "all". OEM-style/domestic-focused brands
        // (AC Delco, Motorcraft) are restricted to the makes they
        // actually manufacture for — see FILTER_COMPATIBILITY below,
        // which is what actually drives availability. The `availability`
        // field here is mostly informational; FILTER_COMPATIBILITY is
        // the real gate (so a single source of truth lives in one place
        // rather than two).
        filterBrand: {
            "Carquest": makePart({ price: 8.99, supplier: "advanceAuto" }), // the brand bundled free w/ 5qt jug promos
            "FRAM": makePart({ price: 9.99, supplier: "advanceAuto" }),
            "K&N": makePart({ price: 11.49, supplier: "advanceAuto" }),
            "Mobil 1": makePart({ price: 13.99, supplier: "advanceAuto" }),
            "AC Delco": makePart({ price: 10.49, supplier: "advanceAuto" }),
            "Motorcraft": makePart({ price: 10.99, supplier: "rockauto" }),
            "OEM": makePart({ price: 14.99 })
        }
    },

    brakes: {
        padType: {
            "Economy": makePart({ price: 34.99, supplier: "rockauto" }),
            "Ceramic": makePart({ price: 54.99, supplier: "detroitAxle" }),
            "Premium Ceramic": makePart({ price: 79.99, supplier: "detroitAxle" }),
            "OEM": makePart({ price: 94.99, supplier: "advanceAuto" })
        },
        // price is PER AXLE (front set or rear set)
        padUnit: "per axle set",

        rotors: {
            "Reuse Existing": makePart({ price: 0 }),
            "Replace Rotors": makePart({ price: 64.99, supplier: "detroitAxle" })
        },
        // price is PER AXLE (pair of rotors)
        rotorUnit: "per axle pair"
    },

    tires: {
        serviceType: {
            "Rotate": makePart({ price: 0 }), // labor-only, no parts
            "Balance": makePart({ price: 0 }), // labor-only, weights included in labor
            "Rotate & Balance": makePart({ price: 0 }),
            "Mount & Balance": makePart({ price: 0 }) // assumes customer-supplied tires
        }
    }
};

/**
 * FILTER_COMPATIBILITY
 * -----------------------------------------------------------------------
 * Which makes each filter brand actually supports. Brands not listed
 * here are treated as universal (available for every make) — this is
 * an EXCLUSION mechanism only for brands with real-world limits, so you
 * don't have to enumerate every make for every brand.
 *
 * "Carquest" deliberately has no entry — it's an aftermarket universal
 * brand and makes a filter for essentially everything, so it's always
 * available regardless of make.
 *
 * Add a brand here only when it's actually make-restricted in real life
 * (e.g. AC Delco doesn't make filters for BMW; Motorcraft doesn't make
 * filters for Mercedes). List every make that brand DOES support.
 * -----------------------------------------------------------------------
 */
const FILTER_COMPATIBILITY = {
    "AC Delco": {
        makes: ["Chevrolet", "GMC", "Buick", "Cadillac"]
    },
    "Motorcraft": {
        makes: ["Ford", "Lincoln", "Mercury"]
    }
    // FRAM, K&N, Mobil 1, OEM, Carquest: no entry = universal/all makes.
};

/**
 * FILTER_PART_NUMBERS
 * -----------------------------------------------------------------------
 * Per-vehicle part number overrides for filter brands. Keyed by brand ->
 * make -> model -> (optional) year, but you choose the granularity per
 * entry: a model-level entry covers every year of that model unless a
 * more specific year-level entry also exists (year-level always wins
 * when present, since it's more specific).
 *
 * This is OPTIONAL data entered over time. Any brand/make/model/year
 * combination with no entry here just falls back to the generic record
 * in PARTS_CATALOG.oilChange.filterBrand — nothing breaks while this is
 * sparse or empty.
 *
 * Shape:
 *   "BrandName": {
 *     "Make": {
 *       "Model": {
 *         _default: { partNumber, price?, url? }   // covers all years unless overridden below
 *         "2015": { partNumber, price?, url? }       // exact-year override, wins over _default
 *       }
 *     }
 *   }
 *
 * price/url are optional per override — omit to keep the brand's generic
 * price/url and only override the part number.
 *
 * EXAMPLE (commented out — fill in real numbers as you encounter vehicles):
 *
 * "Carquest": {
 *   "Chevrolet": {
 *     "Suburban": {
 *       _default: { partNumber: "85355" }   // covers most years on this engine family
 *     }
 *   }
 * }
 * -----------------------------------------------------------------------
 */
const FILTER_PART_NUMBERS = {
    // Intentionally empty to start — add entries as you confirm real
    // part numbers per vehicle. See shape/example in the comment above.
};

/**
 * Returns the list of oil product names (brand+grade) available, filtered
 * by TWO independent things that can each only narrow the list further:
 *
 *  1. requestedTier — which checkbox the customer picked in Step 3.
 *     "Oil Change" requests "budget", "Premium Oil Change" requests
 *     "premium". Pass null to not filter by this (used by callers that
 *     don't care, if any).
 *
 *  2. vehicleRequiredTier — from VEHICLE_SPECS[...][...].oilTierOverride.
 *     If the vehicle's engine spec requires "premium", budget products
 *     are excluded even if the customer checked the (cheaper) "Oil
 *     Change" box — the vehicle requirement always wins. This should
 *     surface as the "Oil Change" box being unavailable for that vehicle
 *     in practice (handled in booking.js), not as a silent swap here.
 */
function getAvailableOilBrands(requestedTier, vehicleRequiredTier) {
    return Object.entries(OIL_PRODUCTS)
        .filter(([, product]) => {
            if (product.availability !== "all") return false;
            if (vehicleRequiredTier === "premium" && product.tier === "budget") return false;
            if (requestedTier && product.tier !== requestedTier) return false;
            return true;
        })
        .map(([name]) => name);
}

/**
 * Returns the list of filter brand names available for a given make.
 * Brands with no FILTER_COMPATIBILITY entry are universal (always
 * included). Brands WITH an entry are only included if `make` appears
 * in their makes list.
 *
 * Pass no make (or a make not worth filtering on) to get every brand —
 * this keeps the function safe to call from contexts that don't have a
 * vehicle selected yet.
 */
function getAvailableFilterBrands(make) {
    const allBrands = Object.keys(PARTS_CATALOG.oilChange.filterBrand);
    if (!make) return allBrands;

    return allBrands.filter(brand => {
        const compat = FILTER_COMPATIBILITY[brand];
        if (!compat) return true; // universal brand, no restriction
        return compat.makes.includes(make);
    });
}

/**
 * Resolve a part record, returning a safe placeholder object instead of
 * undefined if the option isn't found in the catalog.
 *
 * For filterBrand lookups specifically, pass a vehicle object
 * ({ make, model, year }) as the 4th argument to check
 * FILTER_PART_NUMBERS for a vehicle-specific part number/price/url
 * override first. Falls back to the generic catalog record (today's
 * behavior) if no override exists, or if no vehicle is passed — so
 * every existing call site that doesn't pass a vehicle keeps working
 * exactly as before.
 */
function getPartRecord(serviceKey, optionGroup, optionValue, vehicle = null) {
    const record = PARTS_CATALOG?.[serviceKey]?.[optionGroup]?.[optionValue];
    const base = record || makePart();

    if (serviceKey === 'oilChange' && optionGroup === 'filterBrand' && vehicle?.make && vehicle?.model) {
        const override = FILTER_PART_NUMBERS?.[optionValue]?.[vehicle.make]?.[vehicle.model];
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