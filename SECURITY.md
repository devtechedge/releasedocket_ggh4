# Security

ReleaseDocket is a multi-tenant platform for agency delivery evidence and client acceptance. This file gives the security posture at a glance; the full review and production backlog live in [docs/SECURITY.md](./docs/SECURITY.md).

## Authentication and sessions

- Database-backed email/password auth with scrypt per-user salted hashes.
- Session tokens are stored as SHA-256 hashes; the raw token is carried in an HttpOnly, Secure, SameSite cookie with a 7-day expiry and server-side revocation.
- Cross-origin mutations are rejected via Origin/Host checks; login and OTP endpoints are rate limited.

## Authorization and tenancy

- Roles (`OWNER`, `ADMIN`, `DELIVERY_LEAD`, `CONTRIBUTOR`, `CLIENT_VIEWER`) are centralized in `domain/rbac.ts` and enforced in services, never in the UI.
- Every query is scoped by the tenant workspace inferred from the session; client-supplied workspace IDs are never trusted.
- PostgreSQL deployments add Row-Level Security as defense in depth (see `db/migrations/0001_init.sql`).

## Evidence and client portal

- Client portal links use unguessable 256-bit tokens stored as SHA-256 hashes, with expiry, revocation, attempt limits, and optional 6-digit OTP.
- Portal pages set `X-Robots-Tag: noindex, nofollow, noarchive`.
- Receipt snapshots are hashed with SHA-256; internal agency notes are stripped from every client-visible snapshot.

## Demo mode

- Synthetic DEMO data is isolated and clearly labelled. It is disabled by default in production and requires an explicit `ALLOW_DEMO_MODE=true` environment opt-in, plus non-production credentials that never touch live data.

## Integrations

- The GitHub App requests read-only scopes and never asks for PATs. Webhooks verify `X-Hub-Signature-256` with constant-time comparison and process deliveries idempotently.
- Stripe billing changes activate only through verified, idempotent webhooks.
- Secrets live in environment variables or a secret manager, never in the repository.

## Reporting vulnerabilities

Please open a private security advisory in this repository or email the maintainers via the address listed in the repository profile.
