import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config/environment.js';

mkdirSync(dirname(config.dbPath), { recursive: true });
export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function audit(actorType, actorId, action, entity, entityId, extra = {}) {
  db.prepare(`INSERT INTO audit_logs (actor_type, actor_id, action, entity, entity_id,
    before_json, after_json, reason, operator, ip) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    actorType, actorId ?? null, action, entity ?? null, entityId ?? null,
    extra.before ? JSON.stringify(extra.before) : null,
    extra.after ? JSON.stringify(extra.after) : null,
    extra.reason ?? null, extra.operator ?? null, extra.ip ?? null);
}
