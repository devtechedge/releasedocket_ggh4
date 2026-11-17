# Operations & Deployment

## Production Checklist
1. Provision a PostgreSQL database (e.g., Neon or Cloud SQL) and set `DATABASE_URL`.
2. Set `NODE_ENV=production` and `APP_URL=https://your-domain`. Note: Demo seeding and billing simulation are automatically disabled when `NODE_ENV=production`.
3. Configure GitHub App env vars (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET`) if connecting live repositories.
4. Configure Stripe env vars (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`) for paid subscriptions.
5. Configure `GEMINI_API_KEY` (server-side only) for Gemini summary drafting, and optionally `RESEND_API_KEY` / `EMAIL_FROM` for transactional portal emails.
6. Run `npm run build` and start with `npm start` (port `3000`).

## Health Endpoint
`GET /api/health` verifies database connectivity and returns runtime status without leaking secret values.
