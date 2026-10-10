/**
 * detailingConfigurator.js
 * -----------------------------------------------------------------------
 * Step 3 configurator engine for Detailing — the counterpart of
 * configurator.js for Automotive. Same contract, same state:
 *
 *  - buildDetailingConfiguratorHTML() returns the option cards for every
 *    selected detailing service (plus one shared "Vehicle & Site" card).
 *  - computeDetailingEstimate() returns an estimate in the SAME shape as
 *    computeEstimate(), so the estimate card, sidebar, invoice preview,
 *    admin payload and /api/booking all work without a second code path.
 *    Detailing has no parts, so every charge is a laborItems entry.
 *  - getDetailingBlock() / onDetailingServiceSelected() keep overlapping
 *    services from being booked together (Full Detail already includes
 *    Interior Detail, packages are pick-one, etc).
 *
 * Choices are stored in state.selectedParts exactly like Automotive:
 *   state.selectedParts[DETAILING_SITE_KEY] = { size, waterAccess, powerAccess }
 *   state.selectedParts['Full Detail']      = { condition, petHair, protection, addons: [] }
 *
 * Depends on: detailingCatalog.js, configurator.js (TAX_RATE), and
 * booking.js at call time (state, updatePartSelection, updateSidebar).
 * -----------------------------------------------------------------------
 */

function dtEsc(value) {
    return String(value).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}

function dtMoney(n) {
    return Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
}

function dtSizeLabel(sizeId) {
    return DETAILING_SIZES.find(s => s.id === sizeId)?.label || '';
}

/**
 * Best guess at the size tier from what Step 1 already knows (the
 * Vehicle Type dropdown, or NHTSA's vehicleType in VIN mode). Only
 * returns a tier when the type is unambiguous — an "SUV" could be a
 * CR-V or a Suburban, so that one is left for the customer to pick.
 */
function guessDetailingSize() {
    const manualType = document.getElementById('vehicleTypeVIN')?.value || '';
    const type = (state.vinMode === 'vin' ? (state.selectedType || '') : manualType).toLowerCase();
    if (!type) return '';
    if (/sedan|coupe|convertible|passenger car/.test(type)) return 'car';
    if (/wagon/.test(type)) return 'mid';
    if (/truck|van/.test(type)) return 'large';
    return '';
}

/**
 * Size class for the selected vehicle, from VEHICLE_SIZES in
 * vehicle-data.js (set per model in Admin → Site → Vehicle Data).
 * Case-insensitive so VIN-decoded names still match. Returns '' when
 * the model has no size on file.
 */
function getVehicleSizeClass() {
    if (typeof VEHICLE_SIZES === 'undefined') return '';

    const lookup = (obj, key) => {
        const wanted = String(key || '').trim().toLowerCase();
        const match = Object.keys(obj || {}).find(k => k.toLowerCase() === wanted);
        return match ? obj[match] : undefined;
    };

    const size = lookup(lookup(VEHICLE_SIZES, state.selectedMake), state.selectedModel);
    return DETAILING_SIZES.some(s => s.id === size) ? size : '';
}

/**
 * Shared Vehicle & Site answers. Size comes from the vehicle's own data
 * and can't be changed by the customer (site.sizeSource === 'vehicle').
 * Only a model with no size on file falls back to the customer picking
 * (sizeSource === 'customer'), which is flagged on the tech sheet.
 */
function getDetailingSite() {
    if (!state.selectedParts[DETAILING_SITE_KEY]) {
        state.selectedParts[DETAILING_SITE_KEY] = {};
    }
    const site = state.selectedParts[DETAILING_SITE_KEY];
    const knownSize = getVehicleSizeClass();
    if (knownSize) {
        site.size = knownSize;
        site.sizeSource = 'vehicle';
    } else {
        // A size left over from a previously selected vehicle doesn't carry over.
        if (site.sizeSource === 'vehicle') site.size = '';
        site.sizeSource = 'customer';
        if (!site.size) site.size = guessDetailingSize();
    }
    return site;
}

// ── OVERLAP / AVAILABILITY RULES ──

/**
 * Should this Step 3 option be disabled right now? Returns null, or
 * { reason, vehicleRelated } — vehicleRelated tells booking.js whether
 * to prefix the note with "Not available for this vehicle".
 */
