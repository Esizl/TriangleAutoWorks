const MAKE_NAMES = Object.keys(VEHICLE_DATA).sort();

// ── STATE ──
const state = {
    vinMode: 'manual',
    selectedMake: '',
    selectedModel: '',
    selectedYear: '',
    selectedType: '',
    cachedSpecs: null,
    cachedSpecsKey: '',
    specsFetchInFlight: false,

    category: '',
    services: [],

    selectedParts: {},
    lastEstimate: null,
    adminPayload: null,

    locationType: '',

    step: 1,
    maxReached: 1
};

// ── SERVICE OPTIONS BY CATEGORY (Step 3 checkbox list) ──
const serviceOptions = {
    // Names, prices and descriptions come from detailingCatalog.js so the
    // checkbox list and the configurator can never disagree.
    Detailing: getDetailingServiceOptions(),
    // Same for Tint — tintCatalog.js.
    Tint: getTintServiceOptions(),
    Automotive: [
        { name: 'Oil Change', price: 'From $65', desc: 'Up to 5 qts ARGOS oil + filter + fluid check' },
        { name: 'Premium Oil Change', price: 'From $75', desc: 'Pennzoil / Valvoline / Mobil 1' },
        { name: 'Brake Service', price: 'From $149', desc: 'Inspection, pad & rotor replacement' },
        { name: 'Tire Rotation & Balance', price: 'From $75', desc: 'Rotation, balance, pressure & inspection' },
        { name: 'Mount & Balance (4 Tires)', price: 'From $120', desc: 'Full mount and balance service' },
        { name: 'Diagnostic Service', price: 'From $100', desc: 'Check engine scan + system report' },
        { name: 'General Maintenance', price: 'Custom quote', desc: 'Fluid top-offs, filters, wipers, belts, etc.' },
    ]
};

// ── INIT MAKE GRID ──
(function () {
    const grid = document.getElementById('make-grid');
    MAKE_NAMES.forEach(make => {
        const chip = document.createElement('div');
        chip.className = 'picker-chip';
        chip.textContent = make;
        chip.dataset.make = make;
        chip.onclick = () => selectMake(make, chip);
        grid.appendChild(chip);
    });
})();

// ── MAKE PICKER ──
function filterMakes(q) {
    const chips = document.querySelectorAll('#make-grid .picker-chip');
    const lq = q.toLowerCase();
    chips.forEach(c => {
        c.classList.toggle('hidden', !c.dataset.make.toLowerCase().includes(lq));
    });
}

function selectMake(make, chip) {
    state.selectedMake = make;
    state.selectedModel = '';
    state.selectedYear = '';
    state.cachedSpecs = null;
    state.cachedSpecsKey = '';

    document.getElementById('make-grid').style.display = 'none';
    document.getElementById('make-search').style.display = 'none';
    document.getElementById('make-locked').style.display = 'flex';
    document.getElementById('make-locked-val').textContent = make;
    document.getElementById('make-selected-label').textContent = make;

    buildModelGrid(make);

    document.getElementById('stage-model').classList.remove('disabled');
    document.getElementById('stage-year').classList.add('disabled');

    document.querySelectorAll('#year-grid .year-chip').forEach(c => c.classList.remove('selected'));
    document.getElementById('year-selected-label').textContent = '';

    updateSidebar();
}

function resetMake() {
    state.selectedMake = '';
    state.selectedModel = '';
    state.selectedYear = '';
    state.cachedSpecs = null;
    state.cachedSpecsKey = '';

    document.getElementById('make-grid').style.display = '';
    document.getElementById('make-search').style.display = '';
    document.getElementById('make-search').value = '';
    document.getElementById('make-locked').style.display = 'none';
    document.getElementById('make-selected-label').textContent = '';
    filterMakes('');

    document.getElementById('stage-model').classList.add('disabled');
    document.getElementById('stage-year').classList.add('disabled');
    document.getElementById('model-selected-label').textContent = '';
    document.getElementById('year-selected-label').textContent = '';
    updateSidebar();
}

// ── MODEL PICKER ──
function buildModelGrid(make) {
    const grid = document.getElementById('model-grid');
    grid.innerHTML = '';

    document.getElementById('model-search').value = '';
    document.getElementById('model-locked').style.display = 'none';

    grid.style.display = '';
    document.getElementById('model-search').style.display = '';
    document.getElementById('model-selected-label').textContent = '';

    const models = Object.keys(VEHICLE_DATA[make] || {});

    models.forEach(model => {
        const chip = document.createElement('div');
        chip.className = 'picker-chip';
        chip.textContent = model;
        chip.dataset.model = model;
        chip.onclick = () => selectModel(model, chip);
        grid.appendChild(chip);
    });
}

