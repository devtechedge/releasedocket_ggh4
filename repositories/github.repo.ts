import { randomUUID } from 'node:crypto';
import type { DbExecutor } from '@/db/client';
import { parseJsonColumn, toBool, toIso, toNullableIso } from '@/db/client';
import type { ObservationType, SourceOrigin } from '@/domain/types';

export interface GitHubInstallationRecord {
  id: string;
  workspaceId: string;
  installationExternalId: string;
  accountLogin: string;
  mode: 'github_live' | 'demo_synthetic';
  permissions: Record<string, string>;
  healthStatus: string;
  lastSyncAt: string | null;
  lastError: string | null;
  createdAt: string;
}

export interface GitHubRepositoryRecord {
  id: string;
  workspaceId: string;
  installationId: string;
  repoExternalId: string;
  fullName: string;
  defaultBranch: string;
  isPrivate: boolean;
  mode: 'github_live' | 'demo_synthetic';
  createdAt: string;
}

export interface SourceObservationRecord {
  id: string;
  workspaceId: string;
  repositoryId: string;
  repoFullName: string;
  observationType: ObservationType;
  sourceOrigin: SourceOrigin;
  externalId: string;
  externalUrl: string;
  title: string;
  actor: string;
  headSha: string | null;
  mergeCommitSha: string | null;
  testedSha: string | null;
  rawState: string;
  rawConclusion: string | null;
  environmentName: string | null;
  observedAt: string;
  metadata: Record<string, unknown>;
}

export async function listInstallations(
  db: DbExecutor,
  workspaceId: string
): Promise<GitHubInstallationRecord[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM github_installations WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [workspaceId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    installationExternalId: String(r.installation_external_id),
    accountLogin: String(r.account_login),
    mode: r.mode as GitHubInstallationRecord['mode'],
    permissions: parseJsonColumn<Record<string, string>>(r.permissions_json, {}),
    healthStatus: String(r.health_status),
    lastSyncAt: toNullableIso(r.last_sync_at),
    lastError: r.last_error ? String(r.last_error) : null,
    createdAt: toIso(r.created_at),
  }));
}

export async function findInstallationByExternalId(
  db: DbExecutor,
  installationExternalId: string
): Promise<GitHubInstallationRecord | null> {
  const r = await db.queryOne<Record<string, unknown>>(
    `SELECT * FROM github_installations WHERE installation_external_id = $1`,
    [installationExternalId]
  );
  if (!r) return null;
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    installationExternalId: String(r.installation_external_id),
    accountLogin: String(r.account_login),
    mode: r.mode as GitHubInstallationRecord['mode'],
    permissions: parseJsonColumn<Record<string, string>>(r.permissions_json, {}),
    healthStatus: String(r.health_status),
    lastSyncAt: toNullableIso(r.last_sync_at),
    lastError: r.last_error ? String(r.last_error) : null,
    createdAt: toIso(r.created_at),
  };
}

