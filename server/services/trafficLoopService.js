// trafficLoopService.js — campaign runner with failure-point pipeline logging,
// automatic recovery, station isolation, and Push Pack reconciliation.
import { randomUUID } from 'node:crypto';
import { setTimeout as wait } from 'node:timers/promises';
import { db, audit } from '../database/connection.js';
import { EgressProvider } from '../providers/egressProvider.js';
import { GA4Provider } from '../providers/ga4Provider.js';
import * as stations from './stationService.js';

// ============================================================
// CONSTANTS
// ============================================================

export const ERR = Object.freeze({
  DNS_FAILURE: 'DNS_FAILURE', CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',
  EGRESS_UNAVAILABLE: 'EGRESS_UNAVAILABLE', EGRESS_MISMATCH: 'EGRESS_MISMATCH',
  HTTP_4XX: 'HTTP_4XX', HTTP_5XX: 'HTTP_5XX', HTTP_3XX_REDIRECT_LOOP: 'HTTP_3XX_REDIRECT_LOOP',
  TLS_ERROR: 'TLS_ERROR', BROWSER_FAILURE: 'BROWSER_FAILURE',
  GA4_PENDING: 'GA4_PENDING', GA4_AUTH_FAILURE: 'GA4_AUTH_FAILURE',
  PAYMENT_PENDING: 'PAYMENT_PENDING', PAYMENT_FAILED: 'PAYMENT_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR', USER_CANCELLED: 'USER_CANCELLED',
});

export const STAGE = Object.freeze({
  // Request lifecycle (per-session):
  // REQUEST_RECEIVED → VALIDATED → EGRESS_CHECK → EGRESS_VERIFIED →
  // COUNTRY_MATCH → QUEUED → CONNECTION → TARGET_REQUEST → RESPONSE →
  // TELEMETRY → FINALIZED
  REQUEST_RECEIVED: 'REQUEST_RECEIVED',
  VALIDATED: 'VALIDATED',
  EGRESS_CHECK: 'EGRESS_CHECK',
  EGRESS_VERIFIED: 'EGRESS_VERIFIED',
  COUNTRY_MATCH: 'COUNTRY_MATCH',
  QUEUED: 'QUEUED',
  CONNECTION: 'CONNECTION',
  TARGET_REQUEST: 'TARGET_REQUEST',
  RESPONSE: 'RESPONSE',
  TELEMETRY: 'TELEMETRY',
  FINALIZED: 'FINALIZED',
  // Request outcome (structured log markers):
  REQUEST_COMPLETED: 'REQUEST_COMPLETED',
  REQUEST_UNVERIFIED: 'REQUEST_UNVERIFIED',
  REQUEST_FAILED: 'REQUEST_FAILED',
  ANALYTICS_OBSERVATION: 'ANALYTICS_OBSERVATION',
  RECOVERY_ATTEMPTED: 'RECOVERY_ATTEMPTED',
  RECOVERY_SUCCEEDED: 'RECOVERY_SUCCEEDED',
  RECOVERY_FAILED: 'RECOVERY_FAILED',
  // Legacy aliases (kept for backward compatibility):
  RECEIVED: 'RECEIVED',
  RECEIVED_ALIAS: 'RECEIVED',
  SESSION_STARTED: 'SESSION_STARTED',
  TELEMETRY_SAVED: 'TELEMETRY_SAVED',
  SESSION_FINALIZED: 'SESSION_FINALIZED',
  CAMPAIGN_COMPLETED: 'CAMPAIGN_COMPLETED',
  CAMPAIGN_FAILED: 'CAMPAIGN_FAILED',
  CAMPAIGN_CANCELLED: 'CAMPAIGN_CANCELLED',
  COMMAND_RECEIVED: 'COMMAND_RECEIVED',
  CAMPAIGN_CREATED: 'CAMPAIGN_CREATED',
  CONFIG_VALIDATED: 'CONFIG_VALIDATED',
  GROUP_RESOLVED: 'GROUP_RESOLVED',
  COUNTRIES_ASSIGNED: 'COUNTRIES_ASSIGNED',
  EGRESS_REQUESTED: 'EGRESS_REQUESTED',
  SESSION_STARTED_ALIAS: 'SESSION_STARTED',
});

const RECOVERY_MAX = 3;
const RECOVERY_BASE_DELAY_MS = 2000;
const RECOVERY_BACKOFF = 2;
const AUTO_ROLL_RETRY_LIMIT = 3;

// ============================================================
// PIPELINE LOGGING
// ============================================================

export function generateRequestId() { return 'req_' + randomUUID().split('-')[0] + '_' + Date.now().toString(36); }

