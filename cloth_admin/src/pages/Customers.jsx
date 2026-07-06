import React, { useEffect, useState } from 'react'
import api from '../api/axios'

export default function Customers() {
  const [users, setUsers] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState(null)
  const [actionId, setActionId] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const load = async () => {
    try {
      // Try admin endpoint first, fallback to general users
      const res = await api.get('/api/admin/users?limit=200')
      const d = res.data
      const list = Array.isArray(d) ? d : (Array.isArray(d?.users) ? d.users : [])
      setUsers(list)
      setFiltered(list)
    } catch (err) {
      console.error('Failed to load users:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (!search.trim()) { setFiltered(users); return }
    const q = search.trim().toLowerCase()
    setFiltered(users.filter(u => {
      const name = (u.fullName || u.name || '').toLowerCase()
      const email = (u.email || '').toLowerCase()
      const phone = (u.phone || '').toLowerCase()
      return name.includes(q) || email.includes(q) || phone.includes(q)
    }))
  }, [users, search])

  const toggleBan = async (user) => {
    const userId = user._id || user.id
    const isBanned = Boolean(user.isBanned || user.status === 'banned')
    setActionId(userId)
    try {
      await api.put(`/api/admin/users/${userId}/status`, { status: isBanned ? 'active' : 'banned' })
      showToast(`User ${isBanned ? 'unbanned' : 'banned'} successfully`)
      load()
    } catch (err) {
      showToast(err?.response?.data?.msg || 'Action failed', 'error')
    } finally {
      setActionId(null)
    }
  }

  const statusBadge = (user) => {
    if (user.isBanned || user.status === 'banned') return <span className="badge badge-danger">Banned</span>
    if (user.status === 'inactive') return <span className="badge badge-warning">Inactive</span>
    return <span className="badge badge-success">Active</span>
  }

  return (
    <div className="animate-fade-in">
      {toast && (
        <div style={{ position:'fixed', top:'20px', right:'20px', zIndex:9999, padding:'12px 20px', borderRadius:'var(--radius-sm)', background: toast.type==='error' ? 'var(--danger)' : 'var(--success)', color:'#fff', fontWeight:600, boxShadow:'var(--shadow-lg)' }}>
          {toast.msg}
        </div>
      )}

      <div className="page-header">
        <h1>Customers</h1>
        <p>View and manage customer accounts.</p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <input className="form-control" style={{ maxWidth: '320px' }} placeholder="Search by name, email, or phone..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="section-card">
        <div style={{ overflowX: 'auto' }}>
          {loading ? (
            <div className="empty-state"><div className="spinner" /></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state"><p>No customers found.</p></div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Provider</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => {
                  const uid = user._id || user.id
                  const name = user.fullName || user.name || '—'
                  const isBanned = Boolean(user.isBanned || user.status === 'banned')
                  return (
                    <tr key={uid}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {user.profileImage ? (
                            <img src={user.profileImage} alt="" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--accent-light)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.75rem', flexShrink: 0 }}>
                              {name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                          <span style={{ fontWeight: 600 }}>{name}</span>
                        </div>
                      </td>
                      <td style={{ color: 'var(--text-secondary)' }}>{user.email || '—'}</td>
                      <td style={{ color: 'var(--text-secondary)' }}>{user.phone || '—'}</td>
                      <td><span className="badge badge-neutral">{user.role || 'customer'}</span></td>
                      <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>{user.provider || user.authProvider || '—'}</td>
                      <td>{statusBadge(user)}</td>
                      <td style={{ color: 'var(--text-tertiary)', fontSize: '0.8125rem' }}>
                        {user.createdAt || user.created_at ? new Date(user.createdAt || user.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td>
                        <button
                          className={`btn ${isBanned ? 'btn-secondary' : 'btn-danger'}`}
                          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
                          disabled={actionId === uid}
                          onClick={() => toggleBan(user)}
                        >
                          {actionId === uid ? <div className="spinner" /> : (isBanned ? 'Unban' : 'Ban')}
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