function filterModels(q) {
    const chips = document.querySelectorAll('#model-grid .picker-chip');
    const lq = q.toLowerCase();
    chips.forEach(c => {
        c.classList.toggle('hidden', !c.dataset.model.toLowerCase().includes(lq));
    });
}

function selectModel(model, chip) {
    state.selectedModel = model;
    state.selectedYear = '';
    state.cachedSpecs = null;
    state.cachedSpecsKey = '';

    document.getElementById('model-grid').style.display = 'none';
    document.getElementById('model-search').style.display = 'none';

    document.getElementById('model-locked').style.display = 'flex';
    document.getElementById('model-locked-val').textContent = model;
    document.getElementById('model-selected-label').textContent = model;

    document.getElementById('stage-year').classList.remove('disabled');

    buildYearGrid(state.selectedMake, state.selectedModel);

    document.getElementById('year-selected-label').textContent = '';

    updateSidebar();
}

function resetModel() {
    state.selectedModel = '';
    state.selectedYear = '';
    state.cachedSpecs = null;
    state.cachedSpecsKey = '';

    buildModelGrid(state.selectedMake);
    document.getElementById('stage-year').classList.add('disabled');
    document.getElementById('year-selected-label').textContent = '';
    document.querySelectorAll('#year-grid .year-chip').forEach(c => c.classList.remove('selected'));
    updateSidebar();
}

function buildYearGrid(make, model) {
    const grid = document.getElementById('year-grid');
    grid.innerHTML = '';

    const availableYears = VEHICLE_DATA[make]?.[model] || [];
    const maxYear = new Date().getFullYear() + 1;

    for (let year = maxYear; year >= 1980; year--) {
        const chip = document.createElement('div');
        chip.className = 'picker-chip year-chip';
        chip.textContent = year;
        chip.dataset.year = year;

        const available = availableYears.map(Number).includes(year);

        if (!available) {
            chip.classList.add('disabled');
        } else {
            chip.onclick = () => selectYear(year, chip);
        }

        grid.appendChild(chip);
    }
}

// ── YEAR PICKER ──
function selectYear(year, chip) {
    state.selectedYear = year;
    document.querySelectorAll('#year-grid .year-chip').forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
    document.getElementById('year-selected-label').textContent = year;
    updateSidebar();
    fetchAndCacheSpecs();
}

