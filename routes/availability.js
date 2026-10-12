const router = require('express').Router()
const scheduling = require('../services/scheduling')

/**
 * GET /api/availability?start=YYYY-MM-DD&end=YYYY-MM-DD&hours=3.5[&dropoff=1]
 *
 * Which time windows the booking calendar should grey out, for a job
 * that takes `hours` of work. All the rules live in services/scheduling.js.
 *
 *   {
 *     "unavailable": { "2026-07-01": ["Afternoon (2 PM – 5 PM)"] },
 *     "tooLate": ["Evening (5 PM – 7 PM)"]
 *   }
 *
 * unavailable: per date, the windows already taken. A date that isn't
 *              listed is wide open.
 * tooLate:     windows this job couldn't finish in — the same every day.
 * dropoff=1:   the vehicle comes to us, so no travel time is added.
 */
router.get('/', async (req, res) => {
    try {
        const { start, end, hours } = req.query

        if (!scheduling.isValidDate(start) || !scheduling.isValidDate(end)) {
            return res.status(400).json({ error: 'start and end query params are required (YYYY-MM-DD)' })
        }
        // A month at a time is all the calendar ever asks for.
        if (Date.parse(end) - Date.parse(start) > 62 * 24 * 60 * 60 * 1000 || end < start) {
            return res.status(400).json({ error: 'Date range too large.' })
        }

        res.json(await scheduling.getAvailability(start, end, hours, { dropOff: req.query.dropoff === '1' }))
    } catch (err) {
        console.error('Error fetching availability:', err)
        res.status(500).json({ error: 'Failed to fetch availability' })
    }
})

module.exports = router