export async function upsertInstallation(
  db: DbExecutor,
  params: {
    id?: string;
    workspaceId: string;
    installationExternalId: string;
    accountLogin: string;
    mode: 'github_live' | 'demo_synthetic';
    permissions: Record<string, string>;
    healthStatus?: string;
  }
): Promise<GitHubInstallationRecord> {
  const existing = await findInstallationByExternalId(
    db,
    params.installationExternalId
  );
  const now = new Date().toISOString();
  if (existing) {
    if (existing.workspaceId !== params.workspaceId) {
      throw new Error(
        'GitHub installation is already bound to a different workspace.'
      );
    }
    await db.execute(
      `UPDATE github_installations
       SET account_login = $1, mode = $2, permissions_json = $3, health_status = $4, last_sync_at = $5, last_error = NULL
       WHERE id = $6 AND workspace_id = $7`,
      [
        params.accountLogin,
        params.mode,
        JSON.stringify(params.permissions),
        params.healthStatus ?? 'healthy',
        now,
        existing.id,
        params.workspaceId,
      ]
    );
    return {
      ...existing,
      accountLogin: params.accountLogin,
      mode: params.mode,
      permissions: params.permissions,
      healthStatus: params.healthStatus ?? 'healthy',
      lastSyncAt: now,
      lastError: null,
    };
  }

  const id = params.id ?? `ghi_${randomUUID()}`;
  await db.execute(
    `INSERT INTO github_installations
     (id, workspace_id, installation_external_id, account_login, mode, permissions_json, health_status, last_sync_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      params.workspaceId,
      params.installationExternalId,
      params.accountLogin,
      params.mode,
      JSON.stringify(params.permissions),
      params.healthStatus ?? 'healthy',
      now,
      now,
    ]
  );

  return {
    id,
    workspaceId: params.workspaceId,
    installationExternalId: params.installationExternalId,
    accountLogin: params.accountLogin,
    mode: params.mode,
    permissions: params.permissions,
    healthStatus: params.healthStatus ?? 'healthy',
    lastSyncAt: now,
    lastError: null,
    createdAt: now,
  };
}

export async function updateInstallationHealth(
  db: DbExecutor,
  workspaceId: string,
  installationId: string,
  healthStatus: string,
  lastError: string | null
): Promise<void> {
  await db.execute(
    `UPDATE github_installations
     SET health_status = $1, last_sync_at = $2, last_error = $3
     WHERE id = $4 AND workspace_id = $5`,
    [healthStatus, new Date().toISOString(), lastError, installationId, workspaceId]
  );
}

export async function upsertRepository(
  db: DbExecutor,
  params: {
    id?: string;
    workspaceId: string;
    installationId: string;
    repoExternalId: string;
    fullName: string;
    defaultBranch: string;
    isPrivate: boolean;
    mode: 'github_live' | 'demo_synthetic';
  }
): Promise<GitHubRepositoryRecord> {
  const existing = await db.queryOne<Record<string, unknown>>(
    `SELECT * FROM github_repositories WHERE workspace_id = $1 AND repo_external_id = $2`,
    [params.workspaceId, params.repoExternalId]
  );
  if (existing) {
    await db.execute(
      `UPDATE github_repositories
       SET full_name = $1, default_branch = $2, is_private = $3, mode = $4
       WHERE id = $5 AND workspace_id = $6`,
      [
        params.fullName,
        params.defaultBranch,
        params.isPrivate ? 1 : 0,
        params.mode,
        String(existing.id),
        params.workspaceId,
      ]
    );
    return {
      id: String(existing.id),
      workspaceId: params.workspaceId,
      installationId: String(existing.installation_id),
      repoExternalId: params.repoExternalId,
      fullName: params.fullName,
      defaultBranch: params.defaultBranch,
      isPrivate: params.isPrivate,
      mode: params.mode,
      createdAt: toIso(existing.created_at),
    };
  }

  const id = params.id ?? `repo_${randomUUID()}`;
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO github_repositories
     (id, workspace_id, installation_id, repo_external_id, full_name, default_branch, is_private, mode, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      params.workspaceId,
      params.installationId,
      params.repoExternalId,
      params.fullName,
      params.defaultBranch,
      params.isPrivate ? 1 : 0,
      params.mode,
      now,
    ]
  );
  return {
    id,
    workspaceId: params.workspaceId,
    installationId: params.installationId,
    repoExternalId: params.repoExternalId,
    fullName: params.fullName,
    defaultBranch: params.defaultBranch,
    isPrivate: params.isPrivate,
    mode: params.mode,
    createdAt: now,
  };
}

export async function listRepositories(
  db: DbExecutor,
  workspaceId: string
): Promise<GitHubRepositoryRecord[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM github_repositories WHERE workspace_id = $1 ORDER BY full_name ASC`,
    [workspaceId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    installationId: String(r.installation_id),
    repoExternalId: String(r.repo_external_id),
    fullName: String(r.full_name),
    defaultBranch: String(r.default_branch),
    isPrivate: toBool(r.is_private),
    mode: r.mode as GitHubRepositoryRecord['mode'],
    createdAt: toIso(r.created_at),
  }));
}

export async function findRepositoryByFullName(
  db: DbExecutor,
  workspaceId: string,
  fullName: string
): Promise<GitHubRepositoryRecord | null> {
  const r = await db.queryOne<Record<string, unknown>>(
    `SELECT * FROM github_repositories WHERE workspace_id = $1 AND full_name = $2`,
    [workspaceId, fullName]
  );
  if (!r) return null;
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    installationId: String(r.installation_id),
    repoExternalId: String(r.repo_external_id),
    fullName: String(r.full_name),
    defaultBranch: String(r.default_branch),
    isPrivate: toBool(r.is_private),
    mode: r.mode as GitHubRepositoryRecord['mode'],
    createdAt: toIso(r.created_at),
  };
}