// ── VIN TOGGLE ──
function switchVinTab(mode, btn) {
    state.vinMode = mode;
    document.querySelectorAll('.vin-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.vin-section').forEach(s => s.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('vin-' + mode).classList.add('active');
}

// ── CATEGORY SELECT ──
function selectCategory(cat, el) {
    state.category = cat;
    state.services = [];
    state.selectedParts = {};
    document.querySelectorAll('.category-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
    updateSidebar();
}

// ── LOCATION SELECT ──
function selectLocation(loc, el) {
    state.locationType = loc;
    document.querySelectorAll('.location-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');

    // "Bring it to us": no service address to type, show ours instead.
    const isDropOff = loc === DROP_OFF_LOCATION;
    const addressField = document.getElementById('f-address');
    const dropOffInfo = document.getElementById('dropOffInfo');
    if (addressField) addressField.style.display = isDropOff ? 'none' : '';
    if (dropOffInfo) dropOffInfo.style.display = isDropOff ? '' : 'none';

    // Drop-off changes the price (and drops the travel time), so the
    // estimate and the calendar's open windows are worked out again.
    if (categoryHasEstimate(state.category)) refreshConfiguratorAndEstimate();
    if (typeof refreshCalendarAvailability === 'function') refreshCalendarAvailability();
    updateSidebar();
}

/** Where the work happens, as shown to the customer. */
function serviceAddressText() {
    if (state.locationType === DROP_OFF_LOCATION) {
        const el = document.querySelector('#dropOffInfo .dropoff-info-address');
        return el ? `You bring it to us: ${el.textContent.trim()}` : 'You bring it to us';
    }
    return document.getElementById('serviceAddress').value.trim();
}

// ── BUILD SERVICE OPTIONS (Step 3 checkbox grid) ──
function buildServiceOptions() {
    const grid = document.getElementById('serviceOptionsGrid');
    // Detailing prices depend on the vehicle's size, so the list is rebuilt
    // for the selected vehicle each time (exact prices, not "From" prices).
    if (state.category === 'Detailing') {
        serviceOptions.Detailing = getDetailingServiceOptions(getVehicleSizeClass());
    }
    if (state.category === 'Tint') {
        serviceOptions.Tint = getTintServiceOptions(getVehicleSizeClass());
    }
    const options = serviceOptions[state.category] || [];
    document.getElementById('step3-title').textContent = state.category + ' Services';

    const oilBlockCheck = (typeof isOilChangeBlocked === 'function')
        ? isOilChangeBlocked(state.selectedMake, state.selectedModel)
        : { blocked: false, reason: null };

    const vehicleSpecs = (typeof resolveVehicleSpecs === 'function') ? resolveVehicleSpecs() : null;
    const requiresPremiumOil = vehicleSpecs?.oilTierOverride === 'premium';

    grid.innerHTML = options.map((o, i) => {
        const isOilChangeOption = (o.name === 'Oil Change' || o.name === 'Premium Oil Change');

        // Fully blocked (skid plate / exotic drain plugs) disables BOTH
        // oil change options. A premium-oil requirement only disables the
        // budget "Oil Change" option — "Premium Oil Change" still works.
        let disabledReason = null;
        let disabledPrefix = 'Not available for this vehicle — ';
        if (usesDetailingEngine(state.category)) {
            // Overlap rules (e.g. Full Detail already includes Interior
            // Detail) and packages that bundle a blocked oil change.
            const block = getDetailingBlock(o.name);
            if (block) {
                disabledReason = block.reason;
                if (!block.vehicleRelated) disabledPrefix = '';
            }
        } else if (isOilChangeOption && oilBlockCheck.blocked) {
            disabledReason = oilBlockCheck.reason;
        } else if (o.name === 'Oil Change' && requiresPremiumOil) {
            disabledReason = 'This vehicle requires full synthetic / synthetic blend oil — select "Premium Oil Change" instead.';
        }
        const isDisabled = !!disabledReason;

        if (isDisabled) {
            // If it was previously selected (e.g. user picked a different
            // vehicle after checking it), make sure it's cleared out of state.
            state.services = state.services.filter(s => s !== o.name);
            delete state.selectedParts[o.name];
        }

        return `
      <div class="service-option ${state.services.includes(o.name) ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}"
           onclick="${isDisabled ? '' : `toggleService(${i}, this)`}" data-index="${i}">
        <div class="service-option-check">
          <svg viewBox="0 0 24 24" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="service-option-info">
          <div class="service-option-name">${o.name}</div>
          <div class="service-option-price">${o.price}</div>
          <div class="service-option-desc">${o.desc}</div>
          ${isDisabled ? `<div class="service-option-blocked-note">${disabledPrefix}${disabledReason}</div>` : ''}
        </div>
      </div>
    `;
    }).join('');

    refreshConfiguratorAndEstimate();
}

function toggleService(idx, el) {
    const name = serviceOptions[state.category][idx].name;

    el.classList.toggle('selected');

    if (el.classList.contains('selected')) {
        state.services.push(name);
        if (usesDetailingEngine(state.category)) onDetailingServiceSelected(name);
    } else {
        state.services = state.services.filter(s => s !== name);
        delete state.selectedParts[name];
    }

    if (usesDetailingEngine(state.category)) {
        // Selecting one detailing service can disable or swap out others,
        // so the whole grid is rebuilt (which also refreshes the
        // configurator + estimate).
        buildServiceOptions();
    } else {
        refreshConfiguratorAndEstimate();
    }
    updateSidebar();
}

// ── PARTS CONFIGURATOR HOOK (called from configurator.js's rendered <select> onchange) ──
function updatePartSelection(service, key, value) {
    if (!state.selectedParts[service]) {
        state.selectedParts[service] = {};
    }
    state.selectedParts[service][key] = value;

    refreshConfiguratorAndEstimate();
    updateSidebar();
}

// ── PHONE FORMAT ──
function formatPhone(el) {
    let v = el.value.replace(/\D/g, '').substring(0, 10);
    if (v.length >= 6) v = '(' + v.substring(0, 3) + ') ' + v.substring(3, 6) + '-' + v.substring(6);
    else if (v.length >= 3) v = '(' + v.substring(0, 3) + ') ' + v.substring(3);
    el.value = v;
}

// ── SIDEBAR ──
function updateSidebar() {
    // Vehicle
    let veh = '';
    if (state.selectedYear && state.selectedMake && state.selectedModel) {
        veh = `${state.selectedYear} ${state.selectedMake} ${state.selectedModel}`;
    } else {
        const vin = document.getElementById('vehicleVIN').value.trim();
        if (vin) veh = `VIN: ${vin}`;
    }
    setSidebarItem('sb-vehicle', veh);

    // Vehicle service data (tools/specs preview)
    updateSidebarServiceData();

    // Category
    setSidebarItem('sb-service', state.category);

    // Services
    setSidebarItem('sb-work', state.services.length ? state.services.join('\n') : '');

    // Location
    const addr = serviceAddressText();
    setSidebarItem('sb-location', state.locationType === DROP_OFF_LOCATION ? 'Bring it to us' : state.locationType);
    document.getElementById('sb-address-val').textContent = addr;

    // DateTime
    const dt = document.getElementById('preferredDate').value;
    const tm = document.getElementById('preferredTime').value;
    let dtStr = '';
    if (dt) dtStr = new Date(dt + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (tm) dtStr += (dtStr ? '\n' : '') + tm;
    setSidebarItem('sb-datetime', dtStr);

    // Contact
    const fn = document.getElementById('contactFirst').value.trim();
    const ln = document.getElementById('contactLast').value.trim();
    const ph = document.getElementById('contactPhone').value.trim();
    setSidebarItem('sb-contact', [fn, ln].filter(Boolean).join(' '));
    document.getElementById('sb-phone-val').textContent = ph;
}

function updateSidebarServiceData() {
    const el = document.getElementById('sb-tools-val');
    if (!el) return;

    if (usesDetailingEngine(state.category) && state.services.length > 0) {
        el.textContent = getDetailingSidebarText();
        return;
    }

    if (state.category !== 'Automotive' || state.services.length === 0) {
        el.textContent = 'Vehicle-specific tools will appear after selection.';
        return;
    }

    const specs = (typeof resolveVehicleSpecs === 'function') ? resolveVehicleSpecs() : null;
    if (!specs) {
        el.textContent = 'Vehicle-specific tools will appear after selection.';
        return;
    }

    const estimate = state.lastEstimate;
    if (!estimate || estimate.toolsNeeded.length === 0) {
        el.textContent = specs.isEstimate
            ? 'Estimated specs — confirm options to see tool list.'
            : 'Confirm options to see tool list.';
        return;
    }

    const prefix = specs.isEstimate ? '(Estimated specs) ' : '';
    el.textContent = prefix + estimate.toolsNeeded.join(', ');
}

function setSidebarItem(id, val) {
    const item = document.getElementById(id);
    const valEl = item.querySelector('.sidebar-item-val');
    if (val && val.trim()) {
        valEl.innerHTML = val.replace(/\n/g, '<br>');
        item.classList.add('filled');
    } else {
        valEl.textContent = '—';
        item.classList.remove('filled');
    }
}

// ── VALIDATION ──
function validateStep(n) {
    let ok = true;

    const clearErrors = (...ids) => ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.remove('has-error');
    });

    const setError = (id) => {
        const el = document.getElementById(id);
        if (el) { el.classList.add('has-error'); ok = false; }
    };

    if (n === 1) {
        document.getElementById('f-make-err').style.display = 'none';
        document.getElementById('f-model-err').style.display = 'none';
        document.getElementById('f-year-err').style.display = 'none';
        if (document.getElementById('f-vin')) document.getElementById('f-vin').classList.remove('has-error');

        if (state.vinMode === 'manual') {
            if (!state.selectedMake) {
                document.getElementById('f-make-err').style.display = 'block';
                ok = false;
            }
            if (!state.selectedModel) {
                document.getElementById('f-model-err').style.display = 'block';
                ok = false;
            }
            if (!state.selectedYear) {
                document.getElementById('f-year-err').style.display = 'block';
                ok = false;
            }
        } else {
            if (!state.selectedYear || !state.selectedMake || !state.selectedModel) {
                document.getElementById('f-vin').classList.add('has-error');
                ok = false;
            }
        }
    }

    if (n === 2) {
        if (!state.category) { ok = false; alert('Please select a service category.'); }
    }

    if (n === 3) {
        if (state.services.length === 0) {
            ok = false;
            alert('Please select at least one service.');
        } else if (categoryHasEstimate(state.category)) {
            // Make sure every selected service has its required
            // configurator options filled in before moving on.
            const incomplete = getIncompleteServices();
            if (incomplete.length > 0) {
                ok = false;
                alert(`Please finish configuring: ${incomplete.join(', ')}`);
            }
        }
    }

    if (n === 4) {
        clearErrors('f-address', 'f-date', 'f-time');
        if (state.locationType !== DROP_OFF_LOCATION && !document.getElementById('serviceAddress').value.trim()) setError('f-address');
        if (!document.getElementById('preferredDate').value) setError('f-date');
        if (!document.getElementById('preferredTime').value) setError('f-time');
        if (!state.locationType) {
            ok = false;
            alert('Please select a service location type.');
        }
    }

    if (n === 5) {
        clearErrors('f-fname', 'f-lname', 'f-phone');
        if (!document.getElementById('contactFirst').value.trim()) setError('f-fname');
        if (!document.getElementById('contactLast').value.trim()) setError('f-lname');
        const ph = document.getElementById('contactPhone').value.replace(/\D/g, '');
        if (ph.length < 10) setError('f-phone');
    }

    return ok;
}

// isServiceConfigComplete() lives in configurator.js — the server-side
// price check needs it too.

// ── NAVIGATION ──
function goToStep(n) {
    document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById('step-' + n);
    if (panel) panel.classList.add('active');

    document.querySelectorAll('.progress-step').forEach(s => {
        const sn = parseInt(s.dataset.step);
        s.classList.remove('active', 'done');
        if (sn === n) s.classList.add('active');
        else if (sn < n) s.classList.add('done');
    });

    for (let i = 1; i <= 5; i++) {
        const conn = document.getElementById('conn-' + i);
        if (conn) conn.classList.toggle('done', i < n);
    }

    state.step = n;
    if (n > state.maxReached) state.maxReached = n;
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (n === 3) buildServiceOptions();
    if (n === 4 && typeof initCalendar === 'function') initCalendar();
    if (n === 6) buildConfirmSummary();
}

function nextStep(current) {
    if (!validateStep(current)) return;
    goToStep(current + 1);
}

function prevStep(current) {
    goToStep(current - 1);
}

function jumpToStep(n) {
    if (n <= state.maxReached) goToStep(n);
}

// ── CONFIRM SUMMARY (Step 6) ──
function buildConfirmSummary() {
    let veh = '';
    if (state.vinMode === 'manual') {
        veh = [state.selectedYear, state.selectedMake, state.selectedModel].filter(Boolean).join(' ');
    } else {
        const vin = document.getElementById('vehicleVIN').value.trim();
        veh = 'VIN: ' + vin;
    }

    const dt = document.getElementById('preferredDate').value;
    const dtFormatted = dt ? new Date(dt + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';
    const tm = document.getElementById('preferredTime').value;
    const addr = serviceAddressText();
    const fn = document.getElementById('contactFirst').value.trim();
    const ln = document.getElementById('contactLast').value.trim();
    const ph = document.getElementById('contactPhone').value.trim();
    const em = document.getElementById('contactEmail').value.trim();
    const notes = document.getElementById('contactNotes').value.trim();
    const firstTime = document.getElementById('firstTime').value;
    const hear = document.getElementById('hearAbout').value;

    document.getElementById('confirmSummary').innerHTML = `
      <div class="confirm-section">
        <div class="confirm-section-label">Vehicle</div>
        <div class="confirm-row"><span class="confirm-row-key">Vehicle</span><span class="confirm-row-val">${veh || '—'}</span></div>
        <button class="confirm-edit" onclick="goToStep(1)">Edit vehicle</button>
      </div>
      <div class="confirm-section">
        <div class="confirm-section-label">Service</div>
        <div class="confirm-row"><span class="confirm-row-key">Category</span><span class="confirm-row-val">${state.category}</span></div>
        <div class="confirm-row"><span class="confirm-row-key">Services</span><span class="confirm-row-val">${state.services.join(', ')}</span></div>
        <button class="confirm-edit" onclick="goToStep(2)">Edit service</button>
      </div>
      <div class="confirm-section">
        <div class="confirm-section-label">Logistics</div>
        <div class="confirm-row"><span class="confirm-row-key">Location type</span><span class="confirm-row-val">${state.locationType === DROP_OFF_LOCATION ? 'Bring it to us (drop-off)' : state.locationType}</span></div>
        <div class="confirm-row"><span class="confirm-row-key">Address</span><span class="confirm-row-val">${addr}</span></div>
        <div class="confirm-row"><span class="confirm-row-key">Date</span><span class="confirm-row-val">${dtFormatted}</span></div>
        <div class="confirm-row"><span class="confirm-row-key">Time window</span><span class="confirm-row-val">${tm}</span></div>
        ${firstTime === 'yes' ? '<div class="confirm-row"><span class="confirm-row-key">First-time customer</span><span class="confirm-row-val" style="color:var(--red)">Yes — discounts apply</span></div>' : ''}
        <button class="confirm-edit" onclick="goToStep(4)">Edit logistics</button>
      </div>
      <div class="confirm-section">
        <div class="confirm-section-label">Contact</div>
        <div class="confirm-row"><span class="confirm-row-key">Name</span><span class="confirm-row-val">${fn} ${ln}</span></div>
        <div class="confirm-row"><span class="confirm-row-key">Phone</span><span class="confirm-row-val">${ph}</span></div>
        ${em ? `<div class="confirm-row"><span class="confirm-row-key">Email</span><span class="confirm-row-val">${em}</span></div>` : ''}
        ${hear ? `<div class="confirm-row"><span class="confirm-row-key">Heard via</span><span class="confirm-row-val">${hear}</span></div>` : ''}
        ${notes ? `<div class="confirm-row" style="flex-direction:column;gap:6px"><span class="confirm-row-key">Notes</span><span class="confirm-row-val" style="text-align:left;color:var(--text);font-weight:400">${notes}</span></div>` : ''}
        <button class="confirm-edit" onclick="goToStep(5)">Edit contact</button>
      </div>
    `;

    // Recompute first so the invoice reflects the current discount code
    // even if services changed since it was applied.
    refreshConfiguratorAndEstimate();
    buildInvoicePreview();
    renderDiscountBox();
}

// ── INVOICE PREVIEW (Step 6, Automotive + Detailing) ──
function buildInvoicePreview() {
    const el = document.getElementById('invoicePreview');
    if (!el) return;

    if (!categoryHasEstimate(state.category) || !state.lastEstimate) {
        el.innerHTML = '';
        el.style.display = 'none';
        return;
    }

    const estimate = state.lastEstimate;
    el.style.display = 'block';

    let rows = '';
    estimate.lineItems.forEach(li => {
        rows += `
            <div class="confirm-row">
                <span class="confirm-row-key">${li.label}${li.qty > 1 ? ` × ${li.qty}` : ''}</span>
                <span class="confirm-row-val">$${li.lineTotal.toFixed(2)}</span>
            </div>
        `;
    });
    estimate.laborItems.forEach(li => {
        rows += `
            <div class="confirm-row">
                <span class="confirm-row-key">${li.label}</span>
                <span class="confirm-row-val">${formatEstimateLinePrice(li)}</span>
            </div>
        `;
    });

    el.innerHTML = `
        <div class="confirm-section-label">Estimated Invoice</div>
        ${rows}
        <div class="confirm-row" style="border-top:1px solid var(--border);margin-top:10px;padding-top:10px">
            <span class="confirm-row-key">Subtotal</span>
            <span class="confirm-row-val">$${estimate.subtotal.toFixed(2)}</span>
        </div>
        ${estimate.discountAmount > 0 ? `<div class="confirm-row">
            <span class="confirm-row-key">Discount (${estimate.discount.code} — ${estimate.discount.label})</span>
            <span class="confirm-row-val" style="color:#4ADE80">−$${estimate.discountAmount.toFixed(2)}</span>
        </div>` : ''}
        <div class="confirm-row">
            <span class="confirm-row-key">${formatTaxLabel()}</span>
            <span class="confirm-row-val">$${estimate.tax.toFixed(2)}</span>
        </div>
        <div class="confirm-row" style="font-weight:700;font-size:16px">
            <span class="confirm-row-key">Total Estimate</span>
            <span class="confirm-row-val">${formatEstimateTotal(estimate)}</span>
        </div>
        ${estimate.kind === 'detailing' ? `<div class="confirm-row"><span class="confirm-row-key">Time on site</span><span class="confirm-row-val">${formatDetailingDuration(estimate.totalHours)}</span></div>` : ''}
        ${estimate.hasQuoteItems ? '<p style="font-size:12px;color:var(--silver-dim);margin-top:10px">Quoted items aren\'t in this total — we\'ll price them on site before any work starts.</p>' : ''}
        ${estimate.vehicle.isEstimateSpecs ? '<p style="font-size:12px;color:var(--silver-dim);margin-top:10px">Some figures are estimated — final pricing confirmed on site.</p>' : ''}
    `;

    document.getElementById('invoiceData').value = JSON.stringify(buildAdminPayload());
}

function buildBookingSubmission() {
    const vinMode = state.vinMode;

    const vehicle = vinMode === 'manual'
        ? {
            vinMode,
            make: state.selectedMake,
            model: state.selectedModel,
            year: state.selectedYear,
            // Not asked any more — taken from the model's size class in vehicle-data.js.
            vehicleType: dtSizeLabel(getVehicleSizeClass())
        }
        : {
            vinMode,
            vin: document.getElementById('vehicleVIN').value.trim(),
            make: state.selectedMake,
            model: state.selectedModel,
            year: state.selectedYear,
            vehicleType: state.selectedType
        };

    // Attach specs snapshot if Automotive (mirrors buildAdminPayload's vehicle block)
    if (state.category === 'Automotive' && state.lastEstimate) {
        vehicle.specs = state.lastEstimate.vehicle.specs;
        vehicle.isEstimateSpecs = state.lastEstimate.vehicle.isEstimateSpecs;
    }

    const hasEstimate = categoryHasEstimate(state.category);
    const adminPayload = hasEstimate ? (state.adminPayload || buildAdminPayload()) : null;

    return {
        vehicle,
        category: state.category,
        services: state.services,
        discountCode: state.discount ? state.discount.code : '',
        selections: state.selectedParts,
        serviceNotes: adminPayload?.serviceNotes || {},
        parts: adminPayload?.parts || [],
        labor: adminPayload?.labor || [],
        toolsNeeded: adminPayload?.toolsNeeded || [],
        pricing: adminPayload?.pricing || null,
        flags: adminPayload?.flags || null,

        locationType: state.locationType,
        // The server fills in our address for a drop-off.
        serviceAddress: state.locationType === DROP_OFF_LOCATION ? '' : document.getElementById('serviceAddress').value.trim(),
        preferredDate: document.getElementById('preferredDate').value,
        preferredTime: document.getElementById('preferredTime').value,
        firstTimeCustomer: document.getElementById('firstTime').value === 'yes',

        contact: {
            firstName: document.getElementById('contactFirst').value.trim(),
            lastName: document.getElementById('contactLast').value.trim(),
            phone: document.getElementById('contactPhone').value.trim(),
            email: document.getElementById('contactEmail').value.trim()
        },
        notes: document.getElementById('contactNotes').value.trim(),
        hearAbout: document.getElementById('hearAbout').value
    };
}

async function submitBooking() {
    const btn = document.querySelector('#step-6 .btn-primary');
    const errEl = document.getElementById('submitError');
    if (errEl) errEl.style.display = 'none';

    const payload = buildBookingSubmission();

    if (btn) {
        btn.disabled = true;
        btn.dataset.originalText = btn.innerHTML;
        btn.innerHTML = 'Submitting…';
    }

    try {
        const res = await fetch('/api/booking', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            const errBody = await res.json().catch(() => ({}));
            if (errBody.slotTaken) {
                // Someone else's booking was confirmed for this window
                // while this page was open (or the job is too long for
                // it). Back to the calendar, with fresh availability.
                goToStep(4);
                if (typeof refreshCalendarAvailability === 'function') refreshCalendarAvailability();
                alert(errBody.error);
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = btn.dataset.originalText;
                }
                return;
            }
            if (errBody.discountInvalid) {
                // The code stopped being valid between "Apply" and submit
                // (expired, hit its limit…). Drop it, show the real
                // price, and let the customer decide whether to continue.
                removeDiscountCode(`${errBody.error} It's been removed — check the updated total, then confirm again.`);
                document.getElementById('discountBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = btn.dataset.originalText;
                }
                return;
            }
            // 400s carry a specific, fixable reason — show it as-is.
            if ((res.status === 400 || res.status === 429) && errBody.error) {
                if (errEl) {
                    errEl.textContent = errBody.error;
                    errEl.style.display = 'block';
                } else {
                    alert(errBody.error);
                }
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = btn.dataset.originalText;
                }
                return;
            }
            throw new Error(errBody.error || 'Submission failed');
        }

        const result = await res.json().catch(() => ({}));
        document.getElementById('invoiceData').value = JSON.stringify(payload);

        const emailNote = document.getElementById('successEmailNote');
        if (emailNote) emailNote.style.display = result.emailed ? '' : 'none';

        document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
        document.getElementById('step-success').classList.add('active');
        document.getElementById('progressBar').style.opacity = '0.3';
        window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err) {
        console.error(err);
        if (errEl) {
            errEl.textContent = "Something went wrong submitting your booking. Please try again, or call us directly at 732-647-8703.";
            errEl.style.display = 'block';
        } else {
            alert("Something went wrong submitting your booking. Please try again, or call us directly at 732-647-8703.");
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = btn.dataset.originalText;
        }
    }
}

