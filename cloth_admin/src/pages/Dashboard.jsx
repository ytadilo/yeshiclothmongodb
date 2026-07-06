import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler
} from 'chart.js'
import { Line, Bar } from 'react-chartjs-2'
import api from '../api/axios'
import StatsCard from '../components/StatsCard'

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, ArcElement, Title, Tooltip, Legend, Filler
)

const statusBadge = (status) => {
  const s = String(status || '').toLowerCase()
  if (s === 'confirmed' || s === 'delivered') return 'badge-success'
  if (s === 'pending' || s === 'received') return 'badge-warning'
  if (s === 'failed' || s === 'cancelled') return 'badge-danger'
  return 'badge-neutral'
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({ orders: 0, revenue: 0, pending: 0, customers: 0 })
  const [recentOrders, setRecentOrders] = useState([])
  const [monthlyData, setMonthlyData] = useState({ labels: [], revenue: [], orders: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [ordersRes, usersRes] = await Promise.allSettled([
          api.get('/api/orders'),
          api.get('/api/admin/users?limit=1')
        ])

        let orders = []
        if (ordersRes.status === 'fulfilled') {
          const d = ordersRes.value.data
          orders = Array.isArray(d) ? d : (Array.isArray(d?.orders) ? d.orders : [])
        }

        const totalRevenue = orders.reduce((sum, o) => {
          const price = Number(o?.cloth_details?.post_price_etb || o?.cloth_details?.postPriceEtb || 0)
          const qty = Math.max(1, Number(o?.quantity || 1))
          return sum + price * qty
        }, 0)

        const pendingPayments = orders.filter(o => {
          const ps = String(o?.payment_status || o?.paymentStatus || '').toLowerCase()
          return ps === 'pending' || ps === 'submitted'
        }).length

        let customerCount = 0
        if (usersRes.status === 'fulfilled') {
          customerCount = usersRes.value.data?.total || usersRes.value.data?.count || 0
        }

        setStats({
          orders: orders.length,
          revenue: totalRevenue,
          pending: pendingPayments,
          customers: customerCount
        })
        setRecentOrders(orders.slice(0, 8))

        // Build monthly chart data from orders
        const months = {}
        orders.forEach(o => {
          const date = new Date(o?.created_at || o?.createdAt || Date.now())
          const key = date.toLocaleString('default', { month: 'short', year: '2-digit' })
          if (!months[key]) months[key] = { revenue: 0, count: 0 }
          const price = Number(o?.cloth_details?.post_price_etb || o?.cloth_details?.postPriceEtb || 0)
          const qty = Math.max(1, Number(o?.quantity || 1))
          months[key].revenue += price * qty
          months[key].count += 1
        })
        const sortedKeys = Object.keys(months).slice(-6)
        setMonthlyData({
          labels: sortedKeys,
          revenue: sortedKeys.map(k => months[k].revenue),
          orders: sortedKeys.map(k => months[k].count)
        })
      } catch (err) {
        console.error('Dashboard load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false } },
      y: { grid: { color: 'rgba(0,0,0,0.04)' } }
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Welcome back — here's what's happening with your store.</p>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid" style={{ marginBottom: '28px' }}>
        <StatsCard
          title="Total Orders"
          value={loading ? '...' : stats.orders.toLocaleString()}
          icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{width:'20px',height:'20px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/></svg>}
          type="accent"
        />
        <StatsCard
          title="Total Revenue"
          value={loading ? '...' : `${stats.revenue.toLocaleString()} ETB`}
          icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{width:'20px',height:'20px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
          type="success"
        />
        <StatsCard
          title="Pending Payments"
          value={loading ? '...' : stats.pending.toLocaleString()}
          icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{width:'20px',height:'20px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
          type="warning"
        />
        <StatsCard
          title="Customers"
          value={loading ? '...' : (stats.customers > 0 ? stats.customers.toLocaleString() : orders?.length > 0 ? '—' : '...')}
          icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{width:'20px',height:'20px'}}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"/></svg>}
          type="info"
        />
      </div>

      {/* Charts Row */}
      {monthlyData.labels.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px', marginBottom: '28px' }}>
          <div className="glass-card">
            <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginBottom: '16px' }}>Monthly Revenue (ETB)</div>
            <div style={{ height: '220px' }}>
              <Line
                data={{
                  labels: monthlyData.labels,
                  datasets: [{
                    data: monthlyData.revenue,
                    borderColor: 'var(--accent)',
                    backgroundColor: 'var(--accent-light)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 4,
                    pointBackgroundColor: 'var(--accent)'
                  }]
                }}
                options={chartOptions}
              />
            </div>
          </div>
          <div className="glass-card">
            <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginBottom: '16px' }}>Orders per Month</div>
            <div style={{ height: '220px' }}>
              <Bar
                data={{
                  labels: monthlyData.labels,
                  datasets: [{
                    data: monthlyData.orders,
                    backgroundColor: 'var(--accent-light)',
                    borderColor: 'var(--accent)',
                    borderWidth: 2,
                    borderRadius: 6
                  }]
                }}
                options={chartOptions}
              />
            </div>
          </div>
        </div>
      )}

      {/* Recent Orders */}
      <div className="section-card">
        <div className="section-card-header">
          <span style={{ fontWeight: 700 }}>Recent Orders</span>
          <button className="btn btn-secondary" onClick={() => navigate('/orders')} style={{ fontSize: '0.8125rem', padding: '6px 14px' }}>
            View all
          </button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div className="empty-state"><div className="spinner" /></div>
          ) : recentOrders.length === 0 ? (
            <div className="empty-state"><p>No orders yet.</p></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Item</th>
                  <th>Payment</th>
                  <th>Sewing</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {recentOrders.map(order => {
                  const id = order._id || order.id
                  const profile = order.user_profile || {}
                  const customer = order.customer_info || order.customerInfo || {}
                  const cloth = order.cloth_details || order.clothDetails || {}
                  const name = profile.fullName || customer.full_name || customer.fullName || order.full_name || 'Unknown'
                  const item = Array.isArray(cloth.categories) && cloth.categories.length ? cloth.categories[0] : (cloth.category || cloth.design_type || '—')
                  const payStatus = order.payment_status || order.paymentStatus || 'Pending'
                  const sewStatus = order.sewing_status || order.sewingStatus || 'Pending'
                  const date = new Date(order.created_at || order.createdAt).toLocaleDateString()
                  return (
                    <tr key={id}>
                      <td style={{ fontWeight: 600 }}>{name}</td>
                      <td>{item}</td>
                      <td><span className={`badge ${statusBadge(payStatus)}`}>{payStatus}</span></td>
                      <td><span className={`badge badge-neutral`}>{sewStatus}</span></td>
                      <td style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>{date}</td>
                      <td>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          onClick={() => navigate(`/orders/${id}`)}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
