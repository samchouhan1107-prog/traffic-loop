// promoScheduler.js — Server-controlled gradual distribution of promo exposure.
// Distributes eligible promotional exposure gradually rather than claiming everything immediately.
// Respects campaign limits, rate limits, and pauses when URL fails validation.
import { randomUUID } from 'node:crypto';
import { db, audit } from '../database/connection.js';
import { config } from '../config/environment.js';
import * as promoService from './promoService.js';
import * as trafficLoop from './trafficLoopService.js';
import { EgressProvider } from '../providers/egressProvider.js';
import { GA4Provider } from '../providers/ga4Provider.js';
import { setTimeout as wait } from 'node:timers/promises';

let schedulerRunning = false;
let schedulerTimer = null;

// ============================================================
// SCHEDULER START/STOP
// ============================================================

/**
 * Start the promo scheduler. Runs periodically to distribute batches.
 */
export function startScheduler() {
  if (schedulerRunning) return;
  schedulerRunning = true;
  console.log('[promo-scheduler] started');
  scheduleNext();
}

/**
 * Stop the promo scheduler.
 */
export function stopScheduler() {
  schedulerRunning = false;
  if (schedulerTimer) { clearTimeout(schedulerTimer); schedulerTimer = null; }
  console.log('[promo-scheduler] stopped');
}

function scheduleNext() {
  if (!schedulerRunning) return;
  schedulerTimer = setTimeout(async () => {
    try {
      await runSchedulerCycle();
    } catch (e) {
      console.error('[promo-scheduler] cycle error:', e);
    }
    scheduleNext();
  }, config.promo.batchIntervalMs);
}

// ============================================================
// SCHEDULER CYCLE
// ============================================================

/**
 * Main scheduler cycle — picks up pending batches and dispatches.
 */
async function runSchedulerCycle() {
  const activePromos = promoService.getActivePromoCampaigns();

  for (const promo of activePromos) {
    if (!schedulerRunning) break;

    const remaining = promo.total_allocation - promo.dispatched;
    if (remaining <= 0) {
      // Allocation exhausted
      db.prepare(`UPDATE promo_allocations SET status = 'EXHAUSTED', updated_at = datetime('now')
        WHERE user_id = ?`).run(promo.user_id);
      audit('system', promo.user_id, 'PROMO_EXHAUSTED', 'promo_allocations', String(promo.user_id));
      continue;
    }

    // Health check URL before dispatching
    const health = await promoService.healthCheckUrl(promo.url);
    if (!health.ok) {
      // Pause — URL is unhealthy
      const pausedBatches = db.prepare(`SELECT id FROM promo_scheduler
        WHERE user_id = ? AND status IN ('PENDING', 'RUNNING')`).all(promo.user_id);

      for (const b of pausedBatches) {
        promoService.updateBatchStatus(b.id, 'PAUSED', {
          pausedReason: `URL health check failed: ${health.error || 'HTTP ' + health.httpStatus}`,
        });
      }

      db.prepare(`UPDATE promo_allocations SET status = 'PAUSED', updated_at = datetime('now')
        WHERE user_id = ?`).run(promo.user_id);

      audit('system', promo.user_id, 'PROMO_PAUSED', 'promo_allocations', String(promo.user_id),
        { after: { reason: 'URL health check failed', url: promo.url } });
      continue;
    }

    // Resume if was paused
    if (promo.status === 'PAUSED') {
      db.prepare(`UPDATE promo_allocations SET status = 'ACTIVE', updated_at = datetime('now')
        WHERE user_id = ?`).run(promo.user_id);

      const pausedBatches = db.prepare(`SELECT id FROM promo_scheduler
        WHERE user_id = ? AND status = 'PAUSED'`).all(promo.user_id);
      for (const b of pausedBatches) {
        promoService.updateBatchStatus(b.id, 'PENDING', { pausedReason: null });
      }

      audit('system', promo.user_id, 'PROMO_RESUMED', 'promo_allocations', String(promo.user_id),
        { after: { url: promo.url } });
    }

    // Dispatch a batch
    const batchSize = Math.min(config.promo.batchSize, remaining);
    await dispatchBatch(promo, batchSize);
  }
}

// ============================================================
// BATCH DISPATCH
// ============================================================

/**
 * Dispatch a single batch of promo exposures.
 * Creates REAL campaign sessions — never fabricates visitor data.
 */
