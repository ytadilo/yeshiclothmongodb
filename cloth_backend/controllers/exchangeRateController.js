const { getUsdToEtbRate } = require('../utils/exchangeRate');

// @desc    Get USD -> ETB exchange rate
// @route   GET /api/exchange/usd-etb
// @access  Public
exports.getUsdEtb = async (req, res) => {
    try {
        const force = String(req.query.force || '').trim() === '1';
        const data = await getUsdToEtbRate({ force });

        res.json({
            usdToEtb: data.usdToEtb,
            etbToUsd: data.usdToEtb ? 1 / data.usdToEtb : null,
            fetchedAt: data.fetchedAt,
            source: data.source
        });
    } catch (err) {
        console.error('Exchange rate error:', err?.message || err);
        res.status(502).json({ msg: 'Failed to fetch exchange rate' });
    }
};
