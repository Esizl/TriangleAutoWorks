/**
 * configurator.js
 * -----------------------------------------------------------------------
 * Step 3 "smart parts configurator" engine for Automotive services.
 *
 * Responsibilities:
 *  - Render option pickers (oil type, filter brand, brake axle/pad/rotor,
 *    tire service type) per selected service, driven by SERVICES.
 *  - Auto-calc quantities from VEHICLE_SPECS (falling back to
 *    GENERIC_FALLBACK_SPECS with an "estimated" note when the vehicle has
 *    no specific data yet).
 *  - Resolve prices/part numbers/suppliers from PARTS_CATALOG, using the
 *    selected vehicle's make/model/year so filter part-number overrides
 *    (see FILTER_PART_NUMBERS in partsCatalog.js) apply correctly, and
 *    the filter's type (oil/engine/cabin) so the right override is used.
 *  - Filter available oil brands by requested tier, whether the customer
 *    flagged the vehicle as high-mileage (75k+ miles), AND the vehicle's
 *    recommended viscosity — so only compatible oils are ever offered.
 *  - Offer filter brands per vehicle via a live catalog lookup
 *    (getAvailableFilterBrands), which respects each brand's
 *    compatibleMakes restriction — so a manufacturer-specific brand
 *    (Motorcraft, AC Delco, or any OEM-equivalent brand added in the
 *    admin panel) only appears for vehicles it's actually compatible
 *    with, with no special-casing needed for "OEM" as a concept.
 *  - Build the customer-facing estimate card (#selectedPartsList /
 *    #partsEstimateTotal).
 *  - Build a silent admin payload (vehicle specs, parts list, labor
 *    breakdown, tool sets) for the tech sheet / admin panel.
 *
 * Depends on (load order matters): vehicle-data.js, vehicleSpecs.js,
 * partsCatalog.js, services.js — all before this file, and this file
 * before booking.js.
 * -----------------------------------------------------------------------
 */

const LABOR_RATES = {
    // oil_change labor time is NOT fixed here — it comes from the
    // vehicle's oilChangeLaborMinutes (vehicleSpecs.js / GENERIC_FALLBACK_SPECS),
    // since real time depends on filter location, drain plug count, and
    // skid plate removal. See computeEstimate() for how it's applied.
    oil_change: { label: "Oil Change Labor" },
    brakes: { hours: 1.2, label: "Brake Service Labor" }, // per axle, scaled below
    tires: { hours: 0.5, label: "Tire Service Labor" },
    diagnostic: { hours: 0.15, label: "Diagnostic Labor" } // ~10-20 min actual scan time
};

// Labor rate, tax rate and the diagnostic trip charge are set in
// Admin > Site > Business Config and arrive through /js/businessConfig.js.
// No fallback numbers here on purpose: a quote built on a guessed rate is
// worse than a page that visibly fails.
if (!window.BUSINESS_CONFIG) {
    throw new Error('businessConfig.js did not load — pricing settings are missing, so no estimate can be built.');
}
const LABOR_RATE_PER_HOUR = window.BUSINESS_CONFIG.laborRatePerHour;
const TAX_RATE = window.BUSINESS_CONFIG.taxRate;

// "Bring it to us": approved customers drop the vehicle off instead of
// us driving out, for a lower price (Admin > Site > Business Config).
const DROP_OFF_LOCATION = 'Drop-off';

/** "Tax (7.75%)" — the label always shows the rate actually charged. */
function formatTaxLabel() {
    return `Tax (${Number((TAX_RATE * 100).toFixed(3))}%)`;
}

/**
 * Diagnostic Service pricing logic:
 *  - If bundled with at least one OTHER Automotive service (Oil Change,
 *    Premium Oil Change, Brake Service, Tires) in the same visit, the
 *    diagnostic itself is free to the customer — but the real ~10-20min
 *    labor (DIAGNOSTIC_LABOR_COST_WHEN_BUNDLED) still shows in the admin
 *    payload/tech sheet so actual labor cost is tracked even when it's
 *    not charged.
 *  - If Diagnostic is the ONLY Automotive service selected, it's priced
 *    as a flat trip charge (driving out just to run a scan), not as
 *    labor for the scan itself.
 */
const DIAGNOSTIC_STANDALONE_TRIP_CHARGE = window.BUSINESS_CONFIG.diagnosticStandaloneFee;

/**
 * Pull vehicle specs for the currently selected vehicle, falling back to
 * generic defaults (flagged isEstimate: true) if nothing specific exists.
 */
function resolveVehicleSpecs() {
    const specific = (typeof getVehicleSpecs === "function") ? getVehicleSpecs() : null;
    if (specific && Object.keys(specific).length > 0) {
        // verified: false = seeded starting figures nobody has checked yet,
        // so the quote still carries the "Estimated" flag.
        return { ...specific, isEstimate: specific.verified === false };
    }
    return { ...window.GENERIC_FALLBACK_SPECS };
}

/**
 * Shape the currently selected vehicle the way getPartRecord() expects
 * it (make/model/year), so filter part-number overrides can be resolved.
 * Centralized here so every call site stays in sync if the state shape
 * ever changes.
 */
function currentVehicle() {
    return {
        make: state.selectedMake,
        model: state.selectedModel,
        year: state.selectedYear
    };
}

