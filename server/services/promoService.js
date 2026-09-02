// promoService.js — FREE PROMO system with server-authoritative allocation.
// Never fabricates visitors. All metrics separated honestly.
import { randomUUID } from 'node:crypto';
import { db, audit } from '../database/connection.js';
import { config } from '../config/environment.js';
import { validateUrl } from '../middleware/validation.js';

// ============================================================
// ALLOCATION MANAGEMENT
// ============================================================

/**
 * Create or get the promo allocation for a user.
 * Initial allocation comes from config.promo.initialAllocation.
 */
export function getOrCreateAllocation(userId) {
  let row = db.prepare('SELECT * FROM promo_allocations WHERE user_id = ?').get(userId);
  if (!row) {
    db.prepare(`INSERT INTO promo_allocations (user_id, total_allocation, status, created_at, updated_at)
      VALUES (?, 0, 'PENDING', datetime('now'), datetime('now'))`).run(userId);
    row = db.prepare('SELECT * FROM promo_allocations WHERE user_id = ?').get(userId);
  }
  return row;
}

/**
 * Give initial promo allocation on first URL submission.
 * Returns allocation record. Does NOT fabricate any visitor data.
 */
export function grantInitialAllocation(userId, campaignId) {
  const existing = getOrCreateAllocation(userId);
  if (existing.total_allocation > 0) {
    // Already has allocation — just link the campaign
    db.prepare('UPDATE promo_allocations SET promo_campaign_id = ?, updated_at = datetime(\'now\') WHERE user_id = ?')
      .run(campaignId, userId);
    return getOrCreateAllocation(userId);
  }

  const amount = config.promo.initialAllocation;
  db.prepare(`UPDATE promo_allocations
    SET total_allocation = ?, status = 'ACTIVE', promo_campaign_id = ?, updated_at = datetime('now')
    WHERE user_id = ?`).run(amount, campaignId, userId);

  audit('system', userId, 'PROMO_INITIAL_GRANT', 'promo_allocations', String(userId),
    { after: { allocation: amount, campaignId } });

  return getOrCreateAllocation(userId);
}

/**
 * Add bonus allocation from streak rewards.
 * Server-authoritative — only callable once per streak day.
 */
export function addBonusAllocation(userId, bonusAmount, source) {
  const alloc = getOrCreateAllocation(userId);
  const newTotal = alloc.total_allocation + bonusAmount;

  db.prepare(`UPDATE promo_allocations
    SET total_allocation = ?, updated_at = datetime('now')
    WHERE user_id = ?`).run(newTotal, userId);

  audit('system', userId, 'PROMO_BONUS_GRANT', 'promo_allocations', String(userId),
    { after: { bonus: bonusAmount, newTotal, source } });

  return getOrCreateAllocation(userId);
}

/**
 * Decrement allocation after dispatching a batch.
 * Only counts REAL dispatched requests, never synthetic.
 */
export function decrementAllocation(userId, count) {
  db.prepare(`UPDATE promo_allocations
    SET dispatched = dispatched + ?, updated_at = datetime('now')
    WHERE user_id = ?`).run(count, userId);
  return getOrCreateAllocation(userId);
}

/**
 * Record actual results from promo campaign execution.
 * Each metric is tracked separately — never merged into a fake "Visitors" counter.
 */
export function recordPromoResults(userId, results) {
  const {
    responsesReceived = 0,
    confirmedEligible = 0,
    genuineVisits = 0,
    failedRequests = 0,
    unverifiedEvents = 0,
    ga4Observed = 0,
  } = results;

  db.prepare(`UPDATE promo_allocations SET
    responses_received = responses_received + ?,
    confirmed_eligible = confirmed_eligible + ?,
    genuine_visits = genuine_visits + ?,
    failed_requests = failed_requests + ?,
    unverified_events = unverified_events + ?,
    ga4_observed = ga4_observed + ?,
    updated_at = datetime('now')
    WHERE user_id = ?`).run(
    responsesReceived, confirmedEligible, genuineVisits,
    failedRequests, unverifiedEvents, ga4Observed, userId
  );

  return getOrCreateAllocation(userId);
}

