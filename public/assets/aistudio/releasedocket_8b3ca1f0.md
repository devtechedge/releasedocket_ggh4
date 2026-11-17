# CODEX MASTER PROMPT — RELEASEDOCKET

Act as principal engineer, SaaS architect, security engineer, product designer and test lead. Build **ReleaseDocket**, a production-oriented, multi-tenant SaaS for boutique software and AI-automation agencies. Inspect this workspace, implement end to end, run checks, fix failures and document it. Do not stop at a plan, scaffold or mockup.

## Product and customer

Target the owner/delivery lead of a 5–30-person software consultancy, product studio or AI-automation agency. Agencies connect GitHub repositories, map them to clients/projects, record promised work and acceptance criteria, then publish a branded **Delivery Receipt** showing what shipped, evidence, gaps and client acceptance.

Agencies waste hours assembling updates from GitHub, CI, deployments and chat; clients cannot distinguish delivery from claims; leads chase sign-off and struggle to demonstrate retainer value. Own **commit → evidence → client delivery → acceptance**. Do not build project management, code hosting, agent monitoring, vulnerability scanning, QA automation, observability, compliance certification or a generic AI wrapper. Integrate with existing tools. Name is provisional; no trademark/domain claim.

Target a model capable of $10,000+ USD MRR, not a guaranteed outcome. Never invent customers, traction or revenue.

## Work method and architecture

1. Inspect files, git status, package manager, runtime, scripts, conventions and env examples. Preserve useful work; initialise only if empty; never overwrite secrets.
2. Create `docs/BUILD_PLAN.md` and `docs/DECISIONS.md`, then implement immediately. Keep the app runnable after each slice.
3. Build working flows, not screens: navigation, forms, filters and write paths need validation and loading/empty/error/success states. No inert controls or fake metrics.
4. Reuse sound dependencies; choose secure defaults. Never claim checks passed unless run. Missing credentials require real adapters plus labelled demo mode.

Use a TypeScript modular monolith: Next.js App Router, React, strict TypeScript, Tailwind, PostgreSQL (Neon-compatible), Drizzle if no suitable ORM exists, Zod, server-side domain services/repositories, maintained database-backed auth (email/password, optional GitHub OAuth), Stripe Checkout/Portal/webhooks, email adapter and durable DB-backed jobs/outbox. GitHub App install is separate from login. No mandatory Redis for v1. Keep domain rules out of UI/routes; organise `domain/`, `services/`, `repositories/`, `integrations/`, `jobs/`, `app/`, `components/`, `tests/`. Use Vitest, Playwright, axe, lint, typecheck and GitHub Actions. Secrets/SDKs stay server-side.

## Core journeys

**Onboard:** marketing → account/workspace → agency profile → client → project → GitHub App or labelled demo → select repositories and map to projects. Explain permissions; never ask for PAT.

**Define:** create a delivery batch with title, summary, target date and human-written acceptance criteria (category, priority, expected evidence). Allow manual evidence with URL/type/note/date, visibly labelled user-supplied.

**Collect:** ingest PRs, commits, reviews, check runs/workflows, releases and deployment statuses. Staff attach evidence to batches and criteria. Show source, repo, ID/URL, SHA, actor, time and state. Store metadata only. Provide manual sync and integration health.

**Publish:** preview scope, delivered items, evidence mapping, PRs/checks, deployment, gaps and limitations. Publish immutable receipt version/share URL; edits create a new version. Noindex branded client portal uses one-time link/OTP; client can accept, request changes or comment. Audit each action; revoke/expire links; keep internal notes private.

**Retainer report:** dated snapshot of receipts published/accepted/pending, unresolved items, evidence gaps and linked activity. Separate GitHub facts from agency statements. Activity is not value; merged PRs do not prove working features. Provide print/Markdown/PDF export.

## Evidence integrity — mandatory

Evidence is an observation, not prose. Every delivery claim links to evidence or is marked `agency_statement`/`client_supplied`; AI text is never evidence. Use evidence states `pending`, `verified`, `stale`, `failed`, `unknown`, `not_applicable` and documented receipt states from `draft` through `published`, `accepted`, `changes_requested`, `superseded` and `revoked`.

CI success applies only to the exact tested SHA; changed SHA makes it stale, and missing status is never green. Deployment verifies only on matching SHA; absent SHA is `unknown`. Merged PR proves a merge, not feature correctness; deployment metadata is not browser acceptance. Keep review, CI, deployment and client acceptance separate. A PR never auto-completes human criteria; staff map evidence and set status. Publishing with gaps requires conspicuous disclosure; never call incomplete receipts fully verified. Reconcile events with canonical state and preserve history/timestamps. SHA-256 hashes help detect snapshot alteration; do not claim blockchain immutability.

## GitHub App and webhooks

Create a read-only GitHub App with minimum permissions: repository metadata, pull requests, checks/actions status and deployment statuses. Never request contents write/admin/workflow write. Document setup and permissions.

Handle installation lifecycle plus `pull_request`, `pull_request_review`, `check_run`, `workflow_run`, `deployment`, `deployment_status`, `release`. Verify `X-Hub-Signature-256` against raw body using constant-time comparison. Reject invalid signatures; persist delivery IDs uniquely; process idempotently. Validate installation/repo-to-workspace mapping. Handle duplicates/out-of-order events and fetch canonical state when needed. Use short-lived server-side tokens; protect private keys; never log credentials.

