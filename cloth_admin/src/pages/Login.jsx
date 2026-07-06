import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Admin Login Page
 * Email + password login matching the old HTML admin structure.
 * Calls POST /api/auth/login, stores JWT in localStorage under 'token'.
 * Also stores user object under 'user' key so admin-guard.js and
 * admin-common.js in public/ work identically.
 */
const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState(null);
  const [loading, setLoading]   = useState(false);

  // If already logged in as admin, go to dashboard
  useEffect(() => {
    const token = localStorage.getItem('token');
    const user  = (() => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } })();
    if (token && user?.role === 'admin') {
      navigate('/', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password.trim()) {
      setError('Email and password are required.');
      return;
    }

    setLoading(true);
    try {
      // Get device fingerprint (same as admin-common.js)
      let fp = '';
      try {
        const payload = {
          ua: navigator.userAgent || '',
          lang: navigator.language || '',
          langs: Array.isArray(navigator.languages) ? navigator.languages : [],
          plat: navigator.platform || '',
          hc: navigator.hardwareConcurrency || 0,
          dm: navigator.deviceMemory || 0,
          scr: { w: screen?.width || 0, h: screen?.height || 0, d: screen?.colorDepth || 0 },
          tz: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
          tzOff: new Date().getTimezoneOffset()
        };
        fp = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
      } catch (_) {}

      const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://myclothefullstackhaile.onrender.com'}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(fp ? { 'x-device-fingerprint': fp } : {})
        },
        body: JSON.stringify({ email: email.trim(), password })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.msg || 'Invalid credentials');
      }

      if (!data.token) {
        throw new Error('No token received from server');
      }

      const user = data.user || {};

      if (String(user.role || '').toLowerCase() !== 'admin') {
        throw new Error('Access denied — admin account required.');
      }

      // Store exactly as the old HTML admin expects
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(user));
      localStorage.setItem('role', user.role || 'admin');
      localStorage.setItem('loginTime', String(Date.now()));

      navigate('/', { replace: true });
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'var(--bg-primary)',
      backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(30,75,53,0.07) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(30,75,53,0.07) 0%, transparent 40%)',
      padding: '20px'
    }}>
      <div className="glass-panel animate-fade-in" style={{
        width: '100%',
        maxWidth: '420px',
        padding: '40px',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center'
      }}>
        {/* Logo */}
        <div style={{ marginBottom: '24px' }}>
          <img src="/images/logo.png" alt="Yeshi Clothe" style={{ width: '64px', height: '64px', objectFit: 'contain', borderRadius: '12px' }}
            onError={e => { e.target.style.display = 'none'; }} />
        </div>

        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'var(--font-heading)', marginBottom: '6px' }}>
          Admin Login
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', marginBottom: '28px' }}>
          Use your email and password to continue.
        </p>

        {error && (
          <div style={{
            width: '100%',
            padding: '12px 14px',
            borderRadius: 'var(--radius-sm)',
            background: 'rgba(220,38,38,0.08)',
            border: '1px solid rgba(220,38,38,0.25)',
            color: '#dc2626',
            fontSize: '0.8125rem',
            fontWeight: 500,
            marginBottom: '20px',
            textAlign: 'left',
            lineHeight: 1.5
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} noValidate style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Email */}
          <div className="form-group" style={{ textAlign: 'left', marginBottom: 0 }}>
            <label htmlFor="admin-email" style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px', display: 'block' }}>
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              className="form-control"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              disabled={loading}
              placeholder="hailetadilo@gmail.com"
            />
          </div>

          {/* Password */}
          <div className="form-group" style={{ textAlign: 'left', marginBottom: 0 }}>
            <label htmlFor="admin-password" style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '6px', display: 'block' }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                id="admin-password"
                type={showPw ? 'text' : 'password'}
                className="form-control"
                autoComplete="current-password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={loading}
                style={{ paddingRight: '70px' }}
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                style={{
                  position: 'absolute', right: '10px', top: '50%',
                  transform: 'translateY(-50%)', border: 'none',
                  background: 'none', cursor: 'pointer',
                  fontSize: '0.8rem', color: 'var(--text-tertiary)',
                  padding: '4px 6px', fontWeight: 600
                }}
              >
                {showPw ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '12px', fontSize: '0.9375rem', marginTop: '4px' }}
          >
            {loading ? (
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <span className="spinner" style={{ width: '16px', height: '16px' }} />
                Logging in...
              </span>
            ) : 'Login'}
          </button>
        </form>

        <div style={{ marginTop: '20px' }}>
          <a href="/admin/forgot-password" style={{ fontSize: '0.8125rem', color: 'var(--accent)', textDecoration: 'none' }}>
            Forgot password?
          </a>
        </div>

        <div style={{ marginTop: '24px', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
          Authorized account: <strong>hailetadilo@gmail.com</strong>
        </div>
      </div>
    </div>
  );
};

export default Login;
