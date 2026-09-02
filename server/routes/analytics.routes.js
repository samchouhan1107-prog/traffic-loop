// Analytics routes — GA4 observation lifecycle.
// traffic_sent → HTTP_success → ga4_event_sent → ga4_observed
import * as analyticsService from '../services/analyticsService.js';

export function analyticsRoutes(route) {

  // ──────────────────────────────────────────────────────────
  // GA4 HEALTH CHECK (no auth required for status)
  // ──────────────────────────────────────────────────────────

  route('GET', '/api/analytics/health', async (ctx) => {
    try {
      const health = await analyticsService.healthCheck();
      ctx.json(200, health);
    } catch (e) {
      ctx.json(200, {
        overallStatus: 'ERROR',
        measurementProtocol: 'ERROR',
        dataApi: 'ERROR',
        errors: [e.message],
      });
    }
  });

  // ──────────────────────────────────────────────────────────
  // CAMPAIGN ANALYTICS — full pipeline status
  // ──────────────────────────────────────────────────────────

  route('GET', '/api/analytics/:campaignId', (ctx) => {
    ctx.requireAuth();
    ctx.json(200, analyticsService.getCampaignAnalytics(ctx.params.campaignId));
  });

  // ──────────────────────────────────────────────────────────
  // GA4 OBSERVATION — query Data API for real observations
  // ──────────────────────────────────────────────────────────

  route('POST', '/api/analytics/:campaignId/observe', async (ctx) => {
    ctx.requireAuth();
    try {
      const result = await analyticsService.observeCampaign(ctx.params.campaignId);
      ctx.json(200, { ok: true, observation: result });
    } catch (e) {
      ctx.json(500, { ok: false, error: e.message });
    }
  });

  route('GET', '/api/analytics/:campaignId/observations', (ctx) => {
    ctx.requireAuth();
    ctx.json(200, {
      observations: analyticsService.getObservations(ctx.params.campaignId),
    });
  });

  // ──────────────────────────────────────────────────────────
  // GA4 HIT RECORDING — webhook / manual
  // ──────────────────────────────────────────────────────────

  route('POST', '/api/analytics/:campaignId/hit', async (ctx) => {
    const body = await ctx.readBody();
    ctx.json(200, analyticsService.recordHit(ctx.params.campaignId, body.sessionId, body));
  });

  // ──────────────────────────────────────────────────────────
  // GA4 EVENT SENDING — trigger Measurement Protocol event
  // ──────────────────────────────────────────────────────────

  route('POST', '/api/analytics/:campaignId/send-event', async (ctx) => {
    const session = ctx.requireAuth();
    const body = await ctx.readBody();
    const result = await analyticsService.sendProbeEvent(
      ctx.params.campaignId,
      body.sessionId,
      body.params || {},
    );
    ctx.json(200, result);
  });
}
