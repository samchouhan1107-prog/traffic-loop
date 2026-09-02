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
  console.log('[db] migrations applied');
}

if (process.argv[1] && process.argv[1].endsWith('migrate.js')) { migrate(); process.exit(0); }
