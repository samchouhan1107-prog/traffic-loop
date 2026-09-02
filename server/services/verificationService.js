// VerificationService — email verification, campaign verification.
import { db, audit } from '../database/connection.js';
import { uid } from '../middleware/auth.js';
import { config } from '../config/environment.js';

export function generateVerifyToken(userId) {
  const token = uid('vfy_');
  db.prepare('UPDATE users SET email_verify_token = ? WHERE id = ?').run(token, userId);
  console.log(`[dev-mail] Verify: ${config.baseUrl}/#/verify-email?token=${token}`);
  return token;
}

export function verifyEmail(token) {
  if (!token) throw Object.assign(new Error('Token required'), { status: 400 });
  const user = db.prepare('SELECT * FROM users WHERE email_verify_token = ?').get(token);
  if (!user) throw Object.assign(new Error('Invalid or expired token'), { status: 400 });
  db.prepare('UPDATE users SET email_verified = 1, email_verify_token = NULL WHERE id = ?').run(user.id);
  audit('user', user.id, 'EMAIL_VERIFIED', 'users', String(user.id));
  return { ok: true };
}
