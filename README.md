# Traffic Loop

Honest multi-country traffic probing platform with failure-point monitoring.

## Quick Start

```bash
cp .env.example .env   # configure secrets
npm install
npm run migrate         # create database tables
npm run dev             # start server on :3000
cd client && npm install && npm run dev  # start React client on :5173
npm test                # run tests
```

## Architecture

- **Server**: Node.js (ESM, `node:http`, `node:sqlite`, zero runtime deps)
- **Client**: React 19 + Vite + React Router
- **Database**: SQLite via `node:sqlite` (WAL mode, foreign keys)
- **Tests**: Node.js built-in test runner (`node --test`)

## Project Structure

```
traffic-loop/
├── server/
│   ├── server.js              # HTTP entry point
│   ├── routes/                 # Route handlers
│   ├── services/               # Business logic
│   ├── providers/              # External integrations
│   ├── config/                 # Configuration
│   ├── middleware/              # Auth, validation, rate limiting
│   └── database/               # Schema, migrations, connection
├── client/
│   └── src/                    # React app (pages + components)
├── tests/                      # Test suites
└── docs/                       # Documentation
```

## Key Concepts

### Failure-Point Pipeline
Every campaign action flows through a 10-stage diagnostic pipeline:
```
RECEIVED → VALIDATED → QUEUED → EGRESS_CHECK → CONNECTION →
TARGET_REQUEST → RESPONSE → TELEMETRY → ANALYTICS_OBSERVATION → FINALIZED
```
Each stage records timestamp, status, duration, error code, and retry count.

### Three-Station Isolation
ALPHA-01, BETA-02, GAMMA-03 operate independently. If one fails, others continue.

### Honest Analytics
GA4 data is tracked separately from campaign telemetry. Never fabricated.

### Automatic Recovery
Transient failures retry with exponential backoff (2s → 4s → 8s, max 3 attempts).