/**
 * Builds the filter-brand option list shared by all three filter pickers
 * (oil filter, engine air filter, cabin air filter) for the current
 * vehicle. Pulled live from the catalog via getAvailableFilterBrands(),
 * which already respects each brand's compatibleMakes restriction — so
 * a manufacturer-restricted brand (OEM-equivalent or otherwise, e.g.
 * "AC Delco" restricted to GM makes) only shows up for vehicles it's
 * actually compatible with.
 */
function getFilterBrandOptions(vehicle) {
    return (typeof getAvailableFilterBrands === "function")
        ? getAvailableFilterBrands(vehicle?.make)
        : [];
}

/**
 * Per-service state shape stored in state.selectedParts[serviceDisplayName]:
 * Oil Change:  { oilBrand, filterBrand, engineFilterBrand, cabinFilterBrand, highMileage }
 *              engineFilterBrand/cabinFilterBrand are optional add-ons —
 *              "" / unset means the customer didn't add that filter.
 *              highMileage is "yes"/"no"/unset — "yes" restricts the Oil
 *              Brand list to high-mileage-formulated oils.
 * Brake Service: { axle, padType, rotors }
 * Tires: { serviceType }
 */

function buildConfiguratorHTML() {
    const container = document.getElementById('serviceConfigurator');
    if (!container) return;

    // Detailing has its own option cards (detailingConfigurator.js) but
    // shares this container, the estimate card and the admin payload.
    if (usesDetailingEngine(state.category)) {
        container.innerHTML = buildDetailingConfiguratorHTML();
        return;
    }

    if (state.category !== 'Automotive') {
        container.innerHTML = '';
        return;
    }

    const specs = resolveVehicleSpecs();
    const vehicle = currentVehicle();
    let html = '';

    state.services.forEach(serviceName => {
        const serviceId = getServiceIdForDisplayName(serviceName);
        if (!serviceId) return;

        const def = getServiceDefinition(serviceId);
        if (!def) return;

        const current = state.selectedParts[serviceName] || {};

        if (serviceId === 'oil_change') {
            const blockCheck = (typeof isOilChangeBlocked === 'function')
                ? isOilChangeBlocked(state.selectedMake, state.selectedModel)
                : { blocked: false, reason: null };

            if (blockCheck.blocked) {
                html += `
                    <div class="service-config-card service-config-blocked">
                        <h3>${serviceName}</h3>
                        <div class="config-blocked-flag">
                            Not available as a standard service for this vehicle. ${blockCheck.reason}
                        </div>
                    </div>
                `;
                return; // skip brand/filter pickers entirely for blocked vehicles
            }

            const qty = specs?.oil?.capacity || 5;
            const recommendedViscosity = specs?.oil?.viscosity || '5W-30';
            const vehicleRequiredTier = specs?.oilTierOverride || null;
            const requestedTier = (typeof getRequestedOilTierForDisplayName === 'function')
                ? getRequestedOilTierForDisplayName(serviceName)
                : null;

            // Vehicle requires premium oil but the customer's checkbox
            // (the budget "Oil Change" option) can't satisfy that — there
            // are no valid brands to offer, so block the card entirely
            // instead of showing an empty/confusing dropdown.
            if (vehicleRequiredTier === 'premium' && requestedTier === 'budget') {
                html += `
                    <div class="service-config-card service-config-blocked">
                        <h3>${serviceName}</h3>
                        <div class="config-blocked-flag">
                            Not available for this vehicle — it requires full synthetic / synthetic blend oil. Please select "Premium Oil Change" instead.
                        </div>
                    </div>
                `;
                return;
            }

            const estimateNote = specs.isEstimate
                ? `<div class="config-estimate-flag">${specs.verified === false ? 'Estimated — typical figures for this model, confirmed on site' : 'Estimated — not vehicle-specific yet'}</div>`
                : '';
            const tierNote = (vehicleRequiredTier === 'premium' && requestedTier !== 'budget')
                ? `<div class="config-estimate-flag">This vehicle requires full synthetic / synthetic blend oil — budget options aren't shown.</div>`
                : '';

            // Asked first because it now gates which oils are offered
            // below, rather than being a purely informational note.
            const requestedHighMileage = current.highMileage === 'yes';

            // recommendedViscosity is threaded in here — getAvailableOilBrands
            // now hard-filters out any product that lists specific
            // viscosities and doesn't include this one (see partsCatalog.js).
            const availableBrands = (typeof getAvailableOilBrands === 'function')
                ? getAvailableOilBrands(requestedTier, vehicleRequiredTier, requestedHighMileage, recommendedViscosity)
                : [];

            const highMileageEmptyNote = (requestedHighMileage && availableBrands.length === 0)
                ? `<div class="config-estimate-flag">No high-mileage oil formulas are in the catalog for this tier/viscosity yet. Add one in the parts admin, or select "No" above.</div>`
                : '';
            const viscosityEmptyNote = (!requestedHighMileage && availableBrands.length === 0)
                ? `<div class="config-estimate-flag">No oils in the catalog are listed for ${recommendedViscosity} yet. Add one in the parts admin, or check its Available Viscosities.</div>`
                : '';

            const selectedOilPart = current.oilBrand
                ? getPartRecord('oilChange', 'oilProducts', current.oilBrand)
                : null;
            const qualifiesForPromo = selectedOilPart?.includesFreeFilter && planOilPurchase(qty, selectedOilPart).jugs > 0;
            const promoNote = qualifiesForPromo
                ? `<div class="config-promo-flag">Select Carquest as the filter brand to get it free with this 5qt.</div>`
                : '';

            // One live brand list, shared by all three filter pickers
            // (compatibleMakes restricts by brand, not by filter type).
            // Any previously-selected brand that's no longer in this list
            // (e.g. the customer switched to a vehicle it isn't compatible
            // with) is cleared here, before rendering, so a stale
            // selection never lingers with invalid/mismatched pricing.
            const filterBrandOptions = getFilterBrandOptions(vehicle);
            ['filterBrand', 'engineFilterBrand', 'cabinFilterBrand'].forEach(key => {
                if (current[key] && !filterBrandOptions.includes(current[key])) {
                    delete current[key];
                }
            });

            html += `
                <div class="service-config-card">
                    <h3>${serviceName}</h3>
                    ${estimateNote}
                    ${tierNote}

                    <div class="field">
                        <label>Above 75,000 Miles?</label>
                        <select onchange="updatePartSelection('${serviceName}','highMileage', this.value)">
                            <option value="">Select one</option>
                            <option value="yes" ${current.highMileage === 'yes' ? 'selected' : ''}>Yes</option>
                            <option value="no" ${current.highMileage === 'no' ? 'selected' : ''}>No</option>
                        </select>
                        <div class="field-hint">Yes narrows the Oil Brand list below to high-mileage formulas.</div>
                    </div>

                    ${highMileageEmptyNote}
                    ${viscosityEmptyNote}

                    <div class="field">
                        <label>Oil Brand</label>
                        <select onchange="updatePartSelection('${serviceName}','oilBrand', this.value)">
                            <option value="">Select Oil Brand</option>
                            ${availableBrands.map(brand =>
                `<option value="${brand}" ${current.oilBrand === brand ? 'selected' : ''}>${brand}</option>`
            ).join('')}
                        </select>
                    </div>

                    ${promoNote}

                    <div class="field">
                        <label>Oil Filter Brand</label>
                        <select onchange="updatePartSelection('${serviceName}','filterBrand', this.value)">
                            <option value="">Select Filter Brand</option>
                            ${filterBrandOptions.map(o =>
                `<option value="${o}" ${current.filterBrand === o ? 'selected' : ''}>${o}</option>`
            ).join('')}
                        </select>
                    </div>

                    <div class="field">
                        <label>Engine Air Filter <span class="field-optional">(optional)</span></label>
                        <select onchange="updatePartSelection('${serviceName}','engineFilterBrand', this.value)">
                            <option value="">Not needed this visit</option>
                            ${filterBrandOptions.map(o =>
                `<option value="${o}" ${current.engineFilterBrand === o ? 'selected' : ''}>${o}</option>`
            ).join('')}
                        </select>
                    </div>

                    <div class="field">
                        <label>Cabin Air Filter <span class="field-optional">(optional)</span></label>
                        <select onchange="updatePartSelection('${serviceName}','cabinFilterBrand', this.value)">
                            <option value="">Not needed this visit</option>
                            ${filterBrandOptions.map(o =>
                `<option value="${o}" ${current.cabinFilterBrand === o ? 'selected' : ''}>${o}</option>`
            ).join('')}
                        </select>
                    </div>

                    <div class="field-hint">${qty} qts needed • recommended ${recommendedViscosity}</div>
                </div>
            `;
        }

        if (serviceId === 'brakes') {
            html += `
                <div class="service-config-card">
                    <h3>${serviceName}</h3>

                    <div class="field">
                        <label>Axle(s)</label>
                        <select onchange="updatePartSelection('${serviceName}','axle', this.value)">
                            <option value="">Select Axle</option>
                            ${def.options.axle.map(o =>
                `<option value="${o}" ${current.axle === o ? 'selected' : ''}>${o}</option>`
            ).join('')}
                        </select>
                    </div>

                    <div class="field">
                        <label>Pad Type</label>
                        <select onchange="updatePartSelection('${serviceName}','padType', this.value)">
                            <option value="">Select Pad Type</option>
                            ${def.options.padType.map(o =>
                `<option value="${o}" ${current.padType === o ? 'selected' : ''}>${o}</option>`
            ).join('')}
                        </select>
                    </div>

                    <div class="field">
                        <label>Rotors</label>
                        <select onchange="updatePartSelection('${serviceName}','rotors', this.value)">
                            <option value="">Select Rotor Option</option>
                            ${def.options.rotors.map(o =>
                `<option value="${o}" ${current.rotors === o ? 'selected' : ''}>${o}</option>`
            ).join('')}
                        </select>
                    </div>
                </div>
            `;
        }

        if (serviceId === 'tires') {
            const tireSize = specs?.tires?.size;
            const sizeNote = tireSize
                ? `<div class="field-hint">Vehicle tire size: ${tireSize}</div>`
                : `<div class="field-hint">Tire size not on file — tech will confirm on site</div>`;

            html += `
                <div class="service-config-card">
                    <h3>${serviceName}</h3>

                    <div class="field">
                        <label>Service Type</label>
                        <select onchange="updatePartSelection('${serviceName}','serviceType', this.value)">
                            <option value="">Select Service Type</option>
                            ${def.options.serviceType.map(o =>
                `<option value="${o}" ${current.serviceType === o ? 'selected' : ''}>${o}</option>`
            ).join('')}
                        </select>
                    </div>

                    ${sizeNote}
                </div>
            `;
        }

        if (serviceId === 'diagnostic') {
            html += `
                <div class="service-config-card">
                    <h3>${serviceName}</h3>

                    <div class="field">
                        <label>Concern Type</label>
                        <select onchange="updatePartSelection('${serviceName}','type', this.value)">
                            <option value="">Select Concern</option>
                            ${def.options.type.map(o =>
                `<option value="${o}" ${current.type === o ? 'selected' : ''}>${o}</option>`
            ).join('')}
                        </select>
                    </div>
                </div>
            `;
        }
    });

    container.innerHTML = html;
}

