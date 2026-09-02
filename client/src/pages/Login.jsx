import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../components/AuthContext.jsx';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();

  const promoUrl = location.state?.promoUrl;

  const submit = async (e) => {
    e.preventDefault();
    setError(''); setBusy(true);
    try {
      await login(email, password);
      if (promoUrl) {
        navigate('/dashboard', { state: { autoStartPromo: true, promoUrl, promoCountries: location.state?.promoCountries } });
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <h2>LOGIN</h2>
      {promoUrl && (
        <div className="promo-signup-notice">
          <p>Log in to start your promo for:</p>
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
        <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Signing in…' : 'Log in'}</button>
        {error && <p className="error">{error}</p>}
        <p className="muted" style={{ marginTop: 12 }}>No account? <Link to="/signup">Create one</Link></p>
      </form>
    </div>
  );
}
