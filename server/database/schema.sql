-- Traffic Loop — Database Schema (node:sqlite compatible)

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  google_id TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  email_verify_token TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  device_label TEXT,
  ip TEXT,
  user_agent TEXT,
  csrf_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS traffic_loop_campaigns (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  url TEXT NOT NULL,
  country_group TEXT NOT NULL,
  requested_countries TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL,
  sessions_per_country INTEGER NOT NULL,
  auto_roll INTEGER NOT NULL DEFAULT 0,
  auto_roll_next TEXT,
  auto_roll_retry_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING_EGRESS',
  egress_ip TEXT,
  egress_country TEXT,
  egress_source TEXT,
  started_at TEXT,
  finished_at TEXT,
  summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS traffic_loop_sessions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES traffic_loop_campaigns(id) ON DELETE CASCADE,
  country TEXT NOT NULL,
  station TEXT NOT NULL DEFAULT 'ALPHA-01',
  status TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  country_available INTEGER NOT NULL DEFAULT 0,
  egress_ip TEXT,
  egress_country TEXT,
  http_status INTEGER,
  request_duration_ms INTEGER,
  bytes_received INTEGER,
  failure_reason TEXT,
  error_code TEXT,
  started_at TEXT,
  finished_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS traffic_loop_pipeline_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL,
  session_id TEXT,
  request_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OK',
  duration_ms INTEGER,
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS traffic_loop_session_recovery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  attempt INTEGER NOT NULL DEFAULT 1,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  stage_failed TEXT,
  error_code TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  next_retry_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS traffic_loop_ga4_hits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL REFERENCES traffic_loop_campaigns(id) ON DELETE CASCADE,
  session_id TEXT,
  raw_json TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS traffic_loop_config (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS traffic_loop_wallets (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  balance REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS traffic_loop_wallet_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  credits REAL NOT NULL,
  kind TEXT NOT NULL,
  provider TEXT,
  status TEXT NOT NULL,
  payment_ref TEXT,
  confirmed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  operator TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- FREE PROMO SYSTEM
-- ============================================================

CREATE TABLE IF NOT EXISTS promo_allocations (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  total_allocation INTEGER NOT NULL DEFAULT 0,
  dispatched INTEGER NOT NULL DEFAULT 0,
  responses_received INTEGER NOT NULL DEFAULT 0,
  confirmed_eligible INTEGER NOT NULL DEFAULT 0,
  genuine_visits INTEGER NOT NULL DEFAULT 0,
  failed_requests INTEGER NOT NULL DEFAULT 0,
  unverified_events INTEGER NOT NULL DEFAULT 0,
  ga4_observed INTEGER NOT NULL DEFAULT 0,
  promo_campaign_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS login_streaks (
  user_id INTEGER PRIMARY KEY REFERENCES users(id),
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_login_date TEXT,
  total_bonus_allocation INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS streak_rewards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day_number INTEGER NOT NULL UNIQUE,
  bonus_allocation INTEGER NOT NULL DEFAULT 0,
  label TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS streak_claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  streak_day INTEGER NOT NULL,
  claimed_at TEXT NOT NULL DEFAULT (datetime('now')),
  allocation_added INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, streak_day)
);

CREATE TABLE IF NOT EXISTS promo_scheduler (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  campaign_id TEXT NOT NULL REFERENCES traffic_loop_campaigns(id) ON DELETE CASCADE,
  allocation_batch INTEGER NOT NULL DEFAULT 0,
  dispatched INTEGER NOT NULL DEFAULT 0,
  eligible INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING',
  paused_reason TEXT,
  next_dispatch_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS promo_url_health (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL,
  last_checked_at TEXT,
  is_healthy INTEGER NOT NULL DEFAULT 0,
  http_status INTEGER,
  error_message TEXT,
  UNIQUE(url)
);

CREATE INDEX IF NOT EXISTS idx_tl_campaigns_user ON traffic_loop_campaigns(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tl_sessions_campaign ON traffic_loop_sessions(campaign_id, country);
CREATE INDEX IF NOT EXISTS idx_tl_pipeline_campaign ON traffic_loop_pipeline_log(campaign_id, stage);
CREATE INDEX IF NOT EXISTS idx_tl_pipeline_session ON traffic_loop_pipeline_log(session_id);
CREATE INDEX IF NOT EXISTS idx_tl_recovery_session ON traffic_loop_session_recovery(session_id);
CREATE INDEX IF NOT EXISTS idx_tl_ga4_campaign ON traffic_loop_ga4_hits(campaign_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_promo_alloc_user ON promo_allocations(user_id);
CREATE INDEX IF NOT EXISTS idx_streak_user ON login_streaks(user_id);
CREATE INDEX IF NOT EXISTS idx_streak_claims_user ON streak_claims(user_id, streak_day);
CREATE INDEX IF NOT EXISTS idx_promo_scheduler_user ON promo_scheduler(user_id, status);
CREATE INDEX IF NOT EXISTS idx_promo_scheduler_campaign ON promo_scheduler(campaign_id);
