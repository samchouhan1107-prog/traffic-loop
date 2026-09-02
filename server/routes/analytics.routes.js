// Analytics routes
import * as analyticsService from '../services/analyticsService.js';

export function analyticsRoutes(route) {
  route('GET', '/api/analytics/:campaignId', (ctx) => {
    ctx.requireAuth();
    ctx.json(200, analyticsService.getCampaignAnalytics(ctx.params.campaignId));
  });

  route('POST', '/api/analytics/:campaignId/hit', async (ctx) => {
    const body = await ctx.readBody();
    ctx.json(200, analyticsService.recordHit(ctx.params.campaignId, body.sessionId, body));
  });
}
