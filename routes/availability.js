const router = require('express').Router()
const Booking = require('../models/Booking')

// ── Capacity config ──
// Cap is per (date, window) pair. "Flexible — any time works" is its own
// pseudo-window with its own independent cap — it does NOT count against
// or get blocked by the four time-of-day windows, and vice versa.
//
// Only 'confirmed' and 'completed' bookings count toward capacity.
// 'new' and 'contacted' are unapproved quotes and must never block a
// day/window for other customers.
const WINDOW_CAPS = {
    'Morning (8 AM – 11 AM)': 1,
    'Midday (11 AM – 2 PM)': 1,
    'Afternoon (2 PM – 5 PM)': 1,
    'Evening (5 PM – 7 PM)': 1,
    'Flexible — any time works': 1
}

const BLOCKING_STATUSES = ['confirmed', 'completed']

/**
 * GET /api/availability?start=YYYY-MM-DD&end=YYYY-MM-DD
 *
 * Returns which (date, window) pairs are at/over capacity within the
 * given range, so the booking form can grey them out. Shape:
 *
 *   { "2026-07-01": ["Afternoon (2 PM – 5 PM)"], "2026-07-03": [...] }
 *
 * A date with no entry means every window is open. A date present in
 * the response only lists the FULL windows for that date — windows not
 * listed are still open that day (per-window granularity, not whole-day).
 */
router.get('/', async (req, res) => {
    try {
        const { start, end } = req.query

        if (!start || !end) {
            return res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD)' })
        }

        const bookings = await Booking.find({
            preferredDate: { $gte: start, $lte: end },
            status: { $in: BLOCKING_STATUSES }
        }).select('preferredDate preferredTime status')

        // Count confirmed+ bookings per (date, window)
        const counts = {} // { "2026-07-01": { "Afternoon (2 PM – 5 PM)": 1 } }
        bookings.forEach(b => {
            const date = b.preferredDate
            const window = b.preferredTime
            if (!date || !window) return
            if (!(window in WINDOW_CAPS)) return // ignore any legacy/unexpected window string

            if (!counts[date]) counts[date] = {}
            counts[date][window] = (counts[date][window] || 0) + 1
        })

        // Reduce to only the FULL windows per date
        const full = {}
        Object.entries(counts).forEach(([date, windows]) => {
            const fullWindows = Object.entries(windows)
                .filter(([window, count]) => count >= (WINDOW_CAPS[window] ?? 1))
                .map(([window]) => window)
            if (fullWindows.length > 0) full[date] = fullWindows
        })

        res.json(full)
    } catch (err) {
        console.error('Error fetching availability:', err)
        res.status(500).json({ error: 'Failed to fetch availability' })
    }
})

module.exports = router