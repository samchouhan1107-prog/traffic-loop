import React from 'react';
import { Link } from 'react-router-dom';

export default function CampaignCard({ campaign }) {
  const statusCls = { COMPLETED: 'ok', RUNNING: 'active', FAILED: 'err', PENDING_EGRESS: 'pending' };
  return (
    <Link to={`/campaigns/${campaign.id}`} className={`campaign-card ${statusCls[campaign.status] || ''}`}>
      <span className="badge">{campaign.status}</span>
      <span className="campaign-url">{campaign.url}</span>
      <span className="campaign-meta">{campaign.country_group} · {campaign.created_at?.slice(0, 16)}</span>
    </Link>
  );
}
