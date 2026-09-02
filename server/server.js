// Traffic Loop — HTTP server (node:http, zero deps).
// Secure cookie sessions, CSRF, SSE realtime, all API routes.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join } from 'node:path';
import { db } from './database/connection.js';
import { migrate } from './database/migrate.js';
import { config } from './config/environment.js';
import { listGroups } from './config/countryGroups.js';
import * as auth from './middleware/auth.js';
import { authRoutes } from './routes/auth.routes.js';
import { campaignRoutes } from './routes/campaign.routes.js';
import { stationRoutes } from './routes/station.routes.js';
import { analyticsRoutes } from './routes/analytics.routes.js';
import { walletRoutes } from './routes/wallet.routes.js';
import { paymentRoutes } from './routes/payment.routes.js';
import { promoRoutes } from './routes/promo.routes.js';
import * as promoScheduler from './services/promoScheduler.js';

migrate();

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

// Health
route('GET', '/api/health', (ctx) => {
  let database = 'connected';
  try { db.prepare('SELECT 1').get(); } catch { database = 'error'; }
  ctx.json(200, { status: 'ok', environment: config.isProduction ? 'production' : 'development', database, timestamp: new Date().toISOString() });
});

// Groups (public)
route('GET', '/api/campaigns/groups', (ctx) => {
  ctx.json(200, { groups: listGroups() });
});

// Register all route modules
authRoutes(route);
campaignRoutes(route);
stationRoutes(route);
analyticsRoutes(route);
walletRoutes(route);
paymentRoutes(route);
promoRoutes(route);

// SSE events
const subscribers = new Map();
route('GET', '/api/events', (ctx) => {
  const session = ctx.requireAuth();
  ctx.res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  if (!subscribers.has(session.user_id)) subscribers.set(session.user_id, new Set());
  subscribers.get(session.user_id).add(ctx.res);
  ctx.res.write('event: hello\ndata: {"ok":true}\n\n');
  const keepAlive = setInterval(() => { try { ctx.res.write(': ka\n\n'); } catch {} }, 25_000);
  ctx.req.on('close', () => { clearInterval(keepAlive); subscribers.get(session.user_id)?.delete(ctx.res); });
});

export function notifyUser(userId, payload) {
  const set = subscribers.get(userId);
  if (!set) return;
  const line = `data: ${JSON.stringify(payload)}\n\n`;
  for (const res of set) { try { res.write(line); } catch { set.delete(res); } }
}

// Dispatcher
async function dispatch(req, res) {
  const url = new URL(req.url, config.baseUrl);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';

  // Build context
  const cookies = parseCookies(req);
  const sessionId = cookies.traffic_session;
  const session = auth.getSession(sessionId);
  const ctx = {
    req, res, params: {}, url,
    session,
    ip: (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress,
    json: (status, body) => { const s = JSON.stringify(body); res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(s); },
    readBody: (limit = 32_000) => new Promise((resolve, reject) => { let size = 0; const chunks = []; req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Payload too large'), { status: 413 })); req.destroy(); } else chunks.push(c); }); req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}); } catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); } }); req.on('error', reject); }),
    setCookie: (sid) => { res.setHeader('Set-Cookie', `traffic_session=${encodeURIComponent(sid)}; HttpOnly; SameSite=Lax; Path=/${config.isProduction ? '; Secure' : ''}; Max-Age=${config.sessionTtlHours * 3600}`); },
    clearCookie: () => { res.setHeader('Set-Cookie', 'traffic_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'); },
    requireAuth: () => { if (!session) throw Object.assign(new Error('Authentication required'), { status: 401 }); auth.touchSession(sessionId); return session; },
    withCsrf: (s) => { const token = req.headers['x-csrf-token']; if (!token || token !== s.csrf_token) throw Object.assign(new Error('CSRF check failed'), { status: 403 }); },
    httpError: (status, message) => Object.assign(new Error(message), { status }),
  };

  for (const r of routes) {
    if (r.method !== req.method) continue;
    const pat = new RegExp('^' + r.pattern.replace(/:[^/]+/g, '([^/]+)') + '$');
    const m = pathname.match(pat);
    if (m) {
      (r.pattern.match(/:[^/]+/g) || []).forEach((p, i) => { ctx.params[p.slice(1)] = decodeURIComponent(m[i + 1]); });
      try { await r.handler(ctx); } catch (e) { const status = e.status || 500; if (status >= 500) console.error('[api]', req.method, pathname, e); ctx.json(status, { error: e.message }); }
      return;
    }
  }

  // Static files
  if (req.method === 'GET') {
    const distDir = join(process.cwd(), 'client', 'dist');
    // Vite `base` prefix (e.g. "/traffic-loop/") — strip it so dist-relative
    // lookups resolve correctly.  The prefix lives in vite.config.js `base`.
    const basePrefix = '/traffic-loop';
    const distPath = pathname.startsWith(basePrefix)
      ? pathname.slice(basePrefix.length) || '/'
      : pathname;
    const candidates = [
      join(distDir, distPath === '/' ? '/index.html' : distPath),
      join(process.cwd(), pathname === '/' ? '/index.html' : pathname),
    ];
    for (const filePath of candidates) {
      if (existsSync(filePath) && extname(filePath)) {
        res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
        res.end(readFileSync(filePath));
        return;
      }
    }
    // SPA fallback — serve index.html for any unmatched route
    const spaIndex = join(distDir, 'index.html');
    if (existsSync(spaIndex)) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(readFileSync(spaIndex)); return; }
    const rootIndex = join(process.cwd(), 'index.html');
    if (existsSync(rootIndex)) { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(readFileSync(rootIndex)); return; }
    ctx.json(404, { error: 'Not found' });
    return;
  }
  ctx.json(404, { error: 'Not found' });
}

const server = createServer((req, res) => {
  dispatch(req, res).catch((e) => { console.error('[server]', e); try { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Internal error' })); } catch {} });
});

server.listen(config.port, () => {
  console.log(`🚦 Traffic Loop on http://localhost:${config.port}`);
  console.log(`   Database: ${config.dbPath}`);
  console.log(`   Promo Scheduler: starting...`);
  try {
    promoScheduler.startScheduler();
    console.log(`   Promo Scheduler: running (interval: ${config.promo.batchIntervalMs}ms)`);
  } catch (e) {
    console.error(`   Promo Scheduler: failed to start`, e.message);
  }
});
