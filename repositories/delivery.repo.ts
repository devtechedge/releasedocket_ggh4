import { randomUUID } from 'node:crypto';
import type { DbExecutor } from '@/db/client';
import { parseJsonColumn, toBool, toIso, toNullableIso } from '@/db/client';
import type {
  CanonicalReceiptSnapshot,
  ClaimAttribution,
  CriterionCategory,
  CriterionPriority,
  EvidenceState,
  ObservationType,
  ReceiptState,
  SourceOrigin,
} from '@/domain/types';

export interface DeliveryBatchRecord {
  id: string;
  workspaceId: string;
  projectId: string;
  projectName: string;
  clientId: string;
  clientName: string;
  title: string;
  summary: string;
  internalNotes: string;
  limitationsNote: string;
  targetDate: string | null;
  targetSha: string | null;
  status: ReceiptState;
  aiDraftSummary: string | null;
  aiApprovedByUserId: string | null;
  aiApprovedAt: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AcceptanceCriterionRecord {
  id: string;
  workspaceId: string;
  batchId: string;
  title: string;
  description: string;
  category: CriterionCategory;
  priority: CriterionPriority;
  expectedEvidence: string;
  status: EvidenceState;
  sortOrder: number;
  createdAt: string;
}

export interface EvidenceItemRecord {
  id: string;
  workspaceId: string;
  batchId: string;
  sourceObservationId: string | null;
  title: string;
  observationType: ObservationType;
  sourceOrigin: SourceOrigin;
  claimAttribution: ClaimAttribution;
  state: EvidenceState;
  stateReason: string;
  repoFullName: string | null;
  externalId: string | null;
  externalUrl: string | null;
  commitSha: string | null;
  testedSha: string | null;
  actor: string | null;
  note: string | null;
  observedAt: string;
  createdByUserId: string;
  createdAt: string;
}

export interface ReceiptVersionRecord {
  id: string;
  workspaceId: string;
  batchId: string;
  versionNumber: number;
  status: ReceiptState;
  hasGaps: boolean;
  gapDisclosureAck: boolean;
  snapshot: CanonicalReceiptSnapshot;
  snapshotHash: string;
  publishedByUserId: string;
  publishedAt: string;
  supersededAt: string | null;
  revokedAt: string | null;
}

export interface PortalTokenRecord {
  id: string;
  workspaceId: string;
  receiptVersionId: string;
  recipientEmail: string;
  tokenHash: string;
  otpRequired: boolean;
  otpCodeHash: string | null;
  failedAttempts: number;
  expiresAt: string;
  revokedAt: string | null;
  lastAccessedAt: string | null;
  createdAt: string;
}

function mapBatch(r: Record<string, unknown>): DeliveryBatchRecord {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    projectId: String(r.project_id),
    projectName: String(r.project_name ?? ''),
    clientId: String(r.client_id ?? ''),
    clientName: String(r.client_name ?? ''),
    title: String(r.title),
    summary: String(r.summary),
    internalNotes: String(r.internal_notes ?? ''),
    limitationsNote: String(r.limitations_note ?? ''),
    targetDate: r.target_date ? String(r.target_date) : null,
    targetSha: r.target_sha ? String(r.target_sha) : null,
    status: (r.status as ReceiptState) || 'draft',
    aiDraftSummary: r.ai_draft_summary ? String(r.ai_draft_summary) : null,
    aiApprovedByUserId: r.ai_approved_by_user_id
      ? String(r.ai_approved_by_user_id)
      : null,
    aiApprovedAt: toNullableIso(r.ai_approved_at),
    createdByUserId: String(r.created_by_user_id),
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  };
}

