// promo.routes.js — FREE PROMO + LOGIN STREAK API endpoints.
import * as promoService from '../services/promoService.js';
import * as streakService from '../services/streakService.js';
import * as promoScheduler from '../services/promoScheduler.js';
import * as trafficLoop from '../services/trafficLoopService.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { clampStr } from '../middleware/validation.js';
import { GA4Provider } from '../providers/ga4Provider.js';
import { resolveGroup } from '../config/countryGroups.js';
import { audit } from '../database/connection.js';

export function promoRoutes(route) {

  // ──────────────────────────────────────────────────────────
  // FREE PROMO — Landing flow (no auth required for verify)
  // ──────────────────────────────────────────────────────────

  /**
   * POST /api/promo/verify — Lightweight URL verification.
   * No auth required — part of the landing flow.
   */
  route('POST', '/api/promo/verify', async (ctx) => {
    if (!rateLimit('promo:verify:' + ctx.ip, 10, 60_000)) throw ctx.httpError(429, 'Too many verification requests');
    const body = await ctx.readBody(2048);
    const url = body.url;
    if (!url) throw ctx.httpError(400, 'URL required');

    const result = await promoService.verifyUrl(url);
    ctx.json(200, result);
  });

  // ──────────────────────────────────────────────────────────
  // FREE PROMO — Start campaign (requires auth)
  // ──────────────────────────────────────────────────────────

  /**
   * POST /api/promo/start — Start a free promo campaign.
   * Creates campaign, grants allocation, starts scheduler.
   */
  route('POST', '/api/promo/start', async (ctx) => {
    const session = ctx.requireAuth();
    await ctx.withCsrf(session);
    if (!rateLimit('promo:start:' + session.user_id, 5, 300_000)) throw ctx.httpError(429, 'Slow down');

    const body = await ctx.readBody(2048);
    const url = body.url;
    if (!url) throw ctx.httpError(400, 'URL required');

    // Check if user already has an active promo
    const existing = promoService.getOrCreateAllocation(session.user_id);
    if (existing.status === 'ACTIVE' && existing.promo_campaign_id) {
      throw ctx.httpError(409, 'You already have an active promo campaign');
    }

    // Verify URL is healthy first
    const verification = await promoService.verifyUrl(url);
    if (!verification.ok) {
      throw ctx.httpError(400, `URL verification failed: ${verification.error || 'HTTP ' + verification.httpStatus}`);
    }

    // Resolve countries from group or use default
    let countries = ['US'];
    if (body.groupId) {
      try { countries = resolveGroup(body.groupId); } catch {}
    } else if (body.countries && Array.isArray(body.countries)) {
      countries = body.countries;
    }

    // Create promo campaign
    const campaignId = promoService.createPromoCampaign({
      userId: session.user_id,
      url: clampStr(url, 512),
      countries,
    });

    // Grant initial allocation
    const alloc = promoService.grantInitialAllocation(session.user_id, campaignId);

    // Create scheduler batches to distribute gradually
    const batchSize = 10;
    const totalBatches = Math.ceil(alloc.total_allocation / batchSize);
    for (let i = 0; i < Math.min(3, totalBatches); i++) {
      promoService.createSchedulerBatch(session.user_id, campaignId, batchSize);
    }

    // Start the campaign job
    trafficLoop.startCampaignJob(campaignId, `promo:${session.user_id}`);

    audit('user', session.user_id, 'PROMO_STARTED', 'promo_allocations', String(session.user_id),
      { after: { url: clampStr(url, 512), countries, campaignId, allocation: alloc.total_allocation } });

    ctx.json(202, {
      ok: true,
      campaignId,
      allocation: alloc.total_allocation,
      status: 'PENDING_EGRESS',
      message: 'Your free promo campaign has been started. Results will appear gradually as real traffic is dispatched.',
    });
  });

  // ──────────────────────────────────────────────────────────
  // PROMO STATUS
  // ──────────────────────────────────────────────────────────

  /**
   * GET /api/promo/status — Get full promo status with separated metrics.
   */
  route('GET', '/api/promo/status', (ctx) => {
    const session = ctx.requireAuth();
    const status = promoService.getPromoStatus(session.user_id);
    const ga4Configured = GA4Provider.isConfigured();

    ctx.json(200, {
      ...status,
      ga4Configured,
      ga4Label: ga4Configured ? 'GA4 CONFIGURED' : 'GA4 NOT CONFIGURED',
    });
  });

  /**
   * GET /api/promo/scheduler — Get scheduler status.
   */
  route('GET', '/api/promo/scheduler', (ctx) => {
    const session = ctx.requireAuth();
    const scheduler = promoScheduler.getSchedulerStatus();
    const batches = promoService.getSchedulerStatus(session.user_id);
    ctx.json(200, { scheduler, batches });
  });

  // ──────────────────────────────────────────────────────────
  // LOGIN STREAK
  // ──────────────────────────────────────────────────────────

  /**
   * GET /api/streak — Get current streak status.
   */
  route('GET', '/api/streak', (ctx) => {
    const session = ctx.requireAuth();
    const streak = streakService.getStreakStatus(session.user_id);
    ctx.json(200, { streak });
  });

  /**
   * POST /api/streak/claim — Claim streak reward.
   */
  route('POST', '/api/streak/claim', async (ctx) => {
    const session = ctx.requireAuth();
    await ctx.withCsrf(session);
    if (!rateLimit('streak:claim:' + session.user_id, 5, 60_000)) throw ctx.httpError(429, 'Slow down');

    const result = streakService.claimStreakReward(session.user_id);
    ctx.json(200, result);
  });

  /**
   * GET /api/streak/rewards — Get all reward tiers (public).
   */
  route('GET', '/api/streak/rewards', (ctx) => {
    const rewards = streakService.getRewards();
    ctx.json(200, { rewards });
  });

  /**
   * GET /api/streak/history — Get claim history.
   */
  route('GET', '/api/streak/history', (ctx) => {
    const session = ctx.requireAuth();
    const history = streakService.getClaimHistory(session.user_id);
    ctx.json(200, { history });
  });

  /**
   * PUT /api/streak/rewards/:day — Update reward tier (admin).
   */
  route('PUT', '/api/streak/rewards/:day', async (ctx) => {
    const session = ctx.requireAuth();
    await ctx.withCsrf(session);
    const body = await ctx.readBody(1024);
    const dayNumber = parseInt(ctx.params.day);
    if (!dayNumber || dayNumber < 1) throw ctx.httpError(400, 'Invalid day number');

    streakService.updateReward(dayNumber, {
      bonusAllocation: body.bonusAllocation,
      label: body.label,
      active: body.active,
    });

    ctx.json(200, { ok: true, rewards: streakService.getRewards() });
  });
}
