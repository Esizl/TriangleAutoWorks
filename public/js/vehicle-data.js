const VEHICLE_DATA = {
    Cadillac: {
        "Escalade": [2025, 2024, 2023, 2022, 2021],
        "XT4": [2025, 2024, 2023, 2022, 2021],
        "XT5": [2025, 2024, 2023, 2022, 2021],
        "XT6": [2025, 2024, 2023, 2022, 2021],
        "CT4": [2025, 2024, 2023, 2022, 2021],
        "CT5": [2025, 2024, 2023, 2022, 2021]
    },

    Buick: {
        "Encore GX": [2025, 2024, 2023, 2022, 2021],
        "Envista": [2025, 2024, 2023],
        "Envision": [2025, 2024, 2023, 2022, 2021],
        "Enclave": [2025, 2024, 2023, 2022, 2021]
    },

    Chrysler: {
        "300": [2023, 2022, 2021],
        "Pacifica": [2025, 2024, 2023, 2022, 2021],
        "Voyager": [2025, 2024, 2023, 2022, 2021]
    },

    Dodge: {
        "Charger": [2023, 2022, 2021],
        "Challenger": [2023, 2022, 2021],
        "Durango": [2025, 2024, 2023, 2022, 2021],
        "Hornet": [2025, 2024, 2023]
    },

    Hyundai: {
        "Elantra": [2025, 2024, 2023, 2022, 2021],
        "Sonata": [2025, 2024, 2023, 2022, 2021],
        "Venue": [2025, 2024, 2023, 2022, 2021],
        "Kona": [2025, 2024, 2023, 2022, 2021],
        "Tucson": [2025, 2024, 2023, 2022, 2021],
        "Santa Fe": [2025, 2024, 2023, 2022, 2021],
        "Palisade": [2025, 2024, 2023, 2022, 2021]
    },

    Kia: {
        "Forte": [2025, 2024, 2023, 2022, 2021],
        "K4": [2025, 2024],
        "Rio": [2023, 2022, 2021],
        "Soul": [2025, 2024, 2023, 2022, 2021],
        "Seltos": [2025, 2024, 2023, 2022, 2021],
        "Sportage": [2025, 2024, 2023, 2022, 2021],
        "Sorento": [2025, 2024, 2023, 2022, 2021],
        "Telluride": [2025, 2024, 2023, 2022, 2021]
    },

    Subaru: {
        "Impreza": [2025, 2024, 2023, 2022, 2021],
        "Legacy": [2025, 2024, 2023, 2022, 2021],
        "WRX": [2025, 2024, 2023, 2022, 2021],
        "Crosstrek": [2025, 2024, 2023, 2022, 2021],
        "Forester": [2025, 2024, 2023, 2022, 2021],
        "Outback": [2025, 2024, 2023, 2022, 2021],
        "Ascent": [2025, 2024, 2023, 2022, 2021]
    },

    Mazda: {
        "Mazda3": [2025, 2024, 2023, 2022, 2021],
        "Mazda6": [2021],
        "CX-30": [2025, 2024, 2023, 2022, 2021],
        "CX-5": [2025, 2024, 2023, 2022, 2021],
        "CX-50": [2025, 2024, 2023, 2022],
        "CX-90": [2025, 2024, 2023]
    },

    Volkswagen: {
        "Jetta": [2025, 2024, 2023, 2022, 2021],
        "Passat": [2022, 2021],
        "Taos": [2025, 2024, 2023, 2022, 2021],
        "Tiguan": [2025, 2024, 2023, 2022, 2021],
        "Atlas": [2025, 2024, 2023, 2022, 2021],
        "Atlas Cross Sport": [2025, 2024, 2023, 2022, 2021],
        "Golf GTI": [2025, 2024, 2023, 2022, 2021]
    },

    BMW: {
        "228i": [2025, 2024, 2023, 2022, 2021],
        "330i": [2025, 2024, 2023, 2022, 2021],
        "430i": [2025, 2024, 2023, 2022, 2021],
        "530i": [2025, 2024, 2023, 2022, 2021],
        "X1": [2025, 2024, 2023, 2022, 2021],
        "X3": [2025, 2024, 2023, 2022, 2021],
        "X5": [2025, 2024, 2023, 2022, 2021]
    },

    /* Standardized to match VEHICLE_SPECS key. Bracket-notation lookups
       (VEHICLE_DATA["Mercedes-Benz"]) work fine in JS regardless of the
       hyphen — the hyphen only breaks things if you try dot-notation
       (VEHICLE_DATA.Mercedes-Benz, which is actually subtraction!) or if a
       display label does something like make.replace() unexpectedly. */
    "Mercedes-Benz": {
        "C-Class": [2025, 2024, 2023, 2022, 2021],
        "E-Class": [2025, 2024, 2023, 2022, 2021],
        "GLA": [2025, 2024, 2023, 2022, 2021],
        "GLB": [2025, 2024, 2023, 2022, 2021],
        "GLE": [2025, 2024, 2023, 2022, 2021],
        "GLS": [2025, 2024, 2023, 2022, 2021],
        "Sprinter": [2025, 2024, 2023, 2022, 2021]
    },

    Audi: {
        "A3": [2025, 2024, 2023, 2022, 2021],
        "A4": [2025, 2024, 2023, 2022, 2021],
        "A5": [2025, 2024, 2023, 2022, 2021],
        "Q3": [2025, 2024, 2023, 2022, 2021],
        "Q5": [2025, 2024, 2023, 2022, 2021],
        "Q7": [2025, 2024, 2023, 2022, 2021]
    },

    Lexus: {
        "IS": [2025, 2024, 2023, 2022, 2021],
        "ES": [2025, 2024, 2023, 2022, 2021],
        "RX": [2025, 2024, 2023, 2022, 2021],
        "NX": [2025, 2024, 2023, 2022, 2021],
        "GX": [2025, 2024, 2023, 2022, 2021],
        "LX": [2025, 2024, 2023, 2022, 2021]
    },

    Acura: {
        "Integra": [2025, 2024, 2023, 2022],
        "TLX": [2025, 2024, 2023, 2022, 2021],
        "RDX": [2025, 2024, 2023, 2022, 2021],
        "MDX": [2025, 2024, 2023, 2022, 2021]
    },

    Tesla: {
        "Model 3": [2025, 2024, 2023, 2022, 2021],
        "Model Y": [2025, 2024, 2023, 2022, 2021],
        "Model S": [2025, 2024, 2023, 2022, 2021],
        "Model X": [2025, 2024, 2023, 2022, 2021],
        "Cybertruck": [2025, 2024]
    },

    Chevrolet: {
        "Silverado 1500": [2025, 2024, 2023, 2022, 2021, 2020, 2019],
        "Silverado 2500HD": [2025, 2024, 2023, 2022, 2021],
        "Suburban": [2025, 2024, 2023, 2022, 2021, 2020, 2010, 2009, 2008, 2001],
        "Tahoe": [2025, 2024, 2023, 2022, 2021, 2020],
        "Traverse": [2025, 2024, 2023, 2022, 2021],
        "Equinox": [2025, 2024, 2023, 2022, 2021],
        "Malibu": [2025, 2024, 2023, 2022, 2021],
        "Camaro": [2024, 2023, 2022, 2021, 2020],
        "Corvette": [2025, 2024, 2023, 2022, 2021, 2008]
    },

    Ford: {
        "F-150": [2025, 2024, 2023, 2022, 2021, 2020],
        "F-250": [2025, 2024, 2023, 2022, 2021],
        "F-350": [2025, 2024, 2023, 2022, 2021],
        "Explorer": [2025, 2024, 2023, 2022, 2021],
        "Expedition": [2025, 2024, 2023, 2022, 2021],
        "Escape": [2025, 2024, 2023, 2022, 2021],
        "Mustang": [2025, 2024, 2023, 2022, 2021],
        "Bronco": [2025, 2024, 2023, 2022, 2021],
        "Maverick": [2025, 2024, 2023, 2022]
    },

    Toyota: {
        "Camry": [2025, 2024, 2023, 2022, 2021],
        "Corolla": [2025, 2024, 2023, 2022, 2021],
        "Tacoma": [2025, 2024, 2023, 2022, 2021],
        "Tundra": [2025, 2024, 2023, 2022, 2021],
        "4Runner": [2025, 2024, 2023, 2022, 2021],
        "Highlander": [2025, 2024, 2023, 2022, 2021],
        "RAV4": [2025, 2024, 2023, 2022, 2021, 2008],
        "Sequoia": [2025, 2024, 2023, 2022, 2021],
        "Land Cruiser": [2025, 2024, 2023, 2022, 2021]
    },

    Honda: {
        "Accord": [2025, 2024, 2023, 2022, 2021],
        "Civic": [2025, 2024, 2023, 2022, 2021, 2019],
        "Pilot": [2025, 2024, 2023, 2022, 2021],
        "CR-V": [2025, 2024, 2023, 2022, 2021],
        "Odyssey": [2025, 2024, 2023, 2022, 2021],
        "Ridgeline": [2025, 2024, 2023, 2022, 2021]
    },

    Nissan: {
        "Altima": [2025, 2024, 2023, 2022, 2021],
        "Sentra": [2025, 2024, 2023, 2022, 2021],
        "Rogue": [2025, 2024, 2023, 2022, 2021],
        "Pathfinder": [2025, 2024, 2023, 2022, 2021],
        "Titan": [2024, 2023, 2022, 2021],
        "Frontier": [2025, 2024, 2023, 2022, 2021]
    },

    Jeep: {
        "Wrangler": [2025, 2024, 2023, 2022, 2021],
        "Gladiator": [2025, 2024, 2023, 2022, 2021],
        "Cherokee": [2023, 2022, 2021, 2020],
        "Grand Cherokee": [2025, 2024, 2023, 2022, 2021],
        "Compass": [2025, 2024, 2023, 2022, 2021]
    },

    Jaguar: {
        "XF": [2018]
    },

    "Land Rover": {
        "Range Rover": [2025, 2024, 2023, 2022, 2021, 2020],
        "Range Rover Sport": [2025, 2024, 2023, 2022, 2021, 2020],
        "Range Rover Evoque": [2025, 2024, 2023, 2022, 2021, 2020],
        "Range Rover Velar": [2025, 2024, 2023, 2022, 2021, 2020],
        "Defender": [2025, 2024, 2023, 2022, 2021, 2020],
        "Discovery": [2025, 2024, 2023, 2022, 2021, 2020]
    },

    Lamborghini: {
        "Huracan": [2024, 2023, 2022, 2021],
        "Urus": [2025, 2024, 2023, 2022, 2021],
        "Revuelto": [2025, 2024]
    },

    Ram: {
        "1500": [2025, 2024, 2023, 2022, 2021],
        "2500": [2025, 2024, 2023, 2022, 2021],
        "3500": [2025, 2024, 2023, 2022, 2021]
    },

    GMC: {
        "Sierra 1500": [2025, 2024, 2023, 2022, 2021],
        "Sierra 2500HD": [2025, 2024, 2023, 2022, 2021],
        "Terrain": [2025, 2024, 2023, 2022, 2021],
        "Acadia": [2025, 2024, 2023, 2022, 2021],
        "Yukon": [2025, 2024, 2023, 2022, 2021],
        "Acadia Limited": [2017]
    }
};

