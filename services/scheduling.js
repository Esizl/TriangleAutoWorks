/**
 * scheduling.js
 * -----------------------------------------------------------------------
 * Which time windows are open for a job of a given length.
 *
 * The rules, all in one place:
 *  - The day is split into four windows plus "Flexible".
 *  - A job starts at the beginning of its window and runs for its
 *    estimated hours plus TRAVEL_BUFFER_HOURS (no travel buffer for a
 *    drop-off — the vehicle comes to us). It uses up every window
 *    it runs into — a 5-hour detail booked for Morning also takes
 *    Midday, so nobody else can be booked on top of it.
 *  - Only CONFIRMED and COMPLETED bookings take up a window. New and
 *    contacted bookings are unapproved requests and never block anyone.
 *  - A window is closed to a new job when any window that job would run
 *    into is already at capacity (Admin > Site > Business Config,
 *    "Booking capacity per time window"), or when the job couldn't
 *    finish by the end of the day.
 *  - "Flexible" has its own separate capacity, and is also closed when
 *    no regular window is left for the job that day.
 *
 * Used by /api/availability (what the calendar shows), by POST
 * /api/booking (so a stale page can't book a taken slot), by the manage
 * page (rescheduling) and by the admin "confirm" action.
 * -----------------------------------------------------------------------
 */

const Booking = require('../models/Booking')
const BusinessConfig = require('../models/BusinessConfig')

const WINDOWS = [
    { value: 'Morning (8 AM – 11 AM)', start: 8, end: 11 },
    { value: 'Midday (11 AM – 2 PM)', start: 11, end: 14 },
    { value: 'Afternoon (2 PM – 5 PM)', start: 14, end: 17 },
    { value: 'Evening (5 PM – 7 PM)', start: 17, end: 19 }
]
const FLEXIBLE = 'Flexible — any time works'
const ALL_WINDOW_VALUES = WINDOWS.map(w => w.value).concat(FLEXIBLE)

const BLOCKING_STATUSES = ['confirmed', 'completed']
const DROP_OFF = 'Drop-off'

// Drive time + setup added to every job when working out what it blocks.
const TRAVEL_BUFFER_HOURS = 0.5
// A job may run this long past the end of the last window (7 PM).
const DAY_END_GRACE_HOURS = 1
// Used for old bookings saved before job length was recorded.
const DEFAULT_JOB_HOURS = 1.5

const DAY_END = WINDOWS[WINDOWS.length - 1].end

function isValidDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value + 'T12:00:00Z'))
}

/** Today's date in the business's time zone, as YYYY-MM-DD. */
function todayYmd() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
}

/** Clean up an hours figure from a query string or an estimate. */
function normalizeHours(value) {
    const hours = Number(value)
    if (!isFinite(hours) || hours <= 0) return DEFAULT_JOB_HOURS
    return Math.min(hours, 24)
}

/** Work hours for a saved booking: the stored figure, else its labor lines, else a default. */
function bookingHours(booking) {
    const stored = booking.pricing && booking.pricing.estimatedHours
    if (typeof stored === 'number' && stored > 0) return stored
    const fromLabor = (booking.labor || []).reduce((sum, li) => sum + (li.hours || 0), 0)
    return fromLabor > 0 ? fromLabor : DEFAULT_JOB_HOURS
}

/** Hours a job occupies: the work, plus driving out unless it's a drop-off. */
function jobLength(hours, dropOff) {
    return normalizeHours(hours) + (dropOff ? 0 : TRAVEL_BUFFER_HOURS)
}

/** Every window a job uses when it starts in `windowValue` and takes `hours` of work. */
function windowsUsed(windowValue, hours, dropOff) {
    if (windowValue === FLEXIBLE) return [FLEXIBLE]
    const startIndex = WINDOWS.findIndex(w => w.value === windowValue)
    if (startIndex === -1) return []
    const endsAt = WINDOWS[startIndex].start + jobLength(hours, dropOff)
    return WINDOWS.filter((w, i) => i >= startIndex && w.start < endsAt).map(w => w.value)
}