export async function findWebhookDeliveryByDeliveryId(
  db: DbExecutor,
  deliveryId: string
): Promise<{ id: string; status: string } | null> {
  const r = await db.queryOne<Record<string, unknown>>(
    `SELECT id, status FROM webhook_deliveries WHERE delivery_id = $1`,
    [deliveryId]
  );
  return r ? { id: String(r.id), status: String(r.status) } : null;
}

export async function insertWebhookDelivery(
  db: DbExecutor,
  params: {
    workspaceId: string | null;
    deliveryId: string;
    eventType: string;
    signatureValid: boolean;
    payloadHash: string;
    status: string;
    errorMessage?: string | null;
  }
): Promise<void> {
  await db.execute(
    `INSERT INTO webhook_deliveries
     (id, workspace_id, delivery_id, event_type, signature_valid, payload_hash, status, error_message, received_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      `whd_${randomUUID()}`,
      params.workspaceId,
      params.deliveryId,
      params.eventType,
      params.signatureValid ? 1 : 0,
      params.payloadHash,
      params.status,
      params.errorMessage ?? null,
      new Date().toISOString(),
    ]
  );
}

export async function listWebhookDeliveries(
  db: DbExecutor,
  workspaceId: string,
  limit = 25
): Promise<
  Array<{
    id: string;
    deliveryId: string;
    eventType: string;
    signatureValid: boolean;
    status: string;
    errorMessage: string | null;
    receivedAt: string;
  }>
> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM webhook_deliveries WHERE workspace_id = $1 ORDER BY received_at DESC LIMIT $2`,
    [workspaceId, limit]
  );
  return rows.map((r) => ({
    id: String(r.id),
    deliveryId: String(r.delivery_id),
    eventType: String(r.event_type),
    signatureValid: toBool(r.signature_valid),
    status: String(r.status),
    errorMessage: r.error_message ? String(r.error_message) : null,
    receivedAt: toIso(r.received_at),
  }));
}

export async function upsertSourceObservation(
  db: DbExecutor,
  params: {
    id?: string;
    workspaceId: string;
    repositoryId: string;
    repoFullName: string;
    observationType: ObservationType;
    sourceOrigin: SourceOrigin;
    externalId: string;
    externalUrl: string;
    title: string;
    actor: string;
    headSha: string | null;
    mergeCommitSha: string | null;
    testedSha: string | null;
    rawState: string;
    rawConclusion: string | null;
    environmentName: string | null;
    observedAt: string;
    metadata: Record<string, unknown>;
  }
): Promise<SourceObservationRecord> {
  const existing = await db.queryOne<Record<string, unknown>>(
    `SELECT * FROM source_observations
     WHERE workspace_id = $1 AND observation_type = $2 AND external_id = $3`,
    [params.workspaceId, params.observationType, params.externalId]
  );

  if (existing) {
    // Only overwrite state if the new observation is at least as recent (out-of-order guard).
    const existingObservedAt = String(existing.observed_at);
    if (params.observedAt >= existingObservedAt) {
      await db.execute(
        `UPDATE source_observations
         SET title = $1, head_sha = $2, merge_commit_sha = $3, tested_sha = $4,
             raw_state = $5, raw_conclusion = $6, environment_name = $7,
             observed_at = $8, metadata_json = $9
         WHERE id = $10 AND workspace_id = $11`,
        [
          params.title,
          params.headSha,
          params.mergeCommitSha,
          params.testedSha,
          params.rawState,
          params.rawConclusion,
          params.environmentName,
          params.observedAt,
          JSON.stringify(params.metadata),
          String(existing.id),
          params.workspaceId,
        ]
      );
    }
    return {
      id: String(existing.id),
      workspaceId: params.workspaceId,
      repositoryId: params.repositoryId,
      repoFullName: params.repoFullName,
      observationType: params.observationType,
      sourceOrigin: params.sourceOrigin,
      externalId: params.externalId,
      externalUrl: params.externalUrl,
      title: params.title,
      actor: params.actor,
      headSha: params.headSha,
      mergeCommitSha: params.mergeCommitSha,
      testedSha: params.testedSha,
      rawState: params.rawState,
      rawConclusion: params.rawConclusion,
      environmentName: params.environmentName,
      observedAt: params.observedAt,
      metadata: params.metadata,
    };
  }

  const id = params.id ?? `obs_${randomUUID()}`;
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO source_observations
     (id, workspace_id, repository_id, repo_full_name, observation_type, source_origin,
      external_id, external_url, title, actor, head_sha, merge_commit_sha, tested_sha,
      raw_state, raw_conclusion, environment_name, observed_at, metadata_json, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
    [
      id,
      params.workspaceId,
      params.repositoryId,
      params.repoFullName,
      params.observationType,
      params.sourceOrigin,
      params.externalId,
      params.externalUrl,
      params.title,
      params.actor,
      params.headSha,
      params.mergeCommitSha,
      params.testedSha,
      params.rawState,
      params.rawConclusion,
      params.environmentName,
      params.observedAt,
      JSON.stringify(params.metadata),
      now,
    ]
  );

  return {
    id,
    workspaceId: params.workspaceId,
    repositoryId: params.repositoryId,
    repoFullName: params.repoFullName,
    observationType: params.observationType,
    sourceOrigin: params.sourceOrigin,
    externalId: params.externalId,
    externalUrl: params.externalUrl,
    title: params.title,
    actor: params.actor,
    headSha: params.headSha,
    mergeCommitSha: params.mergeCommitSha,
    testedSha: params.testedSha,
    rawState: params.rawState,
    rawConclusion: params.rawConclusion,
    environmentName: params.environmentName,
    observedAt: params.observedAt,
    metadata: params.metadata,
  };
}

