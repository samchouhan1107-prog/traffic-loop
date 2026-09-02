// TelemetryService — pipeline stage telemetry for campaigns.
import { db } from '../database/connection.js';

export function getStageStats(campaignId) {
  const stages = db.prepare('SELECT stage, status, COUNT(*) as count, AVG(duration_ms) as avg_duration FROM traffic_loop_pipeline_log WHERE campaign_id = ? GROUP BY stage, status ORDER BY id').all(campaignId);
  return stages;
}

export function getErrorBreakdown(campaignId) {
  return db.prepare('SELECT error_code, COUNT(*) as count FROM traffic_loop_pipeline_log WHERE campaign_id = ? AND error_code IS NOT NULL GROUP BY error_code ORDER BY count DESC').all(campaignId);
}

export function getTimeline(campaignId) {
  return db.prepare('SELECT stage, status, duration_ms, error_code, created_at FROM traffic_loop_pipeline_log WHERE campaign_id = ? ORDER BY id ASC').all(campaignId);
}
