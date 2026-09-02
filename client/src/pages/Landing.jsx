import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api.js';
import { trackEvent } from '../services/ga4.js';

/** Regions shown only as selectable options; verification results are
 *  driven by real egress telemetry, never assumed from this list. */
const REGIONS = ['IN', 'AU', 'KR', 'SG', 'JP', 'MY', 'US', 'GB', 'DE'];

const STREAK_REWARDS = [
  { day: 'Day 1', reward: 'Free allocation' },
  { day: 'Day 2', reward: 'Additional allocation' },
  { day: 'Day 3', reward: 'Additional allocation' },
  { day: 'Day 7', reward: 'Streak bonus' },
];

const HOW_IT_WORKS = [
  { step: '01', title: 'Enter your URL' },
  { step: '02', title: 'Choose your region' },
  { step: '03', title: 'Run the check' },
  { step: '04', title: 'Monitor live results' },
];

const TRANSPARENCY = [
  'No fake analytics',
  'No fabricated visitor counts',
  'No fake country detection',
  'No fake verification',
  'Real HTTP telemetry only',
  'Transparent, separate counters',
];

const HTTP_STATUS_HINTS = {
  301: 'moved permanently',
  308: 'moved permanently',
  400: 'bad request',
  401: 'authentication required',
  403: 'access forbidden (the server may be blocking automated checks)',
  404: 'page not found',
  405: 'method not allowed',
  408: 'request timeout',
  410: 'page gone',
  429: 'too many requests (rate limited)',
  500: 'internal server error',
  502: 'bad gateway',
  503: 'service unavailable',
  504: 'gateway timeout',
};

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
    // Real user interaction: a genuine form submission by a person.
    trackEvent('free_check_submitted', { country_count: countries.split(',').filter(Boolean).length });
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
    trackEvent('promo_started', { country_count: countries.split(',').filter(Boolean).length });
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
      {/* ===================== HERO ===================== */}
      <header className="landing-hero">
        <div className="brand-icon">🚦</div>
        <h1>Monitor. Reach. Measure.</h1>
        <p className="subtitle">
          Website monitoring, regional reach and transparent performance
          telemetry. Every result is real — no fake visitors, no fabricated numbers.
        </p>
      </header>

      <main>
      {/* ============ FREE CHECK FORM (hero input) ============ */}
      <section className="promo-form-container" aria-labelledby="free-check-title">
        <div className="promo-form-header">
          <h2 id="free-check-title">FREE PROMO</h2>
          <p className="muted">Start with a free promotional allocation — up to 10,000 eligible exposures.</p>
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
            <select
              multiple
              value={countries.split(',')}
              onChange={(e) => setCountries(Array.from(e.target.selectedOptions, o => o.value).join(','))}
              className="promo-country-input"
              aria-describedby="regions-note"
            >
              {REGIONS.map(code => <option key={code} value={code}>{code}</option>)}
            </select>
            <span id="regions-note" className="muted">Hold Ctrl/Cmd to pick multiple regions. Results reflect only what telemetry verifies.</span>
          </label>

          <div className="promo-actions">
            <button type="submit" className="btn btn-primary promo-verify-btn" disabled={verifying}>
              {verifying ? 'Verifying…' : 'Start Free Check'}
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
                <p className="error">
                  {verification.error
                    || (verification.httpStatus
                      ? `Your server responded with HTTP ${verification.httpStatus} — ${HTTP_STATUS_HINTS[verification.httpStatus] || 'the URL did not return a successful response'}`
                      : 'URL could not be reached')}
                </p>
                {verification.httpStatus === 404 && (
                  <p className="muted">HTTP 404 means “page not found”. Double-check the exact path (e.g. https://example.com/ vs https://example.com/page) — the site may be up, but that specific URL does not exist.</p>
                )}
                {verification.httpStatus >= 500 && verification.httpStatus < 600 && (
                  <p className="muted">A 5xx status means your server had an internal error while responding. Check your server logs and try again.</p>
                )}
                {!verification.httpStatus && !verification.error && (
                  <p className="muted">Please check the URL and try again.</p>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ============ LIVE WEBSITE CHECK — TELEMETRY LABEL ============ */}
      <section className="features" aria-label="What we measure">
        <div className="feature">
          <h3>🔗 HTTP Status</h3>
          <p>Real status codes returned by your server during automated checks.</p>
        </div>
        <div className="feature">
          <h3>⏱ Response Time</h3>
          <p>Measured round-trip time of each automated HTTP probe.</p>
        </div>
        <div className="feature">
          <h3>✅ Availability</h3>
          <p>Share of checks that returned a successful response.</p>
        </div>
        <div className="feature">
          <h3>🕒 Last Checked</h3>
          <p>Timestamp of the most recent automated check — clearly labeled telemetry, never presented as human visits.</p>
        </div>
      </section>

      {/* ============ FREE PROMO EXPLANATION ============ */}
      <section className="trust-section" aria-labelledby="promo-explain-title">
        <h2 id="promo-explain-title">Start with a free promotional allocation</h2>
        <p>
          New campaigns begin with <strong>up to 10,000 eligible exposures</strong>. This is the
          maximum allocation — <strong>not a guaranteed visitor count</strong>. Actual qualifying
          events are counted only when genuinely observed by real HTTP telemetry and
          (if configured) GA4 measurement on your own property.
        </p>
      </section>

      {/* ============ LOGIN STREAK ============ */}
      <section className="features" aria-labelledby="streak-title">
        <h2 id="streak-title" className="section-title">🔥 Login Streak</h2>
        <p className="muted">Reward schedule (configurable from the backend):</p>
        <div className="feature">
          {STREAK_REWARDS.map(r => (
            <p key={r.day}><strong>{r.day}</strong> → {r.reward}</p>
          ))}
        </div>
      </section>

      {/* ============ REGIONAL REACH ============ */}
      <section className="features" aria-labelledby="regions-title">
        <h2 id="regions-title" className="section-title">🌍 Regional Reach</h2>
        <p className="muted">A location is displayed only when telemetry genuinely verifies it.</p>
        <div className="feature">
          <p>{REGIONS.join(' · ')}</p>
        </div>
      </section>

      {/* ============ TRANSPARENT ANALYTICS ============ */}
      <section className="features" aria-labelledby="analytics-title">
        <h2 id="analytics-title" className="section-title">📊 Transparent Analytics</h2>
        <p className="muted">Separate, honest counters — never merged into one artificial “visitor” number.</p>
        <div className="feature">
          <ul>
            <li>Requests</li>
            <li>Successful responses</li>
            <li>Failed responses</li>
            <li>Page views</li>
            <li>Sessions</li>
            <li>Verified user activity</li>
          </ul>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section className="features" aria-labelledby="how-title">
        <h2 id="how-title" className="section-title">How It Works</h2>
        {HOW_IT_WORKS.map(h => (
          <div key={h.step} className="feature">
            <h3>{h.step}</h3>
            <p>{h.title}</p>
          </div>
        ))}
      </section>

      {/* ============ TRUST / SAFETY ============ */}
      <section className="trust-section" aria-labelledby="trust-title">
        <h2 id="trust-title">Trust &amp; Safety</h2>
        <ul>
          {TRANSPARENCY.map(t => <li key={t}>{t}</li>)}
        </ul>
      </section>

      {/* ============ CTA ============ */}
      <section className="cta-section" aria-labelledby="cta-title">
        <h2 id="cta-title">Ready to check your website?</h2>
        <a href="#free-check-title" className="btn btn-primary">Start Free Check</a>
      </section>

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
      </main>

      {/* ============ FOOTER ============ */}
      <footer className="landing-footer">
        <nav aria-label="Footer">
          <Link to="/">About</Link>
          <Link to="/">How it works</Link>
          <Link to="/">Analytics</Link>
          <Link to="/">Reports</Link>
          <Link to="/">Privacy</Link>
          <Link to="/">Terms</Link>
          <Link to="/">Contact</Link>
        </nav>
        <p className="muted">© {new Date().getFullYear()} Traffic Loop — honest monitoring &amp; telemetry.</p>
      </footer>
    </div>
  );
}
