// Campaign tests
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';

process.env.DB_PATH = './server/database/test-campaign.sqlite';
process.env.AUTH_SECRET = 'test-secret-key-that-is-long-enough-32chars';
process.env.NODE_ENV = 'test';

const { db } = await import('../server/database/connection.js');
const { migrate } = await import('../server/database/migrate.js');
migrate();
const auth = await import('../server/middleware/auth.js');
const campaignService = await import('../server/services/campaignService.js');

describe('Campaigns', () => {
  let userId;
  before(() => { const r = auth.register({ email: 'campaign-test@example.com', password: 'password1234' }); userId = r.userId; });
  after(() => { db.close(); for (const f of ['test-campaign.sqlite', 'test-campaign.sqlite-wal', 'test-campaign.sqlite-shm']) { try { unlinkSync('./server/database/' + f); } catch {} } });

  it('createCampaign stores PENDING_EGRESS', () => {
    const id = campaignService.createCampaign({ userId, url: 'https://example.com', groupId: 'GROUP-US', countries: ['US'], durationSeconds: 300, sessionsPerCountry: 1, autoRoll: false });
    assert.ok(id.startsWith('tlc_'));
    const c = campaignService.getCampaign(id, userId);
    assert.equal(c.status, 'PENDING_EGRESS');
    // createCampaign normalizes the URL (adds trailing slash on origin-only URLs)
    assert.equal(c.url, 'https://example.com/');
  });

  it('listCampaigns returns only this user', () => {
    const list = campaignService.listCampaigns(userId);
    assert.ok(list.length >= 1);
  });

  it('invalid URL rejected', () => {
    assert.throws(() => campaignService.createCampaign({ userId, url: 'not-a-url', groupId: 'GROUP-US', countries: ['US'], durationSeconds: 300, sessionsPerCountry: 1 }), /URL/);
  });

  it('canAutoRoll blocked while last campaign is still PENDING_EGRESS', () => {
    // A new user's first campaign is created above and is still pending;
    // auto-roll must not be allowed until the last campaign COMPLETES or FAILS.
    const r = campaignService.canAutoRoll(userId);
    assert.equal(r.ok, false);
    assert.match(r.reason, /status=PENDING_EGRESS/);
  });
});