export async function listBatches(
  db: DbExecutor,
  workspaceId: string
): Promise<DeliveryBatchRecord[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT b.*, p.name as project_name, c.id as client_id, c.name as client_name
     FROM delivery_batches b
     JOIN projects p ON p.id = b.project_id AND p.workspace_id = b.workspace_id
     JOIN clients c ON c.id = p.client_id AND c.workspace_id = p.workspace_id
     WHERE b.workspace_id = $1
     ORDER BY b.updated_at DESC`,
    [workspaceId]
  );
  return rows.map(mapBatch);
}

export async function findBatchById(
  db: DbExecutor,
  workspaceId: string,
  batchId: string
): Promise<DeliveryBatchRecord | null> {
  const row = await db.queryOne<Record<string, unknown>>(
    `SELECT b.*, p.name as project_name, c.id as client_id, c.name as client_name
     FROM delivery_batches b
     JOIN projects p ON p.id = b.project_id AND p.workspace_id = b.workspace_id
     JOIN clients c ON c.id = p.client_id AND c.workspace_id = p.workspace_id
     WHERE b.id = $1 AND b.workspace_id = $2`,
    [batchId, workspaceId]
  );
  return row ? mapBatch(row) : null;
}

export async function createBatch(
  db: DbExecutor,
  params: {
    id?: string;
    workspaceId: string;
    projectId: string;
    title: string;
    summary: string;
    internalNotes?: string;
    limitationsNote?: string;
    targetDate?: string | null;
    targetSha?: string | null;
    createdByUserId: string;
  }
): Promise<{ id: string }> {
  const id = params.id ?? `bat_${randomUUID()}`;
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO delivery_batches
     (id, workspace_id, project_id, title, summary, internal_notes, limitations_note, target_date, target_sha, status, created_by_user_id, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,$11,$12)`,
    [
      id,
      params.workspaceId,
      params.projectId,
      params.title.trim(),
      params.summary.trim(),
      params.internalNotes?.trim() ?? '',
      params.limitationsNote?.trim() ?? '',
      params.targetDate ?? null,
      params.targetSha ?? null,
      params.createdByUserId,
      now,
      now,
    ]
  );
  return { id };
}

export async function updateBatch(
  db: DbExecutor,
  workspaceId: string,
  batchId: string,
  params: {
    title?: string;
    summary?: string;
    internalNotes?: string;
    limitationsNote?: string;
    targetDate?: string | null;
    targetSha?: string | null;
    status?: ReceiptState;
    aiDraftSummary?: string | null;
    aiApprovedByUserId?: string | null;
    aiApprovedAt?: string | null;
  }
): Promise<void> {
  const existing = await findBatchById(db, workspaceId, batchId);
  if (!existing) throw new Error('Delivery batch not found.');

  await db.execute(
    `UPDATE delivery_batches
     SET title = $1,
         summary = $2,
         internal_notes = $3,
         limitations_note = $4,
         target_date = $5,
         target_sha = $6,
         status = $7,
         ai_draft_summary = $8,
         ai_approved_by_user_id = $9,
         ai_approved_at = $10,
         updated_at = $11
     WHERE id = $12 AND workspace_id = $13`,
    [
      params.title ?? existing.title,
      params.summary ?? existing.summary,
      params.internalNotes ?? existing.internalNotes,
      params.limitationsNote ?? existing.limitationsNote,
      params.targetDate !== undefined ? params.targetDate : existing.targetDate,
      params.targetSha !== undefined ? params.targetSha : existing.targetSha,
      params.status ?? existing.status,
      params.aiDraftSummary !== undefined
        ? params.aiDraftSummary
        : existing.aiDraftSummary,
      params.aiApprovedByUserId !== undefined
        ? params.aiApprovedByUserId
        : existing.aiApprovedByUserId,
      params.aiApprovedAt !== undefined
        ? params.aiApprovedAt
        : existing.aiApprovedAt,
      new Date().toISOString(),
      batchId,
      workspaceId,
    ]
  );
}

