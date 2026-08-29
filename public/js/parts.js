(function () {
  'use strict';

  const partsBody = document.getElementById('partsBody');
  const emptyState = document.getElementById('emptyState');
  const errorBanner = document.getElementById('errorBanner');
  const searchInput = document.getElementById('searchInput');
  const categoryFilter = document.getElementById('categoryFilter');
  const modalBackdrop = document.getElementById('partModalBackdrop');
  const partForm = document.getElementById('partForm');
  const modalTitle = document.getElementById('modalTitle');

  let currentParts = [];
  let searchDebounce = null;

  function showError(message) {
    errorBanner.textContent = message;
    errorBanner.style.display = 'block';
  }

  function clearError() {
    errorBanner.style.display = 'none';
    errorBanner.textContent = '';
  }

  async function fetchParts() {
    clearError();
    const params = new URLSearchParams();
    if (searchInput.value.trim()) params.set('q', searchInput.value.trim());
    if (categoryFilter.value) params.set('category', categoryFilter.value);

    let res;
    try {
      res = await fetch('/api/parts?' + params.toString());
    } catch (networkErr) {
      // Loud failure: a network error is shown, not swallowed into an
      // empty table that looks like "no parts exist".
      showError('Could not reach the server. Check your connection and try again.');
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showError(body.error || `Failed to load parts (status ${res.status})`);
      return;
    }

    currentParts = await res.json();
    renderTable();
  }

  function renderTable() {
    partsBody.innerHTML = '';

    if (currentParts.length === 0) {
      emptyState.style.display = 'block';
      return;
    }
    emptyState.style.display = 'none';

    for (const part of currentParts) {
      const tr = document.createElement('tr');
      tr.dataset.partId = part._id;

      tr.innerHTML = `
        <td data-label="Part #">${escapeHtml(part.partNumber)}</td>
        <td data-label="Name">${escapeHtml(part.name)}</td>
        <td data-label="Category">${escapeHtml(part.category)}</td>
        <td data-label="Price">$${Number(part.price).toFixed(2)}</td>
        <td data-label="Stock">
          <span class="badge ${part.inStock ? 'badge-in' : 'badge-out'}">
            ${part.inStock ? 'In stock' : 'Out of stock'}
          </span>
        </td>
        <td>
          <div class="row-actions">
            <button class="icon-btn" data-action="edit-part" data-id="${part._id}" aria-label="Edit part">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
              </svg>
            </button>
            <button class="icon-btn" data-action="delete-part" data-id="${part._id}" aria-label="Delete part">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </td>
      `;
      partsBody.appendChild(tr);
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function openModal(part) {
    partForm.reset();
    document.getElementById('partId').value = part ? part._id : '';
    modalTitle.textContent = part ? 'Edit Part' : 'Add Part';

    if (part) {
      document.getElementById('partNumber').value = part.partNumber || '';
      document.getElementById('brand').value = part.brand || '';
      document.getElementById('name').value = part.name || '';
      document.getElementById('category').value = part.category || 'Other';
      document.getElementById('price').value = part.price != null ? part.price : '';
      document.getElementById('inStock').value = String(part.inStock !== false);
      document.getElementById('notes').value = part.notes || '';
    }

    modalBackdrop.classList.add('open');
  }

  function closeModal() {
    modalBackdrop.classList.remove('open');
  }

  async function savePart(e) {
    e.preventDefault();
    clearError();

    const id = document.getElementById('partId').value;
    const payload = {
      partNumber: document.getElementById('partNumber').value.trim(),
      brand: document.getElementById('brand').value.trim(),
      name: document.getElementById('name').value.trim(),
      category: document.getElementById('category').value,
      price: parseFloat(document.getElementById('price').value),
      inStock: document.getElementById('inStock').value === 'true',
      notes: document.getElementById('notes').value.trim(),
    };

    const url = id ? `/api/parts/${id}` : '/api/parts';
    const method = id ? 'PUT' : 'POST';

    let res;
    try {
      res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (networkErr) {
      showError('Could not reach the server. The part was not saved.');
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showError(body.error || 'Failed to save part.');
      return; // modal stays open, nothing is silently lost
    }

    closeModal();
    fetchParts();
  }

  async function deletePart(id) {
    if (!window.confirm('Delete this part? This cannot be undone.')) return;
    clearError();

    let res;
    try {
      res = await fetch(`/api/parts/${id}`, { method: 'DELETE' });
    } catch (networkErr) {
      showError('Could not reach the server. The part was not deleted.');
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showError(body.error || 'Failed to delete part.');
      return;
    }

    fetchParts();
  }

  // Event delegation, all via data-action — no inline on* handlers anywhere.
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const action = target.dataset.action;
    if (action === 'open-add-modal') {
      openModal(null);
    } else if (action === 'close-modal') {
      closeModal();
    } else if (action === 'edit-part') {
      const part = currentParts.find((p) => p._id === target.dataset.id);
      if (part) openModal(part);
    } else if (action === 'delete-part') {
      deletePart(target.dataset.id);
    }
  });

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeModal();
  });

  partForm.addEventListener('submit', savePart);

  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(fetchParts, 250);
  });

  categoryFilter.addEventListener('change', fetchParts);

  fetchParts();
})();
