import React, { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthContext.jsx';
import { api } from '../services/api';

export default function Settings() {
  const { user, logout } = useAuth();
  const [devices, setDevices] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/auth/devices')
      .then(r => setDevices(r.devices || []))
      .catch(e => setError(e.message));
  }, []);

  return (
    <section className="page">
      <header className="page-header">
        <h1>Settings</h1>
        <p className="muted">Account information is read directly from the backend.</p>
      </header>

      <div className="card">
        <h2>Account</h2>
        {user ? (
          <ul className="kv">
            <li><span>Email</span><b>{user.email || '—'}</b></li>
            <li><span>Email verified</span><b>{user.email_verified ? 'yes' : 'no'}</b></li>
            <li><span>Display name</span><b>{user.display_name || '—'}</b></li>
            <li><span>Role</span><b>{user.role || 'user'}</b></li>
          </ul>
        ) : <p className="muted">Not signed in.</p>}
        <button className="btn" onClick={logout}>Log out</button>
      </div>

      <div className="card">
        <h2>Active sessions</h2>
        {error && <p className="error">{error}</p>}
        {devices.length === 0 ? <p className="muted">No active sessions returned.</p> : (
          <table className="table">
            <thead><tr><th>Device</th><th>IP</th><th>Last seen</th></tr></thead>
            <tbody>
              {devices.map(d => (
                <tr key={d.id}>
                  <td className="truncate">{d.user_agent || '—'}</td>
                  <td>{d.ip || '—'}</td>
                  <td className="muted">{d.last_seen_at || d.created_at || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
