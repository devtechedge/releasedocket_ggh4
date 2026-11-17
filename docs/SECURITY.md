# Security & Tenant Isolation

## Multi-Tenant Enforcement
- Every business table (`clients`, `projects`, `delivery_batches`, `acceptance_criteria`, `evidence_items`, `receipt_versions`, `portal_tokens`, `audit_events`, `source_observations`) carries `workspace_id`.
- Every repository method requires `workspaceId` explicitly; PostgreSQL deployments also include RLS policies in `db/migrations/0001_init.sql`.

## Client Portal Hardening (`/portal/[token]`)
- Raw 256-bit tokens are returned once at publication; only `SHA-256(token)` is persisted in `portal_tokens.token_hash`.
- Optional 6-digit OTP verification enforces a 5-attempt lockout (`failed_attempts >= 5` -> HTTP `429`).
- `next.config.ts` sets `X-Robots-Tag: noindex, nofollow, noarchive` on `/portal/:path*`.
- `internalNotes` are excluded structurally from `CanonicalReceiptSnapshot` so internal agency remarks can never appear on client portals.

## Input & Webhook Safety
- All mutation endpoints verify same-origin `Origin` vs `Host` headers and validate payloads with `zod`.
- External manual evidence URLs pass SSRF validation (`https:`/`http:` only, blocking localhost, private IPv4/IPv6 ranges, and cloud metadata IPs).
- GitHub webhooks verify `X-Hub-Signature-256` with `timingSafeEqual` and deduplicate via `webhook_deliveries.delivery_id`.
- Stripe webhooks verify `Stripe-Signature` and deduplicate via `billing_events.stripe_event_id`.
