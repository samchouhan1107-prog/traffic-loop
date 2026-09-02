# Deployment Guide

## Prerequisites
- Node.js >= 22.5.0
- SQLite (built-in via node:sqlite)
- No external runtime dependencies

## Environment Variables
Copy `.env.example` to `.env` and configure:

1. **AUTH_SECRET**: Long random string (>= 32 chars) for session signing
2. **WORKER_HMAC_SECRET**: Random string for worker HMAC
3. **DB_PATH**: SQLite database file path
4. **GA4_MEASUREMENT_ID** + **GA4_API_SECRET**: For Google Analytics 4 integration
5. **Payment providers**: UPI and/or PayPal credentials

## Production Checklist
1. Set `NODE_ENV=production`
2. Generate secure `AUTH_SECRET` and `WORKER_HMAC_SECRET`
3. Run `npm run migrate` to create database tables
4. Build client: `cd client && npm run build`
5. Start server: `npm start`
6. Configure reverse proxy (nginx/caddy) for HTTPS

## Docker (optional)
```dockerfile
FROM node:22-slim
WORKDIR /app
COPY package.json ./
RUN npm install --production
COPY . .
RUN cd client && npm install && npm run build
EXPOSE 3000
CMD ["node", "server/server.js"]
```