function getDetailingBlock(serviceName) {
    const svc = getDetailingService(serviceName);
    if (!svc) return null;

    if (svc.includesOilChange && typeof isOilChangeBlocked === 'function') {
        const check = isOilChangeBlocked(state.selectedMake, state.selectedModel);
        if (check.blocked) {
            return {
                reason: `this package includes an oil change. ${check.reason}`,
                vehicleRelated: true
            };
        }
    }

    const coveredBy = state.services.find(other => {
        if (other === serviceName) return false;
        const otherSvc = getDetailingService(other);
        return otherSvc && otherSvc.covers.includes(serviceName);
    });
    if (coveredBy) {
        return { reason: `Already included in ${coveredBy}.`, vehicleRelated: false };
    }

    return null;
}

/**
 * Called by booking.js right after a detailing service is checked.
 * Packages are pick-one: selecting one swaps out any other package.
 */
function onDetailingServiceSelected(serviceName) {
    const svc = getDetailingService(serviceName);
    if (!svc || !svc.group) return;

    state.services = state.services.filter(other => {
        if (other === serviceName) return true;
        const sameGroup = getDetailingService(other)?.group === svc.group;
        if (sameGroup) delete state.selectedParts[other];
        return !sameGroup;
    });
}

// ── COMPLETENESS ──

function isDetailingServiceConfigComplete(serviceName) {
    const svc = getDetailingService(serviceName);
    if (!svc) return true;

    const sel = state.selectedParts[serviceName] || {};
    return svc.options.every(key => !!sel[key]);
}

/** Human-readable list of everything still unanswered, for the Step 3 validation alert. */
function getDetailingIncomplete() {
    const site = getDetailingSite();
    const missing = [];

    if (!site.size) missing.push('Vehicle Size');
    DETAILING_SITE_QUESTIONS.forEach(q => {
        if (!site[q.key]) missing.push(q.noteLabel);
    });
    state.services.forEach(name => {
        if (!isDetailingServiceConfigComplete(name)) missing.push(name);
    });

    return missing;
}

// ── CONFIGURATOR UI ──

/** Size picked so far ('' until the customer answers Vehicle Size). */
function dtCurrentSize() {
    return getDetailingSite().size || '';
}

/**
 * "+$30" once a size is picked; "from +$25" before that, since
 * surcharges and add-ons scale with vehicle size and the coupe price
 * is the lowest.
 */
function dtSurchargeTag(amount) {
    return `${dtCurrentSize() ? '' : 'from '}+${dtMoney(amount)}`;
}

function dtSelectField(serviceKey, fieldKey, label, placeholder, choices, currentValue, hint) {
    const options = choices.map(c => {
        const priceTag = c.price ? ` (${dtSurchargeTag(getDetailingSizedPrice(c.price, dtCurrentSize()))})` : '';
        const selected = currentValue === c.id ? 'selected' : '';
        return `<option value="${dtEsc(c.id)}" ${selected}>${dtEsc(c.label)}${priceTag}</option>`;
    }).join('');

    return `
        <div class="field">
            <label>${dtEsc(label)}</label>
            <select data-dt-service="${dtEsc(serviceKey)}" data-dt-field="${dtEsc(fieldKey)}">
                <option value="">${dtEsc(placeholder)}</option>
                ${options}
            </select>
            ${hint ? `<div class="field-hint">${dtEsc(hint)}</div>` : ''}
        </div>
    `;
}

function buildDetailingSiteCardHTML() {
    const site = getDetailingSite();

    const vehicleName = [state.selectedYear, state.selectedMake, state.selectedModel].filter(Boolean).join(' ');

    // Known vehicle: show the size, locked. Unknown model: let the customer pick.
    const sizeField = site.sizeSource === 'vehicle'
        ? `
        <div class="field">
            <label>Vehicle Size</label>
            <select disabled>
                <option>${dtEsc(dtSizeLabel(site.size))}</option>
            </select>
            <div class="field-hint">Set automatically for your ${dtEsc(vehicleName)}.</div>
        </div>
    `
        : dtSelectField(
            DETAILING_SITE_KEY, 'size', 'Vehicle Size', 'Select Vehicle Size',
            DETAILING_SIZES, site.size,
            'Three-row SUVs, trucks and minivans count as Large.'
        );

    const siteFields = DETAILING_SITE_QUESTIONS.map(q => dtSelectField(
        DETAILING_SITE_KEY, q.key, q.label, 'Select one',
        [{ id: 'yes', label: 'Yes' }, { id: 'no', label: 'No' }],
        site[q.key],
        site[q.key] === 'no' ? "Noted — we'll plan around it and confirm by text." : ''
    )).join('');

    return `
        <div class="service-config-card">
            <h3>Vehicle &amp; Site</h3>
            ${sizeField}
            ${siteFields}
        </div>
    `;
}