/**
 * Build a single line item for the estimate card + admin payload, given
 * a part record from PARTS_CATALOG and a quantity/unit description.
 */
function buildLineItem(label, partRecord, qty, unitLabel) {
    const lineTotal = (partRecord.price || 0) * qty;
    return {
        label,
        partNumber: partRecord.partNumber,
        supplier: partRecord.supplier ? getSupplierInfo(partRecord.supplier) : null,
        url: partRecord.url || null,
        // How far the part number can be trusted for this vehicle — see
        // getPartRecord() in the generated partsCatalog.js.
        fitment: partRecord.fitment || (partRecord.partNumber ? 'default' : 'none'),
        unitPrice: partRecord.price || 0,
        qty,
        unitLabel,
        lineTotal,
        isPlaceholder: partRecord.isPlaceholder
    };
}

/**
 * How the oil is actually bought for a capacity: whole 5qt jugs plus
 * whole loose quarts (nobody sells 0.8 of a quart). When the leftover
 * quarts would cost more than one more jug, it's one more jug instead —
 * a 4.4 qt car gets a 5qt jug, not five single quarts.
 */
function planOilPurchase(capacityQts, oilPart) {
    const jugSize = window.OIL_JUG_SIZE_QTS || 5;
    const needed = Math.ceil(capacityQts - 1e-9);
    let jugs = Math.floor(needed / jugSize);
    let quarts = needed - jugs * jugSize;
    const quartPrice = oilPart.price || 0;
    const jugPrice = (oilPart.jugPrice != null) ? oilPart.jugPrice : quartPrice * jugSize;
    if (quarts > 0 && jugPrice <= quarts * quartPrice) {
        jugs += 1;
        quarts = 0;
    }
    return { jugs, quarts };
}

