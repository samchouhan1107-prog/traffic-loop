// GA4 Provider — honest observation. Never fabricates visitors.
// Lifecycle: traffic_sent → HTTP_success → ga4_event_sent → ga4_observed
import { db } from '../database/connection.js';
import { config } from '../config/environment.js';
import { ga4Auth } from './ga4Auth.js';

const MP_ENDPOINT = 'https://www.google-analytics.com/mp/collect';

export const GA4Provider = Object.freeze({
  // ──────────────────────────────────────────────────────────
  // CREDENTIAL CHECKS
  // ──────────────────────────────────────────────────────────

  /** Measurement Protocol configured (can SEND events) */
  isConfigured() {
    return Boolean(config.ga4.measurementId && config.ga4.apiSecret);
  },

  /** Data API configured (can QUERY observations) */
  isDataApiConfigured() {
    return ga4Auth.isConfigured();
  },

  // ──────────────────────────────────────────────────────────
  // HEALTH CHECK
  // ──────────────────────────────────────────────────────────

  async healthCheck() {
    const mpConfigured = this.isConfigured();
    const dataApiConfigured = this.isDataApiConfigured();
    const propertyId = config.ga4.propertyId || null;
    const measurementId = config.ga4.measurementId || null;
    const serviceAccountEmail = ga4Auth.getServiceAccountEmail?.() || null;

    const result = {
      measurementProtocol: mpConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED',
      dataApi: dataApiConfigured ? 'CONFIGURED' : 'NOT_CONFIGURED',
      measurementId,
      propertyId,
      serviceAccountEmail,
      overallStatus: 'NOT_CONFIGURED',
      errors: [],
    };

    if (!mpConfigured && !dataApiConfigured) {
      result.overallStatus = 'NOT_CONFIGURED';
      result.errors.push('Set GA4_MEASUREMENT_ID + GA4_API_SECRET for Measurement Protocol');
      result.errors.push('Set GA4_SA_KEY (JSON) + GA4_PROPERTY_ID for Data API');
      return result;
    }

    // Test Measurement Protocol with validation endpoint
    if (mpConfigured) {
      try {
        // Use the debug/validation endpoint
        const validateUrl = `https://www.google-analytics.com/debug/mp/collect?measurement_id=${config.ga4.measurementId}&api_secret=${config.ga4.apiSecret}`;
        const resp = await fetch(validateUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            client_id: 'health-check-' + Date.now(),
            events: [{ name: 'health_check', params: { test: true } }],
          }),
          signal: AbortSignal.timeout(10_000),
        });
        const body = await resp.json();
        if (resp.ok && (!body.validationMessages || body.validationMessages.length === 0)) {
          result.measurementProtocol = 'VALID';
        } else if (body.validationMessages?.length > 0) {
          result.measurementProtocol = 'CONFIGURED_WITH_WARNINGS';
          result.errors.push(`MP validation: ${body.validationMessages.map(m => m.description).join('; ')}`);
        } else {
          result.measurementProtocol = 'CONFIGURED';
        }
      } catch (e) {
        result.measurementProtocol = 'CONFIGURED_UNVERIFIED';
        result.errors.push(`MP health check failed: ${e.message}`);
      }
    }

    // Test Data API access
    if (dataApiConfigured) {
      try {
        const token = await ga4Auth.getAccessToken();
        const propId = config.ga4.propertyId;
        const resp = await fetch(
          `https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runRealtimeReport`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              metrics: [{ name: 'activeUsers' }],
              limit: 1,
            }),
            signal: AbortSignal.timeout(15_000),
          }
        );
        if (resp.ok) {
          result.dataApi = 'VALID';
        } else {
          const err = await resp.text();
          result.dataApi = 'CONFIGURED_ERROR';
          result.errors.push(`Data API test failed (${resp.status}): ${err.slice(0, 200)}`);
        }
      } catch (e) {
        result.dataApi = 'CONFIGURED_UNVERIFIED';
        result.errors.push(`Data API health check failed: ${e.message}`);
      }
    }

    if (result.measurementProtocol === 'VALID' || result.dataApi === 'VALID') {
      result.overallStatus = 'HEALTHY';
    } else if (mpConfigured || dataApiConfigured) {
      result.overallStatus = 'PARTIALLY_CONFIGURED';
    }

    return result;
  },

  // ──────────────────────────────────────────────────────────
  // MEASUREMENT PROTOCOL — send events to GA4
  // ──────────────────────────────────────────────────────────

  /**
   * Send a traffic_probe event to GA4 via Measurement Protocol.
   * Returns { sent: true/false, error?: string }.
   * NEVER fabricates — only sends if configured and request succeeds.
   */
  async sendEvent(campaignId, sessionId, params = {}) {
    if (!this.isConfigured()) {
      return { sent: false, reason: 'NOT_CONFIGURED', ga4Status: 'GA4_NOT_CONFIGURED' };
    }

    const clientId = `tl_${campaignId}_${sessionId || 'batch'}_${Date.now()}`;
    const eventPayload = {
      client_id: clientId,
      events: [{
        name: 'traffic_probe',
        params: {
          campaign_id: campaignId,
          session_id: sessionId || 'batch',
          country: params.country || 'unknown',
          http_status: params.httpStatus || 0,
          duration_ms: params.durationMs || 0,
          verified: params.verified ? 'true' : 'false',
          egress_country: params.egressCountry || 'unknown',
          engagement_time_msec: params.durationMs || 1,
          ...params,
        },
      }],
    };

    try {
      const url = `${MP_ENDPOINT}?measurement_id=${config.ga4.measurementId}&api_secret=${config.ga4.apiSecret}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(eventPayload),
        signal: AbortSignal.timeout(10_000),
      });

      const sent = resp.ok || resp.status === 204;
      if (!sent) {
        const body = await resp.text();
        return { sent: false, reason: `HTTP_${resp.status}`, error: body.slice(0, 200) };
      }

      return { sent: true, clientId, ga4Status: 'GA4_EVENT_SENT' };
    } catch (e) {
      return { sent: false, reason: 'NETWORK_ERROR', error: e.message };
    }
  },

  // ──────────────────────────────────────────────────────────
  // DATA API — query GA4 for real observations
  // ──────────────────────────────────────────────────────────

  /**
   * Query GA4 Data API for real-time observations matching our campaign.
   * Returns { observed: true/false, events_found: number, raw?: object }.
   * NEVER fabricates — only reports what the API returns.
   */
  async observeCampaign(campaignId) {
    if (!this.isDataApiConfigured()) {
      return {
        observed: false,
        status: 'DATA_API_NOT_CONFIGURED',
        detail: 'Set GA4_SA_KEY + GA4_PROPERTY_ID to enable Data API observations',
        events_found: 0,
      };
    }

    try {
      const token = await ga4Auth.getAccessToken();
      const propId = config.ga4.propertyId;

      // Query realtime report for our traffic_probe events
      const resp = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${propId}:runRealtimeReport`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            metrics: [
              { name: 'activeUsers' },
              { name: 'eventCount' },
            ],
            dimensions: [
              { name: 'eventName' },
            ],
            dimensionFilter: {
              filter: {
                fieldName: 'eventName',
                stringFilter: { matchType: 'EXACT', value: 'traffic_probe' },
              },
            },
            limit: 100,
          }),
          signal: AbortSignal.timeout(15_000),
        }
      );

      if (!resp.ok) {
        const err = await resp.text();
        return {
          observed: false,
          status: 'DATA_API_ERROR',
          detail: `HTTP ${resp.status}: ${err.slice(0, 300)}`,
          events_found: 0,
        };
      }

      const data = await resp.json();
      let totalEvents = 0;
      const rows = data.rows || [];
      for (const row of rows) {
        totalEvents += parseInt(row.metricValues?.[1]?.value || '0', 10);
      }

      return {
        observed: totalEvents > 0,
        status: totalEvents > 0 ? 'GA4_OBSERVED' : 'GA4_NO_OBSERVATIONS',
        detail: totalEvents > 0
          ? `${totalEvents} traffic_probe event(s) found in GA4 realtime`
          : 'No traffic_probe events found in GA4 realtime yet (may take 30-60s to appear)',
        events_found: totalEvents,
        raw: data,
      };
    } catch (e) {
      return {
        observed: false,
        status: 'DATA_API_ERROR',
        detail: e.message,
        events_found: 0,
      };
    }
  },

  // ──────────────────────────────────────────────────────────
  // OBSERVATION RECORDS — SQLite storage
  // ──────────────────────────────────────────────────────────

  recordObservation(campaignId, observation) {
    db.prepare(`INSERT INTO traffic_loop_ga4_observations
      (campaign_id, observation_type, events_sent, events_observed, observation_json, status, error_message)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(
        campaignId,
        observation.observationType || 'realtime',
        observation.eventsSent || 0,
        observation.eventsObserved || 0,
        JSON.stringify(observation),
        observation.status || 'PENDING',
        observation.error || null,
      );
  },

  listObservations(campaignId) {
    return db.prepare(
      'SELECT id, observation_type, events_sent, events_observed, observation_json, status, error_message, created_at FROM traffic_loop_ga4_observations WHERE campaign_id = ? ORDER BY id DESC LIMIT 50'
    ).all(campaignId);
  },

  // ──────────────────────────────────────────────────────────
  // EXISTING — status, listHits, recordHit (unchanged)
  // ──────────────────────────────────────────────────────────

  status(campaignId) {
    if (!this.isConfigured()) return { status: 'NOT_CONFIGURED', detail: 'GA4_MEASUREMENT_ID not set' };
    const hit = db.prepare('SELECT COUNT(*) c FROM traffic_loop_ga4_hits WHERE campaign_id = ?').get(campaignId).c;
    if (hit === 0) return { status: 'PENDING', detail: 'No GA4 hits received yet' };
    return { status: 'OK', detail: `${hit} GA4 hit(s) matched`, hits: hit };
  },

  listHits(campaignId) {
    return db.prepare('SELECT id, session_id, raw_json, received_at FROM traffic_loop_ga4_hits WHERE campaign_id = ? ORDER BY id DESC LIMIT 100').all(campaignId);
  },

  recordHit(campaignId, sessionId, rawData) {
    db.prepare('INSERT INTO traffic_loop_ga4_hits (campaign_id, session_id, raw_json) VALUES (?,?,?)').run(campaignId, sessionId || null, JSON.stringify(rawData));
  },
});
