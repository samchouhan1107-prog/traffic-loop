import { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { useAuth } from '../components/AuthContext.jsx';
import StreakPanel from '../components/StreakPanel.jsx';
import PromoPanel from '../components/PromoPanel.jsx';

export default function Dashboard() {
  const { streak, promo, refreshStreakAndPromo } = useAuth();
  const [campaigns, setCampaigns] = useState([]);
  const [health, setHealth] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
      api('/api/health').catch(() => null),
      api('/api/campaigns').catch((e) => { if (alive) setError(e.message); return { campaigns: [] }; }),
    ]).then(([h, c]) => {
      if (!alive) return;
      setHealth(h);
      setCampaigns(c?.campaigns || []);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const total = campaigns.length;
  const running = campaigns.filter((c) => ['PENDING_EGRESS', 'RUNNING', 'EGRESS_REQUESTED', 'EGRESS_VERIFIED'].includes(c.status)).length;
  const completed = campaigns.filter((c) => c.status === 'COMPLETED').length;
  const failed = campaigns.filter((c) => c.status === 'FAILED').length;

  if (loading && !health) {
    return <section className="page"><div className="page-loading">Loading dashboard…</div></section>;
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>Dashboard</h1>
        <p className="muted">Honest multi-country traffic probing — failure points, not fabricated numbers.</p>
      </header>

      <div className="cards">
        <Stat label="Total campaigns" value={total} />
        <Stat label="Running" value={running} accent="info" />
        <Stat label="Completed" value={completed} accent="success" />
        <Stat label="Failed" value={failed} accent="danger" />
      </div>

      {/* Streak + Promo panels */}
      <div className="dashboard-promo-row">
        <div className="card">
          <StreakPanel streak={streak} onClaim={() => refreshStreakAndPromo()} />
        </div>
        <div className="card">
          <PromoPanel promo={promo} />
        </div>
      </div>

      <div className="card">
        <h2>System health</h2>
        {health ? (
          <ul className="kv">
            <li><span>Status</span><b>{health.status}</b></li>
            <li><span>Environment</span><b>{health.environment}</b></li>
            <li><span>Database</span><b>{health.database}</b></li>
            <li><span>Timestamp</span><b>{health.timestamp}</b></li>
          </ul>
        ) : <p className="muted">Backend health unknown — could not reach /api/health.</p>}
      </div>

      <div className="card">
        <h2>Recent campaigns</h2>
        {error && <p className="error">{error}</p>}
        {campaigns.length === 0 ? (
          <p className="muted">No campaigns yet. Try the free promo from the landing page!</p>
        ) : (
          <table className="table">
            <thead>
              <tr><th>ID</th><th>URL</th><th>Group</th><th>Status</th><th>Created</th></tr>
            </thead>
            <tbody>
              {campaigns.slice(0, 20).map((c) => (
                <tr key={c.id}>
                  <td><a href={`/campaigns/${c.id}`} className="link">{c.id.slice(0, 12)}</a></td>
                  <td className="truncate">{c.url}</td>
                  <td>{c.country_group}</td>
                  <td><StatusPill status={c.status} /></td>
                  <td className="muted">{c.created_at}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div className={`stat stat-${accent || 'default'}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function StatusPill({ status }) {
  const map = {
    PENDING_EGRESS: 'info', RUNNING: 'info', EGRESS_REQUESTED: 'info', EGRESS_VERIFIED: 'info',
    COMPLETED: 'success', FAILED: 'danger', CANCELLED: 'muted',
  };
  return <span className={`pill pill-${map[status] || 'muted'}`}>{status || 'UNKNOWN'}</span>;
}
