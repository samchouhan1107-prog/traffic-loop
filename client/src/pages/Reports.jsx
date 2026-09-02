import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

export default function Reports() {
  const [campaigns, setCampaigns] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api('/api/campaigns')
      .then(r => { if (alive) setCampaigns(r.campaigns || []); })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);

  const viewDiagnostic = (id) => { window.location.href = `/campaigns/${id}/diagnostic`; };
  const viewAnalytics = (id) => { window.location.href = `/campaigns/${id}/analytics`; };

  return (
    <section className="page">
      <header className="page-header">
        <h1>Reports</h1>
        <p className="muted">Per-campaign reports reflect only what the backend has recorded. CSV/JSON export is not yet exposed by the backend.</p>
      </header>
      {error && <p className="error">Could not load campaigns: {error}</p>}
      <div className="card">
        <h2>Campaigns</h2>
        {campaigns.length === 0 ? (
          <p className="muted">No campaigns yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>ID</th><th>URL</th><th>Status</th><th>Created</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id}>
                  <td className="muted">{c.id.slice(0, 8)}</td>
                  <td className="truncate">{c.url}</td>
                  <td>{c.status}</td>
                  <td className="muted">{c.created_at}</td>
                  <td>
                    <button className="btn small" onClick={() => viewAnalytics(c.id)}>Analytics</button>
                    <button className="btn small" onClick={() => viewDiagnostic(c.id)}>Diagnostic</button>
                    <Link className="btn small" to={`/campaigns/${c.id}`}>Live</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="card">
        <h2>Export</h2>
        <p className="muted">No export endpoint is registered in the backend (verified against <code>server/routes/*.js</code>). Use Analytics and Diagnostic pages to inspect the underlying data.</p>
      </div>
    </section>
  );
}
