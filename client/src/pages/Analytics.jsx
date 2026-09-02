import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../services/api.js';

export default function Analytics({ diagnosticMode = false }) {
  const { campaignId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [campaigns, setCampaigns] = useState([]);

  useEffect(() => {
    api('/api/campaigns').then((r) => setCampaigns(r.campaigns || [])).catch(() => setCampaigns([]));
  }, []);

  useEffect(() => {
    if (!campaignId) return;
    let stop = false;
    const tick = async () => {
      try {
        if (diagnosticMode) {
          const r = await api('/api/campaigns/' + campaignId + '/diagnostic');
          if (!stop) setData(r);
        } else {
          const r = await api('/api/analytics/' + campaignId);
          if (!stop) setData(r);
        }
      } catch (e) { if (!stop) setError(e.message); }
    };
    tick();
    const h = setInterval(tick, 5000);
    return () => { stop = true; clearInterval(h); };
  }, [campaignId, diagnosticMode]);

  if (!campaignId) {
    return (
      <section className="page">
        <header className="page-header"><h1>Analytics</h1></header>
        <div className="card">
          <p className="muted">Pick a campaign to view its analytics. Counts shown below are only what the backend has actually returned.</p>
          {campaigns.length === 0 ? (
            <p className="muted">No campaigns yet.</p>
          ) : (
            <ul className="list">
              {campaigns.map((c) => (
                <li key={c.id}><a className="link" href={`/analytics/${c.id}`}>{c.url}</a> <span className="muted">· {c.status}</span></li>
              ))}
            </ul>
          )}
        </div>
      </section>
    );
  }

  if (error) return <section className="page"><p className="error">Analytics unavailable: {error}</p></section>;
  if (!data) return <section className="page"><div className="page-loading">Loading analytics…</div></section>;

  if (diagnosticMode) {
    return <DiagnosticView data={data} campaignId={campaignId} />;
  }

  const ga4 = data.ga4 || { configured: false, observed: 0 };
  const hits = Array.isArray(data.hits) ? data.hits : [];
  const sessionsByCountry = aggregate(hits, (h) => h.country || h.cc || 'unknown');
  const byEvent = aggregate(hits, (h) => h.event || 'page_view');

  return (
    <section className="page">
      <header className="page-header">
        <h1>Analytics — {campaignId.slice(0, 8)}</h1>
        <p className="muted">GA4 hits are recorded only when GA4 is actually configured. We never fabricate counts.</p>
      </header>

      <div className="cards">
        <div className="stat">
          <div className="stat-value">
            {ga4.configured ? <span className="green">connected</span> : <span className="pill pill-warning">NOT_CONFIGURED</span>}
          </div>
          <div className="stat-label">GA4 status</div>
        </div>
        <div className="stat">
          <div className="stat-value">{typeof ga4.observed === 'number' ? ga4.observed : 0}</div>
          <div className="stat-label">Observed sessions (backend-verified)</div>
        </div>
        <div className="stat">
          <div className="stat-value">{hits.length}</div>
          <div className="stat-label">Recorded hits (returned by backend)</div>
        </div>
      </div>

      <div className="card">
        <h2>Hits by country</h2>
        <Bar data={sessionsByCountry} emptyText="No country data returned by the backend yet." />
      </div>

      <div className="card">
        <h2>Hits by event</h2>
        <Bar data={byEvent} emptyText="No event data returned by the backend yet." />
      </div>

      <div className="card">
        <h2>Raw hits</h2>
        {hits.length === 0 ? <p className="muted">No hits returned by the backend for this campaign.</p> : (
          <table className="table">
            <thead><tr><th>Time</th><th>Event</th><th>Country</th><th>Session</th></tr></thead>
            <tbody>
              {hits.slice(0, 100).map((h, i) => (
                <tr key={i}>
                  <td className="muted">{h.ts || h.timestamp || ''}</td>
                  <td>{h.event || 'page_view'}</td>
                  <td>{h.country || h.cc || '—'}</td>
                  <td className="muted">{(h.sessionId || '').slice(0, 8)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function DiagnosticView({ data, campaignId }) {
  const diag = data.diagnostic || data;
  const pipeline = diag.pipeline || {};
  const summary = diag.summary || {};
  const ga4 = diag.ga4 || {};
  return (
    <section className="page">
      <header className="page-header">
        <h1>Failure-Point Diagnostic — {campaignId.slice(0, 8)}</h1>
        <p className="muted">Each pipeline stage reflects the backend's actual status. Stages without data are not claimed as successful.</p>
      </header>
      <div className="card">
        <h2>Pipeline stages</h2>
        {Object.keys(pipeline).length === 0 ? (
          <p className="muted">No pipeline data returned yet.</p>
        ) : (
          <ul className="list">
            {Object.entries(pipeline).map(([stage, info]) => (
              <li key={stage}>
                <b>{stage}</b> · <span className={`pill ${info.status === 'OK' ? 'pill-success' : info.status === 'FAILED' ? 'pill-danger' : 'pill-info'}`}>{info.status || '—'}</span>
                {info.failures > 0 && <span className="error-code"> · {info.failures} failure(s) · {info.lastError}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="card">
        <h2>Summary</h2>
        <ul className="kv">
          <li><span>Started</span><b>{summary.started || '—'}</b></li>
          <li><span>Completed</span><b>{summary.completed || 0}</b></li>
          <li><span>Failed</span><b>{summary.failed || 0}</b></li>
          <li><span>Unverified</span><b>{summary.unverified || 0}</b></li>
          <li><span>Recovered</span><b>{summary.recovered || 0}</b></li>
        </ul>
      </div>
      <div className="card">
        <h2>GA4</h2>
        <p>
          <span className={`pill ${ga4.status === 'OK' ? 'pill-success' : ga4.status === 'NOT_CONFIGURED' ? 'pill-warning' : 'pill-info'}`}>{ga4.status || 'UNKNOWN'}</span>
          {ga4.detail && <span className="muted"> · {ga4.detail}</span>}
        </p>
      </div>
    </section>
  );
}

function aggregate(rows, key) {
  const out = {};
  for (const r of rows) {
    const k = key(r) || 'unknown';
    out[k] = (out[k] || 0) + 1;
  }
  return out;
}

function Bar({ data, emptyText }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return <p className="muted">{emptyText || 'No data.'}</p>;
  const max = Math.max(...entries.map(([, v]) => v));
  return (
    <ul className="bars">
      {entries.map(([k, v]) => (
        <li key={k}>
          <span className="bar-label">{k}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(v / max) * 100}%` }} /></span>
          <span className="bar-value">{v}</span>
        </li>
      ))}
    </ul>
  );
}
