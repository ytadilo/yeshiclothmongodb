import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const Login = () => {
  const navigate = useNavigate();
  const { loginWithGoogle } = useAuth();
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await loginWithGoogle();
      navigate('/');
    } catch (err) {
      console.error('Login error:', err);
      setError(err.message || 'Authentication failed. Please verify your email.');
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
      backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.05) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(99, 102, 241, 0.05) 0%, transparent 40%)',
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
        <div style={{
          width: '56px',
          height: '56px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, var(--accent), var(--accent-dark))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          fontWeight: 700,
          fontSize: '1.8rem',
          fontFamily: 'var(--font-heading)',
          marginBottom: '24px',
          boxShadow: '0 8px 16px rgba(99, 102, 241, 0.3)'
        }}>
          Y
        </div>

        <h1 style={{
          fontSize: '1.75rem',
          fontWeight: 700,
          fontFamily: 'var(--font-heading)',
          marginBottom: '8px'
        }}>
          Welcome Back
        </h1>
        <p style={{
          fontSize: '0.875rem',
          color: 'var(--text-secondary)',
          marginBottom: '32px'
        }}>
          Sign in to access your e-commerce admin dashboard
        </p>

        {error && (
          <div className="badge-danger" style={{
            width: '100%',
            padding: '12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.8125rem',
            fontWeight: 500,
            marginBottom: '24px',
            textAlign: 'left',
            lineHeight: 1.4
          }}>
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="btn btn-primary"
          style={{
            width: '100%',
            padding: '12px 20px',
            borderRadius: 'var(--radius-sm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            fontSize: '0.9375rem'
          }}
        >
          {loading ? (
            <span>Signing in...</span>
          ) : (
            <>
              <svg style={{ width: '20px', height: '20px' }} viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M12.24 10.285V13.4h6.887C18.2 15.614 15.645 18 12.24 18c-3.86 0-7-3.14-7-7s3.14-7 7-7c1.7 0 3.25.61 4.47 1.625l2.437-2.437C17.312 1.696 14.933 1 12.24 1 6.58 1 2 5.58 2 11.24s4.58 10.24 10.24 10.24c5.795 0 10.254-4.074 10.254-10.24 0-.695-.08-1.355-.22-1.955H12.24z"
                />
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </button>

        <div style={{
          marginTop: '32px',
          fontSize: '0.75rem',
          color: 'var(--text-tertiary)'
        }}>
          Authorized email: <strong>hailetadilo@gmail.com</strong>
        </div>
      </div>
    </div>
  );
};

export default Login;