/**
 * Get the full promo status for a user — all metrics separated honestly.
 */
export function getPromoStatus(userId) {
  const alloc = getOrCreateAllocation(userId);
  const remaining = Math.max(0, alloc.total_allocation - alloc.dispatched);

  return {
    userId,
    // Allocation — the maximum allowed, not a visitor count
    totalAllocation: alloc.total_allocation,
    // How many requests have been dispatched (not visitors)
    dispatched: alloc.dispatched,
    // Remaining allocation for future dispatches
    remaining,
    // ---- SEPARATED METRICS (never merged) ----
    responsesReceived: alloc.responses_received,
    confirmedEligible: alloc.confirmed_eligible,
    genuineVisits: alloc.genuine_visits,
    failedRequests: alloc.failed_requests,
    unverifiedEvents: alloc.unverified_events,
    ga4Observed: alloc.ga4_observed,
    // Status
    status: alloc.status,
    promoCampaignId: alloc.promo_campaign_id,
    createdAt: alloc.created_at,
    updatedAt: alloc.updated_at,
  };
}

// ============================================================
// URL VERIFICATION (lightweight, pre-promo)
// ============================================================

/**
 * Lightweight URL verification — quick HEAD request to check if the URL is reachable.
 * This is NOT a fake visitor — it's a health check.
 */
export async function verifyUrl(url) {
  const cleanUrl = validateUrl(url);

  // Check cache first
  let cached = db.prepare('SELECT * FROM promo_url_health WHERE url = ?').get(cleanUrl);
  if (cached && cached.last_checked_at) {
    const age = Date.now() - new Date(cached.last_checked_at + 'Z').getTime();
    if (age < config.promo.healthCheckIntervalMs) {
      return { ok: cached.is_healthy === 1, url: cleanUrl, httpStatus: cached.http_status, cached: true };
    }
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.promo.healthCheckTimeoutMs);
    const res = await fetch(cleanUrl, {
      method: 'HEAD',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'TrafficLoop-Verify/1.0' },
    });
    clearTimeout(timeout);

    const isHealthy = res.status >= 200 && res.status < 500;
    db.prepare(`INSERT INTO promo_url_health (url, last_checked_at, is_healthy, http_status, error_message)
      VALUES (?, datetime('now'), ?, ?, NULL)
      ON CONFLICT(url) DO UPDATE SET last_checked_at = datetime('now'), is_healthy = excluded.is_healthy,
      http_status = excluded.http_status, error_message = NULL`).run(cleanUrl, isHealthy ? 1 : 0, res.status);

    audit('system', null, 'URL_VERIFIED', 'promo_url_health', cleanUrl,
      { after: { healthy: isHealthy, httpStatus: res.status } });

    return { ok: isHealthy, url: cleanUrl, httpStatus: res.status };
  } catch (e) {
    db.prepare(`INSERT INTO promo_url_health (url, last_checked_at, is_healthy, http_status, error_message)
      VALUES (?, datetime('now'), 0, NULL, ?)
      ON CONFLICT(url) DO UPDATE SET last_checked_at = datetime('now'), is_healthy = 0,
      http_status = NULL, error_message = excluded.error_message`).run(cleanUrl, String(e.message));

    return { ok: false, url: cleanUrl, error: String(e.message) };
  }
}

/**
 * Check URL health for scheduler pause/resume.
 */
export async function healthCheckUrl(url) {
  return verifyUrl(url);
}

// ============================================================
// PROMO CAMPAIGN CREATION
// ============================================================

/**
 * Create a promo campaign — minimal config, auto-assigned.
 */