function logStage(campaignId, stage, detail = {}, operator = null) {
  console.log(`[traffic-loop] ${campaignId} ${stage} ${JSON.stringify(detail)}`);
  audit('system', operator, stage, 'traffic_loop_campaigns', campaignId, { after: detail });
}

export function pipeLog(campaignId, sessionId, requestId, stage, status = 'OK', detail = {}) {
  const safe = {}; for (const k of Object.keys(detail)) safe[k] = detail[k];
  db.prepare(`INSERT INTO traffic_loop_pipeline_log
    (campaign_id, session_id, request_id, stage, status, duration_ms, error_code, error_message, retry_count, detail)
    VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(campaignId, sessionId || null, requestId, stage, status, detail.duration_ms ?? null, detail.error_code || null, detail.error || null, detail.retry_count ?? 0, JSON.stringify(safe));
  console.log(`[tl:${requestId}] ${campaignId} ${stage} ${status}`);
  audit('system', null, stage, 'traffic_loop_campaigns', campaignId, { after: { ...safe, sessionId, requestId } });
}

// Structured outcome logging — emits console markers like COUNTRY_MATCH PASS,
// REQUEST_COMPLETED, REQUEST_UNVERIFIED, REQUEST_FAILED alongside pipeline entries.
export function logOutcome(campaignId, sessionId, requestId, marker, detail = {}) {
  const line = `[traffic-loop] ${marker} ${campaignId} sid=${sessionId || '-'} req=${requestId} ${JSON.stringify(detail)}`;
  console.log(line);
  if (marker === 'COUNTRY_MATCH PASS' || marker === 'COUNTRY_MATCH FAIL') {
    pipeLog(campaignId, sessionId, requestId, STAGE.COUNTRY_MATCH,
      marker === 'COUNTRY_MATCH PASS' ? 'OK' : 'WARNING',
      { country_match: marker === 'COUNTRY_MATCH PASS', ...detail });
  } else if (marker === 'REQUEST_COMPLETED') {
    pipeLog(campaignId, sessionId, requestId, STAGE.REQUEST_COMPLETED, 'OK', detail);
    pipeLog(campaignId, sessionId, requestId, STAGE.FINALIZED, 'OK', detail);
  } else if (marker === 'REQUEST_UNVERIFIED') {
    pipeLog(campaignId, sessionId, requestId, STAGE.REQUEST_UNVERIFIED, 'WARNING', detail);
    pipeLog(campaignId, sessionId, requestId, STAGE.FINALIZED, 'WARNING', detail);
  } else if (marker === 'REQUEST_FAILED') {
    pipeLog(campaignId, sessionId, requestId, STAGE.REQUEST_FAILED, 'FAILED', detail);
    pipeLog(campaignId, sessionId, requestId, STAGE.FINALIZED, 'FAILED', detail);
  } else {
    pipeLog(campaignId, sessionId, requestId, 'LIFECYCLE', 'OK', { marker, ...detail });
  }
}

// ============================================================
// RECOVERY
// ============================================================

function canRecover(sessionId) {
  const row = db.prepare('SELECT COUNT(*) c FROM traffic_loop_session_recovery WHERE session_id = ? AND status IN (\'PENDING\',\'ACTIVE\')').get(sessionId);
  return row.c < RECOVERY_MAX;
}
function recordRecovery(sessionId, campaignId, stageFailed, errorCode, attempt) {
  const delaySec = (RECOVERY_BASE_DELAY_MS * Math.pow(RECOVERY_BACKOFF, attempt - 1)) / 1000;
  db.prepare(`INSERT INTO traffic_loop_session_recovery (session_id, campaign_id, attempt, max_attempts, stage_failed, error_code, status, next_retry_at) VALUES (?,?,?,?,?,?, \'PENDING\', datetime(\'now\', \'+' || ? || \' seconds\'))`).run(sessionId, campaignId, attempt, RECOVERY_MAX, stageFailed, errorCode, String(delaySec));
}
function markRecovered(sessionId) { db.prepare('UPDATE traffic_loop_session_recovery SET status = \'RESOLVED\', resolved_at = datetime(\'now\') WHERE session_id = ? AND status IN (\'PENDING\',\'ACTIVE\')').run(sessionId); }
function markRecoveryFailed(sessionId) { db.prepare('UPDATE traffic_loop_session_recovery SET status = \'FAILED\', resolved_at = datetime(\'now\') WHERE session_id = ? AND status IN (\'PENDING\',\'ACTIVE\')').run(sessionId); }

// ============================================================
// JOB REGISTRY
// ============================================================

const jobs = new Map();
export function listJobs() { return Array.from(jobs.entries()).map(([id, j]) => ({ campaignId: id, status: j.status })); }
export function cancelAll() {
  for (const [, j] of jobs) try { j.controller.abort('STOP_ALL'); } catch {}
  stations.stopAllStations();
  return { ok: true, cancelled: jobs.size };
}
export function cancelCampaign(campaignId) {
  const j = jobs.get(campaignId);
  if (!j) return { ok: false, reason: 'not running' };
  try { j.controller.abort('USER_CANCELLED'); } catch {}
  return { ok: true };
}

export function startCampaignJob(campaignId, operator = 'system') {
  if (jobs.has(campaignId)) return { ok: false, reason: 'already running' };
  const controller = new AbortController();
  const handle = { controller, status: 'RUNNING' };
  jobs.set(campaignId, handle);
  runCampaign(campaignId, operator, controller.signal)
    .catch((e) => {
      console.error('[traffic-loop] job crashed', campaignId, e);
      try {
        db.prepare('UPDATE traffic_loop_campaigns SET status=\'FAILED\', summary=? WHERE id=?')
          .run(JSON.stringify({ error: String(e.message || e), code: 'INTERNAL_ERROR' }), campaignId);
        logStage(campaignId, STAGE.CAMPAIGN_FAILED, { error: String(e.message || e) }, operator);
      } catch {}
    })
    .finally(() => { jobs.delete(campaignId); });
  return { ok: true, campaignId };
}

// ============================================================
// CORE RUNNER
// ============================================================

async function runCampaign(campaignId, operator, signal) {
  const c = db.prepare('SELECT * FROM traffic_loop_campaigns WHERE id = ?').get(campaignId);
  if (!c) throw new Error('Campaign not found');

  const requestId = generateRequestId();

  // PIPELINE: REQUEST_RECEIVED
  pipeLog(campaignId, null, requestId, STAGE.REQUEST_RECEIVED, 'OK', { url: c.url, userId: c.user_id });
  logStage(campaignId, STAGE.REQUEST_RECEIVED, { url: c.url, groupId: c.country_group, userId: c.user_id }, operator);
  console.log(`[traffic-loop] REQUEST_RECEIVED ${campaignId} req=${requestId} url=${c.url}`);

  const requested = JSON.parse(c.requested_countries || '[]');
  logStage(campaignId, STAGE.GROUP_RESOLVED, { groupId: c.country_group, countries: requested }, operator);

  // PIPELINE: VALIDATED
  pipeLog(campaignId, null, requestId, STAGE.VALIDATED, 'OK', { durationSeconds: c.duration_seconds, sessionsPerCountry: c.sessions_per_country, autoRoll: !!c.auto_roll, countries: requested });

  // PIPELINE: EGRESS_CHECK (initiated — detection in progress, no result yet)
  pipeLog(campaignId, null, requestId, STAGE.EGRESS_CHECK, 'INITIATED', { url: c.url });
  const egress = await EgressProvider.detect();
  const geo = await EgressProvider.geo(egress.ip);

  // PIPELINE: EGRESS_VERIFIED (actual result — IP/country never modified to satisfy campaign)
  pipeLog(campaignId, null, requestId, STAGE.EGRESS_VERIFIED, geo.country ? 'OK' : 'FAILED',
    { ip: egress.ip, country: geo.country, countryName: geo.countryName, source: geo.source, error: geo.error });
  logStage(campaignId, STAGE.EGRESS_VERIFIED, { ip: egress.ip, country: geo.country, countryName: geo.countryName, source: geo.source }, operator);

  db.prepare('UPDATE traffic_loop_campaigns SET status=\'RUNNING\', started_at=datetime(\'now\'), egress_ip=?, egress_country=?, egress_source=? WHERE id=?')
    .run(egress.ip || null, geo.country || null, geo.source || null, campaignId);

  const sessionCount = c.sessions_per_country;
  const durationMs = c.duration_seconds * 1000;
  const start = Date.now();
  const STATION_IDS = stations.stationIds();
  const perCountry = {};
  let totalDispatched = 0, totalStarted = 0, totalVerifiedCompleted = 0, totalHttpCompleted = 0,
    totalFailed = 0, totalUnverified = 0, totalCancelled = 0;
  let durSum = 0, durN = 0;
  const statusCounts = {};
  const recoveries = new Map();

  for (const country of requested) {
    const countryAvailable = !!geo.country && geo.country === country;
    perCountry[country] = { requested: sessionCount, available: countryAvailable, dispatched: 0, started: 0, completed: 0, http_completed: 0, verified_completed: 0, failed: 0, unverified: 0, skipped: 0, cancelled: 0, avg_request_duration_ms: null, _sum: 0, _n: 0 };

    for (let i = 0; i < sessionCount; i++) {
      if (signal.aborted) {
        logStage(campaignId, STAGE.CAMPAIGN_CANCELLED, { reason: signal.reason || 'aborted' }, operator);
        db.prepare('UPDATE traffic_loop_campaigns SET status=\'CANCELLED\', finished_at=datetime(\'now\') WHERE id=?').run(campaignId);
        return;
      }
      if (Date.now() - start > durationMs) {
        totalDispatched++;
        const sid = 'tls_' + randomUUID().split('-')[0];
        db.prepare('INSERT INTO traffic_loop_sessions (id, campaign_id, country, station, status, verified, egress_ip, egress_country, country_available, error_code) VALUES (?,?,?,?, \'CANCELLED\', 0, ?, ?, ?, ?)').run(sid, campaignId, country, STATION_IDS[0], egress.ip || null, geo.country || null, countryAvailable ? 1 : 0, ERR.INTERNAL_ERROR);
        pipeLog(campaignId, sid, requestId, STAGE.FINALIZED, 'WARNING', { status: 'CANCELLED', reason: 'duration budget exhausted' });
        totalCancelled++; perCountry[country].cancelled++; perCountry[country].skipped++;
        continue;
      }

      const stationId = STATION_IDS[i % STATION_IDS.length];
      const st = stations.getStation(stationId);
      if (st.circuitOpenUntil > Date.now()) {
        totalDispatched++;
        const sid = 'tls_' + randomUUID().split('-')[0];
        db.prepare('INSERT INTO traffic_loop_sessions (id, campaign_id, country, station, status, verified, egress_ip, egress_country, country_available, error_code, failure_reason) VALUES (?,?,?,?, \'SKIPPED\', 0, ?, ?, ?, ?, ?)').run(sid, campaignId, country, stationId, egress.ip || null, geo.country || null, countryAvailable ? 1 : 0, ERR.EGRESS_UNAVAILABLE, 'station circuit open');
        pipeLog(campaignId, sid, requestId, STAGE.QUEUED, 'WARNING', { country, station: stationId, reason: 'circuit open' });
        continue;
      }

      st.state = 'RUNNING';
      if (!st.startedAt) st.startedAt = new Date().toISOString();

      totalDispatched++;
      const sid = 'tls_' + randomUUID().split('-')[0];
      db.prepare('INSERT INTO traffic_loop_sessions (id, campaign_id, country, station, status, verified, egress_ip, egress_country, country_available, started_at, error_code) VALUES (?,?,?,?, \'STARTED\', 0, ?, ?, ?, datetime(\'now\'), ?)').run(sid, campaignId, country, stationId, egress.ip || null, geo.country || null, countryAvailable ? 1 : 0, countryAvailable ? null : ERR.EGRESS_MISMATCH);

      // PIPELINE: COUNTRY_MATCH — strict verification, actual egress never spoofed
      if (countryAvailable) {
        logOutcome(campaignId, sid, requestId, 'COUNTRY_MATCH PASS', { requested_country: country, actual_country: geo.country, egress_ip: egress.ip, country_match: true });
      } else {
        logOutcome(campaignId, sid, requestId, 'COUNTRY_MATCH FAIL', { requested_country: country, actual_country: geo.country, egress_ip: egress.ip, country_match: false });
      }

      pipeLog(campaignId, sid, requestId, STAGE.QUEUED, 'OK', { country, station: stationId, queuePosition: i });
      pipeLog(campaignId, sid, requestId, STAGE.CONNECTION, 'OK', { station: stationId, country, countryAvailable });
      totalStarted++; perCountry[country].started++; perCountry[country].dispatched++;

      // THE REAL PROBE
      const t0 = Date.now();
      let httpStatus = null, errorCode = null, errMsg = null, verified = false, bytes = 0;
      try {
        const controller = new AbortController();
        const to = setTimeout(() => controller.abort(), 15_000);
        const onAbort = () => controller.abort(signal.reason || 'parent_aborted');
        signal.addEventListener('abort', onAbort, { once: true });
        pipeLog(campaignId, sid, requestId, STAGE.TARGET_REQUEST, 'OK', { url: c.url });
        try {
          const res = await fetch(c.url, { method: 'GET', redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': 'TrafficLoop/1.0', 'X-TL-Session': sid, 'X-TL-Country': country, 'X-TL-Station': stationId } });
          httpStatus = res.status;
          const reader = res.body?.getReader?.();
          if (reader) {
            const first = await reader.read();
            if (first.value) bytes += first.value.length;
            let total = bytes;
            while (!first.done) { const n = await reader.read(); if (n.value) { total += n.value.length; if (total > 1024 * 1024) break; } if (n.done) break; }
            bytes = total;
          } else { const txt = await res.text().catch(() => ''); bytes = txt.length; }
          pipeLog(campaignId, sid, requestId, STAGE.RESPONSE, httpStatus >= 200 && httpStatus < 400 ? 'OK' : 'FAILED', { httpStatus, bytes, duration_ms: Date.now() - t0 });
        } finally { clearTimeout(to); signal.removeEventListener('abort', onAbort); }
      } catch (e) {
        errMsg = String(e.message || e);
        if (/abort/i.test(errMsg) && signal.aborted) errorCode = ERR.USER_CANCELLED;
        else if (/abort/i.test(errMsg)) errorCode = ERR.CONNECTION_TIMEOUT;
        else if (/getaddrinfo|ENOTFOUND/i.test(errMsg)) errorCode = ERR.DNS_FAILURE;
        else if (/tls|certificate/i.test(errMsg)) errorCode = ERR.TLS_ERROR;
        else errorCode = ERR.INTERNAL_ERROR;
        pipeLog(campaignId, sid, requestId, STAGE.TARGET_REQUEST, 'FAILED', { error: errMsg, error_code: errorCode });
        pipeLog(campaignId, sid, requestId, STAGE.RESPONSE, 'FAILED', { error_code: errorCode });
      }

      const dur = Date.now() - t0;
      durSum += dur; durN++; perCountry[country]._sum = (perCountry[country]._sum || 0) + dur; perCountry[country]._n = (perCountry[country]._n || 0) + 1;

      if (!errMsg) {
        if (httpStatus >= 200 && httpStatus < 400) {
          totalHttpCompleted++; perCountry[country].http_completed++;
          if (countryAvailable) { verified = true; }
          else { errorCode = ERR.EGRESS_MISMATCH; }
        }
        else if (httpStatus >= 400 && httpStatus < 500) { errorCode = ERR.HTTP_4XX; }
        else if (httpStatus >= 500) { errorCode = ERR.HTTP_5XX; }
        else { errorCode = ERR.INTERNAL_ERROR; }
      }

      let finalStatus = errMsg ? 'FAILED' : (verified ? 'COMPLETED' : 'UNVERIFIED');

      // RECOVERY for recoverable failures
      if (finalStatus === 'FAILED' && canRecover(sid) && signal.aborted === false) {
        const recoverable = [ERR.EGRESS_MISMATCH, ERR.CONNECTION_TIMEOUT, ERR.HTTP_5XX].includes(errorCode);
        if (recoverable) {
          const attempt = (recoveries.get(sid) || 0) + 1;
          recoveries.set(sid, attempt);
          recordRecovery(sid, campaignId, STAGE.TARGET_REQUEST, errorCode, attempt);
          pipeLog(campaignId, sid, requestId, STAGE.RECOVERY_ATTEMPTED, 'OK', { attempt, error_code: errorCode });
          await wait(RECOVERY_BASE_DELAY_MS * Math.pow(RECOVERY_BACKOFF, attempt - 1));
          try {
            const ctrl2 = new AbortController(); const to2 = setTimeout(() => ctrl2.abort(), 15_000);
            const res2 = await fetch(c.url, { method: 'GET', redirect: 'follow', signal: ctrl2.signal, headers: { 'User-Agent': 'TrafficLoop/1.0', 'X-TL-Session': sid, 'X-TL-Country': country, 'X-TL-Station': stationId } });
            clearTimeout(to2);
            if (res2.status >= 200 && res2.status < 400 && countryAvailable) { verified = true; finalStatus = 'COMPLETED'; markRecovered(sid); pipeLog(campaignId, sid, requestId, STAGE.RECOVERY_SUCCEEDED, 'OK', { attempt, httpStatus: res2.status }); }
            else { pipeLog(campaignId, sid, requestId, STAGE.RECOVERY_FAILED, 'FAILED', { attempt, httpStatus: res2.status }); if (!canRecover(sid)) markRecoveryFailed(sid); }
          } catch (re) { pipeLog(campaignId, sid, requestId, STAGE.RECOVERY_FAILED, 'FAILED', { attempt, error: String(re.message) }); if (!canRecover(sid)) markRecoveryFailed(sid); }
        }
      }

      db.prepare('UPDATE traffic_loop_sessions SET status=?, verified=?, http_status=?, request_duration_ms=?, bytes_received=?, error_code=?, failure_reason=?, finished_at=datetime(\'now\') WHERE id=?')
        .run(finalStatus, verified ? 1 : 0, httpStatus, dur, bytes, errorCode, errMsg, sid);

      pipeLog(campaignId, sid, requestId, STAGE.TELEMETRY, 'OK',
        { verified, http_completed: !errMsg && httpStatus >= 200 && httpStatus < 400, country_match: countryAvailable, httpStatus, errorCode, bytes, duration_ms: dur });

      // Structured outcome logging — each path emits a unique terminal marker
      // HTTP 200 alone is transport success, NOT a verified completion
      if (finalStatus === 'COMPLETED') {
        logOutcome(campaignId, sid, requestId, 'REQUEST_COMPLETED',
          { country, httpStatus, verified, country_match: countryAvailable, egress_ip: egress.ip, egress_country: geo.country, duration_ms: dur });
      } else if (finalStatus === 'UNVERIFIED') {
        logOutcome(campaignId, sid, requestId, 'REQUEST_UNVERIFIED',
          { country, requested_country: country, actual_country: geo.country, httpStatus, verified: false, country_match: false, egress_ip: egress.ip, duration_ms: dur, error_code: errorCode, reason: 'egress_country_mismatch' });
      } else {
        logOutcome(campaignId, sid, requestId, 'REQUEST_FAILED',
          { country, httpStatus, verified: false, country_match: countryAvailable, egress_ip: egress.ip, duration_ms: dur, error_code: errorCode, error: errMsg });
      }

      // Station circuit breaker
      if (verified) { st.sessionsRun++; st.consecutiveFailures = 0; st.lastVerifiedAt = new Date().toISOString(); st.state = 'IDLE'; }
      else { st.sessionsFailed++; st.consecutiveFailures++; st.lastError = errorCode || errMsg || 'unknown'; st.state = st.consecutiveFailures >= 5 ? 'CIRCUIT_OPEN' : 'IDLE'; if (st.consecutiveFailures >= 5) st.circuitOpenUntil = Date.now() + 60_000; }

      if (finalStatus === 'COMPLETED') totalVerifiedCompleted++;
      else if (finalStatus === 'FAILED') totalFailed++;
      else totalUnverified++;
      if (httpStatus != null) statusCounts[httpStatus] = (statusCounts[httpStatus] || 0) + 1;
      // per-country: maintain 'completed'/'failed'/'unverified' for backward compatibility
      perCountry[country][finalStatus === 'COMPLETED' ? 'completed' : finalStatus === 'FAILED' ? 'failed' : 'unverified']++;
      // per-country: new separated metrics — verified_completed is a copy of 'completed' for clarity
      if (finalStatus === 'COMPLETED') perCountry[country].verified_completed++;

      await wait(250);
    }
  }

  // Finalize per-country averages
  for (const cc of Object.keys(perCountry)) {
    if (perCountry[cc]._n) perCountry[cc].avg_request_duration_ms = Math.round(perCountry[cc]._sum / perCountry[cc]._n);
    delete perCountry[cc]._sum; delete perCountry[cc]._n;
  }

  // ANALYTICS_OBSERVATION
  const ga4 = GA4Provider.status(campaignId);
  pipeLog(campaignId, null, requestId, STAGE.ANALYTICS_OBSERVATION, ga4.status === 'OK' ? 'OK' : 'WARNING', { ga4Status: ga4.status, ga4Detail: ga4.detail });

  const summary = {
    requested: requested.length * sessionCount, dispatched: totalDispatched, started: totalStarted,
    http_completed: totalHttpCompleted, verified_completed: totalVerifiedCompleted,
    completed: totalVerifiedCompleted, // backward-compatible alias for verified_completed
    failed: totalFailed, unverified: totalUnverified, cancelled: totalCancelled,
    recovered: Array.from(recoveries.values()).filter(a => a > 0).length,
    success_rate: totalDispatched ? totalVerifiedCompleted / totalDispatched : 0,
    failure_rate: totalStarted ? totalFailed / totalStarted : 0,
    actual_egress_ip: egress.ip, actual_egress_country: geo.country,
    avg_request_duration_ms: durN ? Math.round(durSum / durN) : null, http_status_counts: statusCounts, per_country: perCountry,
  };

  db.prepare('UPDATE traffic_loop_campaigns SET status=\'COMPLETED\', finished_at=datetime(\'now\'), summary=? WHERE id=?').run(JSON.stringify(summary), campaignId);
  console.log(`[traffic-loop] CAMPAIGN_COMPLETED ${campaignId} — processing cycle finished (NOT target achievement). dispatched=${summary.dispatched} verified_completed=${summary.verified_completed}`);
  logStage(campaignId, STAGE.CAMPAIGN_COMPLETED, { ...summary, cycle_finished: true, target_achieved: totalVerifiedCompleted >= (requested.length * sessionCount) }, operator);
  pipeLog(campaignId, null, requestId, STAGE.CAMPAIGN_COMPLETED, 'OK',
    { dispatched: summary.dispatched, started: summary.started, http_completed: summary.http_completed, verified_completed: totalVerifiedCompleted, failed: totalFailed, unverified: totalUnverified, cancelled: totalCancelled, recovered: summary.recovered, requestId, cycle_finished: true });

  // AUTO-ROLL — only if NO verified completed sessions (country/target never matched)
  const autoRollEnabled = c.auto_roll;
  if (autoRollEnabled && totalVerifiedCompleted === 0) {
    const retryCount = (c.auto_roll_retry_count || 0) + 1;
    db.prepare('UPDATE traffic_loop_campaigns SET auto_roll_retry_count=? WHERE id=?').run(retryCount, campaignId);
    if (retryCount < AUTO_ROLL_RETRY_LIMIT) {
      const newId = 'tlc_' + randomUUID().split('-')[0];
      db.prepare('INSERT INTO traffic_loop_campaigns (id, user_id, url, country_group, requested_countries, duration_seconds, sessions_per_country, auto_roll, auto_roll_retry_count, status) VALUES (?,?,?,?,?,?,?,?,?, \'PENDING_EGRESS\')').run(newId, c.user_id, c.url, c.country_group, c.requested_countries, c.duration_seconds, c.sessions_per_country, 1, retryCount);
      logStage(newId, STAGE.CAMPAIGN_CREATED, { autoRollFrom: campaignId, retryCount }, `auto-roll:${c.user_id}`);
      startCampaignJob(newId, `auto-roll:${c.user_id}`);
    }
  }
  return summary;
}

// ============================================================
// DIAGNOSTICS
// ============================================================

export function getCampaignDiagnostic(campaignId) {
  const c = db.prepare('SELECT * FROM traffic_loop_campaigns WHERE id = ?').get(campaignId);
  if (!c) return null;
  const sessions = db.prepare('SELECT * FROM traffic_loop_sessions WHERE campaign_id = ? ORDER BY created_at, id').all(campaignId);
  const pipeline = db.prepare('SELECT * FROM traffic_loop_pipeline_log WHERE campaign_id = ? ORDER BY id ASC').all(campaignId);
  const recoveries = db.prepare('SELECT * FROM traffic_loop_session_recovery WHERE campaign_id = ? ORDER BY id ASC').all(campaignId);

  const stageTree = ['REQUEST_RECEIVED', 'VALIDATED', 'EGRESS_CHECK', 'EGRESS_VERIFIED', 'COUNTRY_MATCH', 'QUEUED', 'CONNECTION', 'TARGET_REQUEST', 'RESPONSE', 'TELEMETRY', 'REQUEST_COMPLETED', 'REQUEST_UNVERIFIED', 'REQUEST_FAILED', 'FINALIZED', 'ANALYTICS_OBSERVATION'];
  const pipelineStages = {};
  for (const stage of stageTree) {
    const entries = pipeline.filter(p => p.stage === stage);
    const failures = entries.filter(p => p.status !== 'OK');
    pipelineStages[stage] = { status: failures.length === 0 ? (entries.length > 0 ? 'OK' : 'PENDING') : 'FAILED', total: entries.length, failures: failures.length, lastError: failures.length > 0 ? failures[failures.length - 1].error_code : null };
  }

  const sessionDiagnostics = sessions.map(s => ({
    sessionId: s.id, station: s.station, country: s.country, status: s.status, verified: s.verified,
    httpStatus: s.http_status, errorCode: s.error_code, failureReason: s.failure_reason,
    durationMs: s.request_duration_ms, bytesReceived: s.bytes_received,
    pipeline: pipeline.filter(p => p.session_id === s.id).map(st => ({ stage: st.stage, status: st.status, durationMs: st.duration_ms, errorCode: st.error_code, errorMessage: st.error_message, retryCount: st.retry_count, createdAt: st.created_at })),
    recovery: recoveries.filter(r => r.session_id === s.id).map(r => ({ attempt: r.attempt, stageFailed: r.stage_failed, errorCode: r.error_code, status: r.status })),
  }));

  return {
    campaignId, url: c.url, status: c.status, createdAt: c.created_at, startedAt: c.started_at, finishedAt: c.finished_at,
    egressIp: c.egress_ip, egressCountry: c.egress_country, pipeline: pipelineStages,
    summary: { total: sessions.length, dispatched: sessions.filter(s => s.status !== 'SKIPPED').length, started: sessions.filter(s => s.status === 'STARTED' || s.status === 'COMPLETED' || s.status === 'FAILED' || s.status === 'UNVERIFIED').length, http_completed: sessions.filter(s => s.http_status >= 200 && s.http_status < 400).length, verified_completed: sessions.filter(s => s.status === 'COMPLETED').length, completed: sessions.filter(s => s.status === 'COMPLETED').length, failed: sessions.filter(s => s.status === 'FAILED').length, unverified: sessions.filter(s => s.status === 'UNVERIFIED').length, cancelled: sessions.filter(s => s.status === 'CANCELLED').length, recovered: recoveries.filter(r => r.status === 'RESOLVED').length, recoveryFailed: recoveries.filter(r => r.status === 'FAILED').length },
    stations: stations.listStations().map(s => ({ id: s.id, sessionsRun: s.sessionsRun, sessionsFailed: s.sessionsFailed, state: s.state })),
    ga4: GA4Provider.status(campaignId),
    sessions: sessionDiagnostics,
  };
}

export function getCampaignLiveStatus(campaignId) {
  const c = db.prepare('SELECT * FROM traffic_loop_campaigns WHERE id = ?').get(campaignId);
  if (!c) return null;
  const sessions = db.prepare('SELECT status, verified, http_status, station, error_code FROM traffic_loop_sessions WHERE campaign_id = ?').all(campaignId);
  const pipeline = db.prepare('SELECT stage, status, error_code, created_at FROM traffic_loop_pipeline_log WHERE campaign_id = ? ORDER BY id DESC LIMIT 50').all(campaignId);
  const sum = { total: sessions.length, dispatched: sessions.filter(s => s.status !== 'SKIPPED').length, started: sessions.filter(s => s.status !== 'SKIPPED' && s.status !== 'CANCELLED').length, http_completed: sessions.filter(s => s.http_status >= 200 && s.http_status < 400).length, verified_completed: sessions.filter(s => s.status === 'COMPLETED').length, completed: sessions.filter(s => s.status === 'COMPLETED').length, failed: sessions.filter(s => s.status === 'FAILED').length, unverified: sessions.filter(s => s.status === 'UNVERIFIED').length, cancelled: sessions.filter(s => s.status === 'CANCELLED').length, pending: sessions.filter(s => s.status === 'STARTED').length };
  const lastError = pipeline.find(p => p.status !== 'OK');
  return { campaignId, status: c.status, currentStage: pipeline[0]?.stage || null, lastError: lastError ? { stage: lastError.stage, code: lastError.error_code, at: lastError.created_at } : null, summary: sum, stations: stations.listStations(), ga4: GA4Provider.status(campaignId), elapsedMs: c.started_at ? Date.now() - new Date(c.started_at.endsWith('Z') ? c.started_at : c.started_at + 'Z').getTime() : null, durationMs: c.duration_seconds * 1000 };
}

export function reconcilePushPack(campaignId) {
  const c = db.prepare('SELECT * FROM traffic_loop_campaigns WHERE id = ?').get(campaignId);
  if (!c) return null;
  const sessions = db.prepare('SELECT status FROM traffic_loop_sessions WHERE campaign_id = ?').all(campaignId);
  const totalRequested = JSON.parse(c.requested_countries || '[]').length * c.sessions_per_country;
  const counts = { dispatched: sessions.filter(s => s.status !== 'SKIPPED').length, started: sessions.filter(s => s.status === 'STARTED').length, completed: sessions.filter(s => s.status === 'COMPLETED').length, failed: sessions.filter(s => s.status === 'FAILED').length, unverified: sessions.filter(s => s.status === 'UNVERIFIED').length, cancelled: sessions.filter(s => s.status === 'CANCELLED').length, total: sessions.length };
  const accounted = counts.started + counts.completed + counts.failed + counts.unverified + counts.cancelled;
  return { campaignId, requested: totalRequested, accounted, pending: Math.max(0, totalRequested - accounted), counts, reconciled: accounted === totalRequested };
}

export function getPipelineLog(campaignId, limit = 200) { return db.prepare('SELECT * FROM traffic_loop_pipeline_log WHERE campaign_id = ? ORDER BY id ASC LIMIT ?').all(campaignId, limit); }
export function getSessionPipelineLog(sessionId) { return db.prepare('SELECT * FROM traffic_loop_pipeline_log WHERE session_id = ? ORDER BY id ASC').all(sessionId); }
export function getRecoveryLog(campaignId) { return db.prepare('SELECT * FROM traffic_loop_session_recovery WHERE campaign_id = ? ORDER BY id ASC').all(campaignId); }
