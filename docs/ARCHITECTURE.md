# Architecture

ReleaseDocket uses a layered Next.js 15 App Router architecture with strict separation between HTTP handlers, business services, database repositories, external integrations, and pure domain logic:

1. **Domain Layer (`domain/`)**
   - `domain/evidence.ts`: Pure deterministic state evaluators (`evaluateCiState`, `evaluateDeploymentState`, `assessBatchGaps`), canonical SHA-256 snapshot hashing (`computeSnapshotHash`, `verifySnapshotHash`), and state transition guards (`canTransitionReceiptState`).
   - `domain/rbac.ts`: Centralized role permission matrix (`OWNER`, `ADMIN`, `DELIVERY_LEAD`, `CONTRIBUTOR`, `CLIENT_VIEWER`) and `assertPermission`.
   - `domain/billing.ts`: Plan catalog (`solo`, `studio`, `agency`, `partner`), server entitlement checks (`checkEntitlement`), and MRR arithmetic helper.
   - `domain/security.ts`: `scrypt` password hashing, SHA-256 token hashing, SSRF external URL validation, and log key redaction.

2. **Database & Repositories (`db/`, `repositories/`)**
   - PostgreSQL/Neon (`db/migrations/0001_init.sql`) with Row-Level Security policies when `DATABASE_URL` is configured.
   - Embedded `node:sqlite` (`db/sqlite-init.ts`) fallback for local development and deterministic `:memory:` integration tests when `DATABASE_URL` is absent.
   - All repository queries explicitly scope by `workspace_id`.

3. **Services & Integrations (`services/`, `integrations/`, `jobs/`)**
   - `services/*`: Transactional orchestration (`auth.service.ts`, `crm.service.ts`, `github-sync.service.ts`, `delivery.service.ts`, `portal.service.ts`, `reports.service.ts`, `billing.service.ts`).
   - `integrations/github.ts`: Read-only GitHub App RS256 JWT generation, installation token caching, webhook HMAC-SHA256 verification, and synthetic demo repository builder.
   - `integrations/ai.ts`: Server-side `@google/genai` draft helper sending metadata-only prompts (zero source code) with deterministic offline fallback when `GEMINI_API_KEY` is unset.
   - `jobs/outbox.ts`: Transactional outbox queue for portal email notifications and team invitations.
