import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './connection.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function migrate() {
  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  const v = db.prepare('SELECT MAX(version) v FROM schema_migrations').get().v ?? 0;
  if (v < 1) {
    const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
    if (!cols.includes('email_verify_token')) {
      db.exec("ALTER TABLE users ADD COLUMN email_verify_token TEXT");
    }
    db.prepare('INSERT INTO schema_migrations (version) VALUES (1)').run();
  }
  if (v < 2) {
    // Seed default streak reward tiers
    const existing = db.prepare('SELECT COUNT(*) c FROM streak_rewards').get().c;
    if (existing === 0) {
      const defaultRewards = [
        { day: 1, bonus: 10000, label: 'Promo allocation unlocked' },
        { day: 2, bonus: 5000, label: 'Additional allocation' },
        { day: 3, bonus: 5000, label: 'Additional allocation' },
        { day: 4, bonus: 7500, label: 'Bonus allocation' },
        { day: 5, bonus: 7500, label: 'Bonus allocation' },
        { day: 6, bonus: 10000, label: 'Major bonus allocation' },
        { day: 7, bonus: 15000, label: 'Weekly champion allocation' },
      ];
      const ins = db.prepare('INSERT INTO streak_rewards (day_number, bonus_allocation, label, active) VALUES (?, ?, ?, 1)');
      for (const r of defaultRewards) ins.run(r.day, r.bonus, r.label);
      console.log('[db] seeded default streak rewards');
    }
    db.prepare('INSERT INTO schema_migrations (version) VALUES (2)').run();
  }
  if (v < 3) {
    // Ensure traffic_loop_ga4_observations table exists (may already from schema.sql)
    db.exec(`CREATE TABLE IF NOT EXISTS traffic_loop_ga4_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      campaign_id TEXT NOT NULL REFERENCES traffic_loop_campaigns(id) ON DELETE CASCADE,
      observation_type TEXT NOT NULL DEFAULT 'realtime',
      events_sent INTEGER NOT NULL DEFAULT 0,
      events_observed INTEGER NOT NULL DEFAULT 0,
      observation_json TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING',
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`);
    db.exec('CREATE INDEX IF NOT EXISTS idx_tl_ga4_obs_campaign ON traffic_loop_ga4_observations(campaign_id)');
    db.prepare('INSERT INTO schema_migrations (version) VALUES (3)').run();
    console.log('[db] migration v3: ga4_observations table');
  }
  console.log('[db] migrations applied');
}

if (process.argv[1] && process.argv[1].endsWith('migrate.js')) { migrate(); process.exit(0); }
