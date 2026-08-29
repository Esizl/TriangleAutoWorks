(function () {
  'use strict';

  // Each section describes: its table columns, and the form fields for
  // the add/edit modal. One generic render/CRUD flow drives all seven —
  // adding an eighth section later just means adding a config entry here.
  const SECTIONS = {
    'oil-products': {
      label: 'Oil Products',
      columns: [
        { key: 'name', label: 'Name' },
        { key: 'tier', label: 'Tier' },
        { key: 'price', label: 'Price/qt', format: (v) => v != null ? `$${Number(v).toFixed(2)}` : '—' },
        { key: 'jugPrice', label: 'Jug Price', format: (v) => v != null ? `$${Number(v).toFixed(2)}` : '—' },
        { key: 'supplier', label: 'Supplier' },
      ],
      fields: [
        { key: 'name', label: 'Name (brand + grade)', type: 'text', required: true },
        { key: 'partNumber', label: 'Part Number', type: 'text' },
        { key: 'price', label: 'Per-quart price ($)', type: 'number', step: '0.01' },
        { key: 'jugPrice', label: '5-quart jug price ($)', type: 'number', step: '0.01' },
        { key: 'supplier', label: 'Supplier key', type: 'text', hint: 'Must match a key from the Suppliers tab.' },
        { key: 'url', label: 'Product URL', type: 'text' },
        { key: 'oilCategory', label: 'Oil Category', type: 'select', options: ['', 'Conventional', 'Synthetic'] },
        { key: 'tier', label: 'Tier', type: 'select', options: ['', 'budget', 'premium'] },
        { key: 'includesFreeFilter', label: 'Includes free filter with jug?', type: 'select', options: ['false', 'true'], boolValue: true },
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
        { key: 'make', label: 'Make' },
        { key: 'model', label: 'Model' },
        { key: 'year', label: 'Year', format: (v) => v != null ? v : 'All years' },
        { key: 'partNumber', label: 'Part #' },
      ],
      fields: [
        { key: 'brand', label: 'Filter Brand', type: 'text', required: true, hint: 'Must match a name from the Filter Brands tab.' },
        { key: 'make', label: 'Make', type: 'text', required: true },
        { key: 'model', label: 'Model', type: 'text', required: true },
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

  function renderFormFields(item) {
    const config = SECTIONS[currentSection];
    formFields.innerHTML = config.fields.map(f => {
      const rawVal = item ? item[f.key] : undefined;
      const fieldId = 'f_' + f.key;

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
      const el = document.getElementById('f_' + f.key);
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
