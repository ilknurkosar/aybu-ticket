import { createContext, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('user');
    return stored ? JSON.parse(stored) : null;
  });

  useEffect(() => {
    if (!localStorage.getItem('accessToken')) return;
    apiRequest('/auth/me')
      .then((data) => {
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      })
      .catch(() => logout());
  }, []);

  function saveSession(payload) {
    localStorage.setItem('accessToken', payload.tokens.accessToken);
    localStorage.setItem('refreshToken', payload.tokens.refreshToken);
    localStorage.setItem('user', JSON.stringify(payload.user));
    setUser(payload.user);
  }

  async function login(email, password) {
    const payload = await apiRequest('/auth/login', { method: 'POST', body: { email, password } });
    saveSession(payload);
    return payload;
  }

  async function register(fullName, email, password) {
    const payload = await apiRequest('/auth/register', {
      method: 'POST',
      body: { fullName, email, password }
    });
    saveSession(payload);
    return payload;
  }

  async function sendVerification() {
    await apiRequest('/auth/send-verification', { method: 'POST' });
  }

  async function verifyEmail(code) {
    await apiRequest('/auth/verify-email', { method: 'POST', body: { code } });
    const stored = localStorage.getItem('user');
    if (stored) {
      const parsed = JSON.parse(stored);
      parsed.emailVerified = true;
      localStorage.setItem('user', JSON.stringify(parsed));
      setUser(parsed);
    }
  }

  async function logout() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (refreshToken) {
      apiRequest('/auth/logout', { method: 'POST', body: { refreshToken } }).catch(() => {});
    }
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, login, register, sendVerification, verifyEmail, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