// ── VIN LOOKUP ──
async function lookupVIN() {
    const vin = document.getElementById("vehicleVIN").value.trim().toUpperCase();

    if (vin.length !== 17) {
        alert("Please enter a valid 17-character VIN.");
        return;
    }

    const status = document.getElementById("vinLookupStatus");
    const card = document.getElementById("vinDecodedCard");

    status.innerHTML = '<span style="color:var(--silver-dim);font-size:13px">Looking up VIN…</span>';
    card.style.display = 'none';

    try {
        const res = await fetch(`/api/vin/${vin}`);
        if (!res.ok) throw new Error('Bad response');

        const data = await res.json();

        state.cachedSpecs = null;
        state.cachedSpecsKey = '';

        // The server returns the site's own spelling of the make and model
        // whenever the vehicle is in our list, so saved specs and the size
        // class match. Re-casing them here ("BMW" -> "Bmw") used to break that.
        state.selectedYear = data.year;
        state.selectedMake = data.make;
        state.selectedModel = data.model;
        state.selectedType = data.vehicleType;

        fetchAndCacheSpecs();
        document.getElementById("vinYear").textContent = data.year || "—";
        document.getElementById("vinMake").textContent = data.make || "—";
        document.getElementById("vinModel").textContent = data.model || "—";
        document.getElementById("vinEngine").textContent = data.engine || "—";

        status.innerHTML = '';
        card.style.display = 'block';

        updateSidebar();

    } catch (err) {
        status.innerHTML = '<div class="field-error" style="display:block">VIN lookup failed. Check the number and try again.</div>';
    }
}

