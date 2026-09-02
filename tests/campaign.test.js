// Campaign tests
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

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
  after(() => { db.close(); try { require('node:fs').unlinkSync('./server/database/test-campaign.sqlite'); } catch {} });

  it('createCampaign stores PENDING_EGRESS', () => {
    const id = campaignService.createCampaign({ userId, url: 'https://example.com', groupId: 'GROUP-US', countries: ['US'], durationSeconds: 300, sessionsPerCountry: 1, autoRoll: false });
    assert.ok(id.startsWith('tlc_'));
    const c = campaignService.getCampaign(id, userId);
    assert.equal(c.status, 'PENDING_EGRESS');
    assert.equal(c.url, 'https://example.com');
  });

  it('listCampaigns returns only this user', () => {
    const list = campaignService.listCampaigns(userId);
    assert.ok(list.length >= 1);
  });

  it('invalid URL rejected', () => {
    assert.throws(() => campaignService.createCampaign({ userId, url: 'not-a-url', groupId: 'GROUP-US', countries: ['US'], durationSeconds: 300, sessionsPerCountry: 1 }), /URL/);
  });

  it('canAutoRoll returns ok for first campaign', () => {
    const r = campaignService.canAutoRoll(userId);
    assert.equal(r.ok, true);
  });
});
