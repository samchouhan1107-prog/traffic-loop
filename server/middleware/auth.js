// Auth middleware — session management, CSRF, password hashing.
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { db, audit } from '../database/connection.js';
import { config } from '../config/environment.js';
import * as streakService from '../services/streakService.js';

export const uid = (prefix = '') => prefix + randomBytes(16).toString('base64url');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}
function verifyPassword(password, stored) {
  const [, salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function register({ email, password, displayName }, req = {}) {
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw Object.assign(new Error('Valid email required'), { status: 400 });
  if (!password || password.length < 10)
    throw Object.assign(new Error('Password must be at least 10 characters'), { status: 400 });
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) throw Object.assign(new Error('Email already exists'), { status: 409 });
  const info = db.prepare('INSERT INTO users (email, password_hash, display_name) VALUES (?,?,?)')
    .run(email, hashPassword(password), displayName || email.split('@')[0]);
  const userId = Number(info.lastInsertRowid);
  const session = createSession(userId, req);
  const verifyToken = uid('vfy_');
  db.prepare('UPDATE users SET email_verify_token = ? WHERE id = ?').run(verifyToken, userId);
  audit('user', userId, 'REGISTER', 'users', String(userId), { after: { email } });
  // Record login streak for new user
  try { streakService.recordLogin(userId); } catch {}
  return { userId, session: { id: session.id, csrf: session.csrf_token }, verifyToken };
}

export function login({ email, password }, req = {}) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash))
    throw Object.assign(new Error('Invalid credentials'), { status: 401 });
  const session = createSession(user.id, req);
  audit('user', user.id, 'LOGIN', 'users', String(user.id));
  // Record login streak
  try { streakService.recordLogin(user.id); } catch {}
  return { user: publicUser(user), session: { id: session.id, csrf: session.csrf_token } };
}

export function logout(sessionId, userId) {
  db.prepare('UPDATE sessions SET revoked_at = datetime(\'now\') WHERE id = ?').run(sessionId);
  audit('user', userId, 'LOGOUT', 'sessions', sessionId);
}

export function getSession(sessionId) {
  if (!sessionId) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE id = ? AND revoked_at IS NULL').get(sessionId);
  if (!s) return null;
  if (new Date(s.expires_at) < new Date()) { db.prepare('UPDATE sessions SET revoked_at = datetime(\'now\') WHERE id = ?').run(sessionId); return null; }
  return s;
}

export function touchSession(sid) { db.prepare('UPDATE sessions SET last_seen_at = datetime(\'now\') WHERE id = ?').run(sid); }

export function createSession(userId, req = {}) {
  const sid = uid('sess_');
  const csrf = uid('csrf_');
  const expiresAt = new Date(Date.now() + config.sessionTtlHours * 3600_000).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, device_label, ip, user_agent, csrf_token, expires_at) VALUES (?,?,?,?,?,?,?)')
    .run(sid, userId, req.deviceLabel || null, req.ip || null, req.userAgent || null, csrf, expiresAt);
  return { id: sid, csrf_token: csrf };
}

export function verifyEmail(token) {
  if (!token) throw Object.assign(new Error('Token required'), { status: 400 });
  const user = db.prepare('SELECT * FROM users WHERE email_verify_token = ?').get(token);
  if (!user) throw Object.assign(new Error('Invalid or expired token'), { status: 400 });
  db.prepare('UPDATE users SET email_verified = 1, email_verify_token = NULL WHERE id = ?').run(user.id);
  audit('user', user.id, 'EMAIL_VERIFIED', 'users', String(user.id));
  return { ok: true };
}

export function resendVerification(userId) {
  const token = uid('vfy_');
  db.prepare('UPDATE users SET email_verify_token = ? WHERE id = ?').run(token, userId);
  console.log(`[dev-mail] Verify: ${config.baseUrl}/#/verify-email?token=${token}`);
  return { token };
}

export function listSessions(userId) {
  return db.prepare('SELECT id, device_label, ip, user_agent, created_at, last_seen_at, revoked_at FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 20').all(userId);
}

export function revokeSession(userId, sessionId) {
  db.prepare('UPDATE sessions SET revoked_at = datetime(\'now\') WHERE id = ? AND user_id = ?').run(sessionId, userId);
}

export function publicUser(user) {
  return { id: user.id, email: user.email, displayName: user.display_name, role: user.role, emailVerified: !!user.email_verified };
}

export function httpError(status, message) { return Object.assign(new Error(message), { status }); }
