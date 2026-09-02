// CampaignService — campaign CRUD + lifecycle management.
import { randomUUID } from 'node:crypto';
import { db, audit } from '../database/connection.js';
import { resolveGroup } from '../config/countryGroups.js';
import { clampStr, validateUrl, clampInt } from '../middleware/validation.js';

export function createCampaign({ userId, url, groupId, countries, durationSeconds, sessionsPerCountry, autoRoll }) {
  if (!userId) throw Object.assign(new Error('userId required'), { status: 400 });
  const cleanUrl = validateUrl(url);
  const dur = clampInt(durationSeconds, 30, 1800);
  const spc = clampInt(sessionsPerCountry, 1, 10);
  const id = 'tlc_' + randomUUID().split('-')[0];
  db.prepare(`INSERT INTO traffic_loop_campaigns
    (id, user_id, url, country_group, requested_countries, duration_seconds, sessions_per_country, auto_roll, status)
    VALUES (?,?,?,?,?,?,?,?, 'PENDING_EGRESS')`)
    .run(id, userId, cleanUrl, groupId, JSON.stringify(countries), dur, spc, autoRoll ? 1 : 0);
  audit('user', userId, 'CAMPAIGN_CREATED', 'traffic_loop_campaigns', id, { after: { url: cleanUrl, groupId, countries, durationSeconds: dur, sessionsPerCountry: spc } });
  return id;
}

export function getCampaign(id, userId, isAdmin = false) {
  const c = db.prepare('SELECT * FROM traffic_loop_campaigns WHERE id = ?').get(id);
  if (!c) return null;
  if (!isAdmin && userId != null && c.user_id !== userId) return null;
  const sessions = db.prepare('SELECT * FROM traffic_loop_sessions WHERE campaign_id = ? ORDER BY created_at, id').all(id);
  return { ...c, requested_countries: JSON.parse(c.requested_countries || '[]'), summary: c.summary ? JSON.parse(c.summary) : null, sessions };
}

export function listCampaigns(userId, limit = 50) {
  return db.prepare('SELECT id, url, country_group, status, created_at, finished_at FROM traffic_loop_campaigns WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, limit);
}

export function canAutoRoll(userId) {
  const last = db.prepare('SELECT * FROM traffic_loop_campaigns WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId);
  if (!last) return { ok: true, reason: 'no previous campaign', retryCount: 0 };
  if (last.status !== 'COMPLETED' && last.status !== 'FAILED') return { ok: false, reason: `last campaign status=${last.status}`, retryCount: 0 };
  if (last.status === 'COMPLETED') {
    const verified = db.prepare('SELECT COUNT(*) c FROM traffic_loop_sessions WHERE campaign_id = ? AND verified = 1').get(last.id).c;
    if (verified === 0) return { ok: false, reason: 'previous campaign had no verified sessions', retryCount: 0 };
  }
  const retryCount = last.auto_roll_retry_count || 0;
  if (retryCount >= 3) return { ok: false, reason: 'auto-roll retry limit reached', retryCount };
  return { ok: true, reason: 'previous outcome valid', retryCount };
}
