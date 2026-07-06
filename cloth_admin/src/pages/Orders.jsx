import React, { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

const PAYMENT_STATUSES = ['All', 'Pending', 'Submitted', 'Confirmed', 'Failed']
const SEWING_STATUSES = ['pending', 'in_progress', 'ready', 'delivery_started', 'delivered']

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function formatDate(val) {
  if (!val) return '—'
  const d = new Date(val)
  return isNaN(d) ? '—' : d.toLocaleString()
}

function paymentBadge(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'confirmed') return 'badge-success'
  if (s === 'submitted') return 'badge-info'
  if (s === 'failed') return 'badge-danger'
  return 'badge-warning'
}

function sewingBadge(status) {
  const s = String(status || '').toLowerCase()
  if (s === 'delivered') return 'badge-success'
  if (s === 'delivery_started' || s === 'shipped') return 'badge-info'
  if (s === 'ready') return 'badge-warning'
  return 'badge-neutral'
}

function getCustomerName(order) {
  const p = order?.user_profile || {}
  const c = order?.customer_info || order?.customerInfo || {}
  return p.fullName || c.full_name || c.fullName || order?.full_name || order?.fullName || 'Unknown'
}

function getItemLabel(order) {
  const cloth = order?.cloth_details || order?.clothDetails || {}
  const cats = Array.isArray(cloth.categories) ? cloth.categories.filter(Boolean) : []
  if (cats.length) return cats.join(', ')
  return cloth.category || cloth.design_type || cloth.post_title || '—'
}

function getPhone(order) {
  const p = order?.user_profile || {}
  const c = order?.customer_info || order?.customerInfo || {}
  return p.phone || c.phone || order?.phone || '—'
}

function getPaymentScreenshot(order) {
  const pi = order?.payment_info || {}
  return pi.screenshot_url || pi.screenshotUrl || order?.payment_screenshot_url || ''
}

