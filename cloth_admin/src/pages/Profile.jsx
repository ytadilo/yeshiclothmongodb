import React from 'react'
import { useAuth } from '../hooks/useAuth'

// Admin accounts are managed via Firebase Console, not the backend.
// There is no profile-edit endpoint — all account changes (display name,
// photo, password) must be made directly in the Firebase Console or via
// Firebase Auth SDK calls outside this panel.

export default function Profile() {
  const { user, logout } = useAuth()

  // Derive initials from displayName or email for the avatar placeholder
  const getInitials = () => {
    if (user?.displayName) {
      return user.displayName
        .split(' ')
        .map(part => part[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    }
    if (user?.email) {
      return user.email[0].toUpperCase()
    }
    return '?'
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h1>Profile</h1>
        <p>Your admin account details. Manage your account via Firebase Console.</p>
      </div>

      <div className="glass-card" style={{ maxWidth: '520px' }}>
        {/* Avatar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '28px' }}>
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt={user.displayName || 'Admin avatar'}
              referrerPolicy="no-referrer"
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '3px solid var(--accent)',
              }}
            />
          ) : (
            <div
              aria-label="Admin initials avatar"
              style={{
                width: '72px',
                height: '72px',
                borderRadius: '50%',
                background: 'var(--accent)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.625rem',
                fontWeight: 800,
                fontFamily: 'var(--font-heading)',
                flexShrink: 0,
              }}
            >
              {getInitials()}
            </div>
          )}

          <div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, marginBottom: '4px' }}>
              {user?.displayName || '—'}
            </div>
            <div style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)' }}>
              {user?.email || '—'}
            </div>
          </div>
        </div>

        {/* Read-only profile fields */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '28px' }}>
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
              Display Name
            </div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 500 }}>
              {user?.displayName || <span style={{ color: 'var(--text-tertiary)' }}>Not set</span>}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
              Email
            </div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 500 }}>
              {user?.email || <span style={{ color: 'var(--text-tertiary)' }}>Unknown</span>}
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
              Account Type
            </div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 500 }}>
              Admin (Firebase)
            </div>
          </div>
        </div>

        {/* Logout */}
        <button
          className="btn btn-primary"
          onClick={logout}
          style={{ width: '100%' }}
        >
          Logout
        </button>
      </div>
    </div>
  )
}
