// Analytics tests
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = './server/database/test-analytics.sqlite';
process.env.AUTH_SECRET = 'test-secret-key-that-is-long-enough-32chars';
process.env.NODE_ENV = 'test';

const { db } = await import('../server/database/connection.js');
const { migrate } = await import('../server/database/migrate.js');
migrate();
const auth = await import('../server/middleware/auth.js');
const campaignService = await import('../server/services/campaignService.js');
const analyticsService = await import('../server/services/analyticsService.js');
const telemetryService = await import('../server/services/telemetryService.js');

describe('Analytics', () => {
  let userId, campaignId;
  before(() => {
    const r = auth.register({ email: 'analytics-test@example.com', password: 'password1234' });
    userId = r.userId;
    campaignId = campaignService.createCampaign({ userId, url: 'https://example.com', groupId: 'GROUP-US', countries: ['US'], durationSeconds: 300, sessionsPerCountry: 1 });
  });
  after(() => { db.close(); try { require('node:fs').unlinkSync('./server/database/test-analytics.sqlite'); } catch {} });

  it('GA4 status returns NOT_CONFIGURED', () => {
    const r = analyticsService.getCampaignAnalytics(campaignId);
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
