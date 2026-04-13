const https = require('https');

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

let cached = {
    usdToEtb: null,
    fetchedAt: 0,
    source: null
};

function httpsGetJson(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            let raw = '';
            res.on('data', (chunk) => {
                raw += chunk;
            });
            res.on('end', () => {
                try {
                    const json = JSON.parse(raw || '{}');
                    resolve({ statusCode: res.statusCode || 0, json });
                } catch (err) {
                    reject(err);
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(8000, () => {
            req.destroy(new Error('Timeout fetching exchange rate'));
        });
    });
}

async function fetchUsdToEtbFromProvider() {
    // No API key required; public endpoint
    const url = 'https://open.er-api.com/v6/latest/USD';
    const { statusCode, json } = await httpsGetJson(url);

    const rate = Number(json?.rates?.ETB);
    if (statusCode < 200 || statusCode >= 300 || !Number.isFinite(rate) || rate <= 0) {
        const msg = json?.error_type || json?.message || 'Invalid exchange rate response';
        throw new Error(msg);
    }

    return {
        usdToEtb: rate,
        source: 'open.er-api.com'
    };
}

async function getUsdToEtbRate(options = {}) {
    const force = Boolean(options.force);
    const now = Date.now();

    if (!force && Number.isFinite(cached.usdToEtb) && cached.usdToEtb > 0 && now - cached.fetchedAt < CACHE_TTL_MS) {
        return { usdToEtb: cached.usdToEtb, fetchedAt: cached.fetchedAt, source: cached.source };
    }

    try {
        const fresh = await fetchUsdToEtbFromProvider();
        cached = {
            usdToEtb: fresh.usdToEtb,
            fetchedAt: now,
            source: fresh.source
        };
        return { usdToEtb: cached.usdToEtb, fetchedAt: cached.fetchedAt, source: cached.source };
    } catch (err) {
        // If provider fails, fall back to cached value if present
        if (Number.isFinite(cached.usdToEtb) && cached.usdToEtb > 0) {
            return { usdToEtb: cached.usdToEtb, fetchedAt: cached.fetchedAt, source: cached.source || 'cache' };
        }
        throw err;
    }
}

module.exports = {
    getUsdToEtbRate
};