const COLORS = [
    "Black",
    "White",
    "Silver",
    "Gray",
    "Red",
    "Blue",
    "Green",
    "Orange",
    "Yellow",
    "Brown",
    "Tan",
    "Gold",
    "Purple",
    "Other"
];

const VEHICLE_TYPES = [
    "Sedan",
    "Coupe",
    "SUV",
    "Truck",
    "Van",
    "Wagon",
    "Convertible",
    "Other"
];

// Size class per model: "car" | "mid" | "large". Edited in Admin → Site → Vehicle Data.
const VEHICLE_SIZES = {
    "Cadillac": {
        "Escalade": "large",
        "XT4": "mid",
        "XT5": "mid",
        "XT6": "large",
        "CT4": "car",
        "CT5": "car"
    },
    "Buick": {
        "Encore GX": "mid",
        "Envista": "mid",
        "Envision": "mid",
        "Enclave": "large"
    },
    "Chrysler": {
        "300": "car",
        "Pacifica": "large",
        "Voyager": "large"
    },
    "Dodge": {
        "Charger": "car",
        "Challenger": "car",
        "Durango": "large",
        "Hornet": "mid"
    },
    "Hyundai": {
        "Elantra": "car",
        "Sonata": "car",
        "Venue": "mid",
        "Kona": "mid",
        "Tucson": "mid",
        "Santa Fe": "mid",
        "Palisade": "large"
    },
    "Kia": {
        "Forte": "car",
        "K4": "car",
        "Rio": "car",
        "Soul": "car",
        "Seltos": "mid",
        "Sportage": "mid",
        "Sorento": "large",
        "Telluride": "large"
    },
    "Subaru": {
        "Impreza": "car",
        "Legacy": "car",
        "WRX": "car",
        "Crosstrek": "mid",
        "Forester": "mid",
        "Outback": "mid",
        "Ascent": "large"
    },
    "Mazda": {
        "Mazda3": "car",
        "Mazda6": "car",
        "CX-30": "mid",
        "CX-5": "mid",
        "CX-50": "mid",
        "CX-90": "large"
    },
    "Volkswagen": {
        "Jetta": "car",
        "Passat": "car",
        "Taos": "mid",
        "Tiguan": "mid",
        "Atlas": "large",
        "Atlas Cross Sport": "mid",
        "Golf GTI": "car"
    },
    "BMW": {
        "228i": "car",
        "330i": "car",
        "430i": "car",
        "530i": "car",
        "X1": "mid",
        "X3": "mid",
        "X5": "mid"
    },
    "Mercedes-Benz": {
        "C-Class": "car",
        "E-Class": "car",
        "GLA": "mid",
        "GLB": "mid",
        "GLE": "mid",
        "GLS": "large",
        "Sprinter": "large"
    },
    "Audi": {
        "A3": "car",
        "A4": "car",
        "A5": "car",
        "Q3": "mid",
        "Q5": "mid",
        "Q7": "large"
    },
    "Lexus": {
        "IS": "car",
        "ES": "car",
        "RX": "mid",
        "NX": "mid",
        "GX": "large",
        "LX": "large"
    },
    "Acura": {
        "Integra": "car",
        "TLX": "car",
        "RDX": "mid",
        "MDX": "large"
    },
    "Tesla": {
        "Model 3": "car",
        "Model Y": "mid",
        "Model S": "car",
        "Model X": "large",
        "Cybertruck": "large"
    },
    "Chevrolet": {
        "Silverado 1500": "large",
        "Silverado 2500HD": "large",
        "Suburban": "large",
        "Tahoe": "large",
        "Traverse": "large",
        "Equinox": "mid",
        "Malibu": "car",
        "Camaro": "car",
        "Corvette": "car"
    },
    "Ford": {
        "F-150": "large",
        "F-250": "large",
        "F-350": "large",
        "Explorer": "large",
        "Expedition": "large",
        "Escape": "mid",
        "Mustang": "car",
        "Bronco": "mid",
        "Maverick": "large"
    },
    "Toyota": {
        "Camry": "car",
        "Corolla": "car",
        "Tacoma": "large",
        "Tundra": "large",
        "4Runner": "mid",
        "Highlander": "large",
        "RAV4": "mid",
        "Sequoia": "large",
        "Land Cruiser": "large"
    },
    "Honda": {
        "Accord": "car",
        "Civic": "car",
        "Pilot": "large",
        "CR-V": "mid",
        "Odyssey": "large",
        "Ridgeline": "large"
    },
    "Nissan": {
        "Altima": "car",
        "Sentra": "car",
        "Rogue": "mid",
        "Pathfinder": "large",
        "Titan": "large",
        "Frontier": "large"
    },
    "Jeep": {
        "Wrangler": "mid",
        "Gladiator": "large",
        "Cherokee": "mid",
        "Grand Cherokee": "mid",
        "Compass": "mid"
    },
    "Jaguar": {
        "XF": "car"
    },
    "Land Rover": {
        "Range Rover": "large",
        "Range Rover Sport": "mid",
        "Range Rover Evoque": "mid",
        "Range Rover Velar": "mid",
        "Defender": "large",
        "Discovery": "large"
    },
    "Lamborghini": {
        "Huracan": "car",
        "Urus": "mid",
        "Revuelto": "car"
    },
    "Ram": {
        "1500": "large",
        "2500": "large",
        "3500": "large"
    },
    "GMC": {
        "Sierra 1500": "large",
        "Sierra 2500HD": "large",
        "Terrain": "mid",
        "Acadia": "large",
        "Yukon": "large",
        "Acadia Limited": "large"
    }
};
