// Wallet routes
import * as walletService from '../services/walletService.js';
import { PaymentProvider } from '../providers/paymentProvider.js';

export function walletRoutes(route) {
  route('GET', '/api/wallet', (ctx) => {
    const session = ctx.requireAuth();
    ctx.json(200, { ...walletService.getWallet(session.user_id), transactions: walletService.listTransactions(session.user_id), providers: PaymentProvider.providers() });
  });

  route('POST', '/api/wallet/topup', async (ctx) => {
    const session = ctx.requireAuth(); await ctx.withCsrf(session);
    const body = await ctx.readBody(1024);
    const providers = PaymentProvider.providers();
    const provider = body.provider || 'upi';
    if (!providers[provider]?.configured && provider !== 'test') throw ctx.httpError(409, 'Payment provider not configured');
    if (!body.paymentRef) throw ctx.httpError(400, 'paymentRef required');
    const credits = Number(body.credits);
    if (!Number.isFinite(credits) || credits <= 0) throw ctx.httpError(400, 'credits must be > 0');
    const w = walletService.topUpWallet(session.user_id, { amount: body.amount || 0, credits, paymentRef: body.paymentRef, provider });
    ctx.json(201, { ok: true, wallet: w });
  });

  route('POST', '/api/wallet/webhook', async (ctx) => {
    const body = await ctx.readBody(4096);
    if (body.signature !== 'dev-webhook-signature') throw ctx.httpError(401, 'Invalid webhook signature');
    if (!body.userId || !body.credits) throw ctx.httpError(400, 'userId and credits required');
    const w = walletService.topUpWallet(Number(body.userId), { amount: body.amount || 0, credits: Number(body.credits), paymentRef: body.paymentRef || 'webhook', provider: body.provider || 'unknown' });
    ctx.json(200, { ok: true, wallet: w });
  });
}
