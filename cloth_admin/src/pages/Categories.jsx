import React, { useEffect, useState } from 'react'
import api from '../api/axios'

export default function Categories() {
  const [content, setContent] = useState({
    tiktok: '', telegram: '', instagram: '', whatsapp: '', phone: '',
    siteTitle: '', headerLogoUrl: '', faviconUrl: ''
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get('/api/settings/content')
        const d = res.data?.content || res.data || {}
        setContent({
          tiktok: d.tiktok || d.socialTikTok || '',
          telegram: d.telegram || d.socialTelegram || '',
          instagram: d.instagram || d.socialInstagram || '',
          whatsapp: d.whatsapp || d.socialWhatsApp || '',
          phone: d.phone || d.socialPhone || '',
          siteTitle: d.siteTitle || '',
          headerLogoUrl: d.headerLogoUrl || '',
          faviconUrl: d.faviconUrl || ''
        })
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.put('/api/settings/content', { content })
      showToast('Settings saved successfully')
    } catch (err) {
      showToast(err?.response?.data?.msg || 'Save failed', 'error')
    } finally {
      setSaving(false)
    }
  }

  const field = (key, label, placeholder = '', type = 'text') => (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input
        className="form-control"
        type={type}
        value={content[key] || ''}
        placeholder={placeholder}
        onChange={e => setContent(c => ({ ...c, [key]: e.target.value }))}
      />
    </div>
  )

  if (loading) return <div className="empty-state"><div className="spinner" /></div>

  return (
    <div className="animate-fade-in">
      {toast && (
        <div style={{ position:'fixed', top:'20px', right:'20px', zIndex:9999, padding:'12px 20px', borderRadius:'var(--radius-sm)', background: toast.type==='error' ? 'var(--danger)' : 'var(--success)', color:'#fff', fontWeight:600, boxShadow:'var(--shadow-lg)' }}>
          {toast.msg}
        </div>
      )}

      <div className="page-header">
        <h1>Categories & Site Content</h1>
        <p>Manage social links, branding, and site content settings.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '20px' }}>
          <div className="glass-card">
            <div style={{ fontWeight: 700, marginBottom: '16px' }}>Social Links</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {field('tiktok', 'TikTok', 'https://www.tiktok.com/@...')}
              {field('telegram', 'Telegram', 'https://t.me/...')}
              {field('instagram', 'Instagram', 'https://instagram.com/...')}
              {field('whatsapp', 'WhatsApp Link', 'https://wa.me/2519...')}
              {field('phone', 'Phone', '+251...')}
            </div>
          </div>

          <div className="glass-card">
            <div style={{ fontWeight: 700, marginBottom: '16px' }}>Site Branding</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {field('siteTitle', 'Site Title', 'Yeshi Clothe')}
              {field('headerLogoUrl', 'Header Logo URL', 'https://...')}
              {field('faviconUrl', 'Favicon URL', 'https://...')}
            </div>
          </div>
        </div>

        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? <><div className="spinner" /><span>Saving...</span></> : 'Save Settings'}
        </button>
      </form>
    </div>
  )
}
