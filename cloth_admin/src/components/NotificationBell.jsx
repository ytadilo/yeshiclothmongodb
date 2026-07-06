import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotifications } from '../hooks/useNotifications';

const NotificationBell = ({ adminMongoId }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications(adminMongoId);

  const toggleDropdown = () => setOpen(!open);

  const handleNotificationClick = async (n) => {
    setOpen(false);
    if (!n.is_read) {
      await markAsRead(n.id);
    }
    
    if (n.reference_id) {
      navigate(`/orders/${n.reference_id}`);
    } else {
      navigate('/notifications');
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button 
        onClick={toggleDropdown}
        className="btn-icon" 
        style={{ width: '40px', height: '40px', borderRadius: '50%', position: 'relative' }}
      >
        <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            backgroundColor: 'var(--danger)',
            color: '#ffffff',
            borderRadius: '50%',
            width: '18px',
            height: '18px',
            fontSize: '0.675rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 0 2px var(--bg-secondary)'
          }}>
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div 
          className="glass-panel"
          style={{
            position: 'absolute',
            top: '50px',
            right: 0,
            width: '320px',
            maxHeight: '400px',
            overflowY: 'auto',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            border: '1px solid var(--border-color)',
            zIndex: 110
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifySpaceBetween: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Notifications</span>
            {unreadCount > 0 && (
              <button 
                onClick={markAllAsRead}
                style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', maxHeight: '280px' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '0.875rem' }}>
                No notifications yet
              </div>
            ) : (
              notifications.slice(0, 5).map((n) => (
                <div 
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: n.is_read ? 'transparent' : 'var(--bg-tertiary)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    borderLeft: n.is_read ? '3px solid transparent' : '3px solid var(--accent)',
                    transition: 'background var(--transition-fast)'
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.8125rem' }}>{n.title}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{n.body}</span>
                  <span style={{ fontSize: '0.675rem', color: 'var(--text-tertiary)', textAlign: 'right' }}>
                    {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>

          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '8px', textAlign: 'center' }}>
            <button 
              onClick={() => { setOpen(false); navigate('/notifications'); }}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.8125rem', fontWeight: 600, cursor: 'pointer' }}
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
