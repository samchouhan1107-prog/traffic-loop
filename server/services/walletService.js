// WalletService — server-authoritative ledger for traffic-loop credits.
import { db, audit } from '../database/connection.js';

export function getWallet(userId) {
  const row = db.prepare('SELECT balance FROM traffic_loop_wallets WHERE user_id = ?').get(userId);
  return { balance: row ? Number(row.balance) : 0 };
}

export function listTransactions(userId, limit = 50) {
  return db.prepare('SELECT id, amount, credits, status, payment_ref, kind, created_at FROM traffic_loop_wallet_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit);
}

export function topUpWallet(userId, { amount, credits, paymentRef, provider, kind = 'TOPUP' }) {
  db.exec('BEGIN');
  try {
    db.prepare('INSERT INTO traffic_loop_wallet_ledger (user_id, amount, credits, status, payment_ref, provider, kind, confirmed_at) VALUES (?,?,?, \'CONFIRMED\', ?, ?, ?, datetime(\'now\'))').run(userId, amount, credits, paymentRef, provider, kind);
    db.prepare('INSERT INTO traffic_loop_wallets (user_id, balance) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET balance = balance + excluded.balance').run(userId, credits);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  audit('user', userId, 'WALLET_TOPUP', 'traffic_loop_wallet_ledger', paymentRef, { after: { amount, credits, provider } });
  return getWallet(userId);
}
