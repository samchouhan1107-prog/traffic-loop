import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../components/AuthContext.jsx';

export default function Signup() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { register } = useAuth();

  // Get promo data from landing page redirect
  const promoUrl = location.state?.promoUrl;
  const promoCountries = location.state?.promoCountries;

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setInfo(null); setBusy(true);
    try {
      const r = await register(email, password);
      setInfo({
        message: 'Account created!',
        verifyToken: r.verifyToken || null,
      });
      // If coming from promo flow, redirect to start the promo
      if (promoUrl) {
        setTimeout(() => navigate('/dashboard', {
          state: { autoStartPromo: true, promoUrl, promoCountries },
        }), 2000);
      } else {
        setTimeout(() => navigate('/dashboard'), 3000);
      }
    } catch (err) {
      setError(err.message || 'Sign up failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h2>SIGN UP</h2>
      {promoUrl && (
        <div className="promo-signup-notice">
          <p>Create a free account to start your promo for:</p>
          <p className="promo-signup-url"><strong>{promoUrl}</strong></p>
        </div>
      )}
      <form onSubmit={submit}>
        <label>
          <span>Email</span>
          <input type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </label>
        <label>
          <span>Password (min 10 chars)</span>
          <input type="password" placeholder="••••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={10} />
        </label>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Creating…' : promoUrl ? 'Create Account & Start Promo' : 'Create account'}</button>
        {error && <p className="error">{error}</p>}
        {info && (
          <div className="card" style={{ marginTop: 12 }}>
            <p>{info.message}</p>
            <ul className="kv">
              <li><span>Email</span><b className="red">Not verified</b></li>
            </ul>
            {promoUrl && <p className="muted">Redirecting to start your promo…</p>}
            {!promoUrl && <p className="muted">Redirecting to dashboard…</p>}
          </div>
        )}
        <p className="muted" style={{ marginTop: 12 }}>Already have an account? <Link to="/login">Log in</Link></p>
      </form>
    </div>
  );
}
