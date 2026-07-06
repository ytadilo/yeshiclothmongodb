import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

export default function Products() {
  const navigate = useNavigate()
  const [products, setProducts] = useState([])
  const [filtered, setFiltered] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('All')
  const [categories, setCategories] = useState([])
  const [toast, setToast] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  const load = async () => {
    try {
      const res = await api.get('/api/posts')
      const d = res.data
      const list = Array.isArray(d) ? d : (Array.isArray(d?.posts) ? d.posts : [])
      setProducts(list)
      setFiltered(list)
      const cats = [...new Set(list.flatMap(p => Array.isArray(p.categories) ? p.categories : [p.category]).filter(Boolean))]
      setCategories(cats)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    let result = products
    if (filterCat !== 'All') {
      result = result.filter(p => {
        const cats = Array.isArray(p.categories) ? p.categories : [p.category]
        return cats.includes(filterCat)
      })
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      result = result.filter(p => (p.title || p.name || '').toLowerCase().includes(q))
    }
    setFiltered(result)
  }, [products, search, filterCat])

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this product?')) return
    setDeleting(id)
    try {
      await api.delete(`/api/posts/${id}`)
      showToast('Product deleted')
      load()
    } catch (err) {
      showToast(err?.response?.data?.msg || 'Delete failed', 'error')
    } finally {
      setDeleting(null)
    }
  }

  const getImage = (p) => {
    const imgs = Array.isArray(p.images) ? p.images : []
    return imgs[0] || p.image_url || p.imageUrl || ''
  }

  return (
    <div className="animate-fade-in">
      {toast && (
        <div style={{ position:'fixed', top:'20px', right:'20px', zIndex:9999, padding:'12px 20px', borderRadius:'var(--radius-sm)', background: toast.type==='error' ? 'var(--danger)' : 'var(--success)', color:'#fff', fontWeight:600, boxShadow:'var(--shadow-lg)' }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div className="page-header" style={{ margin: 0 }}>
          <h1>Products</h1>
          <p>Manage your clothing catalog and product listings.</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/products/new')}>
          + Add Product
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
        <input className="form-control" style={{ maxWidth: '260px' }} placeholder="Search products..." value={search} onChange={e => setSearch(e.target.value)} />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['All', ...categories].map(c => (
            <button key={c} className={`btn ${filterCat === c ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '6px 12px', fontSize: '0.8125rem' }} onClick={() => setFilterCat(c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Product Grid */}
      {loading ? (
        <div className="empty-state"><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <svg style={{ width: '48px', height: '48px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/></svg>
          <p>No products found.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '16px' }}>
          {filtered.map(p => {
            const id = p._id || p.id
            const img = getImage(p)
            const title = p.title || p.name || 'Untitled'
            const cats = Array.isArray(p.categories) ? p.categories : [p.category].filter(Boolean)
            const price = Number(p.price_etb || p.priceEtb || 0)
            return (
              <div key={id} className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                {img ? (
                  <img src={img} alt={title} style={{ width: '100%', height: '180px', objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: '180px', background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)' }}>
                    No Image
                  </div>
                )}
                <div style={{ padding: '14px' }}>
                  <div style={{ fontWeight: 700, fontSize: '0.9375rem', marginBottom: '4px' }}>{title}</div>
                  <div style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)', marginBottom: '8px' }}>{cats.join(', ') || '—'}</div>
                  {price > 0 && <div style={{ fontWeight: 700, color: 'var(--accent)', marginBottom: '12px' }}>{price.toLocaleString()} ETB</div>}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button className="btn btn-secondary" style={{ flex: 1, fontSize: '0.8125rem', padding: '6px' }} onClick={() => navigate(`/products/${id}/edit`)}>
                      Edit
                    </button>
                    <button className="btn btn-danger" style={{ flex: 1, fontSize: '0.8125rem', padding: '6px' }} disabled={deleting === id} onClick={() => handleDelete(id)}>
                      {deleting === id ? <div className="spinner" /> : 'Delete'}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
