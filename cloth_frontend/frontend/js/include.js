(function () {
    const componentCache = new Map();
    let readyResolved = false;
    let readyResolve;
    const readyPromise = new Promise((resolve) => {
        readyResolve = resolve;
    });

    function markReady() {
        if (readyResolved) return;
        readyResolved = true;
        readyResolve();
        document.dispatchEvent(new CustomEvent('yeshi:includes-ready'));
        window.dispatchEvent(new CustomEvent('yeshi:includes-ready'));
    }

    async function fetchComponent(url) {
        const key = String(url || '').trim();
        if (!key) return '';
        if (!componentCache.has(key)) {
            componentCache.set(key, fetch(key, {
                credentials: 'same-origin',
                headers: { 'X-Requested-With': 'YeshiInclude' }
            }).then(async (response) => {
                if (!response.ok) {
                    throw new Error('Failed to load component: ' + key);
                }
                return response.text();
            }));
        }
        return componentCache.get(key);
    }

    async function resolvePlaceholder(placeholder) {
        if (!placeholder || placeholder.dataset.includeResolved === '1') return;

        const url = String(placeholder.getAttribute('data-include') || '').trim();
        if (!url) {
            placeholder.dataset.includeResolved = '1';
            return;
        }

        try {
            const html = await fetchComponent(url);
            const template = document.createElement('template');
            template.innerHTML = html.trim();

            const nestedPlaceholders = Array.from(template.content.querySelectorAll('[data-include]'));
            for (const nested of nestedPlaceholders) {
                await resolvePlaceholder(nested);
            }

            placeholder.replaceWith(template.content);
        } catch (_) {
            placeholder.dataset.includeError = '1';
        } finally {
            placeholder.dataset.includeResolved = '1';
        }
    }

    async function loadIncludes(root) {
        const scope = root || document;
        const placeholders = Array.from(scope.querySelectorAll('[data-include]')).filter((node) => node.dataset.includeResolved !== '1');
        await Promise.all(placeholders.map(resolvePlaceholder));
        return true;
    }

    async function run() {
        try {
            await loadIncludes(document);
        } catch (_) {
            // Fallback is handled by existing runtime layout builders.
        } finally {
            markReady();
        }
    }

    window.YeshiIncludes = {
        load(root) {
            return loadIncludes(root);
        },
        ready() {
            return readyPromise;
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run, { once: true });
    } else {
        run();
    }
})();