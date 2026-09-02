import React from 'react';

export default function StationCard({ station }) {
  const stateCls = { IDLE: 'ok', RUNNING: 'active', CIRCUIT_OPEN: 'err', STOPPED: 'warn' };
  return (
    <div className={`station-card ${stateCls[station.state] || ''}`}>
      <h3>{station.id}</h3>
      <span className={`badge ${stateCls[station.state] || ''}`}>{station.state}</span>
      <p>Sessions: {station.sessionsRun} run · {station.sessionsFailed} failed</p>
      {station.lastError && <p className="error-code">Last error: {station.lastError}</p>}
    </div>
  );
}
