(function () {
    const fallback = [
        { name: 'Ethiopia', code: '+251' },
        { name: 'Kenya', code: '+254' },
        { name: 'Uganda', code: '+256' },
        { name: 'Tanzania', code: '+255' },
        { name: 'Rwanda', code: '+250' },
        { name: 'Burundi', code: '+257' },
        { name: 'South Sudan', code: '+211' },
        { name: 'Sudan', code: '+249' },
        { name: 'Somalia', code: '+252' },
        { name: 'Djibouti', code: '+253' },
        { name: 'Eritrea', code: '+291' },
        { name: 'Egypt', code: '+20' },
        { name: 'Nigeria', code: '+234' },
        { name: 'Ghana', code: '+233' },
        { name: 'South Africa', code: '+27' },
        { name: 'India', code: '+91' },
        { name: 'China', code: '+86' },
        { name: 'Japan', code: '+81' },
        { name: 'South Korea', code: '+82' },
        { name: 'United Arab Emirates', code: '+971' },
        { name: 'Saudi Arabia', code: '+966' },
        { name: 'Turkey', code: '+90' },
        { name: 'Germany', code: '+49' },
        { name: 'France', code: '+33' },
        { name: 'Italy', code: '+39' },
        { name: 'Spain', code: '+34' },
        { name: 'United Kingdom', code: '+44' },
        { name: 'United States', code: '+1' },
        { name: 'Canada', code: '+1' },
        { name: 'Australia', code: '+61' }
    ];

    function sanitizeCountryRow(row) {
        const name = String(row && row.name || '').trim();
        const code = String(row && row.code || '').trim();
        if (!name || !code || !/^\+[1-9]\d{0,3}$/.test(code)) return null;
        return { name, code };
    }

    function dedupeSorted(list) {
        const map = new Map();
        (Array.isArray(list) ? list : []).forEach((row) => {
            const item = sanitizeCountryRow(row);
            if (!item) return;
            const key = item.name.toLowerCase();
            if (!map.has(key)) map.set(key, item);
        });
        return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    async function fetchRemoteCountries() {
        // restcountries.com is blocked by our CSP — always use the built-in fallback
        // to avoid a console error. Remove this early return if you ever add
        // restcountries.com to the connect-src CSP directive.
        throw new Error('remote fetch disabled — using fallback list');
    }

        const rows = (Array.isArray(data) ? data : []).map((country) => {
            const name = String(country && country.name && country.name.common || '').trim();
            const root = String(country && country.idd && country.idd.root || '').trim();
            const suffixes = country && country.idd && Array.isArray(country.idd.suffixes)
                ? country.idd.suffixes
                : [];
            const suffix = String(suffixes[0] || '').trim();
            const code = root ? `${root}${suffix}` : '';
            return { name, code };
        });

        return dedupeSorted(rows);
    }

    let cache = null;

    async function getCountries() {
        if (cache && cache.length) return cache;
        try {
            const remote = await fetchRemoteCountries();
            if (remote.length) {
                cache = remote;
                return cache;
            }
        } catch (_) {
            // fallback below
        }
        cache = dedupeSorted(fallback);
        return cache;
    }

    window.YeshiCountryData = {
        getCountries,
        fallback: dedupeSorted(fallback)
    };
})();
