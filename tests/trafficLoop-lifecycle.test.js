// trafficLoop-lifecycle.test.js — Verifies the request lifecycle fix:
// US-targeted request against Indian egress must become UNVERIFIED,
// HTTP 200 remains visible as transport success, and metrics are separated.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'node:fs';

process.env.DB_PATH = './server/database/test-lifecycle.sqlite';
process.env.AUTH_SECRET = 'test-secret-key-that-is-long-enough-32chars';
process.env.NODE_ENV = 'test';

const { db } = await import('../server/database/connection.js');
const { migrate } = await import('../server/database/migrate.js');
migrate();
const auth = await import('../server/middleware/auth.js');
const campaignService = await import('../server/services/campaignService.js');
const trafficLoop = await import('../server/services/trafficLoopService.js');
const { EgressProvider } = await import('../server/providers/egressProvider.js');

describe('Traffic Loop Lifecycle — Country Match', () => {
  let userId, campaignId;

  before(() => {
    const r = auth.register({ email: 'lifecycle-test@example.com', password: 'password1234' });
    userId = r.userId;
  });

  after(() => {
    db.close();
    for (const f of ['test-lifecycle.sqlite', 'test-lifecycle.sqlite-wal', 'test-lifecycle.sqlite-shm']) {
      try { unlinkSync('./server/database/' + f); } catch {}
    }
  });

  it('detects actual egress country (expected: IN for this environment)', async () => {
    const egress = await EgressProvider.detect();
    const geo = await EgressProvider.geo(egress.ip);
    console.log(`  [info] egress IP=${egress.ip} country=${geo.country}`);
    assert.ok(egress.ip, 'should detect a real egress IP');
    assert.ok(geo.country, 'should detect a real country code');
  });

  it('US-targeted campaign with Indian egress produces UNVERIFIED sessions (not COMPLETED)', async () => {
    // Create a campaign targeting US — but egress is IN
    campaignId = campaignService.createCampaign({
      userId, url: 'https://example.com/', groupId: 'GROUP-US',
      countries: ['US'], durationSeconds: 300, sessionsPerCountry: 1, autoRoll: false,
    });
    assert.ok(campaignId.startsWith('tlc_'));

    // Start the campaign job
    trafficLoop.startCampaignJob(campaignId, `user:${userId}`);

    // Wait for the job to complete (max 30s)
    await new Promise((resolve) => setTimeout(resolve, 20_000));

    // Wait a bit more for the job to finish
    for (let i = 0; i < 10; i++) {
      const jobs = trafficLoop.listJobs();
      if (!jobs.find(j => j.campaignId === campaignId)) break;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const c = db.prepare('SELECT * FROM traffic_loop_campaigns WHERE id = ?').get(campaignId);
    console.log(`  [info] campaign status: ${c.status}`);

    const sessions = db.prepare('SELECT * FROM traffic_loop_sessions WHERE campaign_id = ?').all(campaignId);
    console.log(`  [info] sessions: ${JSON.stringify(sessions.map(s => ({ id: s.id, status: s.status, verified: s.verified, http_status: s.http_status, error_code: s.error_code, country_available: s.country_available, egress_country: s.egress_country })))}`);

    // At least one session should exist
    assert.ok(sessions.length > 0, 'should have at least one session');

    // The session should NOT be COMPLETED (verified) because egress country (IN) != requested (US)
    const unverifiedSessions = sessions.filter(s => s.status === 'UNVERIFIED');
    const completedSessions = sessions.filter(s => s.status === 'COMPLETED');
    assert.ok(unverifiedSessions.length > 0, 'should have UNVERIFIED sessions (egress country mismatch)');
    assert.equal(completedSessions.length, 0, 'should have ZERO COMPLETED/verified sessions (country mismatch)');

    // At least one session should have HTTP 200 (transport success, even though unverified)
    const http200Sessions = sessions.filter(s => s.http_status === 200);
    assert.ok(http200Sessions.length > 0, 'should have HTTP 200 responses (transport success)');

    // Summary should have separated metrics
    const summary = JSON.parse(c.summary || '{}');
    console.log(`  [info] summary: ${JSON.stringify({ ...summary, per_country: undefined })}`);

    assert.ok('dispatched' in summary, 'summary should have dispatched');
    assert.ok('started' in summary, 'summary should have started');
    assert.ok('http_completed' in summary, 'summary should have http_completed');
    assert.ok('verified_completed' in summary, 'summary should have verified_completed');
    assert.ok('unverified' in summary, 'summary should have unverified');

    // verified_completed should be 0 (egress country is IN, not US)
    assert.equal(summary.verified_completed, 0, 'verified_completed must be 0 (country mismatch)');

    // http_completed should be > 0 (HTTP 200 was received)
    assert.ok(summary.http_completed >= 1 || summary.unverified >= 1, 'should have HTTP 200 transport success or unverified sessions');

    // Check pipeline log for COUNTRY_MATCH
    const pipeline = db.prepare('SELECT stage, status, detail FROM traffic_loop_pipeline_log WHERE campaign_id = ? ORDER BY id ASC').all(campaignId);
    const countryMatchLogs = pipeline.filter(p => p.stage === 'COUNTRY_MATCH');
    console.log(`  [info] COUNTRY_MATCH logs: ${JSON.stringify(countryMatchLogs.map(p => ({ status: p.status, detail: JSON.parse(p.detail) })))}`);
    assert.ok(countryMatchLogs.length > 0, 'should have COUNTRY_MATCH pipeline entries');

    const failLogs = countryMatchLogs.filter(p => {
      const d = JSON.parse(p.detail);
      return !d.country_match;
    });
    assert.ok(failLogs.length > 0, 'should have COUNTRY_MATCH FAIL entries (IN != US)');

    // Check for structured outcome logs
    const outcomeLogs = pipeline.filter(p => p.stage === 'REQUEST_UNVERIFIED' || p.stage === 'REQUEST_COMPLETED' || p.stage === 'REQUEST_FAILED');
    console.log(`  [info] outcome logs: ${JSON.stringify(outcomeLogs.map(p => ({ stage: p.stage, status: p.status, detail: JSON.parse(p.detail) })))}`);
    assert.ok(pipeline.some(p => p.stage === 'REQUEST_UNVERIFIED'), 'should have REQUEST_UNVERIFIED stage');

    // Check that EGRESS_CHECK is logged only once (no duplicate 'OK' before detection)
    const egressCheckLogs = pipeline.filter(p => p.stage === 'EGRESS_CHECK');
    console.log(`  [info] EGRESS_CHECK logs: ${JSON.stringify(egressCheckLogs.map(p => ({ status: p.status, detail: JSON.parse(p.detail) })))}`);
    // Should have exactly 1 EGRESS_CHECK (INITIATED) entry, not the duplicate 'OK' one
    assert.equal(egressCheckLogs.length, 1, 'should have exactly 1 EGRESS_CHECK log (no duplicate)');
    assert.equal(egressCheckLogs[0].status, 'INITIATED', 'EGRESS_CHECK should be INITIATED, not premature OK');

    // Should have EGRESS_VERIFIED with actual country
    const egressVerifiedLogs = pipeline.filter(p => p.stage === 'EGRESS_VERIFIED');
    assert.ok(egressVerifiedLogs.length > 0, 'should have EGRESS_VERIFIED log');
    const verifiedDetail = JSON.parse(egressVerifiedLogs[0].detail);
    console.log(`  [info] EGRESS_VERIFIED: country=${verifiedDetail.country} ip=${verifiedDetail.ip}`);
    assert.equal(verifiedDetail.country, 'IN', 'actual egress country should be IN');
    assert.ok(verifiedDetail.ip, 'actual egress IP should be preserved in telemetry');
  });
});
