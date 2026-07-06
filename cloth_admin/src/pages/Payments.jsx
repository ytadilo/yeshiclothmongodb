import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

function formatDate(v) {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d) ? '—' : d.toLocaleString()
}

export default function Payments() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState(null)
  const [toast, setToast] = useState(null)
  const [filter, setFilter] = useState('Submitted')

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    try {
      const res = await api.get('/api/orders')
      const d = res.data
      let list = Array.isArray(d) ? d : (Array.isArray(d?.orders) ? d.orders : [])
      list.sort((a, b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt))
      setOrders(list)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const updatePayment = async (orderId, action) => {
    setActionId(orderId + action)
    try {
      await api.put(`/api/orders/${orderId}/payment`, { action })
      showToast(`Payment ${action}d successfully`)
      load()
    } catch (err) {
      showToast(err?.response?.data?.msg || 'Action failed', 'error')
    } finally {
      setActionId(null)
    }
  }

  const FILTERS = ['All', 'Pending', 'Submitted', 'Confirmed', 'Failed']
  const filtered = filter === 'All' ? orders : orders.filter(o => {
    const ps = String(o.payment_status || o.paymentStatus || '').toLowerCase()
    return ps === filter.toLowerCase()
  })

  const submittedCount = orders.filter(o => {
    const ps = String(o.payment_status || o.paymentStatus || '').toLowerCase()
    return ps === 'submitted'
  }).length

  return (
    <div className="animate-fade-in">
      {toast && (
        <div style={{ position:'fixed', top:'20px', right:'20px', zIndex:9999, padding:'12px 20px', borderRadius:'var(--radius-sm)', background: toast.type==='error' ? 'var(--danger)' : 'var(--success)', color:'#fff', fontWeight:600, boxShadow:'var(--shadow-lg)' }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div className="page-header" style={{ margin: 0 }}>
          <h1>Payments</h1>
          <p>Review payment proofs and approve or reject transactions.</p>
        </div>
        {submittedCount > 0 && (
          <span className="badge badge-warning" style={{ fontSize: '0.875rem', padding: '6px 12px' }}>
            {submittedCount} awaiting review
          </span>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {FILTERS.map(f => (
          <button key={f} className={`btn ${filter === f ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '6px 14px', fontSize: '0.8125rem' }} onClick={() => setFilter(f)}>
            {f} {f === 'Submitted' && submittedCount > 0 ? `(${submittedCount})` : ''}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="empty-state"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state"><p>No payments found for "{filter}".</p></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map(order => {
            const id = order._id || order.id
            const profile = order.user_profile || {}
            const customer = order.customer_info || order.customerInfo || {}
            const cloth = order.cloth_details || order.clothDetails || {}
            const payInfo = order.payment_info || {}
            const name = profile.fullName || customer.full_name || customer.fullName || 'Unknown'
            const phone = profile.phone || customer.phone || '—'
            const payStatus = order.payment_status || order.paymentStatus || 'Pending'
            const price = Number(cloth.post_price_etb || cloth.postPriceEtb || 0)
            const qty = Math.max(1, Number(order.quantity || 1))
            const total = price * qty
            const screenshot = payInfo.screenshot_url || payInfo.screenshotUrl || order.payment_screenshot_url || ''
            const method = payInfo.method || order.payment_method || '—'
            const submittedAt = payInfo.paid_at ? formatDate(payInfo.paid_at) : '—'
            const isSubmitted = payStatus.toLowerCase() === 'submitted'

            return (
              <div key={id} className="glass-card" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '20px', alignItems: 'start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{name}</div>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>{phone}</span>
                    <span className={`badge ${payStatus === 'Confirmed' ? 'badge-success' : payStatus === 'Failed' ? 'badge-danger' : isSubmitted ? 'badge-info' : 'badge-warning'}`}>
                      {payStatus}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                    <div>Method: <strong>{method}</strong></div>
                    <div>Amount: <strong style={{ color: 'var(--accent)' }}>{total > 0 ? `${total.toLocaleString()} ETB` : '—'}</strong></div>
                    <div>Submitted: <strong>{submittedAt}</strong></div>
                  </div>

                  {screenshot && (
                    <div style={{ marginTop: '12px' }}>
                      <a href={screenshot} target="_blank" rel="noopener noreferrer">
                        <img src={screenshot} alt="Payment proof" style={{ maxWidth: '280px', width: '100%', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }} />
                      </a>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
                  <button className="btn btn-secondary" style={{ fontSize: '0.8125rem', padding: '6px 12px' }} onClick={() => navigate(`/orders/${id}`)}>
                    View Order
                  </button>
                  {isSubmitted && (
                    <>
                      <button
                        className="btn btn-primary"
                        style={{ fontSize: '0.8125rem' }}
                        disabled={Boolean(actionId)}
                        onClick={() => updatePayment(id, 'approve')}
                      >
                        {actionId === id + 'approve' ? <div className="spinner" /> : '✓ Approve'}
                      </button>
                      <button
                        className="btn btn-danger"
                        style={{ fontSize: '0.8125rem' }}
                        disabled={Boolean(actionId)}
                        onClick={() => updatePayment(id, 'reject')}
                      >
                        {actionId === id + 'reject' ? <div className="spinner" /> : '✕ Reject'}
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
