# API Reference

## Base URL
`http://localhost:3000`

## Authentication
- Register: `POST /api/auth/register` → `{ email, password }`
- Login: `POST /api/auth/login` → `{ email, password }`
- Logout: `POST /api/auth/logout`
- Current user: `GET /api/auth/me`
- CSRF: Token returned in login response, send via `X-CSRF-Token` header

## Campaigns
- `GET /api/campaigns/groups` — list country groups
- `POST /api/campaigns` — create campaign (requires auth + CSRF)
- `GET /api/campaigns` — list user campaigns
- `GET /api/campaigns/:id` — get campaign detail with sessions
- `GET /api/campaigns/:id/diagnostic` — full failure-point diagnostic
- `GET /api/campaigns/:id/live` — live status with current stage
- `GET /api/campaigns/:id/reconcile` — Push Pack session reconciliation
- `GET /api/campaigns/:id/pipeline` — pipeline log entries

## Stations
- `GET /api/stations` — list all station states
- `POST /api/stations/stop-all` — stop all running campaigns
- `POST /api/stations/:id/reset` — reset a station
- `POST /api/stations/:id/reset-independent` — independent station reset

## Wallet
- `GET /api/wallet` — balance + transactions
- `POST /api/wallet/topup` — add credits
- `POST /api/wallet/webhook` — provider webhook

## Analytics
- `GET /api/analytics/:campaignId` — GA4 observation status
- `POST /api/analytics/:campaignId/hit` — record GA4 hit

## Payment
- `GET /api/payments/status` — provider availability

## Health
- `GET /api/health` — server health check
