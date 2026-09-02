import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { StatusPill } from './Dashboard.jsx';

export default function Campaign() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [form, setForm] = useState({ url: '', groupId: '', durationSeconds: 300, sessionsPerCountry: 1, autoRoll: false });
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/campaigns/groups')
      .then((r) => setGroups(r.groups || []))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!id) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await api('/api/campaigns/' + id);
        if (!stop) setCampaign(r);
      } catch (e) { if (!stop) setError(e.message); }
    };
    tick();
    const h = setInterval(tick, 5000);
    return () => { stop = true; clearInterval(h); };
  }, [id]);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      const r = await api('/api/campaigns', { method: 'POST', body: form });
      navigate('/campaigns/' + r.id);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <section className="page">
      <header className="page-header">
        <h1>{id ? `Campaign ${id.slice(0, 8)}` : 'New campaign'}</h1>
        <p className="muted">Probes originate from real egress points per country. Stages are honest — failures surface, they don't get papered over.</p>
      </header>

      {!id && (
        <form className="card form" onSubmit={submit}>
          <label>
            <span>Target URL</span>
            <input
              type="url" required placeholder="https://example.com/landing"
              value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
          </label>
          <label>
            <span>Country group</span>
            <select required value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })}>
              <option value="">Select a group…</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
          <div className="row">
            <label className="grow">
              <span>Duration (seconds)</span>
              <input type="number" min="30" max="86400" value={form.durationSeconds}
                onChange={(e) => setForm({ ...form, durationSeconds: Number(e.target.value) })} />
            </label>
            <label className="grow">
              <span>Sessions per country</span>
              <input type="number" min="1" max="50" value={form.sessionsPerCountry}
                onChange={(e) => setForm({ ...form, sessionsPerCountry: Number(e.target.value) })} />
            </label>
          </div>
          <label className="checkbox">
            <input type="checkbox" checked={form.autoRoll} onChange={(e) => setForm({ ...form, autoRoll: e.target.checked })} />
            <span>Auto-roll on transient failure (max 3 retries)</span>
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn btn-primary" disabled={busy} type="submit">{busy ? 'Starting…' : 'Launch campaign'}</button>
        </form>
      )}

      {id && campaign && campaign.campaign && (
        <div className="card">
          <div className="row spread">
            <div>
              <StatusPill status={campaign.campaign.status} />
              <span className="muted"> · {campaign.campaign.url}</span>
            </div>
            <a className="link" href={`/campaigns/${id}/analytics`}>Open analytics →</a>
          </div>
          <ul className="kv">
            <li><span>Group</span><b>{campaign.campaign.group_id}</b></li>
            <li><span>Duration</span><b>{campaign.campaign.duration_seconds}s</b></li>
            <li><span>Sessions / country</span><b>{campaign.campaign.sessions_per_country}</b></li>
            <li><span>Auto-roll</span><b>{campaign.campaign.auto_roll ? 'yes' : 'no'}</b></li>
          </ul>
        </div>
      )}
    </section>
  );
}
