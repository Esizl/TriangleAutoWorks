(function () {
  'use strict';

  // Viscosity grades grouped by real-world use case, purely for a
  // cleaner admin display/editing experience. This grouping has NO
  // effect on booking-time compatibility matching — the configurator
  // still checks the raw viscosities array for an exact match against
  // the vehicle's recommended grade. This is presentation only.
  const VISCOSITY_GROUPS = [
    { key: 'popular', label: 'Popular', options: ['0W-16', '0W-20', '0W-30', '5W-20', '5W-30', '5W-40', '10W-30', '10W-40'] },
    { key: 'racecar', label: 'Race Car', options: ['0W-40', '0W-50', '5W-50', '10W-60'] },
    { key: 'heavyduty', label: 'Diesel', options: ['15W-40', '15W-50', '20W-50'] },
    { key: 'ultrathin', label: 'Ultra-Thin', options: ['0W-8'] },
  ];

  // A product touching 3+ of the groups above is effectively "stocked
  // in nearly everything" — collapsing that to one neutral pill instead
  // of stacking every matching colored pill keeps the table readable.
  // The full raw list is still available on hover.
  const ALL_AROUND_GROUP_THRESHOLD = 3;

  function formatViscosities(list) {
    if (!list || list.length === 0) return '<span class="visc-pill visc-pill-any">Any</span>';

    const matchedGroups = VISCOSITY_GROUPS.filter(group => {
      const matchCount = list.filter(v => group.options.includes(v)).length;
      if (matchCount === 0) return false;
      // "Popular" is a large group (8 grades) — require a real majority
      // before tagging it, so one stray popular grade on an otherwise
      // narrow product doesn't earn the pill. Small groups: any match counts.
      if (group.key === 'popular' && matchCount < 2) return false;
      return true;
    });

    const fullListText = list.join(', ');

    if (matchedGroups.length >= ALL_AROUND_GROUP_THRESHOLD) {
      return `<span class="visc-pill visc-pill-all" title="${escapeHtml(fullListText)}">All-Around</span>`;
    }

    if (matchedGroups.length === 0) {
      // Didn't clear any group's threshold (e.g. a single niche grade) —
      // just show what's actually there as a plain pill.
      return `<span class="visc-pill visc-pill-any" title="${escapeHtml(fullListText)}">${escapeHtml(fullListText)}</span>`;
    }

    return matchedGroups
      .map(g => `<span class="visc-pill visc-pill-${g.key}" title="${escapeHtml(fullListText)}">${escapeHtml(g.label)}</span>`)
      .join(' ');
  }

  // Each section describes: its table columns, and the form fields for
  // the add/edit modal. One generic render/CRUD flow drives all seven —
  // adding an eighth section later just means adding a config entry here.
  const SECTIONS = {
    'oil-products': {
      label: 'Oil Products',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'tier', label: 'Tier' },
        { key: 'quartPartNumber', label: 'Qt Part #' },
        { key: 'price', label: 'Price/qt', format: (v) => v != null ? `$${Number(v).toFixed(2)}` : '—' },
        { key: 'jugPrice', label: 'Jug Price', format: (v) => v != null ? `$${Number(v).toFixed(2)}` : '—' },
        { key: 'highMileage', label: 'High Mileage', format: (v) => v ? 'Yes' : 'No' },
        { key: 'viscosities', label: 'Viscosities', format: formatViscosities },
        { key: 'supplier', label: 'Supplier' },
      ],
      fields: [
        { key: 'name', label: 'Name (brand + grade)', type: 'text', required: true },
        { key: 'quartPartNumber', label: 'Quart Part Number', type: 'text' },
        { key: 'price', label: 'Per-quart price ($)', type: 'number', step: '0.01' },
        { key: 'jugPartNumber', label: 'Jug (5qt) Part Number', type: 'text' },
        { key: 'jugPrice', label: '5-quart jug price ($)', type: 'number', step: '0.01' },
        { key: 'supplier', label: 'Supplier key', type: 'text', hint: 'Must match a key from the Suppliers tab.' },
        { key: 'url', label: 'Product URL', type: 'text' },
        { key: 'oilCategory', label: 'Oil Category', type: 'select', options: ['', 'Conventional', 'Synthetic'] },
        { key: 'tier', label: 'Tier', type: 'select', options: ['', 'budget', 'premium'] },
        { key: 'includesFreeFilter', label: 'Includes free filter with jug?', type: 'select', options: ['false', 'true'], boolValue: true },
        { key: 'highMileage', label: 'High-mileage formula (75k+)?', type: 'select', options: ['false', 'true'], boolValue: true },
        { key: 'viscosities', label: 'Available Viscosities', type: 'checklist', groups: VISCOSITY_GROUPS, hint: 'Leave all unchecked to offer this product regardless of the vehicle\'s recommended viscosity.' },
      ],
    },
    'filter-brands': {
      label: 'Filter Brands',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'price', label: 'Price', format: (v) => `$${Number(v).toFixed(2)}` },
        { key: 'supplier', label: 'Supplier' },
        { key: 'compatibleMakes', label: 'Restricted to', format: (v) => (v && v.length ? v.join(', ') : 'Universal') },
      ],
      fields: [
        { key: 'name', label: 'Brand Name', type: 'text', required: true },
        { key: 'price', label: 'Price ($)', type: 'number', step: '0.01', required: true },
        { key: 'supplier', label: 'Supplier key', type: 'text' },
        { key: 'compatibleMakes', label: 'Compatible makes', type: 'text', listValue: true, hint: 'Comma-separated makes (e.g. Ford, Lincoln). Leave blank for universal / all makes.' },
      ],
    },
    'filter-overrides': {
      label: 'Filter Overrides',
      columns: [
        { key: 'brand', label: 'Brand' },
        { key: 'filterType', label: 'Type' },
        { key: 'make', label: 'Make' },
        { key: 'model', label: 'Model' },
        { key: 'year', label: 'Year', format: (v) => v != null ? v : 'All years' },
        { key: 'partNumber', label: 'Part #' },
      ],
      fields: [
        { key: 'brand', label: 'Filter Brand', type: 'text', required: true, hint: 'Must match a name from the Filter Brands tab.' },
        { key: 'filterType', label: 'Filter Type', type: 'select', options: ['oil', 'engine', 'cabin'], required: true },
        { key: 'make', label: 'Make', type: 'vehicle-make', required: true },
        { key: 'model', label: 'Model', type: 'vehicle-model', required: true },
        { key: 'year', label: 'Year (optional)', type: 'number', hint: 'Leave blank to apply to all years of this model.' },
        { key: 'partNumber', label: 'Part Number', type: 'text' },
        { key: 'price', label: 'Price override ($, optional)', type: 'number', step: '0.01' },
        { key: 'url', label: 'URL override (optional)', type: 'text' },
      ],
    },
    'brake-pads': {
      label: 'Brake Pads',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'price', label: 'Price (per axle set)', format: (v) => `$${Number(v).toFixed(2)}` },
        { key: 'supplier', label: 'Supplier' },
      ],
      fields: [
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'price', label: 'Price ($, per axle set)', type: 'number', step: '0.01', required: true },
        { key: 'supplier', label: 'Supplier key', type: 'text' },
      ],
    },
    rotors: {
      label: 'Rotors',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'price', label: 'Price (per axle pair)', format: (v) => `$${Number(v).toFixed(2)}` },
        { key: 'supplier', label: 'Supplier' },
      ],
      fields: [
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'price', label: 'Price ($, per axle pair)', type: 'number', step: '0.01', required: true },
        { key: 'supplier', label: 'Supplier key', type: 'text' },
      ],
    },
    'tire-services': {
      label: 'Tire Services',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'price', label: 'Price', format: (v) => `$${Number(v).toFixed(2)}` },
      ],
      fields: [
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'price', label: 'Price ($)', type: 'number', step: '0.01', required: true },
      ],
    },
    suppliers: {
      label: 'Suppliers',
      columns: [
        { key: 'key', label: 'Key' },
        { key: 'label', label: 'Display Name' },
        { key: 'baseUrl', label: 'Base URL' },
      ],
      fields: [
        { key: 'key', label: 'Key', type: 'text', required: true, hint: 'Referenced by the "Supplier key" field elsewhere — e.g. "rockauto".' },
        { key: 'label', label: 'Display Name', type: 'text', required: true },
        { key: 'baseUrl', label: 'Base URL', type: 'text', required: true },
      ],
    },
  };

  let currentSection = 'oil-products';
  let currentItems = [];

  const tabsEl = document.getElementById('tabs');
  const itemsHead = document.getElementById('itemsHead');
  const itemsBody = document.getElementById('itemsBody');
  const emptyState = document.getElementById('emptyState');
  const errorBanner = document.getElementById('errorBanner');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const modalTitle = document.getElementById('modalTitle');
  const formFields = document.getElementById('formFields');
  const itemForm = document.getElementById('itemForm');

  // Vehicle make/model data, embedded into the page by the server
  // (admin/parts.ejs sets window.VEHICLE_DATA before this script loads).
  // Falls back to {} so this file never throws if it's ever loaded
  // without that data being present.
  const VEHICLE_DATA = window.VEHICLE_DATA || {};

  function showError(message) {
    errorBanner.textContent = message;
    errorBanner.style.display = 'block';
  }

  function clearError() {
    errorBanner.style.display = 'none';
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  async function loadCatalog() {
    clearError();
    let res;
    try {
      res = await fetch('/admin/api/parts-catalog');
    } catch (networkErr) {
      showError('Could not reach the server. Check your connection.');
      return;
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showError(body.error || `Failed to load catalog (status ${res.status})`);
      return;
    }
    const catalog = await res.json();
    const fieldMap = {
      'oil-products': 'oilProducts',
      'filter-brands': 'filterBrands',
      'filter-overrides': 'filterOverrides',
      'brake-pads': 'brakePadTypes',
      rotors: 'rotorOptions',
      'tire-services': 'tireServiceTypes',
      suppliers: 'suppliers',
    };
    currentItems = catalog[fieldMap[currentSection]] || [];
    renderTable();
  }

  function renderTabs() {
    tabsEl.innerHTML = '';
    Object.entries(SECTIONS).forEach(([key, config]) => {
      const btn = document.createElement('button');
      btn.className = 'tab' + (key === currentSection ? ' active' : '');
      btn.dataset.section = key;
      btn.textContent = config.label;
      tabsEl.appendChild(btn);
    });
  }

  function renderTable() {
    const config = SECTIONS[currentSection];

    itemsHead.innerHTML = `<tr>${config.columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}<th></th></tr>`;
    itemsBody.innerHTML = '';

    if (currentItems.length === 0) {
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    for (const item of currentItems) {
      const tr = document.createElement('tr');
      tr.dataset.itemId = item._id;

      const cells = config.columns.map(c => {
        const raw = item[c.key];
        const display = c.format ? c.format(raw) : escapeHtml(raw);
        return `<td data-label="${escapeHtml(c.label)}">${display}</td>`;
      }).join('');

      tr.innerHTML = `
        ${cells}
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-action="edit-item" data-id="${item._id}" aria-label="Edit">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
            </button>
            <button class="icon-btn" data-action="delete-item" data-id="${item._id}" aria-label="Delete">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </td>
      `;
      itemsBody.appendChild(tr);
    }
  }

  // Build the <option> list for every make in VEHICLE_DATA, alphabetized.
  function makeOptionsHtml(currentVal) {
    const makes = Object.keys(VEHICLE_DATA).sort((a, b) => a.localeCompare(b));
    const opts = makes.map(m =>
      `<option value="${escapeHtml(m)}" ${m === currentVal ? 'selected' : ''}>${escapeHtml(m)}</option>`
    ).join('');
    return `<option value="">Select Make</option>${opts}`;
  }

  // Build the <option> list for every model under a given make, alphabetized.
  function modelOptionsHtml(make, currentVal) {
    const models = (make && VEHICLE_DATA[make])
      ? Object.keys(VEHICLE_DATA[make]).sort((a, b) => a.localeCompare(b))
      : [];
    const opts = models.map(m =>
      `<option value="${escapeHtml(m)}" ${m === currentVal ? 'selected' : ''}>${escapeHtml(m)}</option>`
    ).join('');
    return `<option value="">${make ? 'Select Model' : 'Select a make first'}</option>${opts}`;
  }

  // Wired up after the form renders — when Make changes, repopulate the
  // Model select from scratch (previous model selection is cleared,
  // since it almost certainly doesn't belong to the new make).
  function bindMakeModelCascade() {
    const makeEl = document.getElementById('f_make');
    const modelEl = document.getElementById('f_model');
    if (!makeEl || !modelEl) return;

    makeEl.addEventListener('change', () => {
      modelEl.innerHTML = modelOptionsHtml(makeEl.value, '');
    });
  }

  // Renders a checklist field. If f.groups is present, checkboxes are
  // organized under subheadings (used for viscosities); otherwise falls
  // back to a flat list of f.options for any future ungrouped checklist.
  function renderChecklistField(f, fieldId, currentVals) {
    const groups = f.groups || [{ label: null, options: f.options || [] }];

    const groupsHtml = groups.map((g, gi) => {
      const boxes = g.options.map((opt, i) => {
        const boxId = `${fieldId}_g${gi}_${i}`;
        const checked = currentVals.includes(opt) ? 'checked' : '';
        return `
          <label class="checklist-option" for="${boxId}">
            <input type="checkbox" id="${boxId}" data-checklist="${fieldId}" value="${escapeHtml(opt)}" ${checked}>
            <span>${escapeHtml(opt)}</span>
          </label>
        `;
      }).join('');

      return `
        <div class="checklist-subgroup">
          ${g.label ? `<div class="checklist-subgroup-label">${escapeHtml(g.label)}</div>` : ''}
          <div class="checklist-subgroup-boxes">${boxes}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="field">
        <label>${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>
        <div class="checklist-group" id="${fieldId}">${groupsHtml}</div>
        ${f.hint ? `<div class="field-hint">${escapeHtml(f.hint)}</div>` : ''}
      </div>
    `;
  }

  function renderFormFields(item) {
    const config = SECTIONS[currentSection];
    formFields.innerHTML = config.fields.map(f => {
      const rawVal = item ? item[f.key] : undefined;
      const fieldId = 'f_' + f.key;

      if (f.type === 'vehicle-make') {
        const currentVal = item ? item[f.key] : '';
        return `<div class="field"><label for="${fieldId}">${escapeHtml(f.label)}${f.required ? ' *' : ''}</label><select id="${fieldId}">${makeOptionsHtml(currentVal)}</select></div>`;
      }

      if (f.type === 'vehicle-model') {
        const currentMake = item ? item.make : '';
        const currentVal = item ? item[f.key] : '';
        return `<div class="field"><label for="${fieldId}">${escapeHtml(f.label)}${f.required ? ' *' : ''}</label><select id="${fieldId}">${modelOptionsHtml(currentMake, currentVal)}</select></div>`;
      }

      if (f.type === 'checklist') {
        const currentVals = (item && Array.isArray(rawVal)) ? rawVal : [];
        return renderChecklistField(f, fieldId, currentVals);
      }

      if (f.type === 'select') {
        const currentVal = item
          ? (f.boolValue ? String(!!rawVal) : (rawVal ?? ''))
          : (f.options[0] ?? '');
        const options = f.options.map(opt =>
          `<option value="${escapeHtml(opt)}" ${opt === currentVal ? 'selected' : ''}>${opt === '' ? '(none)' : escapeHtml(opt)}</option>`
        ).join('');
        return `<div class="field"><label for="${fieldId}">${escapeHtml(f.label)}</label><select id="${fieldId}">${options}</select></div>`;
      }

      let displayVal = rawVal;
      if (f.listValue && Array.isArray(rawVal)) displayVal = rawVal.join(', ');
      if (displayVal == null) displayVal = '';

      return `
        <div class="field">
          <label for="${fieldId}">${escapeHtml(f.label)}${f.required ? ' *' : ''}</label>
          <input type="${f.type}" id="${fieldId}" value="${escapeHtml(displayVal)}" ${f.step ? `step="${f.step}"` : ''} ${f.required ? 'required' : ''}>
          ${f.hint ? `<div class="field-hint">${escapeHtml(f.hint)}</div>` : ''}
        </div>
      `;
    }).join('');

    bindMakeModelCascade();
  }

  function openModal(item) {
    document.getElementById('itemId').value = item ? item._id : '';
    modalTitle.textContent = item ? 'Edit Entry' : 'Add Entry';
    renderFormFields(item);
    modalBackdrop.classList.add('open');
  }

  function closeModal() {
    modalBackdrop.classList.remove('open');
  }

  function collectFormPayload() {
    const config = SECTIONS[currentSection];
    const payload = {};
    for (const f of config.fields) {
      const fieldId = 'f_' + f.key;

      if (f.type === 'checklist') {
        const checked = document.querySelectorAll(`input[data-checklist="${fieldId}"]:checked`);
        payload[f.key] = Array.from(checked).map(el => el.value);
        continue;
      }

      const el = document.getElementById(fieldId);
      let value = el.value;

      if (f.type === 'number') {
        value = value === '' ? null : parseFloat(value);
      } else if (f.type === 'select' && f.boolValue) {
        value = value === 'true';
      } else if (f.listValue) {
        value = value.split(',').map(s => s.trim()).filter(Boolean);
      } else if (value === '') {
        value = null;
      }

      payload[f.key] = value;
    }
    return payload;
  }

  async function saveItem(e) {
    e.preventDefault();
    clearError();

    const id = document.getElementById('itemId').value;
    const payload = collectFormPayload();
    const url = id
      ? `/admin/api/parts-catalog/${currentSection}/${id}`
      : `/admin/api/parts-catalog/${currentSection}`;
    const method = id ? 'PUT' : 'POST';

    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (networkErr) {
      showError('Could not reach the server. Entry was not saved.');
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showError(body.error || 'Failed to save entry.');
      return;
    }

    closeModal();
    loadCatalog();
  }

  async function deleteItem(id) {
    if (!window.confirm('Delete this entry? This cannot be undone.')) return;
    clearError();

    let res;
    try {
      res = await fetch(`/admin/api/parts-catalog/${currentSection}/${id}`, { method: 'DELETE' });
    } catch (networkErr) {
      showError('Could not reach the server. Entry was not deleted.');
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showError(body.error || 'Failed to delete entry.');
      return;
    }

    loadCatalog();
  }

  document.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-section]');
    if (tab) {
      currentSection = tab.dataset.section;
      renderTabs();
      loadCatalog();
      return;
    }

    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;

    const action = actionEl.dataset.action;
    if (action === 'open-add-modal') {
      openModal(null);
    } else if (action === 'close-modal') {
      closeModal();
    } else if (action === 'edit-item') {
      const item = currentItems.find(i => i._id === actionEl.dataset.id);
      if (item) openModal(item);
    } else if (action === 'delete-item') {
      deleteItem(actionEl.dataset.id);
    }
  });

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  itemForm.addEventListener('submit', saveItem);

  renderTabs();
  loadCatalog();
})();