export async function listCriteriaByBatch(
  db: DbExecutor,
  workspaceId: string,
  batchId: string
): Promise<AcceptanceCriterionRecord[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM acceptance_criteria
     WHERE workspace_id = $1 AND batch_id = $2
     ORDER BY sort_order ASC, created_at ASC`,
    [workspaceId, batchId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    batchId: String(r.batch_id),
    title: String(r.title),
    description: String(r.description ?? ''),
    category: r.category as CriterionCategory,
    priority: r.priority as CriterionPriority,
    expectedEvidence: String(r.expected_evidence),
    status: r.status as EvidenceState,
    sortOrder: Number(r.sort_order ?? 0),
    createdAt: toIso(r.created_at),
  }));
}

export async function createCriterion(
  db: DbExecutor,
  params: {
    id?: string;
    workspaceId: string;
    batchId: string;
    title: string;
    description?: string;
    category: CriterionCategory;
    priority: CriterionPriority;
    expectedEvidence: string;
    status?: EvidenceState;
    sortOrder?: number;
  }
): Promise<AcceptanceCriterionRecord> {
  const id = params.id ?? `cri_${randomUUID()}`;
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO acceptance_criteria
     (id, workspace_id, batch_id, title, description, category, priority, expected_evidence, status, sort_order, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      id,
      params.workspaceId,
      params.batchId,
      params.title.trim(),
      params.description?.trim() ?? '',
      params.category,
      params.priority,
      params.expectedEvidence.trim(),
      params.status ?? 'pending',
      params.sortOrder ?? 0,
      now,
    ]
  );
  return {
    id,
    workspaceId: params.workspaceId,
    batchId: params.batchId,
    title: params.title.trim(),
    description: params.description?.trim() ?? '',
    category: params.category,
    priority: params.priority,
    expectedEvidence: params.expectedEvidence.trim(),
    status: params.status ?? 'pending',
    sortOrder: params.sortOrder ?? 0,
    createdAt: now,
  };
}

export async function updateCriterionStatus(
  db: DbExecutor,
  workspaceId: string,
  criterionId: string,
  status: EvidenceState
): Promise<void> {
  await db.execute(
    `UPDATE acceptance_criteria SET status = $1 WHERE id = $2 AND workspace_id = $3`,
    [status, criterionId, workspaceId]
  );
}

export async function listEvidenceByBatch(
  db: DbExecutor,
  workspaceId: string,
  batchId: string
): Promise<EvidenceItemRecord[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM evidence_items
     WHERE workspace_id = $1 AND batch_id = $2
     ORDER BY observed_at DESC`,
    [workspaceId, batchId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    batchId: String(r.batch_id),
    sourceObservationId: r.source_observation_id
      ? String(r.source_observation_id)
      : null,
    title: String(r.title),
    observationType: r.observation_type as ObservationType,
    sourceOrigin: r.source_origin as SourceOrigin,
    claimAttribution: r.claim_attribution as ClaimAttribution,
    state: r.state as EvidenceState,
    stateReason: String(r.state_reason),
    repoFullName: r.repo_full_name ? String(r.repo_full_name) : null,
    externalId: r.external_id ? String(r.external_id) : null,
    externalUrl: r.external_url ? String(r.external_url) : null,
    commitSha: r.commit_sha ? String(r.commit_sha) : null,
    testedSha: r.tested_sha ? String(r.tested_sha) : null,
    actor: r.actor ? String(r.actor) : null,
    note: r.note ? String(r.note) : null,
    observedAt: toIso(r.observed_at),
    createdByUserId: String(r.created_by_user_id),
    createdAt: toIso(r.created_at),
  }));
}

