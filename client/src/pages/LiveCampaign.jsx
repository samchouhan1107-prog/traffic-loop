import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../services/api';
import StationCard from '../components/StationCard';
import TelemetryPanel from '../components/TelemetryPanel';

function CountryRow({ session }) {
  const requested = session.country || session.requested_country || '—';
  const verified = session.verified_country;
  const ip = session.egress_ip || session.ip;
  const status = (session.status || '').toUpperCase();
  const isFailed = ['FAILED', 'EGRESS_MISMATCH', 'EGRESS_UNAVAILABLE'].includes(status) || (verified && verified !== requested);

  let verifiedLabel = 'Not Verified';
  let verifiedClass = 'pill-muted';
  if (verified) {
    const matches = verified === requested;
    verifiedLabel = matches ? verified : `Mismatch (${verified})`;
    verifiedClass = matches ? 'pill-success' : 'pill-warning';
  } else if (status === 'PENDING' || status === 'PENDING_EGRESS' || status === 'RUNNING') {
    verifiedLabel = 'Pending verification';
    verifiedClass = 'pill-info';
  } else if (status === 'FAILED' || status === 'CANCELLED') {
    verifiedLabel = 'Not verified';
    verifiedClass = 'pill-danger';
  }

  return (
    <div className={`list-item ${isFailed ? 'failed' : ''}`}>
      <span className="badge">{status || '—'}</span>
      <span className="kv-inline"><b>Requested:</b> {requested}</span>
      <span className="kv-inline"><b>Verified:</b> <span className={`pill ${verifiedClass}`}>{verifiedLabel}</span></span>
      {ip && <span className="kv-inline muted">Egress IP: {ip}</span>}
      {session.station && <span className="kv-inline muted">· {session.station}</span>}
      {session.http_status && <span className="kv-inline muted">· HTTP {session.http_status}</span>}
      {session.request_duration_ms != null && <span className="kv-inline muted">· {session.request_duration_ms}ms</span>}
      {session.error_code && <span className="error-code">⚠ {session.error_code}</span>}
    </div>
  );
}

export default function LiveCampaign() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [live, setLive] = useState(null);
  const [error, setError] = useState('');
  const [disconnected, setDisconnected] = useState(false);

  const refresh = () => {
    api(`/api/campaigns/${id}`).then(r => setCampaign(r.campaign)).catch(e => { setError(e.message); setDisconnected(true); });
    api(`/api/campaigns/${id}/live`).then(r => { setLive(r.live); setDisconnected(false); }).catch(() => setDisconnected(true));
  };

  useEffect(() => { refresh(); const t = setInterval(refresh, 3000); return () => clearInterval(t); }, [id]);

  if (error) return (
    <div className="page">
      <p className="error">Could not load campaign: {error}</p>
      <button className="btn btn-primary" onClick={refresh}>Retry</button>
    </div>
  );
  if (!campaign) return <div className="loading">Loading campaign…</div>;

  return (
    <section className="page">
      <header className="page-header">
        <h1>Campaign {campaign.id}</h1>
        <p className="muted">{campaign.url}</p>
        <div className="row">
          <Link to={`/campaigns/${id}/analytics`} className="btn">Analytics</Link>
          <Link to={`/campaigns/${id}/diagnostic`} className="btn">Failure-Point Diagnostic</Link>
          <button className="btn btn-ghost" onClick={refresh}>Refresh</button>
          {disconnected && <span className="pill pill-danger">Reconnecting…</span>}
        </div>
      </header>

      {live && <TelemetryPanel live={live} />}

      <div className="card">
        <h2>Stations</h2>
        <div className="grid">
          {(live?.stations || []).map(s => <StationCard key={s.id} station={s} />)}
          {(!live || !live.stations || live.stations.length === 0) && <p className="muted">No station data yet.</p>}
        </div>
      </div>

      <div className="card">
        <h2>Sessions ({campaign.sessions?.length || 0})</h2>
        <p className="muted">Requested vs verified country. A country is only shown as verified when the backend returned a confirmed egress country.</p>
        {(campaign.sessions || []).length === 0 ? (
          <p className="muted">No sessions have been started yet.</p>
        ) : (
          <div className="list">
            {campaign.sessions.map(s => <CountryRow key={s.id} session={s} />)}
          </div>
        )}
      </div>
    </section>
  );
}
