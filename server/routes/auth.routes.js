// Auth routes
import * as auth from '../middleware/auth.js';
import { db } from '../database/connection.js';
import * as streakService from '../services/streakService.js';
import * as promoService from '../services/promoService.js';

export function authRoutes(route) {
  route('POST', '/api/auth/register', async (ctx) => {
    const body = await ctx.readBody();
    const result = auth.register(body, { ip: ctx.ip, userAgent: ctx.req.headers['user-agent'] });
    ctx.setCookie(result.session.id);
    ctx.json(201, { ok: true, user: { userId: result.userId }, verifyToken: result.verifyToken, csrfToken: result.session.csrf });
  });

  route('POST', '/api/auth/login', async (ctx) => {
    const body = await ctx.readBody();
    const result = auth.login(body, { ip: ctx.ip, userAgent: ctx.req.headers['user-agent'] });
    ctx.setCookie(result.session.id);
    ctx.json(200, { ok: true, user: result.user, csrfToken: result.session.csrf });
  });

  route('POST', '/api/auth/logout', async (ctx) => {
    const session = ctx.requireAuth();
    auth.logout(session.id, session.user_id);
    ctx.clearCookie();
    ctx.json(200, { ok: true });
  });

  route('POST', '/api/auth/verify-email', async (ctx) => {
    const body = await ctx.readBody();
    ctx.json(200, auth.verifyEmail(body.token));
  });

  route('POST', '/api/auth/resend-verification', async (ctx) => {
    const session = ctx.requireAuth();
    ctx.json(200, auth.resendVerification(session.user_id));
  });

  route('GET', '/api/auth/me', async (ctx) => {
    const session = ctx.requireAuth();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(session.user_id);
    if (!user) throw Object.assign(new Error('User not found'), { status: 401 });
    // Include streak and promo info with auth response
    let streak = null;
    let promo = null;
    try { streak = streakService.getStreakStatus(user.id); } catch {}
    try { promo = promoService.getPromoStatus(user.id); } catch {}
    ctx.json(200, { user: auth.publicUser(user), csrfToken: session.csrf_token, streak, promo });
  });

  route('GET', '/api/auth/devices', async (ctx) => {
    const session = ctx.requireAuth();
    ctx.json(200, { devices: auth.listSessions(session.user_id) });
  });

  route('DELETE', '/api/auth/devices/:id', async (ctx) => {
    const session = ctx.requireAuth();
    await ctx.withCsrf(session);
    auth.revokeSession(session.user_id, ctx.params.id);
    ctx.json(200, { ok: true });
  });
}
