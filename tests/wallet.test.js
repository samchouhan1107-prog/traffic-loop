// Wallet tests
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = './server/database/test-wallet.sqlite';
process.env.AUTH_SECRET = 'test-secret-key-that-is-long-enough-32chars';
process.env.NODE_ENV = 'test';

const { db } = await import('../server/database/connection.js');
const { migrate } = await import('../server/database/migrate.js');
migrate();
const auth = await import('../server/middleware/auth.js');
const walletService = await import('../server/services/walletService.js');

describe('Wallet', () => {
  let userId;
  before(() => { const r = auth.register({ email: 'wallet-test@example.com', password: 'password1234' }); userId = r.userId; });
  after(() => { db.close(); try { require('node:fs').unlinkSync('./server/database/test-wallet.sqlite'); } catch {} });

  it('initial balance is 0', () => {
    const w = walletService.getWallet(userId);
    assert.equal(w.balance, 0);
  });

  it('topUpWallet adds credits', () => {
    const w = walletService.topUpWallet(userId, { amount: 10, credits: 100, paymentRef: 'test-tx-1', provider: 'test' });
    assert.equal(w.balance, 100);
  });

  it('topUpWallet accumulates', () => {
    const w = walletService.topUpWallet(userId, { amount: 5, credits: 50, paymentRef: 'test-tx-2', provider: 'test' });
    assert.equal(w.balance, 150);
  });

  it('listTransactions shows ledger', () => {
    const tx = walletService.listTransactions(userId);
    assert.ok(tx.length >= 2);
  });
});
