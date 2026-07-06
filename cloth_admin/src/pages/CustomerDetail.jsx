import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../api/axios'

export default function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const [userRes, ordersRes] = await Promise.allSettled([
          api.get(`/api/admin/users/${id}`),
          api.get(`/api/orders?userId=${id}`)
        ])
        if (userRes.status === 'fulfilled') {
          setUser(userRes.value.data?.user || userRes.value.data)
        }
        if (ordersRes.status === 'fulfilled') {
          const d = ordersRes.value.data
          setOrders(Array.isArray(d) ? d : (Array.isArray(d?.orders) ? d.orders : []))
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  if (loading) return <div className="empty-state"><div className="spinner" /></div>
  if (!user) return (
    <div className="empty-state">
      <p>Customer not found.</p>
      <button className="btn btn-secondary" onClick={() => navigate('/customers')}>Back to Customers</button>
    </div>
  )

  const name = user.fullName || user.name || '—'
  const totalSpend = orders.reduce((sum, o) => {
    const price = Number(o?.cloth_details?.post_price_etb || 0)
    const qty = Math.max(1, Number(o?.quantity || 1))
    return sum + price * qty
  }, 0)

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => navigate('/customers')}>← Back</button>
        <h1 style={{ fontSize: '1.25rem' }}>Customer Profile</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px', marginBottom: '20px' }}>
        <div className="glass-card" style={{ textAlign: 'center' }}>
          {user.profileImage ? (
            <img src={user.profileImage} alt="" style={{ width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', margin: '0 auto 16px' }} />
          ) : (
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.5rem', margin: '0 auto 16px' }}>
              {name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{name}</div>
          <div style={{ color: 'var(--text-tertiary)', fontSize: '0.875rem', marginTop: '4px' }}>{user.role || 'customer'}</div>
          <div style={{ marginTop: '12px' }}>
            {(user.isBanned || user.status === 'banned')
              ? <span className="badge badge-danger">Banned</span>
              : <span className="badge badge-success">Active</span>}
          </div>
        </div>

        <div className="glass-card">
          <div style={{ fontWeight: 700, marginBottom: '14px' }}>Account Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.875rem', lineHeight: 2 }}>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Email:</span> {user.email || '—'}</div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Phone:</span> {user.phone || '—'}</div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Age:</span> {user.age || '—'}</div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Sex:</span> {user.sex || '—'}</div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Provider:</span> {user.provider || user.authProvider || '—'}</div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Joined:</span> {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : '—'}</div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Total Orders:</span> <strong>{orders.length}</strong></div>
            <div><span style={{ color: 'var(--text-tertiary)' }}>Total Spend:</span> <strong style={{ color: 'var(--accent)' }}>{totalSpend > 0 ? `${totalSpend.toLocaleString()} ETB` : '—'}</strong></div>
          </div>
        </div>
      </div>

      {/* Order History */}
      <div className="section-card">
        <div className="section-card-header">
          <span style={{ fontWeight: 700 }}>Order History ({orders.length})</span>
        </div>
        {orders.length === 0 ? (
          <div className="empty-state" style={{ padding: '40px' }}><p>No orders found for this customer.</p></div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Payment</th>
                  <th>Sewing</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => {
                  const oid = o._id || o.id
                  const cloth = o.cloth_details || o.clothDetails || {}
                  const item = Array.isArray(cloth.categories) ? cloth.categories[0] : (cloth.category || '—')
                  const price = Number(cloth.post_price_etb || cloth.postPriceEtb || 0)
                  const qty = Math.max(1, Number(o.quantity || 1))
                  const total = price * qty
                  const payStatus = o.payment_status || o.paymentStatus || 'Pending'
                  const sewStatus = o.sewing_status || o.sewingStatus || 'pending'
                  return (
                    <tr key={oid}>
                      <td>{item}</td>
                      <td><span className={`badge ${payStatus === 'Confirmed' ? 'badge-success' : payStatus === 'Failed' ? 'badge-danger' : 'badge-warning'}`}>{payStatus}</span></td>
                      <td><span className="badge badge-neutral">{sewStatus}</span></td>
                      <td style={{ fontWeight: 600 }}>{total > 0 ? `${total.toLocaleString()} ETB` : '—'}</td>
                      <td style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>{new Date(o.created_at || o.createdAt).toLocaleDateString()}</td>
                      <td>
                        <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.75rem' }} onClick={() => navigate(`/orders/${oid}`)}>View</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
