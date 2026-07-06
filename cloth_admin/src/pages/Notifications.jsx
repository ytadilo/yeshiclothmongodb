import React from 'react'
import { useNotifications } from '../hooks/useNotifications'

export default function Notifications({ adminMongoId }) {
  const { notifications, unreadCount, loading, markAllAsRead } = useNotifications(adminMongoId)

  if (loading) {
    return (
      <div className="empty-state">
        <div className="spinner" />
      </div>
    )
  }

  const formatTimestamp = (timestamp) => {
    if (!timestamp) return '—'
    // Firestore Timestamp object
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp)
    if (isNaN(date.getTime())) return '—'
    return date.toLocaleString()
  }

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h1>Notifications</h1>
          <p>
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
              : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button className="btn btn-primary" onClick={markAllAsRead}>
            Mark all as read
          </button>
        )}
      </div>

      <div className="section-card">
        <div className="section-card-header">
          <span style={{ fontWeight: 700 }}>All Notifications</span>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-tertiary)' }}>
            {notifications.length} total
          </span>
        </div>

        {notifications.length === 0 ? (
          <div className="empty-state" style={{ padding: '48px 24px' }}>
            <p style={{ color: 'var(--text-tertiary)' }}>No notifications yet.</p>
          </div>
        ) : (
          <div style={{ overflowY: 'auto', maxHeight: '70vh' }}>
            {notifications.map((notification) => (
              <div
                key={notification.id}
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '16px',
                  padding: '16px 24px',
                  borderBottom: '1px solid var(--border)',
                  background: notification.is_read
                    ? 'transparent'
                    : 'rgba(var(--accent-rgb, 30, 75, 53), 0.04)',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
                      {notification.title || 'Notification'}
                    </span>
                    <span className={notification.is_read ? 'badge-success' : 'badge-warning'}>
                      {notification.is_read ? 'Read' : 'Unread'}
                    </span>
                  </div>
                  {notification.body && (
                    <p style={{ margin: '0 0 6px', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                      {notification.body}
                    </p>
                  )}
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
                    {formatTimestamp(notification.timestamp)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
