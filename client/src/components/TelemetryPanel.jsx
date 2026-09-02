import React from 'react';
import StatusBadge from './StatusBadge';

export default function TelemetryPanel({ live }) {
  if (!live) return null;
  const pct = live.durationMs ? Math.min(100, (live.elapsedMs / live.durationMs) * 100) : 0;
  return (
    <div className="panel telemetry">
      <h2>LIVE STATUS</h2>
      <div className="grid">
        <div className="tile"><span>STATUS</span><StatusBadge status={live.status} /></div>
        <div className="tile"><span>CURRENT STAGE</span><b>{live.currentStage || '—'}</b></div>
        <div className="tile"><span>ELAPSED</span><b>{live.elapsedMs ? Math.round(live.elapsedMs / 1000) + 's' : '—'}</b></div>
        <div className="tile"><span>SESSIONS</span><b>{live.summary.total}</b></div>
        <div className="tile"><span>COMPLETED</span><b className="green">{live.summary.completed}</b></div>
        <div className="tile"><span>FAILED</span><b className="red">{live.summary.failed}</b></div>
        <div className="tile"><span>PENDING</span><b>{live.summary.pending}</b></div>
        <div className="tile"><span>GA4</span><StatusBadge status={live.ga4?.status} /></div>
      </div>
      <div className="progress-bar"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
      {live.lastError && <p className="error-code">Last error at {live.lastError.stage}: {live.lastError.code}</p>}
    </div>
  );
}
