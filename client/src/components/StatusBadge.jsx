import React from 'react';

export default function StatusBadge({ status }) {
  const cls = { OK: 'ok', COMPLETED: 'ok', RESOLVED: 'ok', RUNNING: 'active', PENDING: 'pending', NOT_CONFIGURED: 'warn', WARNING: 'warn', FAILED: 'err', CANCELLED: 'warn' };
  return <span className={`badge ${cls[status] || ''}`}>{status || '—'}</span>;
}
