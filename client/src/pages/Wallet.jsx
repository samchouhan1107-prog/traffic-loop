import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import WalletCard from '../components/WalletCard';

export default function Wallet() {
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api('/api/wallet')
      .then(r => { if (alive) setWallet(r); })
      .catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, []);

  if (error) {
    return (
      <section className="page">
        <header className="page-header"><h1>Wallet</h1></header>
        <p className="error">Could not load wallet: {error}</p>
      </section>
    );
  }
  if (!wallet) {
    return (
      <section className="page">
        <header className="page-header"><h1>Wallet</h1></header>
        <div className="page-loading">Loading wallet…</div>
      </section>
    );
  }
  return (
    <section className="page">
      <header className="page-header">
        <h1>Wallet</h1>
        <p className="muted">Balance and transactions are taken directly from the backend. We do not display a balance the backend has not returned.</p>
      </header>
      <WalletCard wallet={wallet} />
      <div className="card">
        <h2>Payment providers</h2>
        {wallet.providers ? (
          <ul className="list">
            {Object.entries(wallet.providers).map(([k, v]) => (
              <li key={k}>
                <b>{k}</b> · <span className={`pill ${v.configured ? 'pill-success' : 'pill-warning'}`}>{v.configured ? 'CONFIGURED' : 'NOT_CONFIGURED'}</span>
                {v.detail && <span className="muted"> · {v.detail}</span>}
              </li>
            ))}
          </ul>
        ) : <p className="muted">No provider information returned.</p>}
      </div>
      <div className="card">
        <h2>Transactions</h2>
        {(wallet.transactions || []).length === 0 ? (
          <p className="muted">No transactions recorded yet.</p>
        ) : (
          <table className="table">
            <thead><tr><th>Kind</th><th>Credits</th><th>Status</th><th>Provider</th><th>When</th></tr></thead>
            <tbody>
              {wallet.transactions.map(t => (
                <tr key={t.id}>
                  <td>{t.kind || '—'}</td>
                  <td>{t.credits}</td>
                  <td>{t.status || '—'}</td>
                  <td>{t.provider || '—'}</td>
                  <td className="muted">{t.created_at || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
