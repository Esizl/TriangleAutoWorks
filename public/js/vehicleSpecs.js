const VEHICLE_SPECS = {
    Chevrolet: {
        "Silverado 1500": {},
        "Silverado 2500HD": {},
        "Colorado": {},
        Suburban: {
            2008: {
                oil: {
                    viscosity: "5W-30",
                    capacity: 6
                },

                filter: {
                    brandPartNumber: null,
                    socket: "74mm"
                },

                drainPlug: "15mm",

                tires: {
                    size: "265/70R17"
                },

                tools: {
                    oilChange: [
                        "15mm Socket",
                        "74mm Oil Filter Socket",
                        "Drain Pan",
                        "Torque Wrench"
                    ]
                },

                // Filter is top-mounted and easily reached, single drain
                // plug, no skid plate — quick oil change.
                oilChangeLaborMinutes: 20
            }
        },
        "Tahoe": {},
        "Traverse": {},
        "Equinox": {},
        "Trailblazer": {},
        "Blazer": {},
        "Trax": {},
        "Malibu": {},
        "Camaro": {},
        "Corvette": {}
    },

    Ford: {
        "F-150": {},
        "F-250": {},
        "F-350": {},
        "Ranger": {},
        "Maverick": {},
        "Explorer": {},
        "Expedition": {},
        "Escape": {},
        "Edge": {},
        "Bronco": {},
        "Bronco Sport": {},
        "Mustang": {},
        "Transit": {}
    },

    Toyota: {
        "Camry": {},
        "Corolla": {},
        "Corolla Cross": {},
        "Prius": {},
        "Tacoma": {},
        "Tundra": {},
        "4Runner": {},
        "Highlander": {},
        "RAV4": {},
        "Sequoia": {},
        "Sienna": {},
        "Land Cruiser": {},
        "GR86": {}
    },

    Honda: {
        "Accord": {},
        "Civic": {},
        "CR-V": {},
        "HR-V": {},
        "Pilot": {},
        "Passport": {},
        "Ridgeline": {},
        "Odyssey": {}
    },

    Nissan: {
        "Altima": {},
        "Sentra": {},
        "Versa": {},
        "Rogue": {},
        "Kicks": {},
        "Murano": {},
        "Pathfinder": {},
        "Armada": {},
        "Frontier": {},
        "Titan": {}
    },

    Jeep: {
        "Wrangler": {},
        "Gladiator": {},
        "Cherokee": {},
        "Grand Cherokee": {},
        "Compass": {},
        "Renegade": {},
        "Wagoneer": {},
        "Grand Wagoneer": {}
    },

    Jaguar: {
        "XF": {
            2018: {
                oil: {
                    viscosity: "0W-20",
                    capacity: 7
                },

                filter: {
                    brandPartNumber: "HP-1002",
                    socket: "24mm"
                },

                drainPlug: "13mm",

                tires: {
                    size: "245/45R18"
                },

                tools: {
                    oilChange: [
                        "13mm Socket",
                        "24mm Oil Filter Socket",
                        "Drain Pan",
                        "Torque Wrench"
                    ]
                },

                // Tighter engine bay access than a truck, no skid plate to
                // remove though.
                oilChangeLaborMinutes: 25,

                // Jaguar spec calls for full synthetic only — budget/
                // conventional products are not offered for this vehicle
                // regardless of brand default tier.
                oilTierOverride: "premium"
            }
        }
    },

    "Land Rover": {
        "Range Rover": {},
        "Range Rover Sport": {},
        "Range Rover Evoque": {},
        "Range Rover Velar": {},
        "Defender": {},
        "Discovery": {}
    },

    Lamborghini: {
        "Huracan": {},
        "Urus": {},
        "Revuelto": {}
    },

    Ram: {
        "1500": {},
        "2500": {},
        "3500": {},
        "ProMaster": {}
    },

    GMC: {
        "Sierra 1500": {},
        "Sierra 2500HD": {},
        "Canyon": {},
        "Terrain": {},
        "Acadia": {},
        "Yukon": {},
        "Savana 2500": {},
        "Savana 3500": {}
    },

    Cadillac: {
        "Escalade": {},
        "XT4": {},
        "XT5": {},
        "XT6": {},
        "CT4": {},
        "CT5": {}
    },

    Buick: {
        "Encore GX": {},
        "Envista": {},
        "Envision": {},
        "Enclave": {}
    },

    Chrysler: {
        "300": {},
        "Pacifica": {},
        "Voyager": {}
    },

    Dodge: {
        "Charger": {},
        "Challenger": {},
        "Durango": {},
        "Hornet": {}
    },

    Hyundai: {
        "Elantra": {},
        "Sonata": {},
        "Venue": {},
        "Kona": {},
        "Tucson": {},
        "Santa Fe": {},
        "Palisade": {}
    },

    Kia: {
        "Forte": {},
        "K4": {},
        "Rio": {},
        "Soul": {},
        "Seltos": {},
        "Sportage": {},
        "Sorento": {},
        "Telluride": {}
    },

    Subaru: {
        "Impreza": {},
        "Legacy": {},
        "WRX": {},
        "Crosstrek": {},
        "Forester": {},
        "Outback": {},
        "Ascent": {}
    },

    Mazda: {
        "Mazda3": {},
        "Mazda6": {},
        "CX-30": {},
        "CX-5": {},
        "CX-50": {},
        "CX-90": {}
    },

    Volkswagen: {
        "Jetta": {},
        "Passat": {},
        "Taos": {},
        "Tiguan": {},
        "Atlas": {},
        "Atlas Cross Sport": {},
        "Golf GTI": {}
    },

    BMW: {
        "228i": {},
        "330i": {},
        "430i": {},
        "530i": {},
        "X1": {},
        "X3": {},
        "X5": {}
    },

    /* Standardized key — matches VEHICLE_DATA["Mercedes-Benz"].
       Bracket-notation access (used everywhere in booking.js via
       VEHICLE_SPECS?.[state.selectedMake]) handles the hyphen fine. */
    "Mercedes-Benz": {
        "C-Class": {},
        "E-Class": {},
        "GLA": {},
        "GLB": {},
        "GLE": {},
        "GLS": {},
        "Sprinter": {}
    },

    Audi: {
        "A3": {},
        "A4": {},
        "A5": {},
        "Q3": {},
        "Q5": {},
        "Q7": {}
    },

    Lexus: {
        "IS": {},
        "ES": {},
        "RX": {},
        "NX": {},
        "GX": {},
        "LX": {}
    },

    Acura: {
        "Integra": {},
        "TLX": {},
        "RDX": {},
        "MDX": {}
    },

    Tesla: {
        "Model 3": {},
        "Model Y": {},
        "Model S": {},
        "Model X": {},
        "Cybertruck": {}
    }
};

/**
 * Generic fallback specs used whenever a vehicle has no entry (or an empty
 * {} entry) in VEHICLE_SPECS. This covers ~95% of the database today.
 * Anything built from this fallback should be flagged in the UI as an
 * estimate rather than a vehicle-specific spec.
 */
const GENERIC_FALLBACK_SPECS = {
    oil: {
        viscosity: "5W-30",
        capacity: 5
    },
    filter: {
        brandPartNumber: null,
        socket: "Standard wrench/cap"
    },
    drainPlug: "Standard",
    tires: {
        size: null
    },
    tools: {
        oilChange: [
            "Drain Pan",
            "Oil Filter Wrench",
            "Torque Wrench"
        ]
    },
    // Generic default labor time when a vehicle has no specific entry.
    // Real labor time depends on filter location, drain plug count, and
    // whether a skid plate has to come off first — those get set per
    // vehicle in VEHICLE_SPECS above as data comes in.
    oilChangeLaborMinutes: 20,
    oilTierOverride: null,
    isEstimate: true
};

window.VEHICLE_SPECS = VEHICLE_SPECS;
window.GENERIC_FALLBACK_SPECS = GENERIC_FALLBACK_SPECS;