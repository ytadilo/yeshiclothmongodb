import React, { useEffect, useState } from 'react'
import api from '../api/axios'

export default function Settings() {
  // Social links state
  const [social, setSocial] = useState({
    tiktok: '',
    telegram: '',
    instagram: '',
    whatsapp: '',
    phone: ''
  })

  // Site content state
  const [siteContent, setSiteContent] = useState({
    siteTitle: '',
    footerBrand: '',
    headerLogoUrl: '',
    faviconUrl: ''
  })

  const [loading, setLoading] = useState(true)
  const [savingSocial, setSavingSocial] = useState(false)
  const [savingContent, setSavingContent] = useState(false)
  const [toast, setToast] = useState(null)

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  useEffect(() => {
    const load = async () => {
      try {
        // Load social links
        const [socialRes, contentRes] = await Promise.allSettled([
          api.get('/api/settings/social'),
          api.get('/api/settings/content')
        ])

        if (socialRes.status === 'fulfilled') {
          const d = socialRes.value.data?.social || socialRes.value.data || {}
          setSocial({
            tiktok: d.tiktok || d.socialTikTok || '',
            telegram: d.telegram || d.socialTelegram || '',
            instagram: d.instagram || d.socialInstagram || '',
            whatsapp: d.whatsapp || d.socialWhatsApp || '',
            phone: d.phone || d.socialPhone || ''
          })
        }

        if (contentRes.status === 'fulfilled') {
          const d = contentRes.value.data?.content || contentRes.value.data || {}
          setSiteContent({
            siteTitle: d.siteTitle || '',
            footerBrand: d.footerBrand || '',
            headerLogoUrl: d.headerLogoUrl || '',
            faviconUrl: d.faviconUrl || ''
          })
        }
      } catch (err) {
        console.error('Failed to load settings:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleSaveSocial = async (e) => {
    e.preventDefault()
    setSavingSocial(true)
    try {
      await api.put('/api/settings/social', { social })
      showToast('Social links saved successfully')
    } catch (err) {
      showToast(err?.response?.data?.msg || 'Failed to save social links', 'error')
    } finally {
      setSavingSocial(false)
    }
  }

  const handleSaveContent = async (e) => {
    e.preventDefault()
    setSavingContent(true)
    try {
      await api.put('/api/settings/content', { content: siteContent })
      showToast('Site content saved successfully')
    } catch (err) {
      showToast(err?.response?.data?.msg || 'Failed to save site content', 'error')
    } finally {
      setSavingContent(false)
    }
  }

  const socialField = (key, label, placeholder = '', type = 'text') => (
    <div className="form-group" key={key}>
      <label className="form-label">{label}</label>
      <input
        className="form-control"
        type={type}
        value={social[key] || ''}
        placeholder={placeholder}
        onChange={e => setSocial(s => ({ ...s, [key]: e.target.value }))}
      />
    </div>
  )

  const contentField = (key, label, placeholder = '', type = 'text') => (
    <div className="form-group" key={key}>
      <label className="form-label">{label}</label>
      <input
        className="form-control"
        type={type}
        value={siteContent[key] || ''}
        placeholder={placeholder}
        onChange={e => setSiteContent(c => ({ ...c, [key]: e.target.value }))}
      />
    </div>
  )

  if (loading) return <div className="empty-state"><div className="spinner" /></div>

  return (
    <div className="animate-fade-in">
      {toast && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 9999,
          padding: '12px 20px',
          borderRadius: 'var(--radius-sm)',
          background: toast.type === 'error' ? 'var(--danger)' : 'var(--success)',
          color: '#fff',
          fontWeight: 600,
          boxShadow: 'var(--shadow-lg)'
        }}>
          {toast.msg}
        </div>
      )}

      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage social links and site content settings.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Social Links Section */}
        <form onSubmit={handleSaveSocial}>
          <div className="glass-card">
            <div style={{ fontWeight: 700, marginBottom: '16px' }}>Social Links</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {socialField('tiktok', 'TikTok', 'https://www.tiktok.com/@...')}
              {socialField('telegram', 'Telegram', 'https://t.me/...')}
              {socialField('instagram', 'Instagram', 'https://instagram.com/...')}
              {socialField('whatsapp', 'WhatsApp Link', 'https://wa.me/2519...')}
              {socialField('phone', 'Phone', '+251...')}
            </div>
            <div style={{ marginTop: '20px' }}>
              <button type="submit" className="btn btn-primary" disabled={savingSocial}>
                {savingSocial
                  ? <><div className="spinner" /><span>Saving...</span></>
                  : 'Save Social Links'}
              </button>
            </div>
          </div>
        </form>

        {/* Site Content Section */}
        <form onSubmit={handleSaveContent}>
          <div className="glass-card">
            <div style={{ fontWeight: 700, marginBottom: '16px' }}>Site Content</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {contentField('siteTitle', 'Site Title', 'Yeshi Clothe')}
              {contentField('footerBrand', 'Footer Brand', 'Yeshi Clothe')}
              {contentField('headerLogoUrl', 'Header Logo URL', 'https://...')}
              {contentField('faviconUrl', 'Favicon URL', 'https://...')}
            </div>
            <div style={{ marginTop: '20px' }}>
              <button type="submit" className="btn btn-primary" disabled={savingContent}>
                {savingContent
                  ? <><div className="spinner" /><span>Saving...</span></>
                  : 'Save Site Content'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