export function createPromoCampaign({ userId, url, countries }) {
  const cleanUrl = validateUrl(url);
  const id = 'tlc_promo_' + randomUUID().split('-')[0];

  db.prepare(`INSERT INTO traffic_loop_campaigns
    (id, user_id, url, country_group, requested_countries, duration_seconds, sessions_per_country, auto_roll, status)
    VALUES (?, ?, ?, 'PROMO', ?, ?, ?, 0, 'PENDING_EGRESS')`)
    .run(id, userId, cleanUrl, JSON.stringify(countries),
      config.promo.maxDurationSeconds, config.promo.sessionsPerCountry);

  audit('user', userId, 'PROMO_CAMPAIGN_CREATED', 'traffic_loop_campaigns', id,
    { after: { url: cleanUrl, countries } });

  return id;
}

// ============================================================
// SCHEDULER HELPERS
// ============================================================

/**
 * Create a scheduler batch entry.
 */
export function createSchedulerBatch(userId, campaignId, allocationBatch) {
  db.prepare(`INSERT INTO promo_scheduler (user_id, campaign_id, allocation_batch, status, created_at, updated_at)
    VALUES (?, ?, ?, 'PENDING', datetime('now'), datetime('now'))`).run(userId, campaignId, allocationBatch);
}

/**
 * Get next batch to process.
 */
export function getNextBatch() {
  return db.prepare(`SELECT * FROM promo_scheduler WHERE status = 'PENDING'
    AND (next_dispatch_at IS NULL OR next_dispatch_at <= datetime('now'))
    ORDER BY created_at ASC LIMIT 1`).get();
}

/**
 * Update batch status.
 */
export function updateBatchStatus(batchId, status, extra = {}) {
  const sets = ['status = ?', 'updated_at = datetime(\'now\')'];
  const params = [status];
  if (extra.dispatched != null) { sets.push('dispatched = ?'); params.push(extra.dispatched); }
  if (extra.eligible != null) { sets.push('eligible = ?'); params.push(extra.eligible); }
  if (extra.failed != null) { sets.push('failed = ?'); params.push(extra.failed); }
  if (extra.pausedReason != null) { sets.push('paused_reason = ?'); params.push(extra.pausedReason); }
  if (extra.nextDispatchAt != null) { sets.push('next_dispatch_at = ?'); params.push(extra.nextDispatchAt); }
  params.push(batchId);
  db.prepare(`UPDATE promo_scheduler SET ${sets.join(', ')} WHERE id = ?`).run(...params);
}

/**
 * Get scheduler status for a user.
 */
export function getSchedulerStatus(userId) {
  const batches = db.prepare(`SELECT * FROM promo_scheduler WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`).all(userId);
  const active = batches.filter(b => b.status === 'PENDING' || b.status === 'RUNNING');
  const completed = batches.filter(b => b.status === 'COMPLETED');
  const paused = batches.filter(b => b.status === 'PAUSED');

  return {
    totalBatches: batches.length,
    active: active.length,
    completed: completed.length,
    paused: paused.length,
    batches: batches.map(b => ({
      id: b.id,
      campaignId: b.campaign_id,
      allocationBatch: b.allocation_batch,
      dispatched: b.dispatched,
      eligible: b.eligible,
      failed: b.failed,
      status: b.status,
      pausedReason: b.paused_reason,
      nextDispatchAt: b.next_dispatch_at,
      createdAt: b.created_at,
    })),
  };
}

/**
 * Get all active promo campaigns that need scheduler attention.
 */
export function getActivePromoCampaigns() {
  return db.prepare(`SELECT pa.*, tc.url, tc.status as campaign_status
    FROM promo_allocations pa
    JOIN traffic_loop_campaigns tc ON pa.promo_campaign_id = tc.id
    WHERE pa.status = 'ACTIVE' AND pa.dispatched < pa.total_allocation
    AND tc.status IN ('RUNNING', 'COMPLETED', 'PENDING_EGRESS')`).all();
}
