import React from 'react';
import StatusBadge from './StatusBadge';

export default function AnalyticsPanel({ diagnostic }) {
  if (!diagnostic) return null;
  const { pipeline, summary, stations, ga4 } = diagnostic;
  const STAGE_ICONS = { RECEIVED: '📥', VALIDATED: '✅', QUEUED: '📋', EGRESS_CHECK: '🌐', CONNECTION: '🔗', TARGET_REQUEST: '🎯', RESPONSE: '📨', TELEMETRY: '📊', ANALYTICS_OBSERVATION: '📈', FINALIZED: '🏁' };
  return (
    <div>
      <div className="panel"><h2>PIPELINE STAGES</h2>
        {Object.entries(pipeline || {}).map(([stage, info]) => (
          <div key={stage} className={`list-item ${info.status.toLowerCase()}`}>
            <span>{STAGE_ICONS[stage] || '•'}</span> <b>{stage}</b> <StatusBadge status={info.status} />
            {info.failures > 0 && <span className="error-code"> · {info.failures} failure(s) · {info.lastError}</span>}
          </div>
        ))}
      </div>
      <div className="panel"><h2>SUMMARY</h2>
        <p>Started: {summary?.started} · Completed: {summary?.completed} · Failed: {summary?.failed} · Unverified: {summary?.unverified} · Recovered: {summary?.recovered}</p>
      </div>
      <div className="panel"><h2>GA4</h2><StatusBadge status={ga4?.status} /> <span>{ga4?.detail}</span></div>
    </div>
  );
}