async function dispatchBatch(promo, batchSize) {
  const campaignId = promo.promo_campaign_id;
  const countries = JSON.parse(
    db.prepare('SELECT requested_countries FROM traffic_loop_campaigns WHERE id = ?').get(campaignId)?.requested_countries || '[]'
  );

  if (countries.length === 0) {
    console.log(`[promo-scheduler] no countries for campaign ${campaignId}`);
    return;
  }

  // Create scheduler batch record
  promoService.createSchedulerBatch(promo.user_id, campaignId, batchSize);

  // PIPELINE: EGRESS_CHECK (initiated — no result yet, no duplicate 'OK')
  const requestId = 'req_promo_' + Date.now().toString(36);
  trafficLoop.pipeLog(campaignId, null, requestId, trafficLoop.STAGE.EGRESS_CHECK, 'INITIATED', { source: 'promo-scheduler' });

  // Get egress for real dispatches
  const egress = await EgressProvider.detect();
  const geo = await EgressProvider.geo(egress.ip);

  // PIPELINE: EGRESS_VERIFIED (actual result — never spoofed)
  trafficLoop.pipeLog(campaignId, null, requestId, trafficLoop.STAGE.EGRESS_VERIFIED,
    geo.country ? 'OK' : 'FAILED',
    { ip: egress.ip, country: geo.country, countryName: geo.countryName, source: geo.source, error: geo.error });

  let dispatched = 0, started = 0, httpCompleted = 0, verifiedCompleted = 0, failed = 0, unverified = 0, ga4Observed = 0;

  // Distribute batch across countries
  const perCountry = Math.ceil(batchSize / countries.length);

  for (const country of countries) {
    if (dispatched >= batchSize) break;

    const sessionsThisCountry = Math.min(perCountry, batchSize - dispatched);

    for (let i = 0; i < sessionsThisCountry; i++) {
      if (!schedulerRunning) break;

      // Check campaign still exists and is valid
      const campaign = db.prepare('SELECT * FROM traffic_loop_campaigns WHERE id = ?').get(campaignId);
      if (!campaign || campaign.status === 'FAILED' || campaign.status === 'CANCELLED') {
        console.log(`[promo-scheduler] campaign ${campaignId} no longer valid`);
        break;
      }

      dispatched++;
      const countryAvailable = geo.country === country;
      const stationId = 'PROMO-' + String(i % 3 + 1).padStart(2, '0');
      const sid = 'tls_promo_' + randomUUID().split('-')[0];

      // Create real session record
      db.prepare(`INSERT INTO traffic_loop_sessions
        (id, campaign_id, country, station, status, verified, egress_ip, egress_country, country_available, started_at)
        VALUES (?, ?, ?, ?, 'STARTED', 0, ?, ?, ?, datetime('now'))`)
        .run(sid, campaignId, country, stationId, egress.ip, geo.country, countryAvailable ? 1 : 0);

      // PIPELINE: COUNTRY_MATCH — strict, egress never spoofed
      if (countryAvailable) {
        trafficLoop.logOutcome(campaignId, sid, requestId, 'COUNTRY_MATCH PASS',
          { requested_country: country, actual_country: geo.country, egress_ip: egress.ip, country_match: true });
      } else {
        trafficLoop.logOutcome(campaignId, sid, requestId, 'COUNTRY_MATCH FAIL',
          { requested_country: country, actual_country: geo.country, egress_ip: egress.ip, country_match: false });
      }

      // PIPELINE: QUEUED + CONNECTION
      trafficLoop.pipeLog(campaignId, sid, requestId, trafficLoop.STAGE.QUEUED, 'OK', { country, station: stationId });
      trafficLoop.pipeLog(campaignId, sid, requestId, trafficLoop.STAGE.CONNECTION, 'OK', { station: stationId, country, countryAvailable });
      started++;

      let httpStatus = null, errorCode = null, verified = false;
      const t0 = Date.now();

      trafficLoop.pipeLog(campaignId, sid, requestId, trafficLoop.STAGE.TARGET_REQUEST, 'OK', { url: campaign.url });

      // REAL HTTP probe
      try {
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), 15_000);
        const res = await fetch(campaign.url, {
          method: 'GET',
          redirect: 'follow',
          signal: controller.signal,
          headers: {
            'User-Agent': 'TrafficLoop-Promo/1.0',
            'X-TL-Session': sid,
            'X-TL-Country': country,
            'X-TL-Station': stationId,
          },
        });
        clearTimeout(to);
        httpStatus = res.status;

        trafficLoop.pipeLog(campaignId, sid, requestId, trafficLoop.STAGE.RESPONSE,
          httpStatus >= 200 && httpStatus < 400 ? 'OK' : 'FAILED',
          { httpStatus, duration_ms: Date.now() - t0 });

        if (httpStatus >= 200 && httpStatus < 400) {
          httpCompleted++;
          // HTTP 200 = transport success, NOT verified completion
          // verified only if egress country matches requested country
          if (countryAvailable) verified = true;
          // else: unverified (HTTP OK but country mismatch)
        } else if (httpStatus >= 400) {
          failed++;
          errorCode = httpStatus >= 500 ? 'HTTP_5XX' : 'HTTP_4XX';
        }

        // Drain response body
        try {
          const reader = res.body?.getReader?.();
          if (reader) {
            while (true) {
              const { done } = await reader.read();
              if (done) break;
            }
          }
        } catch {}
      } catch (e) {
        failed++;
        const msg = String(e.message || e);
        if (/abort/i.test(msg)) errorCode = 'TIMEOUT';
        else if (/getaddrinfo|ENOTFOUND/i.test(msg)) errorCode = 'DNS_FAILURE';
        else errorCode = 'INTERNAL_ERROR';
        trafficLoop.pipeLog(campaignId, sid, requestId, trafficLoop.STAGE.RESPONSE, 'FAILED',
          { error_code: errorCode, error: msg });
      }

      const dur = Date.now() - t0;
      const finalStatus = verified ? 'COMPLETED' : (errorCode ? 'FAILED' : 'UNVERIFIED');
      if (!verified && !errorCode) unverified++;

      // Update session — preserve actual egress IP/country, never modified
      db.prepare(`UPDATE traffic_loop_sessions
        SET status = ?, verified = ?, http_status = ?, error_code = ?, request_duration_ms = ?, finished_at = datetime('now')
        WHERE id = ?`)
        .run(finalStatus, verified ? 1 : 0, httpStatus, errorCode, dur, sid);

      // PIPELINE: TELEMETRY — includes country_match, never spoofed
      trafficLoop.pipeLog(campaignId, sid, requestId, trafficLoop.STAGE.TELEMETRY, 'OK',
        { verified, http_completed: httpStatus >= 200 && httpStatus < 400, country_match: countryAvailable, httpStatus, errorCode, duration_ms: dur });

      // Structured outcome logs
      if (finalStatus === 'COMPLETED') {
        verifiedCompleted++;
        trafficLoop.logOutcome(campaignId, sid, requestId, 'REQUEST_COMPLETED',
          { country, httpStatus, verified, country_match: countryAvailable, egress_ip: egress.ip, egress_country: geo.country, duration_ms: dur });
      } else if (finalStatus === 'UNVERIFIED') {
        trafficLoop.logOutcome(campaignId, sid, requestId, 'REQUEST_UNVERIFIED',
          { country, requested_country: country, actual_country: geo.country, httpStatus, verified: false, country_match: false, egress_ip: egress.ip, duration_ms: dur, error_code: errorCode, reason: 'egress_country_mismatch' });
      } else {
        trafficLoop.logOutcome(campaignId, sid, requestId, 'REQUEST_FAILED',
          { country, httpStatus, verified: false, country_match: countryAvailable, egress_ip: egress.ip, duration_ms: dur, error_code: errorCode });
      }

      // Check GA4 (honest observation)
      const ga4 = GA4Provider.status(campaignId);
      if (ga4.status === 'OK' && ga4.hits > 0) ga4Observed = ga4.hits;

      // Update allocation metrics in real-time — per-session values, never running totals
      const thisHttpOk = httpStatus >= 200 && httpStatus < 400;
      const thisFailed = !!errorCode;
      const thisUnverified = !verified && !errorCode;
      promoService.recordPromoResults(promo.user_id, {
        responsesReceived: 1,
        confirmedEligible: thisHttpOk ? 1 : 0,
        genuineVisits: verified ? 1 : 0,
        failedRequests: thisFailed ? 1 : 0,
        unverifiedEvents: thisUnverified ? 1 : 0,
        ga4Observed,
      });

      await wait(250); // Rate limit between requests
    }
  }

  // Update allocation dispatch count
  promoService.decrementAllocation(promo.user_id, dispatched);

  // Finalize batch
  const batch = db.prepare('SELECT id FROM promo_scheduler WHERE user_id = ? AND status = \'PENDING\' ORDER BY id DESC LIMIT 1')
    .get(promo.user_id);

  if (batch) {
    promoService.updateBatchStatus(batch.id, 'COMPLETED', {
      dispatched,
      eligible: httpCompleted, // HTTP 200 count (transport success, not verified)
      failed,
      nextDispatchAt: null,
    });
  }

  audit('system', promo.user_id, 'PROMO_BATCH_COMPLETED', 'promo_scheduler', campaignId,
    { after: { dispatched, started, http_completed: httpCompleted, verified_completed: verifiedCompleted, failed, unverified, ga4Observed } });

  console.log(`[promo-scheduler] batch done: user=${promo.user_id} dispatched=${dispatched} started=${started} http_completed=${httpCompleted} verified_completed=${verifiedCompleted} failed=${failed} unverified=${unverified}`);

  return { dispatched, started, http_completed: httpCompleted, verified_completed: verifiedCompleted, failed, unverified, ga4Observed };
}

// ============================================================
// SCHEDULER STATUS
// ============================================================

export function getSchedulerStatus() {
  return {
    running: schedulerRunning,
    intervalMs: config.promo.batchIntervalMs,
    batchSize: config.promo.batchSize,
  };
}