export async function listSourceObservations(
  db: DbExecutor,
  workspaceId: string,
  options?: { projectId?: string; limit?: number }
): Promise<SourceObservationRecord[]> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 250);
  const rows = options?.projectId
    ? await db.query<Record<string, unknown>>(
        `SELECT o.*
         FROM source_observations o
         JOIN project_repo_mappings m
           ON m.repository_id = o.repository_id AND m.workspace_id = o.workspace_id
         WHERE o.workspace_id = $1 AND m.project_id = $2
         ORDER BY o.observed_at DESC
         LIMIT $3`,
        [workspaceId, options.projectId, limit]
      )
    : await db.query<Record<string, unknown>>(
        `SELECT * FROM source_observations
         WHERE workspace_id = $1
         ORDER BY observed_at DESC
         LIMIT $2`,
        [workspaceId, limit]
      );

  return rows.map((r) => ({
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    repositoryId: String(r.repository_id),
    repoFullName: String(r.repo_full_name),
    observationType: r.observation_type as ObservationType,
    sourceOrigin: r.source_origin as SourceOrigin,
    externalId: String(r.external_id),
    externalUrl: String(r.external_url),
    title: String(r.title),
    actor: String(r.actor),
    headSha: r.head_sha ? String(r.head_sha) : null,
    mergeCommitSha: r.merge_commit_sha ? String(r.merge_commit_sha) : null,
    testedSha: r.tested_sha ? String(r.tested_sha) : null,
    rawState: String(r.raw_state),
    rawConclusion: r.raw_conclusion ? String(r.raw_conclusion) : null,
    environmentName: r.environment_name ? String(r.environment_name) : null,
    observedAt: toIso(r.observed_at),
    metadata: parseJsonColumn<Record<string, unknown>>(r.metadata_json, {}),
  }));
}

export async function findObservationById(
  db: DbExecutor,
  workspaceId: string,
  observationId: string
): Promise<SourceObservationRecord | null> {
  const r = await db.queryOne<Record<string, unknown>>(
    `SELECT * FROM source_observations WHERE id = $1 AND workspace_id = $2`,
    [observationId, workspaceId]
  );
  if (!r) return null;
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    repositoryId: String(r.repository_id),
    repoFullName: String(r.repo_full_name),
    observationType: r.observation_type as ObservationType,
    sourceOrigin: r.source_origin as SourceOrigin,
    externalId: String(r.external_id),
    externalUrl: String(r.external_url),
    title: String(r.title),
    actor: String(r.actor),
    headSha: r.head_sha ? String(r.head_sha) : null,
    mergeCommitSha: r.merge_commit_sha ? String(r.merge_commit_sha) : null,
    testedSha: r.tested_sha ? String(r.tested_sha) : null,
    rawState: String(r.raw_state),
    rawConclusion: r.raw_conclusion ? String(r.raw_conclusion) : null,
    environmentName: r.environment_name ? String(r.environment_name) : null,
    observedAt: toIso(r.observed_at),
    metadata: parseJsonColumn<Record<string, unknown>>(r.metadata_json, {}),
  };
}