/**
 * Oil change tool list for a vehicle: the tools on its spec entry (or the
 * generic set when the entry lists none — an empty list used to mean NO
 * tools on the tech sheet), plus the drain plug and filter sockets from
 * the spec's own fields when they aren't already in the list.
 */
function getOilChangeTools(specs) {
    const listed = specs && specs.tools && specs.tools.oilChange;
    const tools = (Array.isArray(listed) && listed.length > 0)
        ? listed.slice()
        : GENERIC_FALLBACK_SPECS.tools.oilChange.slice();

    const mentions = size => tools.some(t => t.toLowerCase().includes(String(size).toLowerCase()));
    const filterSocket = specs && specs.filter && specs.filter.socket;
    const drainPlug = specs && specs.drainPlug;

    // "64mm" -> "64mm Oil Filter Socket"; "64mm cap wrench" is already a tool name.
    const namesATool = text => /socket|wrench|tool|cap|hex|allen|torx|key|pliers/i.test(text);

    if (filterSocket && !/standard/i.test(filterSocket) && !mentions(filterSocket)) {
        // A specific filter tool makes the generic filter wrench redundant.
        const generic = tools.indexOf('Oil Filter Wrench');
        if (generic !== -1) tools.splice(generic, 1);
        tools.unshift(namesATool(filterSocket) ? `${filterSocket} (oil filter)` : `${filterSocket} Oil Filter Socket`);
    }
    if (drainPlug && !/standard/i.test(drainPlug) && !mentions(drainPlug)) {
        tools.unshift(namesATool(drainPlug) ? `${drainPlug} (drain plug)` : `${drainPlug} Socket (drain plug)`);
    }
    return tools;
}

/**
 * Compute the full breakdown (parts line items + labor) for every
 * configured automotive service. Returns both the customer-facing
 * estimate and the fuller admin payload in one pass so they always
 * stay in sync.
 */
function computeEstimate() {
    // The drop-off discount comes off first, then any discount code
    // (discount.js) comes off what's left — same for every category.
    return applyDiscountToEstimate(applyDropOffDiscount(computeBaseEstimate()));
}

/**
 * Takes the drop-off discount off an estimate when the customer chose
 * "Bring it to us". It's a negative line on the estimate so it shows up
 * everywhere the lines do (estimate card, invoice, tech sheet).
 * Only approved customers ever see that option, and the server refuses
 * a drop-off from anyone else before pricing it.
 */
