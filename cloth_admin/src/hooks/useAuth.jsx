import React, { useEffect, useState, createContext, useContext, useCallback } from 'react';

/**
 * useAuth — JWT-based auth context.
 *
 * Uses the same localStorage keys as the old HTML admin pages:
 *   localStorage.token  — JWT issued by /api/auth/login
 *   localStorage.user   — JSON-serialised user object
 *   localStorage.role   — role string
 *
 * This lets the React admin pages (Dashboard, Orders, etc.) and the old
 * HTML admin pages in public/admin/ share the same session seamlessly.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'https://myclothefullstackhaile.onrender.com';

const AuthContext = createContext(null);

function safeParseUser() {
  try {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(() => safeParseUser());
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  // On mount: verify stored token is still valid
  const verifyToken = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { 'x-auth-token': token }
      });

      if (!res.ok) {
        // Token expired or invalid — clear session
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('role');
        setUser(null);
      } else {
        const data = await res.json();
        const freshUser = data.user || safeParseUser();
        if (freshUser && String(freshUser.role || '').toLowerCase() === 'admin') {
          setUser(freshUser);
          localStorage.setItem('user', JSON.stringify(freshUser));
        } else {
          // Logged in but not admin
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('role');
          setUser(null);
        }
      }
    } catch {
      // Network error — keep stored user so offline navigation still works
      const storedUser = safeParseUser();
      if (storedUser && String(storedUser.role || '').toLowerCase() === 'admin') {
        setUser(storedUser);
      } else {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    verifyToken();
  }, [verifyToken]);

  /**
   * loginWithGoogle kept for backward compat but now not used.
   * Login is handled directly in Login.jsx via POST /api/auth/login.
   */
  const loginWithGoogle = async () => {
    throw new Error('Use the login form instead of Google Sign-In.');
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('role');
    localStorage.removeItem('loginTime');
    setUser(null);
    setError(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
