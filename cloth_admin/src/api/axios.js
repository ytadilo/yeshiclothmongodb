import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'https://myclothefullstackhaile.onrender.com',
});

/**
 * Request interceptor — attaches the JWT from localStorage.
 * Uses the same key ('token') as the old HTML admin pages so the
 * React admin and the vanilla-HTML pages share the same session.
 */
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers['x-auth-token'] = token;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

/**
 * Response interceptor — on 401, clear the stored session.
 * The user will be redirected to /login by ProtectedRoute on the next render.
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('role');
    }
    return Promise.reject(error);
  }
);

export default api;