function applyDropOffDiscount(estimate) {
    if (state.locationType !== DROP_OFF_LOCATION || !(estimate.subtotal > 0)) return estimate;

    const { dropOffDiscountType: type, dropOffDiscountValue: value } = window.BUSINESS_CONFIG;
    const raw = type === 'percent' ? estimate.subtotal * value / 100 : value;
    const amount = Math.round(Math.min(raw, estimate.subtotal) * 100) / 100;
    if (!(amount > 0)) return estimate;

    estimate.laborItems.push({
        label: `Drop-off discount — you bring it to us${type === 'percent' ? ` (${value}% off)` : ''}`,
        hours: 0,
        rate: null,
        cost: -amount,
        isDropOffDiscount: true
    });
    estimate.laborSubtotal -= amount;
    estimate.subtotal -= amount;
    estimate.tax = estimate.subtotal * TAX_RATE;
    estimate.total = estimate.subtotal + estimate.tax;
    estimate.dropOffDiscount = amount;
    return estimate;
}

function computeBaseEstimate() {
    if (usesDetailingEngine(state.category)) return computeDetailingEstimate();

    const specs = resolveVehicleSpecs();
    const vehicle = currentVehicle();
    const lineItems = [];
    const laborItems = [];
    const toolsNeeded = new Set();
    // Informational flags that don't affect pricing or product selection
    // but should still reach the admin payload / tech sheet (e.g. "Above
    // 75,000 Miles?" — the answer itself now also gates oil brand
    // availability in buildConfiguratorHTML, but is still logged here too
    // so the tech sheet shows it plainly).
    const serviceNotes = {};
    let hasPlaceholderPricing = false;

    state.services.forEach(serviceName => {
        const serviceId = getServiceIdForDisplayName(serviceName);
        if (!serviceId) return;

        const sel = state.selectedParts[serviceName] || {};

        if (serviceId === 'oil_change') {
            const blockCheck = (typeof isOilChangeBlocked === 'function')
                ? isOilChangeBlocked(state.selectedMake, state.selectedModel)
                : { blocked: false, reason: null };
            if (blockCheck.blocked) return; // no pricing for blocked vehicles

            if (sel.highMileage === 'yes' || sel.highMileage === 'no') {
                serviceNotes[serviceName] = { highMileage: sel.highMileage === 'yes' };
            }

            if (sel.oilBrand && sel.filterBrand) {
                const totalQty = specs?.oil?.capacity || 5;
                const jugSize = window.OIL_JUG_SIZE_QTS || 5;

                const oilPart = getPartRecord('oilChange', 'oilProducts', sel.oilBrand);
                const { jugs: fullJugs, quarts: remainderQts } = planOilPurchase(totalQty, oilPart);
                // Oil filter: pass the vehicle + explicit "oil" filterType so
                // any vehicle-specific override (FILTER_PART_NUMBERS) for
                // this brand/vehicle/filterType resolves to the correct
                // part number and price instead of the generic brand price.
                const filterPart = getPartRecord('oilChange', 'filterBrand', sel.filterBrand, vehicle, 'oil');

                // Buy oil the way it's actually purchased: full 5qt unit(s)
                // priced at the bulk jugPrice, plus loose quarts at the
                // per-quart price to cover anything past a full 5qt.
                if (fullJugs > 0) {
                    const jugUnitPrice = (oilPart.jugPrice != null) ? oilPart.jugPrice : (oilPart.price || 0) * jugSize;
                    lineItems.push({
                        label: `${sel.oilBrand} Motor Oil (${jugSize}qt)`,
                        // The jug's own part number. The quart number is a
                        // different product, so it isn't used as a stand-in.
                        partNumber: oilPart.jugPartNumber || null,
                        supplier: oilPart.supplier ? getSupplierInfo(oilPart.supplier) : null,
                        url: oilPart.url || null,
                        // Oil is chosen by viscosity, not by vehicle — no fit check.
                        fitment: oilPart.jugPartNumber ? 'product' : 'missing',
                        unitPrice: jugUnitPrice,
                        qty: fullJugs,
                        unitLabel: `${jugSize}qt`,
                        lineTotal: jugUnitPrice * fullJugs,
                        isPlaceholder: oilPart.isPlaceholder
                    });
                }
                if (remainderQts > 0) {
                    const quartLine = buildLineItem(`${sel.oilBrand} Motor Oil (1qt)`, oilPart, remainderQts, '1qt');
                    quartLine.fitment = oilPart.partNumber ? 'product' : 'missing';
                    lineItems.push(quartLine);
                }

                // Free-filter promo: brands that include a free Carquest
                // filter with a 5qt purchase only waive the charge if
                // (a) at least one full 5qt was bought (not just a
                // 1qt-only quantity) and (b) the customer's chosen
                // filter is actually Carquest — picking a different filter
                // brand still gets priced normally.
                const promoApplies = oilPart.includesFreeFilter && fullJugs > 0 && sel.filterBrand === 'Carquest';

                if (promoApplies) {
                    lineItems.push({
                        label: `Carquest Oil Filter (free w/ ${sel.oilBrand} 5qt)`,
                        partNumber: filterPart.partNumber,
                        supplier: filterPart.supplier ? getSupplierInfo(filterPart.supplier) : null,
                        url: filterPart.url || null,
                        fitment: filterPart.fitment || (filterPart.partNumber ? 'default' : 'none'),
                        unitPrice: 0,
                        qty: 1,
                        unitLabel: 'each',
                        lineTotal: 0,
                        isPlaceholder: false
                    });
                } else {
                    lineItems.push(buildLineItem(`${sel.filterBrand} Oil Filter`, filterPart, 1, 'each'));
                }

                // Optional engine air filter add-on. Uses the same brand
                // list/prices as the oil filter, but resolves its part
                // number/price override with filterType "engine" so a
                // brand that has different part numbers per filter type
                // on the same vehicle still gets the right one.
                if (sel.engineFilterBrand) {
                    const engineFilterPart = getPartRecord('oilChange', 'filterBrand', sel.engineFilterBrand, vehicle, 'engine');
                    lineItems.push(buildLineItem(`${sel.engineFilterBrand} Engine Air Filter`, engineFilterPart, 1, 'each'));
                    if (engineFilterPart.isPlaceholder) hasPlaceholderPricing = true;
                }

                // Optional cabin air filter add-on — same pattern, filterType "cabin".
                if (sel.cabinFilterBrand) {
                    const cabinFilterPart = getPartRecord('oilChange', 'filterBrand', sel.cabinFilterBrand, vehicle, 'cabin');
                    lineItems.push(buildLineItem(`${sel.cabinFilterBrand} Cabin Air Filter`, cabinFilterPart, 1, 'each'));
                    if (cabinFilterPart.isPlaceholder) hasPlaceholderPricing = true;
                }

                const laborMinutes = specs?.oilChangeLaborMinutes || GENERIC_FALLBACK_SPECS.oilChangeLaborMinutes || 20;
                const laborHours = laborMinutes / 60;
                laborItems.push({
                    label: LABOR_RATES.oil_change.label,
                    hours: laborHours,
                    rate: LABOR_RATE_PER_HOUR,
                    cost: laborHours * LABOR_RATE_PER_HOUR
                });

                getOilChangeTools(specs).forEach(t => toolsNeeded.add(t));

                if (oilPart.isPlaceholder || filterPart.isPlaceholder) hasPlaceholderPricing = true;
            }
        }

        if (serviceId === 'brakes' && sel.axle && sel.padType && sel.rotors) {
            const axleMultiplier = sel.axle === 'Front & Rear' ? 2 : 1;
            const padPart = getPartRecord('brakes', 'padType', sel.padType);
            const rotorPart = getPartRecord('brakes', 'rotors', sel.rotors);

            lineItems.push(buildLineItem(`${sel.padType} Brake Pads (${sel.axle})`, padPart, axleMultiplier, 'per axle set'));
            if (sel.rotors === 'Replace Rotors') {
                lineItems.push(buildLineItem(`Replacement Rotors (${sel.axle})`, rotorPart, axleMultiplier, 'per axle pair'));
            }

            laborItems.push({
                label: `${LABOR_RATES.brakes.label} (${sel.axle})`,
                hours: LABOR_RATES.brakes.hours * axleMultiplier,
                rate: LABOR_RATE_PER_HOUR,
                cost: LABOR_RATES.brakes.hours * axleMultiplier * LABOR_RATE_PER_HOUR
            });

            toolsNeeded.add('Brake Caliper Tool');
            toolsNeeded.add('C-Clamp');
            toolsNeeded.add('Torque Wrench');
            toolsNeeded.add('Jack & Jack Stands');

            if (padPart.isPlaceholder || rotorPart.isPlaceholder) hasPlaceholderPricing = true;
        }

        if (serviceId === 'tires' && sel.serviceType) {
            const tirePart = getPartRecord('tires', 'serviceType', sel.serviceType);
            lineItems.push(buildLineItem(sel.serviceType, tirePart, 1, 'service'));

            laborItems.push({
                label: `${LABOR_RATES.tires.label} (${sel.serviceType})`,
                hours: LABOR_RATES.tires.hours,
                rate: LABOR_RATE_PER_HOUR,
                cost: LABOR_RATES.tires.hours * LABOR_RATE_PER_HOUR
            });

            toolsNeeded.add('Tire Balancer');
            toolsNeeded.add('Impact Wrench');
            toolsNeeded.add('Torque Wrench');

            if (tirePart.isPlaceholder) hasPlaceholderPricing = true;
        }

        if (serviceId === 'diagnostic' && sel.type) {
            // "Bundled" means at least one OTHER automotive service besides
            // Diagnostic itself is also selected in this visit.
            const isBundled = state.services.some(otherName => {
                if (otherName === serviceName) return false;
                const otherId = getServiceIdForDisplayName(otherName);
                return otherId && otherId !== 'diagnostic';
            });

            if (isBundled) {
                // Free to the customer, but still log the real labor time/
                // cost in the admin payload so actual labor isn't invisible.
                laborItems.push({
                    label: `${LABOR_RATES.diagnostic.label} (${sel.type}) — bundled, no charge`,
                    hours: LABOR_RATES.diagnostic.hours,
                    rate: LABOR_RATE_PER_HOUR,
                    cost: 0,
                    actualLaborCost: LABOR_RATES.diagnostic.hours * LABOR_RATE_PER_HOUR,
                    isComplimentary: true
                });
            } else {
                // Standalone visit — priced as a trip charge, not as scan labor.
                laborItems.push({
                    label: `Diagnostic Visit (${sel.type}) — trip charge`,
                    hours: LABOR_RATES.diagnostic.hours,
                    rate: LABOR_RATE_PER_HOUR,
                    cost: DIAGNOSTIC_STANDALONE_TRIP_CHARGE,
                    isTripCharge: true
                });
            }

            toolsNeeded.add('OBD-II Scanner');
        }
    });

    const partsSubtotal = lineItems.reduce((sum, li) => sum + li.lineTotal, 0);
    const laborSubtotal = laborItems.reduce((sum, li) => sum + li.cost, 0);
    const subtotal = partsSubtotal + laborSubtotal;
    const tax = subtotal * TAX_RATE;
    const total = subtotal + tax;

    return {
        vehicle: {
            make: state.selectedMake,
            model: state.selectedModel,
            year: state.selectedYear,
            specs,
            isEstimateSpecs: specs.isEstimate
        },
        lineItems,
        laborItems,
        toolsNeeded: Array.from(toolsNeeded),
        serviceNotes,
        partsSubtotal,
        laborSubtotal,
        subtotal,
        tax,
        total,
        hasPlaceholderPricing
    };
}

