import React from 'react';

/**
 * PromoPanel — Displays promo allocation status with SEPARATED metrics.
 * Never merges numbers into a fake "Visitors" counter.
 */
export default function PromoPanel({ promo }) {
  if (!promo) return null;

  const {
    totalAllocation,
    dispatched,
    remaining,
    responsesReceived,
    confirmedEligible,
    genuineVisits,
    failedRequests,
    unverifiedEvents,
    ga4Observed,
    ga4Label,
    status,
    promoCampaignId,
  } = promo;

  const usedPct = totalAllocation > 0 ? Math.round((dispatched / totalAllocation) * 100) : 0;

  return (
    <div className="promo-panel">
      <div className="promo-header">
        <h3>Free Promo Status</h3>
        <span className={`pill pill-${status === 'ACTIVE' ? 'success' : status === 'PAUSED' ? 'warning' : status === 'EXHAUSTED' ? 'muted' : 'info'}`}>
          {status}
        </span>
      </div>

      {promoCampaignId && (
        <p className="muted promo-campaign-id">Campaign: <strong>{promoCampaignId}</strong></p>
      )}

      {/* Allocation bar */}
      <div className="promo-allocation">
        <div className="promo-allocation-header">
          <span>Allocation Used</span>
          <span>{dispatched.toLocaleString()} / {totalAllocation.toLocaleString()}</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${usedPct}%` }} />
        </div>
        <p className="muted">{remaining.toLocaleString()} remaining</p>
      </div>

      {/* Separated Metrics — never merged */}
      <div className="promo-metrics">
        <h4>Honest Metrics</h4>
        <div className="promo-metric-grid">
          <div className="promo-metric">
            <span className="promo-metric-label">Requests Dispatched</span>
            <span className="promo-metric-value">{dispatched.toLocaleString()}</span>
            <span className="promo-metric-desc">Actual HTTP requests sent</span>
          </div>
          <div className="promo-metric">
            <span className="promo-metric-label">Responses Received</span>
            <span className="promo-metric-value">{responsesReceived.toLocaleString()}</span>
            <span className="promo-metric-desc">Server responses returned</span>
          </div>
          <div className="promo-metric">
            <span className="promo-metric-label">Confirmed Eligible</span>
            <span className="promo-metric-value success">{confirmedEligible.toLocaleString()}</span>
            <span className="promo-metric-desc">Valid 2xx/3xx responses</span>
          </div>
          <div className="promo-metric">
            <span className="promo-metric-label">Genuine Visits</span>
            <span className="promo-metric-value">{genuineVisits.toLocaleString()}</span>
            <span className="promo-metric-desc">Verified country matches</span>
          </div>
          <div className="promo-metric">
            <span className="promo-metric-label">Failed Requests</span>
            <span className="promo-metric-value danger">{failedRequests.toLocaleString()}</span>
            <span className="promo-metric-desc">DNS, timeout, HTTP errors</span>
          </div>
          <div className="promo-metric">
            <span className="promo-metric-label">Unverified Events</span>
            <span className="promo-metric-value muted">{unverifiedEvents.toLocaleString()}</span>
            <span className="promo-metric-desc">No country confirmation</span>
          </div>
        </div>
      </div>

      {/* GA4 status */}
      <div className="promo-ga4">
        <span className="promo-ga4-label">GA4:</span>
        <span className={`pill pill-${ga4Label === 'GA4 CONFIGURED' ? 'info' : 'muted'}`}>
          {ga4Label || 'GA4 NOT CONFIGURED'}
        </span>
        {ga4Observed > 0 && (
          <span className="promo-ga4-count">— {ga4Observed} observed event(s)</span>
        )}
      </div>

      {/* Location notice */}
      <div className="promo-location">
        <span className="muted">Location shown only when reliable egress evidence exists. Otherwise: UNVERIFIED.</span>
      </div>
    </div>
  );
}
