import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import CampaignCard from '../components/CampaignCard';

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    api('/api/campaigns')
      .then(r => { if (alive) setCampaigns(r.campaigns || []); })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);
  return (
    <section className="page">
      <header className="page-header">
        <h1>Campaigns</h1>
        <Link to="/campaigns/new" className="btn btn-primary">Create Campaign</Link>
      </header>
      {error && <p className="error">{error}</p>}
      <div className="campaign-list" style={{ marginTop: 16 }}>
        {campaigns.length === 0 ? (
          <p className="muted">No campaigns yet.</p>
        ) : (
          campaigns.map(c => <CampaignCard key={c.id} campaign={c} />)
        )}
      </div>
    </section>
  );
}
