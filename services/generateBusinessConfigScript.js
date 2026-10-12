/**
 * Builds the text of /js/businessConfig.js: the pricing settings from
 * Admin > Site > Business Config, handed to the booking form (and to the
 * server-side price check in priceEngine.js) as window.BUSINESS_CONFIG.
 *
 * settings: { laborRatePerHour, diagnosticStandaloneFee, taxRate,
 *             dropOffDiscountType, dropOffDiscountValue }
 * taxRate is a fraction (0.0775 for 7.75%). dropOffDiscountType is
 * 'percent' (value = % off) or 'fixed' (value = dollars off).
 */
function generateBusinessConfigScript(settings) {
    const values = {
        laborRatePerHour: settings.laborRatePerHour,
        diagnosticStandaloneFee: settings.diagnosticStandaloneFee,
        taxRate: settings.taxRate,
        dropOffDiscountValue: settings.dropOffDiscountValue
    }

    // A missing or non-numeric setting must not reach the form as NaN and
    // quietly produce $NaN quotes.
    Object.entries(values).forEach(([key, value]) => {
        if (typeof value !== 'number' || !isFinite(value) || value < 0) {
            throw new Error(`Business config "${key}" is not a valid number (${value}). Fix it in Admin > Site > Business Config.`)
        }
    })

    if (!['percent', 'fixed'].includes(settings.dropOffDiscountType)) {
        throw new Error(`Business config "dropOffDiscountType" must be percent or fixed (got ${settings.dropOffDiscountType}).`)
    }
    values.dropOffDiscountType = settings.dropOffDiscountType

    return `// Generated from Admin > Site > Business Config. Do not edit by hand.
window.BUSINESS_CONFIG = Object.freeze(${JSON.stringify(values, null, 4)});
`
}

module.exports = { generateBusinessConfigScript }