export async function createEvidenceItem(
  db: DbExecutor,
  params: {
    id?: string;
    workspaceId: string;
    batchId: string;
    sourceObservationId?: string | null;
    title: string;
    observationType: ObservationType;
    sourceOrigin: SourceOrigin;
    claimAttribution: ClaimAttribution;
    state: EvidenceState;
    stateReason: string;
    repoFullName?: string | null;
    externalId?: string | null;
    externalUrl?: string | null;
    commitSha?: string | null;
    testedSha?: string | null;
    actor?: string | null;
    note?: string | null;
    observedAt: string;
    createdByUserId: string;
  }
): Promise<EvidenceItemRecord> {
  const id = params.id ?? `ev_${randomUUID()}`;
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO evidence_items
     (id, workspace_id, batch_id, source_observation_id, title, observation_type, source_origin,
      claim_attribution, state, state_reason, repo_full_name, external_id, external_url,
      commit_sha, tested_sha, actor, note, observed_at, created_by_user_id, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
    [
      id,
      params.workspaceId,
      params.batchId,
      params.sourceObservationId ?? null,
      params.title.trim(),
      params.observationType,
      params.sourceOrigin,
      params.claimAttribution,
      params.state,
      params.stateReason,
      params.repoFullName ?? null,
      params.externalId ?? null,
      params.externalUrl ?? null,
      params.commitSha ?? null,
      params.testedSha ?? null,
      params.actor ?? null,
      params.note ?? null,
      params.observedAt,
      params.createdByUserId,
      now,
    ]
  );

  return {
    id,
    workspaceId: params.workspaceId,
    batchId: params.batchId,
    sourceObservationId: params.sourceObservationId ?? null,
    title: params.title.trim(),
    observationType: params.observationType,
    sourceOrigin: params.sourceOrigin,
    claimAttribution: params.claimAttribution,
    state: params.state,
    stateReason: params.stateReason,
    repoFullName: params.repoFullName ?? null,
    externalId: params.externalId ?? null,
    externalUrl: params.externalUrl ?? null,
    commitSha: params.commitSha ?? null,
    testedSha: params.testedSha ?? null,
    actor: params.actor ?? null,
    note: params.note ?? null,
    observedAt: params.observedAt,
    createdByUserId: params.createdByUserId,
    createdAt: now,
  };
}

export async function listCriterionMappingsByBatch(
  db: DbExecutor,
  workspaceId: string,
  batchId: string
): Promise<Array<{ id: string; criterionId: string; evidenceId: string }>> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT m.id, m.criterion_id, m.evidence_id
     FROM criterion_evidence_mappings m
     JOIN acceptance_criteria c ON c.id = m.criterion_id AND c.workspace_id = m.workspace_id
     WHERE m.workspace_id = $1 AND c.batch_id = $2`,
    [workspaceId, batchId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    criterionId: String(r.criterion_id),
    evidenceId: String(r.evidence_id),
  }));
}

export async function linkCriterionEvidence(
  db: DbExecutor,
  params: { workspaceId: string; criterionId: string; evidenceId: string }
): Promise<void> {
  const existing = await db.queryOne<Record<string, unknown>>(
    `SELECT id FROM criterion_evidence_mappings
     WHERE workspace_id = $1 AND criterion_id = $2 AND evidence_id = $3`,
    [params.workspaceId, params.criterionId, params.evidenceId]
  );
  if (existing) return;

  await db.execute(
    `INSERT INTO criterion_evidence_mappings (id, workspace_id, criterion_id, evidence_id, created_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [
      `cem_${randomUUID()}`,
      params.workspaceId,
      params.criterionId,
      params.evidenceId,
      new Date().toISOString(),
    ]
  );
}

export async function listReceiptVersionsByBatch(
  db: DbExecutor,
  workspaceId: string,
  batchId: string
): Promise<ReceiptVersionRecord[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM receipt_versions
     WHERE workspace_id = $1 AND batch_id = $2
     ORDER BY version_number DESC`,
    [workspaceId, batchId]
  );
  return rows.map(mapReceiptVersion);
}

export async function listAllWorkspaceReceipts(
  db: DbExecutor,
  workspaceId: string
): Promise<ReceiptVersionRecord[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM receipt_versions
     WHERE workspace_id = $1
     ORDER BY published_at DESC`,
    [workspaceId]
  );
  return rows.map(mapReceiptVersion);
}

