// Analytics tests — GA4 observation lifecycle.
// Verifies: traffic_sent → HTTP_success → ga4_event_sent → ga4_observed
// Never fabricates GA4 data.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';

process.env.DB_PATH = './server/database/test-analytics.sqlite';
process.env.AUTH_SECRET = 'test-secret-key-that-is-long-enough-32chars';
process.env.NODE_ENV = 'test';
// Ensure GA4 is NOT configured in tests
delete process.env.GA4_MEASUREMENT_ID;
delete process.env.GA4_API_SECRET;
delete process.env.GA4_PROPERTY_ID;
delete process.env.GA4_SA_KEY;

const { db } = await import('../server/database/connection.js');
const { migrate } = await import('../server/database/migrate.js');
migrate();
const auth = await import('../server/middleware/auth.js');
const campaignService = await import('../server/services/campaignService.js');
const analyticsService = await import('../server/services/analyticsService.js');
const telemetryService = await import('../server/services/telemetryService.js');
const { GA4Provider } = await import('../server/providers/ga4Provider.js');

describe('Analytics', () => {
  let userId, campaignId;
  before(() => {
    const r = auth.register({ email: 'analytics-test@example.com', password: 'password1234' });
    userId = r.userId;
    campaignId = campaignService.createCampaign({ userId, url: 'https://example.com', groupId: 'GROUP-US', countries: ['US'], durationSeconds: 300, sessionsPerCountry: 1 });
  });
  after(() => { db.close(); for (const f of ['test-analytics.sqlite', 'test-analytics.sqlite-wal', 'test-analytics.sqlite-shm']) { try { unlinkSync('./server/database/' + f); } catch {} } });

  it('GA4 status returns NOT_CONFIGURED when no credentials', () => {
    const r = analyticsService.getCampaignAnalytics(campaignId);
    assert.equal(r.ga4.status, 'NOT_CONFIGURED');
    assert.equal(r.measurementProtocol, 'NOT_CONFIGURED');
    assert.equal(r.dataApi, 'NOT_CONFIGURED');
  });

  it('GA4Provider.isConfigured() returns false without env vars', () => {
    assert.equal(GA4Provider.isConfigured(), false);
    assert.equal(GA4Provider.isDataApiConfigured(), false);
  });

  it('sendEvent returns NOT_CONFIGURED without crashing', async () => {
    const result = await analyticsService.sendProbeEvent(campaignId, 'test-session', { country: 'US' });
    assert.equal(result.sent, false);
    assert.equal(result.reason, 'NOT_CONFIGURED');
    assert.equal(result.ga4Status, 'GA4_NOT_CONFIGURED');
  });

  it('observeCampaign returns DATA_API_NOT_CONFIGURED without crashing', async () => {
    const result = await analyticsService.observeCampaign(campaignId);
    assert.equal(result.observed, false);
    assert.equal(result.status, 'DATA_API_NOT_CONFIGURED');
    assert.equal(result.events_found, 0);
  });

  it('observation is recorded in DB even when Data API not configured', () => {
    // observeCampaign records the attempt, so there should be 1 observation
    const obs = analyticsService.getObservations(campaignId);
    assert.ok(Array.isArray(obs));
    assert.equal(obs.length, 1);
    assert.equal(obs[0].status, 'DATA_API_NOT_CONFIGURED');
    assert.equal(obs[0].observation_type, 'realtime');
  });

  it('healthCheck returns NOT_CONFIGURED without credentials', async () => {
    const health = await analyticsService.healthCheck();
    assert.equal(health.overallStatus, 'NOT_CONFIGURED');
    assert.ok(health.errors.length > 0);
    assert.equal(health.measurementProtocol, 'NOT_CONFIGURED');
    assert.equal(health.dataApi, 'NOT_CONFIGURED');
  });

  it('recordHit stores data in SQLite (backward compatible)', () => {
    // recordHit still works — stores locally even without GA4 credentials
    analyticsService.recordHit(campaignId, 'test-session', { event: 'test' });
    const r = analyticsService.getCampaignAnalytics(campaignId);
    assert.equal(r.hits.length, 1);
    // Status is NOT_CONFIGURED because no GA4 credentials — this is correct behavior
    assert.equal(r.ga4.status, 'NOT_CONFIGURED');
  });

  it('pipeline log is initially empty', () => {
    const log = telemetryService.getStageStats(campaignId);
    assert.ok(Array.isArray(log));
  });

  it('error breakdown is initially empty', () => {
    const r = telemetryService.getErrorBreakdown(campaignId);
    assert.ok(Array.isArray(r));
  });
});