/** Windows a job of this length can't start in because it wouldn't finish in time — the same every day. */
function windowsTooLate(hours, dropOff) {
    const length = jobLength(hours, dropOff)
    return WINDOWS.filter(w => w.start + length > DAY_END + DAY_END_GRACE_HOURS).map(w => w.value)
}

/**
 * How many confirmed jobs are using each window on each date in a range.
 * Returns { '2026-07-01': { 'Morning (8 AM – 11 AM)': 1, … }, … }
 * excludeId leaves one booking out (the one being confirmed or moved).
 */
async function loadUsage(start, end, excludeId) {
    const filter = {
        preferredDate: { $gte: start, $lte: end },
        status: { $in: BLOCKING_STATUSES }
    }
    if (excludeId) filter._id = { $ne: excludeId }

    const bookings = await Booking.find(filter).select('preferredDate preferredTime locationType pricing.estimatedHours labor.hours')

    const usage = {}
    bookings.forEach(b => {
        windowsUsed(b.preferredTime, bookingHours(b), b.locationType === DROP_OFF).forEach(windowValue => {
            if (!usage[b.preferredDate]) usage[b.preferredDate] = {}
            usage[b.preferredDate][windowValue] = (usage[b.preferredDate][windowValue] || 0) + 1
        })
    })
    return usage
}

/** Windows closed to a job of `hours` on one day, given that day's usage. */
function closedWindows(dayUsage, hours, dropOff, capacity, tooLate) {
    const isFull = windowValue => (dayUsage[windowValue] || 0) >= capacity

    const closed = WINDOWS
        .filter(w => !tooLate.includes(w.value))
        .filter(w => windowsUsed(w.value, hours, dropOff).some(isFull))
        .map(w => w.value)

    const regularLeft = WINDOWS.length - tooLate.length - closed.length
    if (isFull(FLEXIBLE) || regularLeft <= 0) closed.push(FLEXIBLE)
    return closed
}

/**
 * What the calendar needs for a date range and a job length:
 *   unavailable: { date: [windows taken that day] }   (only days with at least one)
 *   tooLate:     [windows this job can't finish in, on any day]
 * options.excludeId leaves one booking out (the one being confirmed or moved).
 * options.dropOff   the job is a drop-off (no travel time).
 */
async function getAvailability(start, end, hours, options = {}) {
    const dropOff = !!options.dropOff
    const [{ bookingCapacityPerWindow: capacity }, usage] = await Promise.all([
        BusinessConfig.getConfig(),
        loadUsage(start, end, options.excludeId)
    ])
    const tooLate = windowsTooLate(hours, dropOff)

    const unavailable = {}
    Object.entries(usage).forEach(([date, dayUsage]) => {
        const closed = closedWindows(dayUsage, hours, dropOff, capacity, tooLate)
        if (closed.length > 0) unavailable[date] = closed
    })
    return { unavailable, tooLate }
}

/**
 * Can a job of `hours` be booked for this date and window?
 * options: same as getAvailability.
 * Returns { ok: true } or { ok: false, message } with wording fit to show a customer.
 */
async function checkSlot(date, windowValue, hours, options = {}) {
    if (!isValidDate(date)) return { ok: false, message: 'Please pick a valid date.' }
    if (!ALL_WINDOW_VALUES.includes(windowValue)) return { ok: false, message: 'Please pick a time window.' }
    if (date < todayYmd()) return { ok: false, message: 'That date has already passed. Please pick another day.' }

    const { unavailable, tooLate } = await getAvailability(date, date, hours, options)
    if (tooLate.includes(windowValue)) {
        return { ok: false, message: 'This job is too long to start in that time window. Please pick an earlier one.' }
    }
    if ((unavailable[date] || []).includes(windowValue)) {
        return { ok: false, message: 'That time window was just taken. Please pick another time.' }
    }
    return { ok: true }
}

module.exports = {
    WINDOWS,
    FLEXIBLE,
    ALL_WINDOW_VALUES,
    BLOCKING_STATUSES,
    DROP_OFF,
    isValidDate,
    todayYmd,
    normalizeHours,
    bookingHours,
    windowsUsed,
    windowsTooLate,
    getAvailability,
    checkSlot
}
