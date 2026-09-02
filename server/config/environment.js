// Central config — reads .env (no deps), all secrets from environment only.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..', '..');

const fileEnv = {};
const envCandidates = [
  join(projectRoot, '.env'),
  join(process.cwd(), '.env'),
];
for (const envPath of envCandidates) {
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !line.trim().startsWith('#')) fileEnv[m[1]] = m[2].trim();
    }
    break;
  }
}
const val = (k, d) => { const v = process.env[k] ?? fileEnv[k]; return v !== undefined && v !== '' ? v : d; };
const num = (k, d) => Number(val(k, d));
const isProd = String(fileEnv.NODE_ENV ?? process.env.NODE_ENV ?? '') === 'production';

export const config = Object.freeze({
  port: num('PORT', 3000),
  baseUrl: val('BASE_URL', 'http://localhost:3000'),
  isProduction: isProd,
  sessionTtlHours: num('SESSION_TTL_HOURS', 72),
  authSecret: val('AUTH_SECRET', 'dev-only-insecure-secret'),
  workerHmacSecret: val('WORKER_HMAC_SECRET', 'dev-only-worker-secret'),
  dbPath: val('DB_PATH', './server/database/traffic-loop.sqlite'),

  smtp: { host: val('SMTP_HOST', ''), port: num('SMTP_PORT', 587), user: val('SMTP_USER', ''), pass: val('SMTP_PASS', ''), from: val('MAIL_FROM', 'no-reply@trafficloop.example') },
  ga4: { measurementId: val('GA4_MEASUREMENT_ID', ''), apiSecret: val('GA4_API_SECRET', '') },
  google: { clientId: val('GOOGLE_CLIENT_ID', ''), clientSecret: val('GOOGLE_CLIENT_SECRET', '') },
  whatsapp: { apiKey: val('WHATSAPP_API_KEY', '') },
  payment: {
    upi: { url: val('UPI_PROVIDER_URL', ''), key: val('UPI_PROVIDER_KEY', '') },
    paypal: { clientId: val('PAYPAL_CLIENT_ID', ''), clientSecret: val('PAYPAL_CLIENT_SECRET', ''), apiUrl: val('PAYPAL_API_URL', 'https://api-m.sandbox.paypal.com') },
  },

  campaignMaxDuration: num('CAMPAIGN_MAX_DURATION', 1800),
  campaignMinDuration: num('CAMPAIGN_MIN_DURATION', 30),
  campaignMaxSessions: num('CAMPAIGN_MAX_SESSIONS', 10),
  recoveryMaxAttempts: num('RECOVERY_MAX_ATTEMPTS', 3),
  recoveryBaseDelayMs: num('RECOVERY_BASE_DELAY_MS', 2000),
  rateLimitWindowMs: num('RATE_LIMIT_WINDOW_MS', 60000),

  // FREE PROMO config
  promo: {
    initialAllocation: num('PROMO_INITIAL_ALLOCATION', 10000),
    batchSize: num('PROMO_BATCH_SIZE', 50),
    batchIntervalMs: num('PROMO_BATCH_INTERVAL_MS', 60_000),
    maxConcurrentBatches: num('PROMO_MAX_CONCURRENT_BATCHES', 3),
    healthCheckIntervalMs: num('PROMO_HEALTH_CHECK_INTERVAL_MS', 300_000),
    healthCheckTimeoutMs: num('PROMO_HEALTH_CHECK_TIMEOUT_MS', 10_000),
    maxDurationSeconds: num('PROMO_MAX_DURATION', 300),
    sessionsPerCountry: num('PROMO_SESSIONS_PER_COUNTRY', 1),
  },

  // LOGIN STREAK config
  streak: {
    gracePeriodHours: num('STREAK_GRACE_PERIOD_HOURS', 36),
    claimWindowHours: num('STREAK_CLAIM_WINDOW_HOURS', 48),
  },
});

if (isProd && (config.authSecret === 'dev-only-insecure-secret' || config.authSecret.length < 32))
  throw new Error('AUTH_SECRET must be a long random value in production');
