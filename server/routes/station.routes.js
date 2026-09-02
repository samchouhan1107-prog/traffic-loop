// Station routes
import * as stationService from '../services/stationService.js';
import * as trafficLoop from '../services/trafficLoopService.js';

export function stationRoutes(route) {
  route('GET', '/api/stations', (ctx) => {
    ctx.json(200, { stations: stationService.listStations() });
  });

  route('POST', '/api/stations/stop-all', async (ctx) => {
    ctx.requireAuth(); await ctx.withCsrf(ctx.requireAuth());
    ctx.json(200, { stations: trafficLoop.cancelAll() });
  });

  route('POST', '/api/stations/:id/reset', async (ctx) => {
    ctx.requireAuth(); await ctx.withCsrf(ctx.requireAuth());
    ctx.json(200, { station: stationService.resetStation(ctx.params.id) });
  });

  route('POST', '/api/stations/:id/reset-independent', async (ctx) => {
    ctx.requireAuth(); await ctx.withCsrf(ctx.requireAuth());
    ctx.json(200, { station: stationService.resetStationIndependent(ctx.params.id) });
  });
}
