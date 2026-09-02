# Launch Checklist

## Pre-Launch
- [ ] `AUTH_SECRET` set to secure random value (>= 32 chars)
- [ ] `WORKER_HMAC_SECRET` set
- [ ] `NODE_ENV=production`
- [ ] Database migrated (`npm run migrate`)
- [ ] Client built (`cd client && npm run build`)
- [ ] GA4 configured (or marked NOT_CONFIGURED — honest status)
- [ ] Payment providers configured (or marked NOT CONFIGURED)

## Verification
- [ ] `GET /api/health` returns `{ status: "ok", database: "connected" }`
- [ ] Register a test user
- [ ] Create a campaign
- [ ] Campaign runs through full 10-stage pipeline
- [ ] Diagnostic endpoint returns complete pipeline data
- [ ] Live status shows real-time updates
- [ ] Push Pack reconciliation shows all sessions accounted for
- [ ] Stations show independent health
- [ ] Recovery logic retries transient failures

## Security
- [ ] HTTPS enforced via reverse proxy
- [ ] CSRF protection active on all mutation endpoints
- [ ] Rate limiting on sensitive endpoints
- [ ] No secrets in client code or logs
- [ ] Session expiry configured appropriately

## Monitoring
- [ ] Pipeline log captures all stages
- [ ] Error codes properly categorized
- [ ] GA4 status accurately reflects reality (NOT_CONFIGURED if no key)
- [ ] No fabricated analytics data
