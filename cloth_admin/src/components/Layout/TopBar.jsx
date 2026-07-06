import React, { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import NotificationBell from '../NotificationBell';

const TopBar = ({ adminMongoId }) => {
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  return (
    <header style={{
      height: '70px',
      backgroundColor: 'var(--bg-secondary)',
      borderBottom: '1px solid var(--border-color)',
      padding: '0 32px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 90
    }}>
      {/* Search / Title Placeholder */}
      <div>
        <h2 style={{
          fontSize: '1.25rem',
          fontFamily: 'var(--font-heading)',
          fontWeight: 700
        }}>
          Control Panel
        </h2>
      </div>

      {/* Right controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '20px'
      }}>
        {/* Dark/Light mode toggle */}
        <button 
          onClick={toggleTheme}
          className="btn-icon" 
          title="Toggle Theme"
          style={{ width: '40px', height: '40px', borderRadius: '50%' }}
        >
          {theme === 'light' ? (
            <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/>
            </svg>
          ) : (
            <svg style={{ width: '20px', height: '20px' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m2.828-9.9a5 5 0 117.072 0l-.547.547M16 12a4 4 0 11-8 0 4 4 0 018 0z"/>
            </svg>
          )}
        </button>

        {/* Real-time Notifications Bell */}
        <NotificationBell adminMongoId={adminMongoId} />

        {/* Admin profile drop-info */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          borderLeft: '1px solid var(--border-color)',
          paddingLeft: '20px'
        }}>
          {user?.photoURL ? (
            <img 
              src={user.photoURL} 
              alt="Profile" 
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '2px solid var(--border-color)'
              }}
            />
          ) : (
            <div style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              backgroundColor: 'var(--accent-light)',
              color: 'var(--accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600
            }}>
              A
            </div>
          )}
          
          <div style={{ display: 'none', flexDirection: 'column' }} className="sm:flex">
            <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{user?.displayName || 'Admin'}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>{user?.email}</span>
          </div>

          <button 
            onClick={logout}
            className="btn btn-secondary" 
            style={{ 
              padding: '6px 12px', 
              fontSize: '0.75rem',
              borderRadius: 'var(--radius-sm)'
            }}
          >
            Logout
          </button>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
