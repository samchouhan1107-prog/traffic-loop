import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';

/**
 * Landing page with FREE PROMO flow.
 * Flow: Landing → Enter URL → Lightweight verification → Free Promo → Live Results → Login/Signup
 */
export default function Landing({ user }) {
  const [step, setStep] = useState('landing'); // landing | verify | promo | result
  const [url, setUrl] = useState('');
  const [countries, setCountries] = useState('US');
  const [verifying, setVerifying] = useState(false);
  const [starting, setStarting] = useState(false);
  const [verification, setVerification] = useState(null);
  const [promoResult, setPromoResult] = useState(null);
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    setError('');
    setVerifying(true);
    setVerification(null);
    try {
      const result = await api('/api/promo/verify', { method: 'POST', body: { url: url.trim() } });
      setVerification(result);
      setStep('verify');
    } catch (e) {
      setError(e.message || 'Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  const handleStart = async () => {
    if (!user) {
      // Redirect to signup with URL pre-filled
      navigate('/signup', { state: { promoUrl: url.trim(), promoCountries: countries.split(',').map(c => c.trim()).filter(Boolean) } });
      return;
    }
    setError('');
    setStarting(true);
    try {
      const result = await api('/api/promo/start', {
        method: 'POST',
        body: {
          url: url.trim(),
          countries: countries.split(',').map(c => c.trim()).filter(Boolean),
        },
      });
      setPromoResult(result);
      setStep('result');
    } catch (e) {
      setError(e.message || 'Failed to start promo');
    } finally {
      setStarting(false);
    }
  };

  if (step === 'result' && promoResult) {
    return (
      <div className="landing promo-result">
        <div className="promo-success-icon">🚀</div>
        <h1>Promo Campaign Started!</h1>
        <p className="subtitle">Your free promo is now running. All results are genuine — never fabricated.</p>

        <div className="card promo-result-card">
          <ul className="kv">
            <li><span>Campaign ID</span><b>{promoResult.campaignId}</b></li>
            <li><span>Status</span><b>{promoResult.status}</b></li>
            <li><span>Total Allocation</span><b>{promoResult.allocation?.toLocaleString()} exposure slots</b></li>
            <li><span>Note</span><b className="muted">Allocation is the maximum allowed, not a visitor count</b></li>
          </ul>
        </div>

        <div className="card promo-result-notice">
          <h3>⚡ What Happens Next</h3>
          <ul className="promo-next-steps">
            <li>Real HTTP requests are dispatched gradually across configured countries</li>
            <li>Each metric is tracked separately: dispatched, responses, eligible, failed</li>
            <li>Country verification only shows when confirmed by egress evidence</li>
            <li>GA4 data is only shown if configured and genuinely observed</li>
            <li>No fake visitors, no fabricated numbers</li>
          </ul>
        </div>

        <div className="btnrow">
          <Link to="/dashboard" className="btn btn-primary">Go to Dashboard</Link>
          <Link to={`/campaigns/${promoResult.campaignId}`} className="btn">View Campaign</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="landing">
      <div className="landing-hero">
        <div className="brand-icon">🚦</div>
        <h1>Traffic Loop</h1>
        <p className="subtitle">
          Honest multi-country traffic probing with failure-point monitoring.
          <br />Every result is real. No fabrication. No fake visitors.
        </p>
      </div>

      {/* Features */}
      <div className="features">
        <div className="feature">
          <h3>🎯 Real Execution</h3>
          <p>Every campaign action is traced through a 10-stage diagnostic pipeline.</p>
        </div>
        <div className="feature">
          <h3>🔍 Failure-Point Monitoring</h3>
          <p>If something fails, we show exactly where — never hide it.</p>
        </div>
        <div className="feature">
          <h3>🆓 Free Promo</h3>
          <p>Get up to 10,000 exposure slots free. Real traffic, real results.</p>
        </div>
        <div className="feature">
          <h3>🔥 Login Streak</h3>
          <p>Earn bonus allocations by returning daily. Streak rewards grow!</p>
        </div>
      </div>

      {/* FREE PROMO FORM */}
      <div className="promo-form-container">
        <div className="promo-form-header">
          <h2>FREE PROMO</h2>
          <p className="muted">Submit your URL and get real traffic — completely free.</p>
        </div>

        <form onSubmit={handleVerify} className="promo-form">
          <label className="promo-input-group">
            <span className="promo-label">Your Website URL</span>
            <input
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="promo-url-input"
              required
            />
          </label>

          <label className="promo-input-group">
            <span className="promo-label">Country/Region</span>
            <input
              type="text"
              placeholder="US (or comma-separated: US,GB,DE)"
              value={countries}
              onChange={(e) => setCountries(e.target.value)}
              className="promo-country-input"
            />
          </label>

          <div className="promo-actions">
            <button type="submit" className="btn btn-primary promo-verify-btn" disabled={verifying}>
              {verifying ? 'Verifying…' : 'FREE PROMO'}
            </button>
          </div>
        </form>

        {error && <p className="error promo-error">{error}</p>}

        {/* Verification Result */}
        {verification && step === 'verify' && (
          <div className="promo-verification-result">
            <div className={`verification-badge ${verification.ok ? 'success' : 'danger'}`}>
              {verification.ok ? '✓ URL Verified' : '✗ Verification Failed'}
            </div>

            {verification.ok ? (
              <div className="verification-details">
                <p>URL: <strong>{verification.url}</strong></p>
                <p>HTTP Status: <strong>{verification.httpStatus}</strong></p>
                <p className="muted">URL is reachable and eligible for free promo.</p>

                <button className="btn btn-primary promo-start-btn" onClick={handleStart} disabled={starting}>
                  {starting ? 'Starting…' : 'START'}
                </button>

                {!user && (
                  <p className="promo-signup-note">
                    You'll be asked to create a free account to track your campaign.
                  </p>
                )}
              </div>
            ) : (
              <div className="verification-details">
                <p className="error">{verification.error || 'URL could not be reached'}</p>
                <p className="muted">Please check the URL and try again.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Auth links */}
      <div className="landing-auth">
        {user ? (
          <Link to="/dashboard" className="btn btn-primary">Go to Dashboard</Link>
        ) : (
          <div className="btnrow">
            <Link to="/login" className="btn">Login</Link>
            <Link to="/signup" className="btn">Sign Up</Link>
          </div>
        )}
      </div>
    </div>
  );
}
