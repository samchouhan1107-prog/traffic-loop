// Campaign routes
import * as campaignService from '../services/campaignService.js';
import * as trafficLoop from '../services/trafficLoopService.js';
import { resolveGroup, listGroups } from '../config/countryGroups.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { clampStr } from '../middleware/validation.js';

export function campaignRoutes(route) {
  route('POST', '/api/campaigns', async (ctx) => {
    const session = ctx.requireAuth();
    await ctx.withCsrf(session);
    if (!rateLimit('tl:create:' + session.user_id, 10, 60_000)) throw ctx.httpError(429, 'Slow down');
    const body = await ctx.readBody(4096);
    const countries = resolveGroup(clampStr(body.groupId, 64));
    const id = campaignService.createCampaign({ userId: session.user_id, url: clampStr(body.url, 512), groupId: body.groupId, countries, durationSeconds: Number(body.durationSeconds) || 300, sessionsPerCountry: Number(body.sessionsPerCountry) || 1, autoRoll: !!body.autoRoll });
    trafficLoop.startCampaignJob(id, `user:${session.user_id}`);
    ctx.json(202, { ok: true, id, status: 'PENDING_EGRESS' });
  });

  route('GET', '/api/campaigns/:id', (ctx) => {
    const session = ctx.requireAuth();
    const c = campaignService.getCampaign(ctx.params.id, session.user_id);
    if (!c) throw ctx.httpError(404, 'Campaign not found');
    ctx.json(200, { campaign: c, stations: trafficLoop.listStations?.() || [] });
  });

  route('GET', '/api/campaigns', (ctx) => {
    const session = ctx.requireAuth();
    ctx.json(200, { campaigns: campaignService.listCampaigns(session.user_id) });
  });

  route('GET', '/api/campaigns/:id/diagnostic', (ctx) => {
    ctx.requireAuth();
    const diag = trafficLoop.getCampaignDiagnostic(ctx.params.id);
    if (!diag) throw ctx.httpError(404, 'Campaign not found');
    ctx.json(200, { diagnostic: diag });
  });

  route('GET', '/api/campaigns/:id/live', (ctx) => {
    ctx.requireAuth();
    const live = trafficLoop.getCampaignLiveStatus(ctx.params.id);
    if (!live) throw ctx.httpError(404, 'Campaign not found');
    ctx.json(200, { live });
  });

  route('GET', '/api/campaigns/:id/reconcile', (ctx) => {
    ctx.requireAuth();
    const r = trafficLoop.reconcilePushPack(ctx.params.id);
    if (!r) throw ctx.httpError(404, 'Campaign not found');
    ctx.json(200, { reconciliation: r });
  });

  route('GET', '/api/campaigns/:id/pipeline', (ctx) => {
    ctx.requireAuth();
    ctx.json(200, { pipeline: trafficLoop.getPipelineLog(ctx.params.id) });
  });

  route('GET', '/api/campaigns/:id/auto-roll-check', (ctx) => {
    const session = ctx.requireAuth();
    ctx.json(200, campaignService.canAutoRoll(session.user_id));
  });
}