function mapReceiptVersion(r: Record<string, unknown>): ReceiptVersionRecord {
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    batchId: String(r.batch_id),
    versionNumber: Number(r.version_number),
    status: r.status as ReceiptState,
    hasGaps: toBool(r.has_gaps),
    gapDisclosureAck: toBool(r.gap_disclosure_ack),
    snapshot: parseJsonColumn<CanonicalReceiptSnapshot>(
      r.snapshot_json,
      {} as CanonicalReceiptSnapshot
    ),
    snapshotHash: String(r.snapshot_hash),
    publishedByUserId: String(r.published_by_user_id),
    publishedAt: toIso(r.published_at),
    supersededAt: toNullableIso(r.superseded_at),
    revokedAt: toNullableIso(r.revoked_at),
  };
}

export async function findReceiptVersionById(
  db: DbExecutor,
  workspaceId: string,
  receiptVersionId: string
): Promise<ReceiptVersionRecord | null> {
  const row = await db.queryOne<Record<string, unknown>>(
    `SELECT * FROM receipt_versions WHERE id = $1 AND workspace_id = $2`,
    [receiptVersionId, workspaceId]
  );
  return row ? mapReceiptVersion(row) : null;
}

export async function insertReceiptVersion(
  db: DbExecutor,
  params: {
    id?: string;
    workspaceId: string;
    batchId: string;
    versionNumber: number;
    hasGaps: boolean;
    gapDisclosureAck: boolean;
    snapshot: CanonicalReceiptSnapshot;
    snapshotHash: string;
    publishedByUserId: string;
  }
): Promise<ReceiptVersionRecord> {
  const id = params.id ?? `rec_${randomUUID()}`;
  const publishedAt = new Date().toISOString();
  await db.execute(
    `INSERT INTO receipt_versions
     (id, workspace_id, batch_id, version_number, status, has_gaps, gap_disclosure_ack, snapshot_json, snapshot_hash, published_by_user_id, published_at)
     VALUES ($1,$2,$3,$4,'published',$5,$6,$7,$8,$9,$10)`,
    [
      id,
      params.workspaceId,
      params.batchId,
      params.versionNumber,
      params.hasGaps ? 1 : 0,
      params.gapDisclosureAck ? 1 : 0,
      JSON.stringify(params.snapshot),
      params.snapshotHash,
      params.publishedByUserId,
      publishedAt,
    ]
  );
  return {
    id,
    workspaceId: params.workspaceId,
    batchId: params.batchId,
    versionNumber: params.versionNumber,
    status: 'published',
    hasGaps: params.hasGaps,
    gapDisclosureAck: params.gapDisclosureAck,
    snapshot: params.snapshot,
    snapshotHash: params.snapshotHash,
    publishedByUserId: params.publishedByUserId,
    publishedAt,
    supersededAt: null,
    revokedAt: null,
  };
}

export async function supersedePriorReceiptVersions(
  db: DbExecutor,
  workspaceId: string,
  batchId: string
): Promise<void> {
  const now = new Date().toISOString();
  await db.execute(
    `UPDATE receipt_versions
     SET status = 'superseded', superseded_at = $1
     WHERE workspace_id = $2 AND batch_id = $3 AND status IN ('published','changes_requested')`,
    [now, workspaceId, batchId]
  );
}

export async function updateReceiptVersionStatus(
  db: DbExecutor,
  workspaceId: string,
  receiptVersionId: string,
  status: ReceiptState
): Promise<void> {
  const revokedAt = status === 'revoked' ? new Date().toISOString() : null;
  await db.execute(
    `UPDATE receipt_versions
     SET status = $1, revoked_at = COALESCE($2, revoked_at)
     WHERE id = $3 AND workspace_id = $4`,
    [status, revokedAt, receiptVersionId, workspaceId]
  );
}