/**
 * Has the customer answered everything this Automotive service needs
 * before it can be priced? Used by the Step 3 validation in booking.js
 * and by the server (priceEngine.js), which refuses a booking whose
 * selected services aren't fully configured.
 */
function isServiceConfigComplete(serviceName) {
    const serviceId = getServiceIdForDisplayName(serviceName);
    if (!serviceId) return true; // no configurator needed (e.g. detailing/tint items)

    const sel = state.selectedParts[serviceName] || {};

    if (serviceId === 'oil_change') {
        const blockCheck = (typeof isOilChangeBlocked === 'function')
            ? isOilChangeBlocked(state.selectedMake, state.selectedModel)
            : { blocked: false };
        if (blockCheck.blocked) return true; // nothing to configure, service is disabled
        return !!(sel.oilBrand && sel.filterBrand);
    }
    if (serviceId === 'brakes') return !!(sel.axle && sel.padType && sel.rotors);
    if (serviceId === 'tires') return !!sel.serviceType;
    if (serviceId === 'diagnostic') return !!sel.type;

    return true;
}

/** Everything still unanswered for the current category, as display names. */
function getIncompleteServices() {
    if (usesDetailingEngine(state.category)) return getDetailingIncomplete();
    return state.services.filter(name => !isServiceConfigComplete(name));
}

