// Auth tests
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';

// Set test environment
process.env.DB_PATH = './server/database/test-auth.sqlite';
process.env.AUTH_SECRET = 'test-secret-key-that-is-long-enough-32chars';
process.env.NODE_ENV = 'test';

const { db } = await import('../server/database/connection.js');
const { migrate } = await import('../server/database/migrate.js');
migrate();
const auth = await import('../server/middleware/auth.js');

describe('Auth', () => {
  after(() => { db.close(); for (const f of ['test-auth.sqlite', 'test-auth.sqlite-wal', 'test-auth.sqlite-shm']) { try { unlinkSync('./server/database/' + f); } catch {} } });

  it('register creates user', () => {
    const r = auth.register({ email: 'test@example.com', password: 'password1234' });
    assert.ok(r.userId);
    assert.ok(r.session.id);
    assert.ok(r.verifyToken);
  });

  it('duplicate email rejected', () => {
    assert.throws(() => auth.register({ email: 'test@example.com', password: 'password1234' }), /already exists/);
  });

  it('weak password rejected', () => {
    assert.throws(() => auth.register({ email: 'new@example.com', password: 'short' }), /10 characters/);
  });

  it('login works', () => {
    const r = auth.login({ email: 'test@example.com', password: 'password1234' });
    assert.ok(r.user);
    assert.ok(r.session.id);
    assert.equal(r.user.email, 'test@example.com');
  });

  it('wrong password rejected', () => {
    assert.throws(() => auth.login({ email: 'test@example.com', password: 'wrongpassword' }), /Invalid credentials/);
  });

  it('verify email works', () => {
    const reg = auth.register({ email: 'verify@example.com', password: 'password1234' });
    const r = auth.verifyEmail(reg.verifyToken);
    assert.ok(r.ok);
  });

  it('session retrieval works', () => {
    const reg = auth.register({ email: 'session@example.com', password: 'password1234' });
    const s = auth.getSession(reg.session.id);
    assert.ok(s);
    assert.equal(s.user_id, reg.userId);
  });
});
