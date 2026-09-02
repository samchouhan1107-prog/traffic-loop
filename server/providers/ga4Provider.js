// GA4 Provider — honest observation. Never fabricates visitors.
import { db } from '../database/connection.js';
import { config } from '../config/environment.js';

export const GA4Provider = Object.freeze({
  isConfigured() { return Boolean(config.ga4.measurementId && config.ga4.apiSecret); },
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