Support pagination, timeouts, rate limits and bounded retries. Provide manual sync. Without credentials use clearly labelled synthetic `DEMO` data; never blend it silently with live evidence. No PAT by default.

## Data, tenancy and roles

Create migrations for users/sessions; workspaces/memberships/invitations; clients/projects/repo mappings; GitHub installations/repos/webhook deliveries/source observations; batches/criteria/evidence/mappings; receipt versions/portal tokens/client actions/comments; audit events/outbox jobs; subscriptions/billing events.

Every tenant row has `workspace_id` or a provable tenant-owned parent. Scope every server query/mutation; never trust client workspace IDs. Add foreign keys, constraints, indexes and transactions for state transitions, publication, webhooks and billing. Public IDs are unguessable; IDs are not access control. Add PostgreSQL RLS only as tested defence in depth.

Roles: `OWNER`, `ADMIN`, `DELIVERY_LEAD`, `CONTRIBUTOR`, `CLIENT_VIEWER`. Centralise permissions and enforce in services. Client viewers access only explicitly shared receipts/actions—not dashboards, internal notes, other clients or integration settings.

## Security, privacy and AI

Use secure HttpOnly/Secure/SameSite cookies, CSRF/origin checks, session revocation, modern password hashing and OTP/login rate limits. Validate server input; prevent XSS, IDOR and tenant leaks. Hash portal tokens with expiry/revocation/attempt limits. Restrict uploads; use private storage/expiring URLs. Guard outbound requests against SSRF/unsafe redirects; never fetch arbitrary URLs. Keep secrets in env/secret manager and out of git. Add security headers, CSP and redacted logs. Audit publishing, client actions, access, evidence, roles, billing and integrations. Document retention/disconnect; minimise data and support workspace deletion.

AI may draft summaries, explain PR titles and suggest evidence mappings, but never invent features, test results, deployments, outcomes or acceptance. Provide server-side provider adapter and no-key fallback. Factual sentences cite evidence IDs or are labelled agency statements. Require human approval; retain draft/edits/approver/time. Never send source code, secrets or private notes to models. Core product works without AI keys.

## UX

Design a premium B2B operations interface: precise typography, readable data density, neutral palette/one accent, strong tables/statuses and responsive layouts. Avoid AI gradients and fake charts. Navigation: Overview, Clients, Projects, Delivery, Reports, Integrations, Team, Billing, Settings. Overview shows only real actionable facts (awaiting publication, overdue sign-offs, stale evidence, sync health). Build marketing/auth/onboarding, client/project views, repo mapping, delivery editor, evidence browser, receipt preview/portal, reports, integrations, roles, billing and audit log. Polish mobile receipt/approval. Forms and tables need validation, feedback, search/filter/sort and empty/loading/error states. Use semantic accessible HTML, keyboard/focus, contrast and reduced motion.

## Pricing and MRR hypothesis

Pricing hypotheses, configurable: Solo $99 (2 projects/1 member/10 receipts); Studio $249 (8 projects/5 members/50 receipts/branding); Agency $499 (25 projects/15 members/portal/audit exports); Partner $999 (75 projects/40 members/multi-team controls). Centralise entitlements and enforce server-side; retain historical read access after downgrade. Implement Stripe test checkout/portal/lifecycle and idempotent signed webhooks. Activate only on valid webhook. Without keys show billing disconnected.

Show arithmetic, not forecast: 21 Agency accounts × $499 = $10,479 MRR before churn, discounts, tax and fees. Never seed paying customers or fake MRR. Sales, validation, onboarding and retention remain necessary.

## Demo and acceptance tests

Seed a synthetic agency: 2 clients, 3 projects, merged PRs, pass/fail/stale checks, matching and mismatching deployment SHAs, batches, criteria, a published receipt and pending/changes-requested approvals. Label synthetic. Demo is explicit, isolated and disabled in production; no reusable demo credentials in production. Guard reset/seed against production.

Test: tenant A cannot access tenant B; client token cannot access private/unpublished/revoked/expired data; invalid signatures rejected and duplicate deliveries processed once; CI SHA matching/staleness; deployment SHA verification; PR/review/CI/deploy/client states distinct; immutable receipt versions; authorised, version-specific, audited client actions; server-side plan limits and webhook-only billing changes; AI fallback and no unsupported evidence claims. E2E: sign in → client/project → demo GitHub → batch/evidence → publish → client action → audit/report.

Run install, lint, typecheck, unit/integration, Playwright and build. Fix failures. Report any blocked check and reason; never silently skip. Include webhook fixtures.

## Delivery and execution order

Deliver source/migrations, `.env.example`, safe seeds, CI, `README.md` and docs for architecture, decisions, plan, GitHub setup, security, billing and operations. README covers local setup, demo, tests, deployment and production config. Target one web app plus managed Postgres (Vercel + Neon acceptable); keep domain portable.

Implement runnable slices: foundation/auth/tenancy; clients/projects; GitHub/webhooks; batches/evidence; immutable receipts/client portal; reports; billing; polish/tests/docs. Do not stop after planning or substitute mocks outside demo mode. Never fabricate test results, customers, deployments or revenue. Verify write paths and permissions. Prioritise correctness, security, provenance and client trust.

Finish with architecture, features, migrations, required env vars, commands actually run/results, deployment steps, limitations and three next actions. Continue until strongest complete state; do not stop at scaffolding.

Operational standard: index queries, bound pagination, expose sync health; isolate provider assumptions in adapters. Prefer deterministic domain logic; document risks and recovery.