/**
 * services.js
 * -----------------------------------------------------------------------
 * Defines the selectable services per category and, for Automotive
 * services, the configuration options each one exposes (oil type,
 * filter brand, brake axle/pad/rotor choices, tire service type, etc).
 *
 * This file is data-only. Pricing lives in partsCatalog.js. Rendering the
 * configurator UI and building the estimate/admin payload happens in
 * booking.js (renderServiceConfigurator, buildEstimate, etc).
 * -----------------------------------------------------------------------
 */

const SERVICES = {
    automotive: {
        name: "Automotive",

        services: [
            {
                id: "oil_change",
                name: "Oil Change",

                options: {
                    // oilBrand is intentionally NOT a static list here — the
                    // configurator pulls live options from
                    // getAvailableOilBrands(requiredTier) in partsCatalog.js,
                    // since which brands are offered depends on the
                    // vehicle's required oil tier (see vehicleSpecs.js).
                    filterBrand: [
                        "Carquest",
                        "FRAM",
                        "K&N",
                        "Mobil 1",
                        "AC Delco",
                        "Motorcraft",
                        "OEM"
                    ]
                }
            },

            {
                id: "brakes",
                name: "Brake Service",

                options: {
                    axle: [
                        "Front",
                        "Rear",
                        "Front & Rear"
                    ],

                    padType: [
                        "Economy",
                        "Ceramic",
                        "Premium Ceramic",
                        "OEM"
                    ],

                    rotors: [
                        "Reuse Existing",
                        "Replace Rotors"
                    ]
                }
            },

            {
                id: "tires",
                name: "Tires",

                options: {
                    serviceType: [
                        "Rotate",
                        "Balance",
                        "Rotate & Balance",
                        "Mount & Balance"
                    ]
                }
            },

            {
                id: "diagnostic",
                name: "Diagnostics",

                options: {
                    type: [
                        "Check Engine Light",
                        "Electrical",
                        "Driveability",
                        "No Start",
                        "General Inspection"
                    ]
                }
            }
        ]
    },

    detailing: {
        name: "Detailing",

        services: [
            { id: "basic_wash", name: "Basic Wash" },
            { id: "interior_detail", name: "Interior Detail" },
            { id: "full_detail", name: "Full Detail" },
            { id: "ceramic_coating", name: "Ceramic Coating" }
        ]
    },

    tint: {
        name: "Window Tint",

        services: [
            { id: "standard_tint", name: "Standard Tint" },
            { id: "carbon_tint", name: "Carbon Tint" },
            { id: "ceramic_tint", name: "Ceramic Tint" },
            { id: "windshield_tint", name: "Windshield Tint" }
        ]
    }
};

/**
 * Maps the display names used in booking.js's `serviceOptions` (Step 3
 * checkbox list, e.g. "Oil Change", "Premium Oil Change", "Brake Service")
 * to the SERVICES automotive service id, so the configurator knows which
 * option set to render regardless of which checkbox label triggered it.
 */
const SERVICE_NAME_TO_ID = {
    "Oil Change": "oil_change",
    "Premium Oil Change": "oil_change",
    "Brake Service": "brakes",
    "Tire Rotation & Balance": "tires",
    "Mount & Balance (4 Tires)": "tires",
    "Diagnostic Service": "diagnostic"
};

/**
 * "Oil Change" and "Premium Oil Change" share the same serviceId
 * (oil_change) but must show DIFFERENT brand lists — budget-tier only
 * for "Oil Change", premium-tier only for "Premium Oil Change". This
 * maps the display name to the tier it requests; getAvailableOilBrands()
 * in partsCatalog.js combines this with any vehicle-required tier
 * override to produce the final filtered brand list.
 */
const OIL_CHANGE_NAME_TO_REQUESTED_TIER = {
    "Oil Change": "budget",
    "Premium Oil Change": "premium"
};

function getServiceDefinition(serviceId) {
    return SERVICES.automotive.services.find(s => s.id === serviceId) || null;
}

function getServiceIdForDisplayName(displayName) {
    return SERVICE_NAME_TO_ID[displayName] || null;
}

function getRequestedOilTierForDisplayName(displayName) {
    return OIL_CHANGE_NAME_TO_REQUESTED_TIER[displayName] || null;
}

window.SERVICES = SERVICES;
window.SERVICE_NAME_TO_ID = SERVICE_NAME_TO_ID;
window.OIL_CHANGE_NAME_TO_REQUESTED_TIER = OIL_CHANGE_NAME_TO_REQUESTED_TIER;
window.getServiceDefinition = getServiceDefinition;
window.getServiceIdForDisplayName = getServiceIdForDisplayName;
window.getRequestedOilTierForDisplayName = getRequestedOilTierForDisplayName;