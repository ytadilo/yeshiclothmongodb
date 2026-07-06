import React, { useEffect, useState, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/axios'

const CATEGORIES = ['Women', 'Men', 'Couple', 'Kids', 'Wedding', 'Accessories', 'Traditional']

export default function ProductForm() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = Boolean(id)
  const fileRef = useRef(null)

  const [form, setForm] = useState({
    title: '', description: '', categories: [], price_etb: '', shipping_price_etb: '', free_shipping: false,
    video_url: '', design_type: '', event_type: '', color: ''
  })
  const [images, setImages] = useState([]) // new File uploads
  const [existingImages, setExistingImages] = useState([]) // URLs for edit mode
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    if (!isEdit) return
    const load = async () => {
      try {
        const res = await api.get(`/api/posts/${id}`)
        const p = res.data?.post || res.data
        setForm({
          title: p.title || p.name || '',
          description: p.description || '',
          categories: Array.isArray(p.categories) ? p.categories : [p.category].filter(Boolean),
          price_etb: p.price_etb || p.priceEtb || '',
          shipping_price_etb: p.shipping_price_etb || p.shippingPriceEtb || '',
          free_shipping: Boolean(p.free_shipping || p.freeShipping),
          video_url: p.video_url || p.videoUrl || '',
          design_type: p.design_type || p.designType || '',
          event_type: p.event_type || p.eventType || '',
          color: p.color || ''
        })
        setExistingImages(Array.isArray(p.images) ? p.images : [])
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id, isEdit])

  const toggleCategory = (cat) => {
    setForm(f => ({
      ...f,
      categories: f.categories.includes(cat) ? f.categories.filter(c => c !== cat) : [...f.categories, cat]
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { showToast('Title is required', 'error'); return }
    if (form.categories.length === 0) { showToast('Select at least one category', 'error'); return }

    setSaving(true)
    try {
      const formData = new FormData()
      formData.append('title', form.title)
      formData.append('description', form.description)
      form.categories.forEach(c => formData.append('categories[]', c))
      if (form.price_etb) formData.append('price_etb', form.price_etb)
      if (form.shipping_price_etb) formData.append('shipping_price_etb', form.shipping_price_etb)
      formData.append('free_shipping', form.free_shipping)
      if (form.video_url) formData.append('video_url', form.video_url)
      if (form.design_type) formData.append('design_type', form.design_type)
      if (form.event_type) formData.append('event_type', form.event_type)
      if (form.color) formData.append('color', form.color)
      images.forEach(img => formData.append('images', img))

      if (isEdit) {
        await api.put(`/api/posts/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
        showToast('Product updated successfully')
      } else {
        await api.post('/api/posts', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
        showToast('Product created successfully')
      }
      setTimeout(() => navigate('/products'), 1200)
    } catch (err) {
      showToast(err?.response?.data?.msg || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="empty-state"><div className="spinner" /></div>

  return (
    <div className="animate-fade-in">
      {toast && (
        <div style={{ position:'fixed', top:'20px', right:'20px', zIndex:9999, padding:'12px 20px', borderRadius:'var(--radius-sm)', background: toast.type==='error' ? 'var(--danger)' : 'var(--success)', color:'#fff', fontWeight:600, boxShadow:'var(--shadow-lg)' }}>
          {toast.msg}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <button className="btn btn-secondary" style={{ padding: '6px 12px' }} onClick={() => navigate('/products')}>← Back</button>
        <h1 style={{ fontSize: '1.5rem' }}>{isEdit ? 'Edit Product' : 'Add New Product'}</h1>
      </div>

      <div className="glass-card">
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Title *</label>
              <input className="form-control" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Color</label>
              <input className="form-control" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea className="form-control" rows="4" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>

          <div className="form-group">
            <label className="form-label">Categories *</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {CATEGORIES.map(cat => (
                <button
                  key={cat} type="button"
                  className={`btn ${form.categories.includes(cat) ? 'btn-primary' : 'btn-secondary'}`}
                  style={{ padding: '6px 14px', fontSize: '0.8125rem' }}
                  onClick={() => toggleCategory(cat)}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Price (ETB)</label>
              <input className="form-control" type="number" value={form.price_etb} onChange={e => setForm(f => ({ ...f, price_etb: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Shipping Price (ETB)</label>
              <input className="form-control" type="number" value={form.shipping_price_etb} onChange={e => setForm(f => ({ ...f, shipping_price_etb: e.target.value }))} disabled={form.free_shipping} />
            </div>
            <div className="form-group" style={{ justifyContent: 'flex-end' }}>
              <label className="form-label">Free Shipping</label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.free_shipping} onChange={e => setForm(f => ({ ...f, free_shipping: e.target.checked }))} />
                <span style={{ fontSize: '0.875rem' }}>Yes, free shipping</span>
              </label>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              <label className="form-label">Design Type</label>
              <input className="form-control" value={form.design_type} onChange={e => setForm(f => ({ ...f, design_type: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Event Type</label>
              <input className="form-control" value={form.event_type} onChange={e => setForm(f => ({ ...f, event_type: e.target.value }))} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Video URL (optional)</label>
            <input className="form-control" type="url" value={form.video_url} onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))} placeholder="https://youtube.com/..." />
          </div>

          {/* Existing Images */}
          {existingImages.length > 0 && (
            <div className="form-group">
              <label className="form-label">Current Images</label>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {existingImages.map((img, i) => (
                  <img key={i} src={img} alt="" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }} />
                ))}
              </div>
            </div>
          )}

          {/* New Images */}
          <div className="form-group">
            <label className="form-label">{isEdit ? 'Add New Images' : 'Images'}</label>
            <input ref={fileRef} type="file" multiple accept="image/*" style={{ display: 'none' }} onChange={e => setImages(Array.from(e.target.files))} />
            <button type="button" className="btn btn-secondary" onClick={() => fileRef.current?.click()}>
              Choose Images {images.length > 0 && `(${images.length} selected)`}
            </button>
            {images.length > 0 && (
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '10px' }}>
                {images.map((f, i) => (
                  <img key={i} src={URL.createObjectURL(f)} alt="" style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)' }} />
                ))}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '12px', paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <><div className="spinner" /><span>Saving...</span></> : (isEdit ? 'Update Product' : 'Create Product')}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => navigate('/products')}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  )
}
