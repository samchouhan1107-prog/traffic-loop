import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [streak, setStreak] = useState(null);
  const [promo, setPromo] = useState(null);

  const refreshStreakAndPromo = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        api('/api/streak').catch(() => null),
        api('/api/promo/status').catch(() => null),
      ]);
      if (s?.streak) setStreak(s.streak);
      if (p) setPromo(p);
    } catch {}
  }, []);

  useEffect(() => {
    api('/api/auth/me')
      .then((r) => {
        setUser(r.user || null);
        if (r.streak) setStreak(r.streak);
        if (r.promo) setPromo(r.promo);
        // Store CSRF token
        if (r.csrfToken) localStorage.setItem('csrf', r.csrfToken);
      })
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
    if (r.csrfToken) localStorage.setItem('csrf', r.csrfToken);
    setUser(r.user || null);
    // Refresh streak/promo after login
    await refreshStreakAndPromo();
    return r.user;
  }, [refreshStreakAndPromo]);

  const register = useCallback(async (email, password) => {
    const r = await api('/api/auth/register', { method: 'POST', body: { email, password } });
    if (r.csrfToken) localStorage.setItem('csrf', r.csrfToken);
    let u = null;
    try {
      const me = await api('/api/auth/me');
      u = me.user || null;
      if (me.streak) setStreak(me.streak);
      if (me.promo) setPromo(me.promo);
    } catch {}
    setUser(u);
    return { ...r, user: u };
  }, []);

  const logout = useCallback(async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch {}
    setUser(null);
    setStreak(null);
    setPromo(null);
    localStorage.removeItem('csrf');
  }, []);

  return (
    <AuthContext.Provider value={{ user, ready, setUser, login, register, logout, streak, promo, refreshStreakAndPromo }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
