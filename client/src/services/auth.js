import { api } from './api';

export async function login(email, password) {
  const r = await api('/api/auth/login', { method: 'POST', body: { email, password } });
  if (r.csrfToken) localStorage.setItem('csrf', r.csrfToken);
  return r;
}

export async function register(email, password) {
  const r = await api('/api/auth/register', { method: 'POST', body: { email, password } });
  if (r.csrfToken) localStorage.setItem('csrf', r.csrfToken);
  return r;
}

export async function getMe() { return api('/api/auth/me'); }
export async function logout() { return api('/api/auth/logout', { method: 'POST' }); }
