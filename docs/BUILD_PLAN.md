# ReleaseDocket — Build Plan

## Product Goal
ReleaseDocket is a multi-tenant B2B SaaS platform for boutique software and AI-automation agencies (5–30 people). It owns the **commit -> evidence -> client delivery -> acceptance** workflow so agencies can map GitHub repositories to clients and projects, define human-written acceptance criteria, ingest verifiable GitHub engineering observations, and publish immutable, gap-disclosed **Delivery Receipts** to a branded, noindex client portal.

## Architectural Slices
1. **Foundation, Tenancy & Auth**
   - PostgreSQL Drizzle schema (`db/schema.ts`), SQL migration (`db/migrations/0001_init.sql` with RLS defense-in-depth), and embedded `node:sqlite` fallback adapter (`db/client.ts`) when `DATABASE_URL` is absent.
   - Database-backed session authentication (`scrypt` per-user salted hashes, SHA-256 hashed session tokens in HttpOnly/SameSite cookies, CSRF/Origin checks, rate limiting).
   - Centralized RBAC (`OWNER`, `ADMIN`, `DELIVERY_LEAD`, `CONTRIBUTOR`, `CLIENT_VIEWER`) in `domain/rbac.ts`.
   - Workspace invitations, team management, and immutable audit event stream.
2. **Clients, Projects & Repo Mapping**
   - Multi-tenant Clients and Projects CRUD with workspace scoping and server-side plan limit enforcement.
   - Project-to-Repository mappings supporting read-only GitHub App installations or explicitly labelled `DEMO` installations.
3. **GitHub App, Webhooks & Evidence Integrity**
   - Read-only GitHub App integration (`integrations/github.ts`) verifying `X-Hub-Signature-256` with `crypto.timingSafeEqual`, persisting unique `X-GitHub-Delivery` IDs idempotently, and fetching canonical state.
   - Deterministic evidence state engine (`domain/evidence.ts`) enforcing SHA-exact CI verification (`stale` when SHA moves, `unknown` when absent), SHA-exact deployment verification, strict separation of PR merge / review / CI / deploy / client acceptance, and mandatory gap disclosure.
4. **Delivery Batches, AI Drafts & Immutable Receipts**
   - Delivery batches with human acceptance criteria, evidence attachment, and manual user-supplied evidence (`agency_statement` / `client_supplied`).
   - Server-side AI drafting adapter (`integrations/ai.ts`) with `@google/genai` (`gemini-4-hydrogen`) and deterministic no-key fallback, requiring human approval and storing draft/edited/approver provenance.
   - Immutable `receipt_versions` (`v1`, `v2`, ...) with canonical SHA-256 snapshot digest, superseding prior versions on edit, and token-scoped `/portal/[token]` client approval portal.
5. **Retainer Reports, Billing & Operations**
   - Dated Retainer Snapshot Reports separating GitHub facts from agency statements, surfacing unresolved items and evidence gaps, with Markdown and print/PDF export.
   - Stripe Checkout, Customer Portal, and idempotent signed webhook lifecycle (`domain/billing.ts`, `services/billing.service.ts`) enforcing Solo ($99), Studio ($249), Agency ($499), and Partner ($999) entitlements.
   - DB-backed outbox job queue (`jobs/outbox.ts`) and email adapter (`integrations/email.ts`).
6. **Verification, Tests, CI & Documentation**
   - Deterministic `node:test` + Vitest unit/integration suite, GitHub webhook fixtures, Playwright E2E checks, GitHub Actions CI workflow, and comprehensive operational documentation.
