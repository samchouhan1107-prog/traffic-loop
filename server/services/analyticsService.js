// AnalyticsService — GA4 observation (honest, never fabricated).
import { GA4Provider } from '../providers/ga4Provider.js';

export function getCampaignAnalytics(campaignId) {
  return { ga4: GA4Provider.status(campaignId), hits: GA4Provider.listHits(campaignId) };
}

export function recordHit(campaignId, sessionId, data) {
  GA4Provider.recordHit(campaignId, sessionId, data);
  return { ok: true };
}
