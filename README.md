# ReleaseDocket

**ReleaseDocket** is a multi-tenant B2B SaaS platform for boutique software and AI-automation agencies (`5–30` people). It bridges the gap between raw engineering activity and client trust:

`commit / PR / CI / deployment → structured delivery evidence → immutable SHA-256 Delivery Receipt → audited client acceptance`

## Core Capabilities

- **Multi-Tenant Agency Workspaces & RBAC**: Scoped `OWNER`, `ADMIN`, `DELIVERY_LEAD`, `CONTRIBUTOR`, and `CLIENT_VIEWER` roles enforced server-side across every route.
- **Read-Only GitHub App Integration + Labelled Demo Mode**: Ingests `pull_request`, `pull_request_review`, `check_run`, `workflow_run`, `deployment`, `deployment_status`, and `release` metadata only (never source code blobs). Supports live HMAC-SHA256 verified webhooks and a clearly separated `DEMO` synthetic workspace when GitHub credentials are disconnected.
- **Honest Verification Rules**:
  - Merged PRs never auto-complete acceptance criteria.
  - CI/Deployment status requires exact SHA match against target merge/head SHA (`verified`, `stale`, `failed`, `pending`, `unknown`).
  - AI prose (Gemini via `@google/genai` or deterministic no-key fallback) is strictly a draft aid requiring human approval—never evidence.
  - Manual evidence is visibly attributed (`Agency Statement` vs. `Client-Supplied`).
- **Immutable Receipt Versioning & Gap Disclosure**: Publishing creates an immutable `v1`, `v2`, ... receipt snapshot hashed with SHA-256. Missing/stale/unlinked evidence requires explicit gap disclosure acknowledgement. Workspace `internalNotes` are stripped from all client-visible snapshots.
- **Client Sign-Off Portal (`/portal/[token]`)**: Cryptographic 256-bit tokens (stored as SHA-256 hashes), optional 6-digit OTP lockouts, `X-Robots-Tag: noindex, nofollow, noarchive`, client `Accept` / `Request Changes` / `Comment` audit trail, and print-ready CSS.
- **Retainer Snapshot Reports & Billing Entitlements**: Printable/Markdown client-scoped reports, append-only workspace audit logs, and server-side plan caps (`Solo $99`, `Studio $249`, `Agency $499`, `Partner $999`) backed by verified Stripe webhooks.

## Quick Start (Local Development)

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. In non-production environments without `DATABASE_URL`, ReleaseDocket runs against an embedded SQLite database (`.data/releasedocket.sqlite`) and seeds the isolated `Northstar Digital Studio` (`DEMO`) workspace automatically when you click **Open Non-Prod Demo Workspace** or **Launch Seeded Demo**.

## Verification Commands

```bash
npm run lint
npm run typecheck
npx tsx --test tests/releasedocket.test.ts
npm run build
```

## Documentation

- [Architecture & Data Model](./docs/ARCHITECTURE.md)
- [GitHub App Setup (Read-Only)](./docs/GITHUB_APP_SETUP.md)
- [Security & Multi-Tenancy](./docs/SECURITY.md)
- [Stripe Billing & Entitlements](./docs/BILLING.md)
- [Operations & Deployment](./docs/OPERATIONS.md)