/**
 * Hours of work in an estimate — what the calendar and the server use to
 * decide which time windows a job needs. Detailing / Tint carry a total;
 * Automotive is the sum of its labor lines.
 */
function getEstimateHours(estimate) {
    if (!estimate) return 0;
    if (typeof estimate.totalHours === 'number') return estimate.totalHours;
    return (estimate.laborItems || []).reduce((sum, li) => sum + (li.hours || 0), 0);
}

/** Categories that have a configurator + priced estimate (all three now). */
function categoryHasEstimate(category) {
    return category === 'Automotive' || usesDetailingEngine(category);
}

/**
 * Price cell for one labor/service line. Detailing can have lines with
 * no number yet ("Custom quote") or a starting price ("$799+").
 */
function formatEstimateLinePrice(li) {
    if (li.isQuote) return 'Quoted on site';
    if (li.cost < 0) return `−$${(-li.cost).toFixed(2)}`;
    return `${li.isFromPrice ? 'From ' : ''}$${li.cost.toFixed(2)}`;
}

/** Grand total, prefixed "From" when any line is a starting price or still to be quoted. */
function formatEstimateTotal(estimate) {
    const open = estimate.isStartingPrice || estimate.hasQuoteItems;
    return `${open ? 'From ' : ''}$${estimate.total.toFixed(2)}`;
}

/**
 * Render the customer-facing estimate card (#selectedPartsList /
 * #partsEstimateTotal) from the current computeEstimate() output.
 */