export async function createPortalToken(
  db: DbExecutor,
  params: {
    id?: string;
    workspaceId: string;
    receiptVersionId: string;
    recipientEmail: string;
    tokenHash: string;
    otpRequired: boolean;
    otpCodeHash: string | null;
    expiresAt: string;
  }
): Promise<PortalTokenRecord> {
  const id = params.id ?? `ptk_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  await db.execute(
    `INSERT INTO portal_tokens
     (id, workspace_id, receipt_version_id, recipient_email, token_hash, otp_required, otp_code_hash, failed_attempts, expires_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$9)`,
    [
      id,
      params.workspaceId,
      params.receiptVersionId,
      params.recipientEmail.trim().toLowerCase(),
      params.tokenHash,
      params.otpRequired ? 1 : 0,
      params.otpCodeHash,
      params.expiresAt,
      createdAt,
    ]
  );
  return {
    id,
    workspaceId: params.workspaceId,
    receiptVersionId: params.receiptVersionId,
    recipientEmail: params.recipientEmail.trim().toLowerCase(),
    tokenHash: params.tokenHash,
    otpRequired: params.otpRequired,
    otpCodeHash: params.otpCodeHash,
    failedAttempts: 0,
    expiresAt: params.expiresAt,
    revokedAt: null,
    lastAccessedAt: null,
    createdAt,
  };
}

export async function findPortalTokenByHash(
  db: DbExecutor,
  tokenHash: string
): Promise<PortalTokenRecord | null> {
  const r = await db.queryOne<Record<string, unknown>>(
    `SELECT * FROM portal_tokens WHERE token_hash = $1`,
    [tokenHash]
  );
  if (!r) return null;
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    receiptVersionId: String(r.receipt_version_id),
    recipientEmail: String(r.recipient_email),
    tokenHash: String(r.token_hash),
    otpRequired: toBool(r.otp_required),
    otpCodeHash: r.otp_code_hash ? String(r.otp_code_hash) : null,
    failedAttempts: Number(r.failed_attempts ?? 0),
    expiresAt: toIso(r.expires_at),
    revokedAt: toNullableIso(r.revoked_at),
    lastAccessedAt: toNullableIso(r.last_accessed_at),
    createdAt: toIso(r.created_at),
  };
}

export async function listPortalTokensByReceipt(
  db: DbExecutor,
  workspaceId: string,
  receiptVersionId: string
): Promise<PortalTokenRecord[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM portal_tokens
     WHERE workspace_id = $1 AND receipt_version_id = $2
     ORDER BY created_at DESC`,
    [workspaceId, receiptVersionId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    receiptVersionId: String(r.receipt_version_id),
    recipientEmail: String(r.recipient_email),
    tokenHash: String(r.token_hash),
    otpRequired: toBool(r.otp_required),
    otpCodeHash: r.otp_code_hash ? String(r.otp_code_hash) : null,
    failedAttempts: Number(r.failed_attempts ?? 0),
    expiresAt: toIso(r.expires_at),
    revokedAt: toNullableIso(r.revoked_at),
    lastAccessedAt: toNullableIso(r.last_accessed_at),
    createdAt: toIso(r.created_at),
  }));
}

export async function revokePortalToken(
  db: DbExecutor,
  workspaceId: string,
  portalTokenId: string
): Promise<void> {
  await db.execute(
    `UPDATE portal_tokens SET revoked_at = $1 WHERE id = $2 AND workspace_id = $3`,
    [new Date().toISOString(), portalTokenId, workspaceId]
  );
}

export async function incrementPortalTokenFailure(
  db: DbExecutor,
  portalTokenId: string
): Promise<void> {
  await db.execute(
    `UPDATE portal_tokens SET failed_attempts = failed_attempts + 1 WHERE id = $1`,
    [portalTokenId]
  );
}

