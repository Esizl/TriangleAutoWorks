/**
 * calendarAvailability.js
 * -----------------------------------------------------------------------
 * Replaces the plain <input type="date"> and <select> in Step 4
 * (Logistics) with a month-grid calendar + clickable time-window pills,
 * matching the picker-chip / location-card visual language already used
 * elsewhere in the booking flow.
 *
 * Behavior:
 *  - Fetches /api/availability for the visible month range.
 *  - A day is only visually "restricted" (amber tint + dot) if it has
 *    at least one full window. A day is only fully disabled if EVERY
 *    window for that day is full.
 *  - Clicking a day re-renders the time pills, disabling (struck-through,
 *    "Unavailable" tag) whichever specific windows are full for that
 *    date — other windows on the same day remain pickable.
 *  - Past days are always disabled.
 *
 * DOM hooks expected in booking.ejs's Step 4:
 *   #calendarGrid        - container the month day-cells render into
 *                           (weekday header row is now static HTML, not
 *                           generated here)
 *   #calendarMonthLabel  - "July 2026" header text
 *   #calendarPrevBtn / #calendarNextBtn - month navigation
 *   #preferredDate       - hidden input, booking.js reads its .value
 *   #timePillGrid        - container the time-window pills render into
 *   #preferredTime        - hidden input, booking.js reads its .value
 *                           (pills write into this on click)
 * -----------------------------------------------------------------------
 */

const WINDOW_DEFS = [
    { value: 'Morning (8 AM – 11 AM)', label: 'Morning', range: '8 AM – 11 AM' },
    { value: 'Midday (11 AM – 2 PM)', label: 'Midday', range: '11 AM – 2 PM' },
    { value: 'Afternoon (2 PM – 5 PM)', label: 'Afternoon', range: '2 PM – 5 PM' },
    { value: 'Evening (5 PM – 7 PM)', label: 'Evening', range: '5 PM – 7 PM' },
    { value: 'Flexible — any time works', label: 'Flexible', range: 'Any time works for you' }
];
const WINDOW_LABELS = WINDOW_DEFS.map(w => w.value);

const CLOCK_ICON = `<svg class="time-pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 16 14"/></svg>`;

const calendarState = {
    viewYear: null,
    viewMonth: null,
    selectedDate: null,
    availability: {},
};

function pad2(n) { return String(n).padStart(2, '0'); }
function ymd(year, month, day) { return `${year}-${pad2(month + 1)}-${pad2(day)}`; }
function todayYmd() { const t = new Date(); return ymd(t.getFullYear(), t.getMonth(), t.getDate()); }
function monthKey(year, month) { return `${year}-${pad2(month + 1)}`; }

async function fetchAvailabilityForMonth(year, month) {
    const key = monthKey(year, month);
    if (calendarState.availability[key]) return calendarState.availability[key];

    const start = ymd(year, month, 1);
    const lastDay = new Date(year, month + 1, 0).getDate();
    const end = ymd(year, month, lastDay);

    try {
        const res = await fetch(`/api/availability?start=${start}&end=${end}`);
        if (!res.ok) throw new Error('availability fetch failed');
        const data = await res.json();
        calendarState.availability[key] = data;
        return data;
    } catch (err) {
        console.error('Could not load availability, defaulting to all-open:', err);
        calendarState.availability[key] = {};
        return {};
    }
}

function initCalendar() {
    const now = new Date();
    calendarState.viewYear = now.getFullYear();
    calendarState.viewMonth = now.getMonth();

    const prevBtn = document.getElementById('calendarPrevBtn');
    const nextBtn = document.getElementById('calendarNextBtn');
    if (prevBtn) prevBtn.onclick = () => navigateMonth(-1);
    if (nextBtn) nextBtn.onclick = () => navigateMonth(1);

    renderCalendar();
    renderTimePills([]); // start with all pills enabled/unselected until a date is picked
}

function navigateMonth(delta) {
    calendarState.viewMonth += delta;
    if (calendarState.viewMonth < 0) {
        calendarState.viewMonth = 11;
        calendarState.viewYear -= 1;
    } else if (calendarState.viewMonth > 11) {
        calendarState.viewMonth = 0;
        calendarState.viewYear += 1;
    }
    renderCalendar();
}

