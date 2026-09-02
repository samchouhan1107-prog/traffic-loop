import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import CountryGroup from '../components/CountryGroup';

export default function CreateCampaign() {
  const [groups, setGroups] = useState([]);
  const [groupId, setGroupId] = useState('GROUP-US');
  const [url, setUrl] = useState('');
  const [duration, setDuration] = useState(300);
  const [sessionsPerCountry, setSessionsPerCountry] = useState(1);
  const [autoRoll, setAutoRoll] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  useEffect(() => { api('/api/campaigns/groups').then(r => setGroups(r.groups || [])); }, []);

  const submit = async (e) => {
    e.preventDefault(); setError('');
    try {
      const r = await api('/api/campaigns', { method: 'POST', body: { url, groupId, durationSeconds: duration, sessionsPerCountry, autoRoll } });
      navigate(`/campaigns/${r.id}`);
    } catch (err) { setError(err.message); }
  };

  return (
    <div className="panel"><h2>CREATE CAMPAIGN</h2>
      <form onSubmit={submit}>
        <input type="url" placeholder="https://example.com" value={url} onChange={e => setUrl(e.target.value)} required />
        <CountryGroup groups={groups} selected={groupId} onChange={setGroupId} />
        <label>Duration (seconds): <input type="number" min={30} max={1800} value={duration} onChange={e => setDuration(Number(e.target.value))} /></label>
        <label>Sessions per country: <input type="number" min={1} max={10} value={sessionsPerCountry} onChange={e => setSessionsPerCountry(Number(e.target.value))} /></label>
        <label><input type="checkbox" checked={autoRoll} onChange={e => setAutoRoll(e.target.checked)} /> Auto-roll on failure</label>
        <button type="submit" className="btn primary">Start Campaign</button>
        {error && <p className="error">{error}</p>}
      </form>
    </div>
  );
}
