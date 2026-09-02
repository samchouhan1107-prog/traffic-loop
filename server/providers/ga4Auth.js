// ga4Auth.js — GA4 Data API authentication via service account (zero deps).
// Uses Node.js built-in crypto for JWT signing + RS256.
import { createSign, createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { config } from '../config/environment.js';

let cachedToken = null;
let cachedTokenExpiry = 0;
const TOKEN_BUFFER_MS = 60_000; // refresh 1 min before expiry

function loadServiceAccount() {
  // Priority 1: GA4_SA_KEY env var (inline JSON)
  if (config.ga4.serviceAccountJson) {
    try {
      return JSON.parse(config.ga4.serviceAccountJson);
    } catch (e) {
      console.error('[ga4-auth] GA4_SA_KEY is not valid JSON:', e.message);
      return null;
    }
  }
  // Priority 2: GOOGLE_APPLICATION_CREDENTIALS file path
  const saPath = config.ga4.serviceAccountFile;
  if (saPath && existsSync(saPath)) {
    try {
      return JSON.parse(readFileSync(saPath, 'utf8'));
    } catch (e) {
      console.error('[ga4-auth] Failed to read service account file:', e.message);
      return null;
    }
  }
  return null;
}

function base64url(data) {
  return Buffer.from(data).toString('base64url');
}

function createJWT(sa) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  const sign = createSign('RSA-SHA256');
  sign.update(signingInput);
  const signature = sign.sign(sa.private_key, 'base64url');

  return `${signingInput}.${signature}`;
}

async function exchangeJWTForToken(sa) {
  const jwt = createJWT(sa);
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  });

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Token exchange failed (${resp.status}): ${err}`);
  }

  const data = await resp.json();
  return { token: data.access_token, expiresIn: (data.expires_in || 3600) * 1000 };
}

export const ga4Auth = Object.freeze({
  isConfigured() {
    return loadServiceAccount() !== null && Boolean(config.ga4.propertyId);
  },

  async getAccessToken() {
    const now = Date.now();
    if (cachedToken && now < cachedTokenExpiry - TOKEN_BUFFER_MS) {
      return cachedToken;
    }

    const sa = loadServiceAccount();
    if (!sa) throw new Error('GA4 service account not configured');

    const { token, expiresIn } = await exchangeJWTForToken(sa);
    cachedToken = token;
    cachedTokenExpiry = now + expiresIn;
    console.log(`[ga4-auth] Access token obtained, expires in ${Math.round(expiresIn / 1000)}s`);
    return token;
  },

  getServiceAccountEmail() {
    const sa = loadServiceAccount();
    return sa?.client_email || null;
  },
});