function renderEstimateCard() {
    const listEl = document.getElementById('selectedPartsList');
    const totalEl = document.getElementById('partsEstimateTotal');
    if (!listEl || !totalEl) return;

    const isDetailing = usesDetailingEngine(state.category);
    const headerEl = document.getElementById('estimateHeader');
    const totalLabelEl = document.getElementById('estimateTotalLabel');
    if (headerEl) headerEl.textContent = isDetailing ? 'Your Estimate' : 'Estimated Parts';
    if (totalLabelEl) totalLabelEl.textContent = isDetailing ? 'Estimated Total:' : 'Estimated Parts Total:';

    if (!categoryHasEstimate(state.category) || state.services.length === 0) {
        listEl.innerHTML = isDetailing ? 'No services selected yet.' : 'No parts selected yet.';
        totalEl.textContent = '$0.00';
        state.lastEstimate = null;
        return;
    }

    const estimate = computeEstimate();
    state.lastEstimate = estimate;

    if (estimate.lineItems.length === 0 && estimate.laborItems.length === 0) {
        listEl.innerHTML = 'Finish configuring your selected services to see pricing.';
        totalEl.textContent = '$0.00';
        return;
    }

    let rows = '';

    estimate.lineItems.forEach(li => {
        rows += `
            <div class="estimate-line-item">
                <span class="estimate-line-label">${li.label} ${li.qty > 1 ? `× ${li.qty} (${li.unitLabel})` : ''}</span>
                <span class="estimate-line-price">$${li.lineTotal.toFixed(2)}</span>
            </div>
        `;
    });

    estimate.laborItems.forEach(li => {
        let hoursLabel;
        if (estimate.kind === 'detailing' || li.isDropOffDiscount) {
            hoursLabel = ''; // detailing time is shown once, as a total, below
        } else if (li.isTripCharge) {
            hoursLabel = ' — flat trip charge, mostly covers the drive-out';
        } else if (li.isComplimentary) {
            hoursLabel = ` (${li.hours.toFixed(2)} hrs, complimentary)`;
        } else {
            hoursLabel = ` (${li.hours.toFixed(1)} hrs)`;
        }
        rows += `
            <div class="estimate-line-item">
                <span class="estimate-line-label">${li.label}${hoursLabel}</span>
                <span class="estimate-line-price">${formatEstimateLinePrice(li)}</span>
            </div>
        `;
    });

    rows += `
        <div class="estimate-line-item estimate-subtotal">
            <span class="estimate-line-label">Subtotal</span>
            <span class="estimate-line-price">$${estimate.subtotal.toFixed(2)}</span>
        </div>
        ${estimate.discountAmount > 0 ? `<div class="estimate-line-item estimate-discount">
            <span class="estimate-line-label">Discount (${estimate.discount.code} — ${estimate.discount.label})</span>
            <span class="estimate-line-price">−$${estimate.discountAmount.toFixed(2)}</span>
        </div>` : ''}
        <div class="estimate-line-item">
            <span class="estimate-line-label">${formatTaxLabel()}</span>
            <span class="estimate-line-price">$${estimate.tax.toFixed(2)}</span>
        </div>
    `;

    if (estimate.discountNote) {
        rows += `<div class="config-estimate-flag">${estimate.discountNote}</div>`;
    }
    if (estimate.vehicle.isEstimateSpecs) {
        rows += `<div class="config-estimate-flag">Some figures are estimated — final pricing confirmed on site.</div>`;
    }
    if (estimate.hasPlaceholderPricing) {
        rows += `<div class="config-estimate-flag">Some ${estimate.kind === 'detailing' ? '' : 'part '}prices are placeholders pending catalog updates.</div>`;
    }
    if (estimate.hasQuoteItems) {
        rows += `<div class="config-estimate-flag">Quoted items aren't in this total — we'll price them on site before any work starts.</div>`;
    }
    if (estimate.kind === 'detailing') {
        rows += `<div class="estimate-line-item">
            <span class="estimate-line-label">Time on site</span>
            <span class="estimate-line-price">${formatDetailingDuration(estimate.totalHours)}</span>
        </div>`;
    }

    rows += `<div class="estimate-disclaimer">Final pricing may vary based on vehicle condition${estimate.kind === 'detailing' ? '' : ' and parts availability'}.</div>`;

    listEl.innerHTML = rows;
    totalEl.textContent = formatEstimateTotal(estimate);
}

/**
 * Build the silent admin payload: full vehicle specs, parts list (with
 * part numbers / suppliers), labor breakdown, and consolidated tool sets
 * needed. This is what the admin/tech-sheet panel will consume later.
 */
function buildAdminPayload() {
    const estimate = state.lastEstimate || computeEstimate();
    return {
        generatedAt: new Date().toISOString(),
        vehicle: estimate.vehicle,
        services: state.services,
        selections: state.selectedParts,
        serviceNotes: estimate.serviceNotes,
        parts: estimate.lineItems,
        labor: estimate.laborItems,
        toolsNeeded: estimate.toolsNeeded,
        pricing: {
            partsSubtotal: estimate.partsSubtotal,
            laborSubtotal: estimate.laborSubtotal,
            subtotal: estimate.subtotal,       // before discount
            discount: estimate.discountAmount, // preview — the server recomputes it on submit
            taxRate: estimate.taxRate,
            tax: estimate.tax,
            total: estimate.total,
            estimatedHours: getEstimateHours(estimate) || null // hours of work, all categories
        },
        flags: {
            hasPlaceholderPricing: estimate.hasPlaceholderPricing,
            isEstimateSpecs: estimate.vehicle.isEstimateSpecs,
            hasQuoteItems: !!estimate.hasQuoteItems,     // Detailing only
            isStartingPrice: !!estimate.isStartingPrice  // Detailing only
        }
    };
}

/**
 * Entry point called whenever a service is toggled or an option changes.
 * Rebuilds the configurator UI + estimate card + admin payload together
 * so they never drift out of sync.
 */
function refreshConfiguratorAndEstimate() {
    buildConfiguratorHTML();
    renderEstimateCard();
    state.adminPayload = buildAdminPayload();
}

window.refreshConfiguratorAndEstimate = refreshConfiguratorAndEstimate;
window.buildAdminPayload = buildAdminPayload;
window.computeEstimate = computeEstimate;
window.getOilChangeTools = getOilChangeTools;
window.planOilPurchase = planOilPurchase;
window.applyDropOffDiscount = applyDropOffDiscount;
window.DROP_OFF_LOCATION = DROP_OFF_LOCATION;
window.getEstimateHours = getEstimateHours;
window.isServiceConfigComplete = isServiceConfigComplete;
window.getIncompleteServices = getIncompleteServices;
window.formatTaxLabel = formatTaxLabel;
window.computeBaseEstimate = computeBaseEstimate;
window.categoryHasEstimate = categoryHasEstimate;
window.formatEstimateLinePrice = formatEstimateLinePrice;
window.formatEstimateTotal = formatEstimateTotal;