export async function markPortalTokenAccessed(
  db: DbExecutor,
  portalTokenId: string
): Promise<void> {
  await db.execute(
    `UPDATE portal_tokens SET last_accessed_at = $1 WHERE id = $2`,
    [new Date().toISOString(), portalTokenId]
  );
}

export async function recordClientAction(
  db: DbExecutor,
  params: {
    workspaceId: string;
    receiptVersionId: string;
    portalTokenId: string | null;
    actionType: 'accepted' | 'changes_requested' | 'commented';
    actorName: string;
    actorEmail: string;
    note: string;
  }
): Promise<void> {
  await db.execute(
    `INSERT INTO client_actions
     (id, workspace_id, receipt_version_id, portal_token_id, action_type, actor_name, actor_email, note, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      `act_${randomUUID()}`,
      params.workspaceId,
      params.receiptVersionId,
      params.portalTokenId,
      params.actionType,
      params.actorName.trim(),
      params.actorEmail.trim().toLowerCase(),
      params.note.trim(),
      new Date().toISOString(),
    ]
  );
}

export async function listClientActionsByReceipt(
  db: DbExecutor,
  workspaceId: string,
  receiptVersionId: string
): Promise<
  Array<{
    id: string;
    actionType: string;
    actorName: string;
    actorEmail: string;
    note: string;
    createdAt: string;
  }>
> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM client_actions
     WHERE workspace_id = $1 AND receipt_version_id = $2
     ORDER BY created_at DESC`,
    [workspaceId, receiptVersionId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    actionType: String(r.action_type),
    actorName: String(r.actor_name),
    actorEmail: String(r.actor_email),
    note: String(r.note ?? ''),
    createdAt: toIso(r.created_at),
  }));
}

export async function addClientComment(
  db: DbExecutor,
  params: {
    workspaceId: string;
    receiptVersionId: string;
    authorName: string;
    authorEmail: string;
    authorKind: 'client' | 'agency';
    body: string;
  }
): Promise<void> {
  await db.execute(
    `INSERT INTO client_comments
     (id, workspace_id, receipt_version_id, author_name, author_email, author_kind, body, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      `cmt_${randomUUID()}`,
      params.workspaceId,
      params.receiptVersionId,
      params.authorName.trim(),
      params.authorEmail.trim().toLowerCase(),
      params.authorKind,
      params.body.trim(),
      new Date().toISOString(),
    ]
  );
}

export async function listClientCommentsByReceipt(
  db: DbExecutor,
  workspaceId: string,
  receiptVersionId: string
): Promise<
  Array<{
    id: string;
    authorName: string;
    authorEmail: string;
    authorKind: string;
    body: string;
    createdAt: string;
  }>
> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM client_comments
     WHERE workspace_id = $1 AND receipt_version_id = $2
     ORDER BY created_at ASC`,
    [workspaceId, receiptVersionId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    authorName: String(r.author_name),
    authorEmail: String(r.author_email),
    authorKind: String(r.author_kind),
    body: String(r.body),
    createdAt: toIso(r.created_at),
  }));
}

export async function findBillingEventByStripeId(
  db: DbExecutor,
  stripeEventId: string
): Promise<boolean> {
  const row = await db.queryOne<{ id: string }>(
    `SELECT id FROM billing_events WHERE stripe_event_id = $1`,
    [stripeEventId]
  );
  return Boolean(row);
}

export async function insertBillingEvent(
  db: DbExecutor,
  params: {
    workspaceId: string | null;
    stripeEventId: string;
    eventType: string;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await db.execute(
    `INSERT INTO billing_events (id, workspace_id, stripe_event_id, event_type, payload_json, processed_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [
      `ble_${randomUUID()}`,
      params.workspaceId,
      params.stripeEventId,
      params.eventType,
      JSON.stringify(params.payload),
      new Date().toISOString(),
    ]
  );
}
