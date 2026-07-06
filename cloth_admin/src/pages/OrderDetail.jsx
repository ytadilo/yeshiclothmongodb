import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/axios'

const SEWING_STATUSES = ['pending', 'in_progress', 'ready', 'delivery_started', 'delivered']

function formatDate(val) {
  if (!val) return '—'
  const d = new Date(val)
  return isNaN(d) ? '—' : d.toLocaleString()
}

function payBadge(s) {
  const v = String(s||'').toLowerCase()
  if (v === 'confirmed') return 'badge-success'
  if (v === 'submitted') return 'badge-info'
  if (v === 'failed') return 'badge-danger'
  return 'badge-warning'
}

export default function OrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [order, setOrder] = useState(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [sewStatus, setSewStatus] = useState('')
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/api/orders/${id}`)
        const o = res.data?.order || res.data
        setOrder(o)
        setSewStatus(o?.sewing_status || o?.sewingStatus || 'pending')
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const updatePayment = async (action) => {
    setActionLoading(true)
    try {
      await api.put(`/api/orders/${id}/payment`, { action })
      showToast(`Payment ${action}d successfully`)
      const res = await api.get(`/api/orders/${id}`)
      setOrder(res.data?.order || res.data)
    } catch (err) {
      showToast(err?.response?.data?.msg || 'Action failed', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  const updateSewing = async () => {
    setActionLoading(true)
    try {
      await api.put(`/api/orders/${id}`, { sewing_status: sewStatus })
      showToast('Sewing status updated')
      const res = await api.get(`/api/orders/${id}`)
      setOrder(res.data?.order || res.data)
    } catch (err) {
      showToast(err?.response?.data?.msg || 'Update failed', 'error')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) return <div className="empty-state"><div className="spinner" /></div>
  if (!order) return <div className="empty-state"><p>Order not found.</p></div>

  const cloth = order.cloth_details || order.clothDetails || {}
  const customer = order.customer_info || order.customerInfo || {}
  const profile = order.user_profile || {}
  const meas = order.measurements || {}
  const payInfo = order.payment_info || {}
  const address = customer.address && typeof customer.address === 'object' ? customer.address : {}

  const name = profile.fullName || customer.full_name || customer.fullName || order.full_name || 'Unknown'
  const phone = profile.phone || customer.phone || '—'
  const email = profile.email || '—'
  const region = customer.region || address.region || '—'
  const city = customer.city || address.city || '—'
  const subCity = address.sub_city || '—'
  const woreda = address.woreda || '—'
  const landmark = address.landmark || '—'

  const price = Number(cloth.post_price_etb || cloth.postPriceEtb || 0)
  const shipping = Number(cloth.post_shipping_price_etb || cloth.postShippingPriceEtb || 0)
  const freeShip = Boolean(cloth.post_free_shipping || cloth.postFreeShipping)
  const qty = Math.max(1, Number(order.quantity || 1))
  const total = (price + (freeShip ? 0 : shipping)) * qty

  const payStatus = order.payment_status || order.paymentStatus || 'Pending'
  const screenshotUrl = payInfo.screenshot_url || payInfo.screenshotUrl || order.payment_screenshot_url || ''
  const item = Array.isArray(cloth.categories) && cloth.categories.length ? cloth.categories.join(', ') : (cloth.category || cloth.design_type || '—')
  const refImages = Array.isArray(order.reference_images) ? order.reference_images : []
  const negMsgs = Array.isArray(order.negotiation_messages) ? order.negotiation_messages : []

  return (
    <div className="animate-fade-in">
      {toast && (
        <div style={{ position:'fixed', top:'20px', right:'20px', zIndex:9999, padding:'12px 20px', borderRadius:'var(--radius-sm)', background: toast.type==='error' ? 'var(--danger)' : 'var(--success)', color:'#fff', fontWeight:600, fontSize:'0.875rem', boxShadow:'var(--shadow-lg)' }}>
          {toast.msg}
        </div>
      )}

      {/* Back + Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => navigate('/orders')}>
          ← Back
        </button>
        <div>
          <h1 style={{ fontSize: '1.25rem' }}>Order Detail</h1>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>ID: {id}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
        {/* Customer */}
        <div className="glass-card">
          <div style={{ fontWeight: 700, marginBottom: '14px' }}>Customer Information</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.875rem', lineHeight: 1.8 }}>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Name:</span> <strong>{name}</strong></div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Phone:</span> {phone}</div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Email:</span> {email}</div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Age/Sex:</span> {profile.age || '—'} / {profile.sex || '—'}</div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Region:</span> {region}</div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>City:</span> {city}</div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Sub-city:</span> {subCity}</div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Woreda:</span> {woreda}</div>
            <div style={{ gridColumn: '1/-1' }}><span style={{ color: 'var(--text-tertiary)' }}>Landmark:</span> {landmark}</div>
          </div>
        </div>

        {/* Order Info */}
        <div className="glass-card">
          <div style={{ fontWeight: 700, marginBottom: '14px' }}>Order Information</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.875rem', lineHeight: 1.8 }}>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Item:</span> <strong>{item}</strong></div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Quantity:</span> {qty}</div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Design Type:</span> {cloth.design_type || cloth.designType || '—'}</div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Color:</span> {cloth.color || '—'}</div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Event Type:</span> {cloth.event_type || cloth.eventType || '—'}</div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Delivery:</span> {order.delivery_method || order.deliveryMethod || '—'}</div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Ordered:</span> {formatDate(order.created_at || order.createdAt)}</div>
            {cloth.deadline_date && <div><span style={{ color: 'var(--text-tertiary)' }}>Deadline:</span> {formatDate(cloth.deadline_date)}</div>}
          </div>
        </div>
      </div>

      {/* Pricing + Payment */}
      <div className="glass-card" style={{ marginBottom: '20px' }}>
        <div style={{ fontWeight: 700, marginBottom: '14px' }}>Payment & Pricing</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', fontSize: '0.875rem' }}>
          <div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginBottom: '4px' }}>Unit Price</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{price > 0 ? `${price.toLocaleString()} ETB` : 'On request'}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginBottom: '4px' }}>Shipping</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{freeShip ? 'Free' : shipping > 0 ? `${shipping.toLocaleString()} ETB` : '—'}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginBottom: '4px' }}>Total ({qty} item{qty !== 1 ? 's' : ''})</div>
            <div style={{ fontWeight: 800, fontSize: '1.25rem', color: 'var(--accent)' }}>{total > 0 ? `${total.toLocaleString()} ETB` : '—'}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginBottom: '4px' }}>Payment Method</div>
            <div style={{ fontWeight: 600 }}>{payInfo.method || order.payment_method || '—'}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginBottom: '4px' }}>Payment Status</div>
            <span className={`badge ${payBadge(payStatus)}`}>{payStatus}</span>
          </div>
          <div>
            <div style={{ color: 'var(--text-tertiary)', fontSize: '0.75rem', marginBottom: '4px' }}>Payment Submitted</div>
            <div style={{ fontWeight: 600 }}>{payInfo.paid_at ? formatDate(payInfo.paid_at) : '—'}</div>
          </div>
        </div>

        {screenshotUrl && (
          <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
            <div style={{ fontWeight: 600, marginBottom: '8px', fontSize: '0.875rem' }}>Payment Proof</div>
            <a href={screenshotUrl} target="_blank" rel="noopener noreferrer">
              <img src={screenshotUrl} alt="Payment proof" style={{ maxWidth: '380px', width: '100%', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }} />
            </a>
          </div>
        )}

        {/* Payment Actions */}
        {(payStatus === 'Submitted' || payStatus === 'submitted') && (
          <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
            <button className="btn btn-primary" disabled={actionLoading} onClick={() => updatePayment('approve')}>
              {actionLoading ? <div className="spinner" /> : '✓ Approve Payment'}
            </button>
            <button className="btn btn-danger" disabled={actionLoading} onClick={() => updatePayment('reject')}>
              {actionLoading ? <div className="spinner" /> : '✕ Reject Payment'}
            </button>
          </div>
        )}
      </div>

      {/* Measurements */}
      {Object.keys(meas).length > 0 && (
        <div className="glass-card" style={{ marginBottom: '20px' }}>
          <div style={{ fontWeight: 700, marginBottom: '14px' }}>Measurements</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', fontSize: '0.875rem' }}>
            {Object.entries(meas).map(([k, v]) => (
              typeof v === 'string' || typeof v === 'number' ? (
                <div key={k}>
                  <span style={{ color: 'var(--text-tertiary)' }}>{k.replace(/_/g, ' ')}:</span>{' '}
                  <strong>{String(v)}</strong>
                </div>
              ) : null
            ))}
          </div>
        </div>
      )}

      {/* Reference Images */}
      {refImages.length > 0 && (
        <div className="glass-card" style={{ marginBottom: '20px' }}>
          <div style={{ fontWeight: 700, marginBottom: '14px' }}>Reference Images</div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {refImages.map((img, i) => (
              <a key={i} href={img} target="_blank" rel="noopener noreferrer">
                <img src={img} alt={`Reference ${i + 1}`} style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }} />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Sewing Status Update */}
      <div className="glass-card" style={{ marginBottom: '20px' }}>
        <div style={{ fontWeight: 700, marginBottom: '14px' }}>Update Sewing Status</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <select
            className="form-control"
            style={{ width: 'auto' }}
            value={sewStatus}
            onChange={e => setSewStatus(e.target.value)}
          >
            {SEWING_STATUSES.map(s => (
              <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
            ))}
          </select>
          <button className="btn btn-primary" disabled={actionLoading} onClick={updateSewing}>
            {actionLoading ? <div className="spinner" /> : 'Save Status'}
          </button>
        </div>
      </div>

      {/* Negotiation Messages */}
      {negMsgs.length > 0 && (
        <div className="glass-card">
          <div style={{ fontWeight: 700, marginBottom: '14px' }}>Negotiation Messages</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {negMsgs.map((msg, i) => {
              const isAdmin = String(msg?.sender_role || '').toLowerCase() === 'admin'
              return (
                <div key={i} style={{ padding: '10px 14px', borderRadius: 'var(--radius-sm)', background: isAdmin ? 'var(--accent-light)' : 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isAdmin ? 'var(--accent)' : 'var(--text-secondary)', marginBottom: '4px' }}>
                    {isAdmin ? 'Admin' : 'Customer'} · {formatDate(msg?.timestamp)}
                  </div>
                  {msg?.message && <div style={{ fontSize: '0.875rem' }}>{msg.message}</div>}
                  {msg?.image_url && (
                    <a href={msg.image_url} target="_blank" rel="noopener noreferrer">
                      <img src={msg.image_url} alt="attachment" style={{ maxWidth: '200px', marginTop: '8px', borderRadius: 'var(--radius-sm)' }} />
                    </a>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
