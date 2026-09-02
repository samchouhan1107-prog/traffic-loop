# Architecture

## System Overview

Traffic Loop is a **Node.js monorepo** with a React frontend and a zero-dependency HTTP backend.

### Backend (`server/`)

**HTTP Server**: Built on `node:http` — no Express, no Fastify. The dispatcher matches routes by regex and builds a context object.

**Database**: SQLite via `node:sqlite` (synchronous API, WAL mode). Schema lives in `database/schema.sql`, applied by `database/migrate.js`.

**Authentication**: Session-based with CSRF tokens. Passwords hashed with scrypt. Sessions stored in SQLite with expiry.

**Campaign Lifecycle**:
1. User creates campaign → `PENDING_EGRESS`
2. Egress detection → `RUNNING`
3. Sessions run across stations → each traced through pipeline
4. Final summary written → `COMPLETED` or `FAILED`

### Frontend (`client/`)

React 19 + Vite SPA with React Router v7. Pages: Landing, Login, Signup, Dashboard, Campaigns, CreateCampaign, LiveCampaign, Analytics, Wallet, Reports, Settings.

### Pipeline Stages

```
RECEIVED → VALIDATED → QUEUED → EGRESS_CHECK → CONNECTION →
TARGET_REQUEST → RESPONSE → TELEMETRY → ANALYTICS_OBSERVATION → FINALIZED
```

Each stage writes to `traffic_loop_pipeline_log` with: campaign_id, session_id, request_id, stage, status, duration_ms, error_code, retry_count.

### Station Architecture

Three independent stations (ALPHA-01, BETA-02, GAMMA-03) with circuit breakers:
- 5 consecutive failures → circuit opens for 60 seconds
- Each station tracks: sessionsRun, sessionsFailed, consecutiveFailures
- Reset is independent per station
