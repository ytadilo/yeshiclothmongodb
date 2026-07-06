import React, { useEffect, useState, createContext, useContext } from 'react';
import { auth, googleProvider } from '../firebase';
import { signInWithPopup, signOut as fbSignOut, onAuthStateChanged } from 'firebase/auth';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loginWithGoogle = async () => {
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email;
      if (email !== 'hailetadilo@gmail.com') {
        await fbSignOut(auth);
        throw new Error('Access Denied: Only hailetadilo@gmail.com is authorized to access the admin dashboard.');
      }
      return result.user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await fbSignOut(auth);
      setUser(null);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (currentUser.email === 'hailetadilo@gmail.com') {
          setUser(currentUser);
        } else {
          await fbSignOut(auth);
          setUser(null);
          setError('Access Denied: Restricted access.');
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, loginWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
