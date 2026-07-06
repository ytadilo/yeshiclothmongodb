import React, { useEffect, useState } from 'react'
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement,
  PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import api from '../api/axios'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, PointElement,
  LineElement, ArcElement, Title, Tooltip, Legend, Filler
)

export default function Analytics() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/api/orders')
        const d = res.data
        setOrders(Array.isArray(d) ? d : (Array.isArray(d?.orders) ? d.orders : []))
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Compute derived data
  const monthly = {}
  const categoryCount = {}
  const statusCount = {}
  const regionCount = {}

  orders.forEach(o => {
    // Monthly
    const date = new Date(o.created_at || o.createdAt || Date.now())
    const key = date.toLocaleString('default', { month: 'short', year: '2-digit' })
    if (!monthly[key]) monthly[key] = { orders: 0, revenue: 0 }
    monthly[key].orders++
    const price = Number(o?.cloth_details?.post_price_etb || o?.cloth_details?.postPriceEtb || 0)
    const qty = Math.max(1, Number(o?.quantity || 1))
    monthly[key].revenue += price * qty

    // Category
    const cloth = o.cloth_details || o.clothDetails || {}
    const cats = Array.isArray(cloth.categories) && cloth.categories.length ? cloth.categories : [cloth.category || 'Other']
    cats.forEach(c => { categoryCount[c] = (categoryCount[c] || 0) + 1 })

    // Status
    const ps = o.payment_status || o.paymentStatus || 'Pending'
    statusCount[ps] = (statusCount[ps] || 0) + 1

    // Region
    const customer = o.customer_info || o.customerInfo || {}
    const address = customer.address && typeof customer.address === 'object' ? customer.address : {}
    const region = customer.region || address.region || 'Unknown'
    regionCount[region] = (regionCount[region] || 0) + 1
  })

  const sortedMonthKeys = Object.keys(monthly).slice(-8)
  const totalRevenue = orders.reduce((sum, o) => {
    const price = Number(o?.cloth_details?.post_price_etb || o?.cloth_details?.postPriceEtb || 0)
    const qty = Math.max(1, Number(o?.quantity || 1))
    return sum + price * qty
  }, 0)

  const confirmedOrders = orders.filter(o => {
    const ps = String(o.payment_status || o.paymentStatus || '').toLowerCase()
    return ps === 'confirmed'
  }).length

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { color: 'rgba(0,0,0,0.04)' } }
    }
  }

  const pieOpts = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right', labels: { font: { size: 12 } } }
    }
  }

  const COLORS = ['#1E4B35', '#D4AF37', '#4ade80', '#60a5fa', '#f87171', '#fb923c', '#a78bfa', '#34d399']

  if (loading) return <div className="empty-state"><div className="spinner" /></div>

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Analytics</h1>
        <p>Order and revenue statistics across your store.</p>
      </div>

      {/* Summary Cards */}
      <div className="stats-grid" style={{ marginBottom: '28px' }}>
        {[
          { label: 'Total Orders', value: orders.length },
          { label: 'Confirmed Orders', value: confirmedOrders },
          { label: 'Total Revenue', value: `${totalRevenue.toLocaleString()} ETB` },
          { label: 'Avg. Order Value', value: orders.length ? `${Math.round(totalRevenue / orders.length).toLocaleString()} ETB` : '—' }
        ].map(s => (
          <div key={s.label} className="glass-card">
            <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', fontWeight: 600, marginBottom: '8px' }}>{s.label}</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: 'var(--font-heading)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div className="glass-card">
          <div style={{ fontWeight: 700, marginBottom: '16px' }}>Monthly Revenue (ETB)</div>
          <div style={{ height: '240px' }}>
            <Bar
              data={{
                labels: sortedMonthKeys,
                datasets: [{
                  data: sortedMonthKeys.map(k => monthly[k].revenue),
                  backgroundColor: 'rgba(30, 75, 53, 0.7)',
                  borderColor: '#1E4B35',
                  borderWidth: 2,
                  borderRadius: 6
                }]
              }}
              options={chartOpts}
            />
          </div>
        </div>

        <div className="glass-card">
          <div style={{ fontWeight: 700, marginBottom: '16px' }}>Payment Status</div>
          <div style={{ height: '240px' }}>
            <Doughnut
              data={{
                labels: Object.keys(statusCount),
                datasets: [{
                  data: Object.values(statusCount),
                  backgroundColor: COLORS,
                  borderWidth: 0
                }]
              }}
              options={pieOpts}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        <div className="glass-card">
          <div style={{ fontWeight: 700, marginBottom: '16px' }}>Orders by Category</div>
          <div style={{ height: '220px' }}>
            <Doughnut
              data={{
                labels: Object.keys(categoryCount),
                datasets: [{
                  data: Object.values(categoryCount),
                  backgroundColor: COLORS,
                  borderWidth: 0
                }]
              }}
              options={pieOpts}
            />
          </div>
        </div>

        <div className="glass-card">
          <div style={{ fontWeight: 700, marginBottom: '16px' }}>Monthly Order Count</div>
          <div style={{ height: '220px' }}>
            <Line
              data={{
                labels: sortedMonthKeys,
                datasets: [{
                  data: sortedMonthKeys.map(k => monthly[k].orders),
                  borderColor: '#D4AF37',
                  backgroundColor: 'rgba(212, 175, 55, 0.1)',
                  fill: true,
                  tension: 0.4,
                  pointRadius: 4,
                  pointBackgroundColor: '#D4AF37'
                }]
              }}
              options={chartOpts}
            />
          </div>
        </div>
      </div>

      {/* Region Table */}
      {Object.keys(regionCount).length > 0 && (
        <div className="section-card">
          <div className="section-card-header">
            <span style={{ fontWeight: 700 }}>Orders by Region</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Region</th><th>Orders</th><th>% of Total</th></tr></thead>
              <tbody>
                {Object.entries(regionCount).sort((a, b) => b[1] - a[1]).map(([region, count]) => (
                  <tr key={region}>
                    <td style={{ fontWeight: 600 }}>{region}</td>
                    <td>{count}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${(count / orders.length) * 100}%`, background: 'var(--accent)', borderRadius: '3px' }} />
                        </div>
                        <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', minWidth: '40px' }}>
                          {((count / orders.length) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
