# ReleaseDocket — Architecture & Engineering Decisions

## ADR-001: Modular Monolith with Strict Domain Isolation
- **Decision**: Organize the Next.js App Router codebase into explicit layers: `domain/` (pure business rules, RBAC, evidence integrity, billing math), `repositories/` (tenant-scoped data access), `services/` (use-case orchestration, transactions, audit logging, entitlement enforcement), `integrations/` (GitHub App, Stripe, Gemini AI, Email), `jobs/` (DB-backed outbox), `db/` (Drizzle PostgreSQL schema, migrations, embedded SQLite fallback), and `app/` + `components/` (thin UI and HTTP handlers).
- **Rationale**: Keeps business invariants testable without HTTP or database coupling and prevents client-supplied workspace IDs or UI shortcuts from bypassing authorization.

## ADR-002: PostgreSQL Primary Schema + Embedded `node:sqlite` Local Adapter
- **Decision**: Define the canonical production schema in Drizzle (`drizzle-orm/pg-core`) with versioned SQL migrations including PostgreSQL Row-Level Security (`db/migrations/0001_init.sql`). Provide an automatic embedded `node:sqlite` (`DatabaseSync` with WAL mode and foreign keys enabled) fallback inside `db/client.ts` when `DATABASE_URL` is not configured.
- **Rationale**: Allows instant local execution, automated verification, and deterministic unit/integration tests without requiring an external PostgreSQL daemon, while maintaining clean Neon/PostgreSQL compatibility when `DATABASE_URL` is provided.

## ADR-003: Evidence Integrity as Deterministic Domain Logic
- **Decision**: Never allow AI-generated prose or merged PRs to mark acceptance criteria as verified. Enforce SHA-exact verification for CI checks (`headSha === targetSha`) and deployments (`deploymentSha === targetSha`) in `domain/evidence.ts`. Compute canonical SHA-256 hashes over serialized immutable `receipt_versions` snapshots.
- **Rationale**: Agencies and clients need an unambiguous distinction between GitHub engineering observations, agency claims, and client sign-off. SHA-256 snapshot digests detect post-publication tampering without misleading blockchain claims.

## ADR-004: Read-Only GitHub App + Labelled Demo Isolation
- **Decision**: Require only read permissions on GitHub (`metadata: read`, `pull_requests: read`, `checks: read`, `actions: read`, `deployments: read`) and never ask users for Personal Access Tokens (PATs). Track `source_origin` (`github_live`, `demo_synthetic`, `manual_user`) on every observation and evidence record so synthetic demo data never blends silently with live repository evidence.
- **Rationale**: Minimizes blast radius on client repositories and preserves clear provenance.

## ADR-005: Webhook-Only Billing Activation & Server-Side Entitlements
- **Decision**: Centralize plan quotas (`Solo`, `Studio`, `Agency`, `Partner`) in `domain/billing.ts` and enforce them in `services/` before creating projects, inviting members, or publishing receipts. Subscription state transitions occur solely via verified Stripe webhooks (or an explicitly gated non-production test webhook simulator when Stripe keys are absent), retaining read access to historical receipts after downgrade.
- **Rationale**: Prevents client-side tampering with plan state and ensures billing state remains consistent across retries.

## ADR-006: AI Drafting with Mandatory Human Approval & Metadata-Only Scope
- **Decision**: Isolate Gemini calls (`gemini-4-hydrogen` via `@google/genai`) behind `integrations/ai.ts` with a deterministic no-key template fallback. Pass only PR titles, criterion names, and observation IDs—never source code, secrets, or internal private notes. Persist draft text, human-edited text, approver user ID, and approval timestamp.
- **Rationale**: Ensures the core product works with zero AI keys and guarantees all external client-facing prose is reviewed and owned by agency staff.