function buildDetailingServiceCardHTML(svc) {
    const sel = state.selectedParts[svc.name] || {};
    const selectedAddons = sel.addons || [];

    const optionFields = svc.options.map(key => {
        const set = DETAILING_OPTION_SETS[key];
        return dtSelectField(svc.name, key, set.label, set.placeholder, set.choices, sel[key], set.hint);
    }).join('');

    const addonRows = svc.addons.map(id => {
        const addon = DETAILING_ADDONS[id];
        const checked = selectedAddons.includes(id) ? 'checked' : '';
        return `
            <label class="dt-addon">
                <input type="checkbox" data-dt-service="${dtEsc(svc.name)}" data-dt-addon="${dtEsc(id)}" ${checked}>
                <span class="dt-addon-name">${dtEsc(addon.label)}</span>
                <span class="dt-addon-price">${addon.flatAcrossSizes ? `+${dtMoney(addon.price)}` : dtSurchargeTag(getDetailingAddonPrice(addon, dtCurrentSize()))}</span>
            </label>
        `;
    }).join('');

    const addonsBlock = addonRows
        ? `<div class="field">
               <label>Add-Ons <span class="field-optional">(optional)</span></label>
               <div class="dt-addon-list">${addonRows}</div>
           </div>`
        : '';

    return `
        <div class="service-config-card">
            <h3>${dtEsc(svc.name)}</h3>
            <div class="dt-includes">Includes: ${dtEsc(svc.desc)}</div>
            ${svc.configNote ? `<div class="config-estimate-flag">${dtEsc(svc.configNote)}</div>` : ''}
            ${optionFields}
            ${addonsBlock}
        </div>
    `;
}

function buildDetailingConfiguratorHTML() {
    const selected = state.services.map(getDetailingService).filter(Boolean);
    if (selected.length === 0) return '';

    return buildDetailingSiteCardHTML() + selected.map(buildDetailingServiceCardHTML).join('');
}

// One delegated listener instead of inline on* handlers, so service
// names never have to be escaped into a JS string inside an attribute.
document.addEventListener('change', event => {
    const el = event.target;
    if (!el.dataset || !el.dataset.dtService) return;

    const serviceKey = el.dataset.dtService;

    if (el.dataset.dtField) {
        updatePartSelection(serviceKey, el.dataset.dtField, el.value);
        return;
    }

    if (el.dataset.dtAddon) {
        if (!state.selectedParts[serviceKey]) state.selectedParts[serviceKey] = {};
        const sel = state.selectedParts[serviceKey];
        const addons = new Set(sel.addons || []);
        if (el.checked) addons.add(el.dataset.dtAddon); else addons.delete(el.dataset.dtAddon);
        sel.addons = Array.from(addons);

        refreshConfiguratorAndEstimate();
        updateSidebar();
    }
});

// ── ESTIMATE ──

/**
 * Same return shape as computeEstimate() in configurator.js, plus:
 *   kind: 'detailing', totalHours, hasQuoteItems, isStartingPrice
 * A service only contributes lines once everything it needs is
 * answered (size for size-priced services + its required options),
 * mirroring how Automotive waits for a finished configuration.
 */