function getMakes() {
    return Object.keys(VEHICLE_DATA);
}

function getModels(make) {
    return Object.keys(VEHICLE_DATA[make] || {});
}

function getYears(make, model) {
    return VEHICLE_DATA[make]?.[model] || [];
}

// ── VEHICLE SPECS (Mongo-backed, fetched on vehicle selection) ──
function currentSpecsKey() {
    return [state.selectedMake, state.selectedModel, state.selectedYear].join('|');
}

async function fetchAndCacheSpecs() {
    const make = state.selectedMake;
    const model = state.selectedModel;
    const year = state.selectedYear;

    if (!make || !model || !year) {
        state.cachedSpecs = null;
        state.cachedSpecsKey = '';
        return;
    }

    const key = currentSpecsKey();
    if (state.cachedSpecsKey === key && !state.specsFetchInFlight) {
        return;
    }

    state.cachedSpecsKey = key;
    state.cachedSpecs = null;
    state.specsFetchInFlight = true;

    try {
        const params = 'make=' + encodeURIComponent(make) +
            '&model=' + encodeURIComponent(model) +
            '&year=' + encodeURIComponent(year);
        const res = await fetch('/api/vehicle-specs?' + params);
        if (res.ok) {
            const data = await res.json();
            if (state.cachedSpecsKey === key) {
                state.cachedSpecs = data.spec || null;
            }
        }
    } catch (err) {
        console.error('Spec fetch failed:', err);
    }

    state.specsFetchInFlight = false;

    if (state.step >= 3 && state.category === 'Automotive') {
        buildServiceOptions();
    }
    updateSidebar();
}

function getVehicleSpecs() {
    if (!state.cachedSpecs) return null;
    if (state.cachedSpecsKey !== currentSpecsKey()) return null;
    return state.cachedSpecs;
}