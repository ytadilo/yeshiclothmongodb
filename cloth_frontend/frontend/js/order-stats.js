// order-stats.js
// Enhanced admin analytics dashboard logic

(async function () {
    const { ensureAdmin, escapeHtml, apiFetch } = window.AdminCommon;
    if (!ensureAdmin()) return;
    let visitsLineChart = null;
    let productBarChart = null;
    let devicePieChart = null;
    let userActivityChart = null;
    const metricCharts = new Map();

    // Elements
    const userAnalyticsEl = document.getElementById('userAnalytics');
    const productAnalyticsEl = document.getElementById('productAnalytics');
    const engagementAnalyticsEl = document.getElementById('engagementAnalytics');
    const mediaAnalyticsEl = document.getElementById('mediaAnalytics');
    const startDateFilterEl = document.getElementById('startDateFilter');
    const endDateFilterEl = document.getElementById('endDateFilter');
    const groupByEl = document.getElementById('groupBy');
    const visitsLineChartEl = document.getElementById('visitsLineChart');
    const productBarChartEl = document.getElementById('productBarChart');
    const devicePieChartEl = document.getElementById('devicePieChart');
    const userTableBodyEl = document.getElementById('userAnalyticsTableBody');
    const userTableFilterEl = document.getElementById('userTableFilter');
    const userTablePrevEl = document.getElementById('userTablePrev');
    const userTableNextEl = document.getElementById('userTableNext');
    const userTablePageInfoEl = document.getElementById('userTablePageInfo');
    const userActivityChartEl = document.getElementById('userActivityChart');

    let userTableRaw = [];
    let userTablePage = 1;
    const userTablePageSize = 10;
    let userTableSortKey = 'sessionCount';
    let userTableSortDir = 'desc';

    // Helper: Format percent
    function percent(part, total) {
        if (!total || total === 0) return '0%';
        return ((part / total) * 100).toFixed(1) + '%';
    }

    function normalizeMetricRows(rows) {
        return (Array.isArray(rows) ? rows : []).map((row) => ({
            _id: (row && row._id != null) ? String(row._id) : 'N/A',
            label: (row && row.label != null) ? String(row.label) : '',
            link: (row && row.link != null) ? String(row.link) : '',
            count: Number(row && row.count || 0)
        }));
    }

    function safeLinkName(row) {
        const explicit = String(row?.label || '').trim();
        if (explicit) return explicit;

        const href = String(row?.link || row?._id || '').trim();
        if (!href) return 'N/A';

        try {
            const u = new URL(href, window.location.origin);
            return String(u.hostname || href).replace(/^www\./i, '');
        } catch (_) {
            return href;
        }
    }

    function isObjectId(value) {
        return /^[a-f0-9]{24}$/i.test(String(value || '').trim());
    }

    function renderMetricValueCell(row, kind) {
        const raw = String(row?._id || 'N/A');
        const label = String(row?.label || raw);
        if (kind === 'product' && isObjectId(raw)) {
            const href = `/user/post.html?id=${encodeURIComponent(raw)}`;
            return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:#1E4B35; text-decoration:underline;">${escapeHtml(raw)}</a>`;
        }

        if (kind === 'linkWithName') {
            const href = String(row?.link || raw).trim();
            const displayName = safeLinkName(row);
            if (!href) return `<span style="word-break:break-word;">${escapeHtml(displayName)}</span>`;
            return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color:#1E4B35; text-decoration:underline; word-break:break-word;">${escapeHtml(displayName)}</a>`;
        }

        if (kind === 'url') {
            const href = String(row?.link || raw);
            return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="color:#1E4B35; text-decoration:underline; word-break:break-all;">${escapeHtml(href)}</a>`;
        }

        return escapeHtml(label || raw);
    }

    function renderMetricActionCell(row, kind) {
        const raw = String(row?._id || '');
        if (kind === 'product' && isObjectId(raw)) {
            const href = `/user/post.html?id=${encodeURIComponent(raw)}`;
            return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding:4px 8px; border:1px solid rgba(30,75,53,0.25); border-radius:6px; color:#1E4B35; text-decoration:none; font-weight:600;">View Product</a>`;
        }
        if (kind === 'linkWithName') {
            const href = String(row?.link || raw).trim();
            if (!href) return '—';
            return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding:4px 8px; border:1px solid rgba(30,75,53,0.25); border-radius:6px; color:#1E4B35; text-decoration:none; font-weight:600;">Open Link</a>`;
        }
        if (kind === 'url' && raw) {
            return `<a href="${escapeHtml(raw)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding:4px 8px; border:1px solid rgba(30,75,53,0.25); border-radius:6px; color:#1E4B35; text-decoration:none; font-weight:600;">Open Link</a>`;
        }
        return '—';
    }

    function renderMetricAllTable(rows, title, itemLabel, valueKind) {
        const cleanRows = normalizeMetricRows(rows);
        if (cleanRows.length === 0) {
            return `
                <div style="border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:10px; margin-top:8px;">
                    <strong>${escapeHtml(title)}</strong>
                    <div style="color:#666; margin-top:6px;">No data available yet.</div>
                </div>
            `;
        }

        const totalCount = cleanRows.reduce((sum, r) => sum + r.count, 0);
        const sorted = cleanRows.slice().sort((a, b) => b.count - a.count);

        return `
            <div style="border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:10px; margin-top:8px;">
                <strong>${escapeHtml(title)}</strong>
                <div style="overflow:auto; margin-top:8px; max-height:320px;">
                    <table style="width:100%; border-collapse:collapse; font-size:12px;">
                        <thead>
                            <tr>
                                <th style="text-align:left; padding:6px 8px; border-bottom:1px solid rgba(0,0,0,0.1);">${escapeHtml(itemLabel)}</th>
                                <th style="text-align:left; padding:6px 8px; border-bottom:1px solid rgba(0,0,0,0.1);">Count</th>
                                <th style="text-align:left; padding:6px 8px; border-bottom:1px solid rgba(0,0,0,0.1);">%</th>
                                <th style="text-align:left; padding:6px 8px; border-bottom:1px solid rgba(0,0,0,0.1);">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${sorted.map((r) => `
                <tr>
                    <td style="padding:6px 8px; border-bottom:1px solid rgba(0,0,0,0.06);">${renderMetricValueCell(r, valueKind)}</td>
                    <td style="padding:6px 8px; border-bottom:1px solid rgba(0,0,0,0.06);">${r.count}</td>
                    <td style="padding:6px 8px; border-bottom:1px solid rgba(0,0,0,0.06);">${percent(r.count, totalCount)}</td>
                    <td style="padding:6px 8px; border-bottom:1px solid rgba(0,0,0,0.06);">${renderMetricActionCell(r, valueKind)}</td>
                </tr>
            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    function renderMetricCanvas(id, title) {
        return `
            <div style="border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:10px; margin-top:8px;">
                <strong>${escapeHtml(title)} Graph</strong>
                <div style="height:240px; margin-top:8px; overflow:auto;">
                    <canvas id="${escapeHtml(id)}"></canvas>
                </div>
            </div>
        `;
    }

    function renderMetricChart(canvasId, rows, label, opts = {}) {
        if (typeof window.Chart === 'undefined') return;
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const cleanRows = normalizeMetricRows(rows).sort((a, b) => b.count - a.count);
        const labels = cleanRows.map((r) => String(safeLinkName(r) || r._id));
        const values = cleanRows.map((r) => Number(r.count));

        canvas.style.minWidth = `${Math.max(520, labels.length * 70)}px`;

        if (metricCharts.has(canvasId)) {
            try { metricCharts.get(canvasId).destroy(); } catch (_) {}
        }

        const chart = new Chart(canvas, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label,
                    data: values,
                    backgroundColor: '#1E4B35'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true },
                    x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 } }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            afterLabel: (context) => {
                                const row = cleanRows[context.dataIndex] || {};
                                const href = String(row.link || row._id || '').trim();
                                if (!href) return '';
                                return `URL: ${href}`;
                            }
                        }
                    }
                },
                onClick: (_event, elements) => {
                    if (!opts.openOnBarClick) return;
                    if (!Array.isArray(elements) || elements.length === 0) return;
                    const hit = elements[0];
                    const row = cleanRows[hit.index] || {};
                    const href = String(row.link || row._id || '').trim();
                    if (!href) return;
                    window.open(href, '_blank', 'noopener,noreferrer');
                }
            }
        });

        metricCharts.set(canvasId, chart);
    }

    // Fetch and render analytics
    async function loadAnalytics() {
        let startDate = '', endDate = '', groupBy = '';
        if (startDateFilterEl) startDate = String(startDateFilterEl.value || '').trim();
        if (endDateFilterEl) endDate = String(endDateFilterEl.value || '').trim();
        if (groupByEl) groupBy = groupByEl.value;
        const url = `/api/analytics/user-activity?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&groupBy=${encodeURIComponent(groupBy)}`;
        const res = await apiFetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Failed to load analytics');

        // User Analytics
        if (userAnalyticsEl) {
            userAnalyticsEl.innerHTML = renderUserAnalytics(data.userActivity, data.userSummary);
        }
        userTableRaw = Array.isArray(data.userActivity) ? data.userActivity.slice() : [];
        userTablePage = 1;
        renderUserTable();
        renderUserActivityChart(userTableRaw);

        // Product Analytics
        if (productAnalyticsEl) {
            productAnalyticsEl.innerHTML = `
                <h3>Product Analytics</h3>
                ${renderProductSummary(data.productSummary)}
                ${renderMetricCanvas('orderedProductsChart', 'Ordered Products')}
                ${renderMetricAllTable(data.orderedProducts, 'Ordered Products Table (All Data)', 'Product', 'product')}

                ${renderMetricCanvas('productViewsChart', 'Product Views')}
                ${renderMetricAllTable(data.productViews, 'Product Views Table (All Data)', 'Product', 'product')}

                ${renderMetricCanvas('productAddToCartChart', 'Added To Bag')}
                ${renderMetricAllTable(data.addToCart, 'Add To Cart Table (All Data)', 'Product', 'product')}

                ${renderMetricCanvas('productLikesChart', 'Liked Products')}
                ${renderMetricAllTable(data.likes, 'Likes Table (All Data)', 'Product', 'product')}

                ${renderMetricCanvas('productSharesChart', 'Shared Products')}
                ${renderMetricAllTable(data.shares, 'Shares Table (All Data)', 'Product', 'product')}
            `;

            renderMetricChart('orderedProductsChart', data.orderedProducts, 'Ordered');
            renderMetricChart('productViewsChart', data.productViews, 'Views');
            renderMetricChart('productAddToCartChart', data.addToCart, 'Add To Cart');
            renderMetricChart('productLikesChart', data.likes, 'Likes');
            renderMetricChart('productSharesChart', data.shares, 'Shares');
        }

        // Engagement Analytics (Clicks)
        if (engagementAnalyticsEl) {
            const clickRows = (Array.isArray(data.clicksEnriched) ? data.clicksEnriched : (Array.isArray(data.clicks) ? data.clicks : []))
                .map((r) => ({
                    _id: String(r?._id || ''),
                    label: String(r?.label || r?._id || ''),
                    link: String(r?.link || r?._id || ''),
                    count: Number(r?.count || 0)
                }));

            engagementAnalyticsEl.innerHTML = `
                <h3>Engagement Analytics</h3>
                ${renderLinkSummary(data.linkAnalytics)}
                ${renderMetricCanvas('engagementClicksChart', 'Clicked Links')}
                ${renderMetricAllTable(clickRows, 'Link Clicks Table (All Data)', 'Product Name / Link', 'linkWithName')}
            `;
            renderMetricChart('engagementClicksChart', clickRows, 'Link Clicks', { openOnBarClick: true });
        }

        // Media Analytics (Video Views, Image Downloads)
        if (mediaAnalyticsEl) {
            const videoRows = (Array.isArray(data.videoViews) ? data.videoViews : []).map((v) => {
                const productId = String(v?._id?.productId || 'N/A');
                const platform = String(v?._id?.platform || 'unknown');
                return { _id: `${platform} | ${productId}`, count: Number(v?.count || 0) };
            });

            mediaAnalyticsEl.innerHTML = `
                <h3>Media Analytics</h3>
                ${renderMetricCanvas('mediaVideoChart', 'Video Views')}
                ${renderMetricAllTable(videoRows, 'Video Views Table (All Data)', 'Platform | Product', 'text')}

                ${renderMetricCanvas('mediaDownloadsChart', 'Image Downloads')}
                ${renderMetricAllTable(data.imageDownloads, 'Image Downloads Table (All Data)', 'Product', 'product')}
            `;

            renderMetricChart('mediaVideoChart', videoRows, 'Video Views');
            renderMetricChart('mediaDownloadsChart', data.imageDownloads, 'Image Downloads');
        }

        renderCharts(data);
    }

    function renderCharts(data) {
        if (typeof window.Chart === 'undefined') return;

        const visits = Array.isArray(data.visitsOverTime) ? data.visitsOverTime : [];
        const productPerformance = Array.isArray(data.productPerformance)
            ? data.productPerformance.slice(0, 10)
            : [];
        const productViews = Array.isArray(data.productViews) ? data.productViews.slice(0, 10) : [];
        const deviceUsage = Array.isArray(data.deviceUsage) ? data.deviceUsage : [];
        const productRows = productPerformance.length > 0 ? productPerformance : productViews;

        const shorten = (value) => {
            const v = String(value || 'N/A');
            if (v.length <= 16) return v;
            return `${v.slice(0, 8)}...${v.slice(-4)}`;
        };

        if (visitsLineChart) visitsLineChart.destroy();
        if (productBarChart) productBarChart.destroy();
        if (devicePieChart) devicePieChart.destroy();

        if (visitsLineChartEl) {
            visitsLineChart = new Chart(visitsLineChartEl, {
                type: 'line',
                data: {
                    labels: visits.map((x) => x._id),
                    datasets: [{
                        label: 'Visits',
                        data: visits.map((x) => x.count),
                        borderColor: '#1E4B35',
                        backgroundColor: 'rgba(30,75,53,0.15)',
                        tension: 0.25
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        if (productBarChartEl) {
            productBarChart = new Chart(productBarChartEl, {
                type: 'bar',
                data: {
                    labels: productRows.map((x) => shorten(x._id)),
                    datasets: [{
                        label: productPerformance.length > 0 ? 'Performance Score' : 'Views',
                        data: productRows.map((x) => productPerformance.length > 0 ? Number(x.score || 0) : Number(x.count || 0)),
                        backgroundColor: '#D4AF37'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            ticks: { maxRotation: 45, minRotation: 0 }
                        },
                        y: {
                            beginAtZero: true
                        }
                    }
                }
            });
        }

        if (devicePieChartEl) {
            devicePieChart = new Chart(devicePieChartEl, {
                type: 'pie',
                data: {
                    labels: deviceUsage.map((x) => x._id),
                    datasets: [{
                        data: deviceUsage.map((x) => x.count),
                        backgroundColor: ['#1E4B35', '#D4AF37', '#B45309']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }
    }

    function tableIdentity(row) {
        const fullName = String(row.userName || '').trim();
        const email = String(row.userEmail || '').trim();
        if (fullName || email) {
            if (fullName && email) return `${fullName} (${email})`;
            return fullName || email;
        }
        return String(row.userId || row.deviceId || 'Guest');
    }

    function renderUserActivityChart(rows) {
        if (typeof window.Chart === 'undefined' || !userActivityChartEl) return;
        if (userActivityChart) {
            try { userActivityChart.destroy(); } catch (_) {}
        }

        const topRows = (Array.isArray(rows) ? rows : [])
            .slice()
            .sort((a, b) => Number(b.sessionCount || 0) - Number(a.sessionCount || 0))
            .slice(0, 20);

        const labels = topRows.map((row) => {
            const id = tableIdentity(row);
            return id.length > 24 ? `${id.slice(0, 24)}...` : id;
        });
        const values = topRows.map((row) => Number(row.sessionCount || 0));

        userActivityChartEl.style.minWidth = `${Math.max(540, labels.length * 60)}px`;

        userActivityChart = new Chart(userActivityChartEl, {
            type: 'bar',
            data: {
                labels,
                datasets: [{
                    label: 'Sessions per User',
                    data: values,
                    backgroundColor: '#1E4B35'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true },
                    x: { ticks: { autoSkip: false, maxRotation: 45, minRotation: 0 } }
                }
            }
        });
    }

    function getTableRows() {
        const filterValue = String(userTableFilterEl?.value || '').trim().toLowerCase();
        const filtered = userTableRaw.filter((row) => {
            if (!filterValue) return true;
            return tableIdentity(row).toLowerCase().includes(filterValue);
        });

        filtered.sort((a, b) => {
            const dir = userTableSortDir === 'asc' ? 1 : -1;
            const av = userTableSortKey === 'identity' ? tableIdentity(a) : (a[userTableSortKey] ?? 0);
            const bv = userTableSortKey === 'identity' ? tableIdentity(b) : (b[userTableSortKey] ?? 0);
            if (typeof av === 'string' || typeof bv === 'string') {
                return String(av).localeCompare(String(bv)) * dir;
            }
            return (Number(av) - Number(bv)) * dir;
        });

        return filtered;
    }

    function renderUserTable() {
        if (!userTableBodyEl) return;
        const rows = getTableRows();
        const totalPages = Math.max(1, Math.ceil(rows.length / userTablePageSize));
        if (userTablePage > totalPages) userTablePage = totalPages;
        const start = (userTablePage - 1) * userTablePageSize;
        const paged = rows.slice(start, start + userTablePageSize);

        userTableBodyEl.innerHTML = paged.map((row) => {
            const firstVisit = row.firstVisit ? new Date(row.firstVisit).toLocaleString() : '—';
            const lastActive = row.lastActive ? new Date(row.lastActive).toLocaleString() : '—';
            const userId = String(row.userId || '').trim();
            const hasAccount = !!userId;
            const previewHref = hasAccount ? `/admin/users?userId=${encodeURIComponent(userId)}` : '';
            return `
                <tr>
                    <td style="padding:8px; border-bottom:1px solid rgba(0,0,0,0.06);">${escapeHtml(tableIdentity(row))}</td>
                    <td style="padding:8px; border-bottom:1px solid rgba(0,0,0,0.06);">${Number(row.sessionCount || 0)}</td>
                    <td style="padding:8px; border-bottom:1px solid rgba(0,0,0,0.06);">${Math.round(Number(row.totalTimeSpentSeconds || 0))}</td>
                    <td style="padding:8px; border-bottom:1px solid rgba(0,0,0,0.06);">${escapeHtml(firstVisit)}</td>
                    <td style="padding:8px; border-bottom:1px solid rgba(0,0,0,0.06);">${escapeHtml(lastActive)}</td>
                    <td style="padding:8px; border-bottom:1px solid rgba(0,0,0,0.06);">${escapeHtml(row.deviceType || '—')}</td>
                    <td style="padding:8px; border-bottom:1px solid rgba(0,0,0,0.06);">${hasAccount ? `<a href="${previewHref}" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding:4px 8px; border:1px solid rgba(30,75,53,0.25); border-radius:6px; color:#1E4B35; text-decoration:none; font-weight:600;">Preview Account</a>` : 'Guest'}</td>
                </tr>
            `;
        }).join('');

        if (userTablePageInfoEl) userTablePageInfoEl.textContent = `Page ${userTablePage} / ${totalPages}`;
        if (userTablePrevEl) userTablePrevEl.disabled = userTablePage <= 1;
        if (userTableNextEl) userTableNextEl.disabled = userTablePage >= totalPages;
    }

    // Renderers
    function renderUserAnalytics(users, summary) {
        const totalUsers = Number(summary?.totalUsers || 0);
        const active24h = Number(summary?.activeLast24h || 0);
        const active7d = Number(summary?.activeLast7d || 0);
        const newUsersPerDay = Array.isArray(summary?.newUsersPerDay) ? summary.newUsersPerDay : [];
        if ((!users || users.length === 0) && totalUsers === 0) return '<div>No data available yet.</div>';
        let total = users.length;
        // Sort by sessionCount
        users = users.sort((a, b) => b.sessionCount - a.sessionCount);
        // Categorize
        const most = users.slice(0, Math.ceil(total * 0.3));
        const medium = users.slice(Math.ceil(total * 0.3), Math.ceil(total * 0.7));
        const least = users.slice(Math.ceil(total * 0.7));
        return `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px; margin-bottom:14px;">
                <div style="border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:10px;"><strong>Total Users</strong><div style="margin-top:6px; font-size:1.35rem; font-weight:800;">${totalUsers}</div></div>
                <div style="border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:10px;"><strong>Active Last 24h</strong><div style="margin-top:6px; font-size:1.35rem; font-weight:800;">${active24h}</div><div style="color:#666;">${Number(summary?.activeLast24hPercent || 0).toFixed(1)}%</div></div>
                <div style="border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:10px;"><strong>Active Last 7d</strong><div style="margin-top:6px; font-size:1.35rem; font-weight:800;">${active7d}</div><div style="color:#666;">${Number(summary?.activeLast7dPercent || 0).toFixed(1)}%</div></div>
            </div>
            <div style="border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:10px; margin-bottom:14px;">
                <strong>New Users Per Day</strong>
                <div style="margin-top:8px; color:#333;">${newUsersPerDay.length ? newUsersPerDay.map((row) => `${escapeHtml(row._id)}: ${Number(row.count || 0)}`).join(' | ') : 'No data available yet.'}</div>
            </div>
            <h4>Most Active Users</h4>
            <ul>${most.map(u => `<li>User: ${escapeHtml(u.userId || u.deviceId || 'Guest')} - Sessions: ${u.sessionCount} (${percent(u.sessionCount, total)})</li>`).join('')}</ul>
            <h4>Medium Activity Users</h4>
            <ul>${medium.map(u => `<li>User: ${escapeHtml(u.userId || u.deviceId || 'Guest')} - Sessions: ${u.sessionCount} (${percent(u.sessionCount, total)})</li>`).join('')}</ul>
            <h4>Least Active Users</h4>
            <ul>${least.map(u => `<li>User: ${escapeHtml(u.userId || u.deviceId || 'Guest')} - Sessions: ${u.sessionCount} (${percent(u.sessionCount, total)})</li>`).join('')}</ul>
        `;
    }

    function renderProductSummary(summary) {
        const totalProducts = Number(summary?.totalProducts || 0);
        if (totalProducts === 0) {
            return '<div style="margin-bottom:10px; color:#666;">No data available yet.</div>';
        }

        const mostViewed = Array.isArray(summary?.mostViewedProducts) ? summary.mostViewedProducts : [];
        const mostClicked = Array.isArray(summary?.mostClickedProducts) ? summary.mostClickedProducts : [];
        return `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:10px; margin-bottom:14px;">
                <div style="border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:10px;"><strong>Total Products</strong><div style="margin-top:6px; font-size:1.35rem; font-weight:800;">${totalProducts}</div></div>
                <div style="border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:10px;"><strong>Total Views</strong><div style="margin-top:6px; font-size:1.35rem; font-weight:800;">${Number(summary?.totalTrackedViews || 0)}</div></div>
                <div style="border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:10px;"><strong>Total Clicks</strong><div style="margin-top:6px; font-size:1.35rem; font-weight:800;">${Number(summary?.totalTrackedClicks || 0)}</div></div>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:10px; margin-bottom:14px;">
                <div style="border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:10px;"><strong>Top 5 Viewed Products</strong><div style="margin-top:8px;">${mostViewed.length ? mostViewed.map((row) => `${escapeHtml(row.label || row._id)} (${Number(row.count || 0)})`).join('<br>') : 'No data available yet.'}</div></div>
                <div style="border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:10px;"><strong>Top 5 Clicked Products</strong><div style="margin-top:8px;">${mostClicked.length ? mostClicked.map((row) => `${escapeHtml(row.label || row._id)} (${Number(row.count || 0)})`).join('<br>') : 'No data available yet.'}</div></div>
            </div>
        `;
    }

    function renderLinkSummary(summary) {
        const clicksPerProduct = Array.isArray(summary?.clicksPerProduct) ? summary.clicksPerProduct : [];
        const clickTrendDaily = Array.isArray(summary?.clickTrendDaily) ? summary.clickTrendDaily : [];
        if (!Number(summary?.totalClicks || 0) && !clicksPerProduct.length && !clickTrendDaily.length) {
            return '<div style="margin-bottom:10px; color:#666;">No data available yet.</div>';
        }
        return `
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:10px; margin-bottom:14px;">
                <div style="border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:10px;"><strong>Total Link Clicks</strong><div style="margin-top:6px; font-size:1.35rem; font-weight:800;">${Number(summary?.totalClicks || 0)}</div></div>
                <div style="border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:10px;"><strong>Clicks Per Product</strong><div style="margin-top:8px;">${clicksPerProduct.length ? clicksPerProduct.slice(0, 5).map((row) => `${escapeHtml(row.label || row._id)} (${Number(row.count || 0)})`).join('<br>') : 'No data available yet.'}</div></div>
                <div style="border:1px solid rgba(0,0,0,0.08); border-radius:10px; padding:10px;"><strong>Daily Click Trend</strong><div style="margin-top:8px;">${clickTrendDaily.length ? clickTrendDaily.map((row) => `${escapeHtml(row._id)}: ${Number(row.count || 0)}`).join('<br>') : 'No data available yet.'}</div></div>
            </div>
        `;
    }
    function renderProductAnalytics(products, label) {
        if (!products || products.length === 0) return `<div>No ${label || 'product'} analytics data.</div>`;
        let total = products.reduce((sum, p) => sum + p.count, 0);
        products = products.sort((a, b) => b.count - a.count);
        const most = products.slice(0, Math.ceil(products.length * 0.3));
        const medium = products.slice(Math.ceil(products.length * 0.3), Math.ceil(products.length * 0.7));
        const least = products.slice(Math.ceil(products.length * 0.7));
        return `
            <h4>Most ${label}</h4>
            <ul>${most.map(p => `<li>Product: ${escapeHtml(p._id || 'N/A')} - ${label}: ${p.count} (${percent(p.count, total)})</li>`).join('')}</ul>
            <h4>Medium ${label}</h4>
            <ul>${medium.map(p => `<li>Product: ${escapeHtml(p._id || 'N/A')} - ${label}: ${p.count} (${percent(p.count, total)})</li>`).join('')}</ul>
            <h4>Least ${label}</h4>
            <ul>${least.map(p => `<li>Product: ${escapeHtml(p._id || 'N/A')} - ${label}: ${p.count} (${percent(p.count, total)})</li>`).join('')}</ul>
        `;
    }

    function renderEngagementAnalytics(clicks, label) {
        if (!clicks || clicks.length === 0) return `<div>No ${label || 'engagement'} data.</div>`;
        let total = clicks.reduce((sum, c) => sum + c.count, 0);
        clicks = clicks.sort((a, b) => b.count - a.count);
        const most = clicks.slice(0, Math.ceil(clicks.length * 0.3));
        const medium = clicks.slice(Math.ceil(clicks.length * 0.3), Math.ceil(clicks.length * 0.7));
        const least = clicks.slice(Math.ceil(clicks.length * 0.7));
        return `
            <h4>Most ${label}</h4>
            <ul>${most.map(c => `<li>Link: ${escapeHtml(c._id || 'N/A')} - Clicks: ${c.count} (${percent(c.count, total)})</li>`).join('')}</ul>
            <h4>Medium ${label}</h4>
            <ul>${medium.map(c => `<li>Link: ${escapeHtml(c._id || 'N/A')} - Clicks: ${c.count} (${percent(c.count, total)})</li>`).join('')}</ul>
            <h4>Least ${label}</h4>
            <ul>${least.map(c => `<li>Link: ${escapeHtml(c._id || 'N/A')} - Clicks: ${c.count} (${percent(c.count, total)})</li>`).join('')}</ul>
        `;
    }

    function renderMediaAnalytics(videoViews, label) {
        if (!videoViews || videoViews.length === 0) return `<div>No ${label || 'media'} data.</div>`;
        let total = videoViews.reduce((sum, v) => sum + v.count, 0);
        videoViews = videoViews.sort((a, b) => b.count - a.count);
        const most = videoViews.slice(0, Math.ceil(videoViews.length * 0.3));
        const medium = videoViews.slice(Math.ceil(videoViews.length * 0.3), Math.ceil(videoViews.length * 0.7));
        const least = videoViews.slice(Math.ceil(videoViews.length * 0.7));
        return `
            <h4>Most ${label}</h4>
            <ul>${most.map(v => `<li>Product: ${escapeHtml(v._id?.productId || 'N/A')} - Platform: ${escapeHtml(v._id?.platform || 'N/A')} - Views: ${v.count} (${percent(v.count, total)})</li>`).join('')}</ul>
            <h4>Medium ${label}</h4>
            <ul>${medium.map(v => `<li>Product: ${escapeHtml(v._id?.productId || 'N/A')} - Platform: ${escapeHtml(v._id?.platform || 'N/A')} - Views: ${v.count} (${percent(v.count, total)})</li>`).join('')}</ul>
            <h4>Least ${label}</h4>
            <ul>${least.map(v => `<li>Product: ${escapeHtml(v._id?.productId || 'N/A')} - Platform: ${escapeHtml(v._id?.platform || 'N/A')} - Views: ${v.count} (${percent(v.count, total)})</li>`).join('')}</ul>
        `;
    }

    window.loadAnalytics = () => loadAnalytics().catch(console.error);

    // Initial load
    loadAnalytics().catch(console.error);

    if (groupByEl) {
        groupByEl.addEventListener('change', () => loadAnalytics().catch(console.error));
    }

    if (userTableFilterEl) {
        userTableFilterEl.addEventListener('input', () => {
            userTablePage = 1;
            renderUserTable();
        });
    }

    if (userTablePrevEl) {
        userTablePrevEl.addEventListener('click', () => {
            userTablePage = Math.max(1, userTablePage - 1);
            renderUserTable();
        });
    }

    if (userTableNextEl) {
        userTableNextEl.addEventListener('click', () => {
            userTablePage += 1;
            renderUserTable();
        });
    }

    Array.from(document.querySelectorAll('th[data-sort-key]')).forEach((th) => {
        th.addEventListener('click', () => {
            const key = th.getAttribute('data-sort-key');
            if (!key) return;
            if (userTableSortKey === key) {
                userTableSortDir = userTableSortDir === 'asc' ? 'desc' : 'asc';
            } else {
                userTableSortKey = key;
                userTableSortDir = 'desc';
            }
            userTablePage = 1;
            renderUserTable();
        });
    });
})();