export default function Orders() {
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterPayment, setFilterPayment] = useState('All')
  const [expandedId, setExpandedId] = useState(null)
  const [actionLoading, setActionLoading] = useState({})
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const loadOrders = useCallback(async () => {
    try {
      const res = await api.get('/api/orders')
      const d = res.data
      const list = Array.isArray(d) ? d : (Array.isArray(d?.orders) ? d.orders : [])
      // Newest first
      list.sort((a, b) => new Date(b.created_at || b.createdAt) - new Date(a.created_at || a.createdAt))
      setOrders(list)
      setFiltered(list)
    } catch (err) {
      console.error('Failed to load orders:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadOrders() }, [loadOrders])

  useEffect(() => {
    let result = orders
    if (filterPayment !== 'All') {
      result = result.filter(o => String(o.payment_status || o.paymentStatus || '').toLowerCase() === filterPayment.toLowerCase())
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(o => {
        const name = getCustomerName(o).toLowerCase()
        const phone = getPhone(o).toLowerCase()
        const id = String(o._id || o.id || '').toLowerCase()
        return name.includes(q) || phone.includes(q) || id.includes(q)
      })
    }
    setFiltered(result)
  }, [orders, search, filterPayment])

  const updatePayment = async (orderId, action) => {
    setActionLoading(p => ({ ...p, [`pay_${orderId}`]: true }))
    try {
      const res = await api.put(`/api/orders/${orderId}/payment`, { action })
      if (res.data?.success || res.status === 200) {
        showToast(`Payment ${action === 'approve' ? 'approved' : 'rejected'} successfully`)
        loadOrders()
      }
    } catch (err) {
      showToast(err?.response?.data?.msg || 'Action failed', 'error')
    } finally {
      setActionLoading(p => ({ ...p, [`pay_${orderId}`]: false }))
    }
  }

  const updateSewing = async (orderId, status) => {
    setActionLoading(p => ({ ...p, [`sew_${orderId}`]: true }))
    try {
      await api.put(`/api/orders/${orderId}`, { sewing_status: status })
      showToast('Sewing status updated')
      loadOrders()
    } catch (err) {
      showToast(err?.response?.data?.msg || 'Update failed', 'error')
    } finally {
      setActionLoading(p => ({ ...p, [`sew_${orderId}`]: false }))
    }
  }

  const orderId = (o) => o._id || o.id || ''

  return (
    <div className="animate-fade-in">
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 9999,
          padding: '12px 20px', borderRadius: 'var(--radius-sm)',
          background: toast.type === 'error' ? 'var(--danger)' : 'var(--success)',
          color: '#fff', fontWeight: 600, fontSize: '0.875rem',
          boxShadow: 'var(--shadow-lg)', animation: 'fadeIn 0.2s ease'
        }}>
          {toast.msg}
        </div>
      )}

      <div className="page-header">
        <h1>Orders</h1>
        <p>Review, manage, and update all customer orders.</p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-control"
          style={{ maxWidth: '280px' }}
          placeholder="Search by name, phone, or order ID..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {PAYMENT_STATUSES.map(s => (
            <button
              key={s}
              className={`btn ${filterPayment === s ? 'btn-primary' : 'btn-secondary'}`}
              style={{ padding: '6px 14px', fontSize: '0.8125rem' }}
              onClick={() => setFilterPayment(s)}
            >
              {s}
            </button>
          ))}
        </div>
        <span style={{ marginLeft: 'auto', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
          {filtered.length} order{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Orders List */}
      {loading ? (
        <div className="empty-state"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <svg style={{ width: '48px', height: '48px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"/>
          </svg>
          <p>No orders found.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filtered.map(order => {
            const id = orderId(order)
            const isExpanded = expandedId === id
            const customerName = getCustomerName(order)
            const item = getItemLabel(order)
            const phone = getPhone(order)
            const payStatus = order.payment_status || order.paymentStatus || 'Pending'
            const sewStatus = order.sewing_status || order.sewingStatus || 'pending'
            const createdAt = formatDate(order.created_at || order.createdAt)
            const screenshotUrl = getPaymentScreenshot(order)
            const cloth = order.cloth_details || order.clothDetails || {}
            const price = Number(cloth.post_price_etb || cloth.postPriceEtb || 0)
            const shipping = Number(cloth.post_shipping_price_etb || cloth.postShippingPriceEtb || 0)
            const freeShip = Boolean(cloth.post_free_shipping || cloth.postFreeShipping)
            const qty = Math.max(1, Number(order.quantity || 1))
            const total = (price + (freeShip ? 0 : shipping)) * qty
            const customer = order.customer_info || order.customerInfo || {}
            const profile = order.user_profile || {}
            const address = customer.address && typeof customer.address === 'object' ? customer.address : {}
            const region = customer.region || address.region || '—'
            const city = customer.city || address.city || '—'
            const profileImg = profile.profileImage || ''

            return (
              <div key={id} className="section-card" style={{ overflow: 'visible' }}>
                {/* Order Header */}
                <div
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    cursor: 'pointer',
                    userSelect: 'none'
                  }}
                  onClick={() => setExpandedId(isExpanded ? null : id)}
                >
                  {profileImg ? (
                    <img src={profileImg} alt="" style={{ width: '44px', height: '44px', borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border-color)', flexShrink: 0 }} />
                  ) : (
                    <div style={{ width: '44px', height: '44px', borderRadius: '50%', background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
                      {customerName.slice(0, 2).toUpperCase()}
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9375rem' }}>{customerName}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>{item} · {phone}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>{createdAt}</div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    <span className={`badge ${paymentBadge(payStatus)}`}>{payStatus}</span>
                    <span className={`badge ${sewingBadge(sewStatus)}`}>{sewStatus.replace(/_/g, ' ')}</span>
                    {total > 0 && (
                      <span style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                        {total.toLocaleString()} ETB
                      </span>
                    )}
                    <button
                      className="btn btn-secondary"
                      style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                      onClick={e => { e.stopPropagation(); navigate(`/orders/${id}`) }}
                    >
                      Detail
                    </button>
                    <svg style={{ width: '16px', height: '16px', color: 'var(--text-tertiary)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                  </div>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid var(--border-color)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {/* Info Grid */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                      <div className="glass-card" style={{ padding: '14px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>Customer Info</div>
                        <div style={{ fontSize: '0.875rem', lineHeight: 1.8 }}>
                          <div><strong>Phone:</strong> {phone}</div>
                          <div><strong>Email:</strong> {profile.email || '—'}</div>
                          <div><strong>Region:</strong> {region}</div>
                          <div><strong>City:</strong> {city}</div>
                        </div>
                      </div>
                      <div className="glass-card" style={{ padding: '14px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>Order Details</div>
                        <div style={{ fontSize: '0.875rem', lineHeight: 1.8 }}>
                          <div><strong>Item:</strong> {item}</div>
                          <div><strong>Qty:</strong> {qty}</div>
                          <div><strong>Price:</strong> {price > 0 ? `${price.toLocaleString()} ETB` : 'On request'}</div>
                          <div><strong>Shipping:</strong> {freeShip ? 'Free' : shipping > 0 ? `${shipping.toLocaleString()} ETB` : '—'}</div>
                          {total > 0 && <div style={{ fontWeight: 700, color: 'var(--accent)' }}><strong>Total:</strong> {total.toLocaleString()} ETB</div>}
                        </div>
                      </div>
                      <div className="glass-card" style={{ padding: '14px' }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>Payment</div>
                        <div style={{ fontSize: '0.875rem', lineHeight: 1.8 }}>
                          <div><strong>Method:</strong> {order?.payment_info?.method || order?.payment_method || '—'}</div>
                          <div><strong>Status:</strong> <span className={`badge ${paymentBadge(payStatus)}`}>{payStatus}</span></div>
                          {order?.payment_info?.paid_at && <div><strong>Submitted:</strong> {formatDate(order.payment_info.paid_at)}</div>}
                        </div>
                      </div>
                    </div>

                    {/* Payment Screenshot */}
                    {screenshotUrl && (
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', marginBottom: '8px' }}>Payment Proof</div>
                        <a href={screenshotUrl} target="_blank" rel="noopener noreferrer">
                          <img
                            src={screenshotUrl}
                            alt="Payment proof"
                            style={{ maxWidth: '360px', width: '100%', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', objectFit: 'contain' }}
                          />
                        </a>
                      </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                      {/* Payment Actions */}
                      {(payStatus === 'Submitted' || payStatus === 'submitted') && (
                        <>
                          <button
                            className="btn btn-primary"
                            disabled={actionLoading[`pay_${id}`]}
                            onClick={() => updatePayment(id, 'approve')}
                          >
                            {actionLoading[`pay_${id}`] ? <div className="spinner" /> : '✓ Approve Payment'}
                          </button>
                          <button
                            className="btn btn-danger"
                            disabled={actionLoading[`pay_${id}`]}
                            onClick={() => updatePayment(id, 'reject')}
                          >
                            {actionLoading[`pay_${id}`] ? <div className="spinner" /> : '✕ Reject Payment'}
                          </button>
                        </>
                      )}

                      {/* Sewing Status Update */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Sewing:</span>
                        <select
                          className="form-control"
                          style={{ width: 'auto', padding: '6px 10px' }}
                          value={sewStatus}
                          disabled={actionLoading[`sew_${id}`]}
                          onChange={e => updateSewing(id, e.target.value)}
                        >
                          {SEWING_STATUSES.map(s => (
                            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                          ))}
                        </select>
                        {actionLoading[`sew_${id}`] && <div className="spinner" />}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