function computeDetailingEstimate() {
    const site = getDetailingSite();
    const size = site.size;
    const laborItems = [];
    const toolsNeeded = new Set();
    const serviceNotes = {};
    let totalHours = 0;
    let hasPlaceholderPricing = false;

    const pushLine = (label, cost, hours, extra) => {
        laborItems.push({ label, hours, rate: null, cost, ...extra });
        totalHours += hours;
    };
    const markPlaceholder = () => {
        if (!DETAILING_PRICING_CONFIRMED) hasPlaceholderPricing = true;
    };

    // Site answers reach the tech sheet as soon as they're given.
    const siteNote = {};
    if (size) {
        siteNote['Vehicle size'] = dtSizeLabel(size) +
            (site.sizeSource === 'vehicle' ? '' : ' (picked by customer — no size on file for this model, verify on site)');
    }
    DETAILING_SITE_QUESTIONS.forEach(q => {
        if (!site[q.key]) return;
        siteNote[q.noteLabel] = site[q.key] === 'yes' ? 'Yes' : 'No';
        if (site[q.key] === 'no') toolsNeeded.add(q.toolIfNo);
    });
    if (Object.keys(siteNote).length > 0) serviceNotes[DETAILING_SITE_KEY] = siteNote;

    state.services.forEach(serviceName => {
        const svc = getDetailingService(serviceName);
        if (!svc) return;

        const sel = state.selectedParts[serviceName] || {};
        const pricing = svc.pricing;

        if (!size) return; // size drives price and/or time for every service
        if (!isDetailingServiceConfigComplete(serviceName)) return;

        const baseHours = svc.hours[size];
        const sizeSuffix = ` — ${dtSizeLabel(size)}`;

        if (pricing.type === 'sized') {
            pushLine(serviceName + sizeSuffix, pricing.prices[size], baseHours);
            if (size !== 'car') markPlaceholder();
        } else if (pricing.type === 'flat') {
            pushLine(serviceName, pricing.price, baseHours);
        } else if (pricing.type === 'from') {
            pushLine(serviceName, pricing.price, baseHours, { isFromPrice: true });
        } else {
            pushLine(serviceName, 0, baseHours, { isQuote: true });
        }

        const note = {};
        svc.options.forEach(key => {
            const set = DETAILING_OPTION_SETS[key];
            const choice = set.choices.find(c => c.id === sel[key]);
            if (!choice) return;
            note[set.label] = choice.label;
            if (choice.price > 0) {
                pushLine(`${choice.lineLabel} (${serviceName})`, getDetailingSizedPrice(choice.price, size), choice.hours);
                markPlaceholder();
            } else {
                totalHours += choice.hours;
            }
        });

        (sel.addons || []).forEach(id => {
            const addon = DETAILING_ADDONS[id];
            if (!addon || !svc.addons.includes(id)) return;
            pushLine(`${addon.label} (${serviceName})`, getDetailingAddonPrice(addon, size), addon.hours);
            addon.tools.forEach(t => toolsNeeded.add(t));
            markPlaceholder();
        });

        if (Object.keys(note).length > 0) serviceNotes[serviceName] = note;
        svc.tools.forEach(t => toolsNeeded.add(t));
    });

    const laborSubtotal = laborItems.reduce((sum, li) => sum + li.cost, 0);
    const subtotal = laborSubtotal;
    const tax = subtotal * TAX_RATE;
    const total = subtotal + tax;

    return {
        kind: 'detailing',
        vehicle: {
            make: state.selectedMake,
            model: state.selectedModel,
            year: state.selectedYear,
            specs: null,
            isEstimateSpecs: false
        },
        lineItems: [],
        laborItems,
        toolsNeeded: Array.from(toolsNeeded),
        serviceNotes,
        partsSubtotal: 0,
        laborSubtotal,
        subtotal,
        tax,
        total,
        totalHours,
        hasPlaceholderPricing,
        hasQuoteItems: laborItems.some(li => li.isQuote),
        isStartingPrice: laborItems.some(li => li.isFromPrice)
    };
}

/** "About 5.5 hrs" — whole/half hours only, it's an estimate. */
function formatDetailingDuration(hours) {
    const rounded = Math.round(hours * 2) / 2;
    return `About ${rounded} ${rounded === 1 ? 'hr' : 'hrs'}`;
}

/** Text for the sidebar's "Vehicle Service Data" slot (tool list for Automotive). */
function getDetailingSidebarText() {
    const estimate = state.lastEstimate;
    if (!estimate || estimate.kind !== 'detailing' || estimate.laborItems.length === 0) {
        return 'Finish your options to see time on site.';
    }

    const parts = [`${formatDetailingDuration(estimate.totalHours)} on site`];
    const site = estimate.serviceNotes[DETAILING_SITE_KEY] || {};
    DETAILING_SITE_QUESTIONS.forEach(q => {
        if (site[q.noteLabel] === 'No') parts.push(`${q.noteLabel}: No`);
    });
    return parts.join(' • ');
}

window.getDetailingBlock = getDetailingBlock;
window.onDetailingServiceSelected = onDetailingServiceSelected;
window.isDetailingServiceConfigComplete = isDetailingServiceConfigComplete;
window.getDetailingIncomplete = getDetailingIncomplete;
window.buildDetailingConfiguratorHTML = buildDetailingConfiguratorHTML;
window.computeDetailingEstimate = computeDetailingEstimate;
window.formatDetailingDuration = formatDetailingDuration;
window.getDetailingSidebarText = getDetailingSidebarText;