async function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const label = document.getElementById('calendarMonthLabel');
    const prevBtn = document.getElementById('calendarPrevBtn');
    if (!grid || !label) return;

    const { viewYear, viewMonth } = calendarState;

    label.textContent = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const now = new Date();
    const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth();
    if (prevBtn) prevBtn.disabled = isCurrentMonth;

    const availability = await fetchAvailabilityForMonth(viewYear, viewMonth);

    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const today = todayYmd();

    let html = '';

    for (let i = 0; i < firstWeekday; i++) {
        html += `<div class="cal-cell cal-empty"></div>`;
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = ymd(viewYear, viewMonth, day);
        const isPast = dateStr < today;
        const fullWindows = availability[dateStr] || [];
        const allFull = fullWindows.length >= WINDOW_LABELS.length;
        const isRestricted = fullWindows.length > 0 && !allFull;
        const isSelected = calendarState.selectedDate === dateStr;
        const isToday = dateStr === today;

        const disabled = isPast || allFull;

        let classes = 'cal-cell cal-day';
        if (disabled) classes += ' cal-disabled';
        if (isSelected) classes += ' cal-selected';
        if (isToday) classes += ' cal-today';
        if (isRestricted) classes += ' cal-restricted';

        html += `<div class="${classes}" ${disabled ? '' : `onclick="selectCalendarDate('${dateStr}')"`} data-date="${dateStr}">
            <span class="cal-day-num">${day}</span>
            ${isRestricted ? '<span class="cal-dot" title="Limited availability"></span>' : ''}
        </div>`;
    }

    grid.innerHTML = html;
}

function selectCalendarDate(dateStr) {
    calendarState.selectedDate = dateStr;

    const hiddenInput = document.getElementById('preferredDate');
    if (hiddenInput) hiddenInput.value = dateStr;

    document.querySelectorAll('#calendarGrid .cal-day').forEach(el => {
        el.classList.toggle('cal-selected', el.dataset.date === dateStr);
    });

    const [year, month] = dateStr.split('-').map(Number);
    const key = monthKey(year, month - 1);
    const availability = calendarState.availability[key] || {};
    const fullWindows = availability[dateStr] || [];

    renderTimePills(fullWindows);

    if (typeof updateSidebar === 'function') updateSidebar();
}

/**
 * Renders the time-window pills. `fullWindows` is the list of window
 * values that are full for the currently selected date (empty array if
 * no date picked yet, or the date is wide open).
 *
 * If the currently-selected time pill just became unavailable (because
 * the customer picked a new date where that window is now full), the
 * selection is cleared — same safety behavior as before.
 */
function renderTimePills(fullWindows) {
    const container = document.getElementById('timePillGrid');
    const hiddenInput = document.getElementById('preferredTime');
    if (!container || !hiddenInput) return;

    let selected = hiddenInput.value;
    if (selected && fullWindows.includes(selected)) {
        selected = '';
        hiddenInput.value = '';
    }

    container.innerHTML = WINDOW_DEFS.map(w => {
        const isFull = fullWindows.includes(w.value);
        const isSelected = selected === w.value;
        const isFlexible = w.value.startsWith('Flexible');

        let classes = 'time-pill';
        if (isFlexible) classes += ' time-pill-flexible';
        if (isSelected) classes += ' selected';
        if (isFull) classes += ' time-pill-disabled';

        return `
            <div class="${classes}" ${isFull ? '' : `onclick="selectTimeWindow('${w.value}')"`}>
                ${CLOCK_ICON}
                <span class="time-pill-text">
                    <span class="time-pill-label">${w.label}</span>
                    <span class="time-pill-range">${w.range}</span>
                </span>
                ${isFull ? '<span class="time-pill-unavailable-tag">Unavailable</span>' : ''}
            </div>
        `;
    }).join('');
}

function selectTimeWindow(value) {
    const hiddenInput = document.getElementById('preferredTime');
    if (!hiddenInput) return;

    hiddenInput.value = value;

    // Re-render so the .selected class moves to the right pill — simpler
    // and less error-prone than hand-toggling classList on each pill.
    const dateStr = calendarState.selectedDate;
    if (dateStr) {
        const [year, month] = dateStr.split('-').map(Number);
        const key = monthKey(year, month - 1);
        const availability = calendarState.availability[key] || {};
        const fullWindows = availability[dateStr] || [];
        renderTimePills(fullWindows);
    } else {
        renderTimePills([]);
    }

    if (typeof updateSidebar === 'function') updateSidebar();
}

window.initCalendar = initCalendar;
window.selectCalendarDate = selectCalendarDate;
window.selectTimeWindow = selectTimeWindow;