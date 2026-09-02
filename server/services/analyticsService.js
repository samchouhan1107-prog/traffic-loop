// AnalyticsService — GA4 observation (honest, never fabricated).
// Lifecycle: traffic_sent → HTTP_success → ga4_event_sent → ga4_observed
import { GA4Provider } from '../providers/ga4Provider.js';

/**
 * Get full campaign analytics — status, hits, observations.
 * Clearly distinguishes each stage of the pipeline.
 */
export function getCampaignAnalytics(campaignId) {
  return {
    ga4: GA4Provider.status(campaignId),
    hits: GA4Provider.listHits(campaignId),
    observations: GA4Provider.listObservations(campaignId),
    measurementProtocol: GA4Provider.isConfigured() ? 'CONFIGURED' : 'NOT_CONFIGURED',
    dataApi: GA4Provider.isDataApiConfigured() ? 'CONFIGURED' : 'NOT_CONFIGURED',
  };
}

/**
 * Record a GA4 Measurement Protocol hit (webhook or manual).
 */
export function recordHit(campaignId, sessionId, data) {
  GA4Provider.recordHit(campaignId, sessionId, data);
  return { ok: true };
}

/**
 * GA4 health check — verify credentials without fabricating data.
 */
export async function healthCheck() {
  return GA4Provider.healthCheck();
}

/**
 * Trigger GA4 observation for a campaign.
 * Queries the GA4 Data API for real-time events.
 * Returns the observation result — never fabricated.
 */
export async function observeCampaign(campaignId) {
  const observation = await GA4Provider.observeCampaign(campaignId);
  const record = {
    observationType: 'realtime',
    eventsSent: observation.events_found || 0,
    eventsObserved: observation.observed ? observation.events_found : 0,
    status: observation.status,
    error: observation.status === 'DATA_API_ERROR' ? observation.detail : null,
    ...observation,
  };
  GA4Provider.recordObservation(campaignId, record);
  return observation;
}

/**
 * List all GA4 observations for a campaign.
 */
export function getObservations(campaignId) {
  return GA4Provider.listObservations(campaignId);
}

/**
 * Send a GA4 Measurement Protocol event for a traffic probe.
 * Returns { sent, reason?, ga4Status }.
 */
export async function sendProbeEvent(campaignId, sessionId, params) {
  return GA4Provider.sendEvent(campaignId, sessionId, params);
}
