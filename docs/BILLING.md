# Billing & Entitlements

## Plan Tiers

| Tier | Price | Active Projects | Members | Monthly Receipts | Custom Portal Branding | Audit JSON Export |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| Solo | $99/mo | 2 | 1 | 10 | No | No |
| Studio | $249/mo | 8 | 5 | 50 | Yes | No |
| Agency | $499/mo | 25 | 15 | Unlimited | Yes | Yes |
| Partner | $999/mo | 75 | 40 | Unlimited | Yes | Yes (multi-pod) |

## Webhook-Driven State
- `workspaces.plan_tier` and `workspaces.subscription_status` are mutated only by verified Stripe webhooks (`/api/webhooks/stripe`) or the gated non-prod simulator when Stripe keys are disconnected.
- If a subscription transitions to `canceled` or `past_due`, write operations fall back to Solo caps while **historical receipt reads and retainer exports remain accessible**.

## Required Stripe Environment Variables
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_SOLO`, `STRIPE_PRICE_STUDIO`, `STRIPE_PRICE_AGENCY`, `STRIPE_PRICE_PARTNER`
