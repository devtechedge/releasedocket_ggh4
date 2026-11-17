import type { DbExecutor } from '@/db/client';
import { checkEntitlement, EntitlementError } from '@/domain/billing';
import {
  assessBatchGaps,
  computeSnapshotHash,
  evaluateCiState,
  evaluateDeploymentState,
} from '@/domain/evidence';
import { assertPermission } from '@/domain/rbac';
import {
  generateOtpCode,
  generateSecureToken,
  hashToken,
  validateSafeExternalUrl,
} from '@/domain/security';
import type {
  CanonicalReceiptSnapshot,
  ClaimAttribution,
  CriterionCategory,
  CriterionPriority,
  EvidenceState,
  ObservationType,
} from '@/domain/types';
import { generateDeliverySummaryDraft } from '@/integrations/ai';
import { enqueueOutboxJob } from '@/jobs/outbox';
import { recordAuditEvent } from '@/repositories/audit.repo';
import type { SessionWithContext } from '@/repositories/auth.repo';
import { findProjectById, getWorkspaceUsage } from '@/repositories/crm.repo';
import {
  createBatch,
  createCriterion,
  createEvidenceItem,
  createPortalToken,
  findBatchById,
  findReceiptVersionById,
  insertReceiptVersion,
  linkCriterionEvidence,
  listAllWorkspaceReceipts,
  listBatches,
  listClientActionsByReceipt,
  listClientCommentsByReceipt,
  listCriteriaByBatch,
  listCriterionMappingsByBatch,
  listEvidenceByBatch,
  listPortalTokensByReceipt,
  listReceiptVersionsByBatch,
  revokePortalToken,
  supersedePriorReceiptVersions,
  updateBatch,
  updateCriterionStatus,
  updateReceiptVersionStatus,
} from '@/repositories/delivery.repo';
import {
  findObservationById,
  listSourceObservations,
} from '@/repositories/github.repo';

export async function listDeliveryBatchesService(
  db: DbExecutor,
  ctx: SessionWithContext
) {
  assertPermission(ctx.role, 'workspace:read');
  const [batches, receipts] = await Promise.all([
    listBatches(db, ctx.workspace.id),
    listAllWorkspaceReceipts(db, ctx.workspace.id),
  ]);
  return batches.map((b) => {
    const batchReceipts = receipts.filter((r) => r.batchId === b.id);
    const latestReceipt = batchReceipts[0] ?? null;
    return {
      ...b,
      latestVersionNumber: latestReceipt?.versionNumber ?? null,
      latestReceiptId: latestReceipt?.id ?? null,
      latestHasGaps: latestReceipt?.hasGaps ?? null,
    };
  });
}

export async function createDeliveryBatchService(
  db: DbExecutor,
  ctx: SessionWithContext,
  input: {
    projectId: string;
    title: string;
    summary: string;
    internalNotes?: string;
    limitationsNote?: string;
    targetDate?: string | null;
    targetSha?: string | null;
    criteria?: Array<{
      title: string;
      description?: string;
      category: CriterionCategory;
      priority: CriterionPriority;
      expectedEvidence: string;
    }>;
  }
) {
  assertPermission(ctx.role, 'delivery:write');
  const project = await findProjectById(db, ctx.workspace.id, input.projectId);
  if (!project) {
    throw new Error('Project not found in workspace.');
  }

  return db.transaction(async (tx) => {
    const { id: batchId } = await createBatch(tx, {
      workspaceId: ctx.workspace.id,
      projectId: project.id,
      title: input.title,
      summary: input.summary,
      internalNotes: input.internalNotes,
      limitationsNote: input.limitationsNote,
      targetDate: input.targetDate,
      targetSha: input.targetSha,
      createdByUserId: ctx.user.id,
    });

    if (input.criteria?.length) {
      for (let i = 0; i < input.criteria.length; i += 1) {
        await createCriterion(tx, {
          workspaceId: ctx.workspace.id,
          batchId,
          ...input.criteria[i],
          sortOrder: i,
        });
      }
    }

    await recordAuditEvent(tx, {
      workspaceId: ctx.workspace.id,
      actorType: 'user',
      actorId: ctx.user.id,
      actorLabel: ctx.user.email,
      eventType: 'batch.created',
      resourceType: 'delivery_batch',
      resourceId: batchId,
      metadata: { title: input.title, projectId: project.id },
    });

    return { batchId };
  });
}

export async function getDeliveryBatchDetailService(
  db: DbExecutor,
  ctx: SessionWithContext,
  batchId: string
) {
  assertPermission(ctx.role, 'workspace:read');
  const batch = await findBatchById(db, ctx.workspace.id, batchId);
  if (!batch) {
    const err = new Error('Delivery batch not found.') as Error & {
      status?: number;
    };
    err.status = 404;
    throw err;
  }

  const [
    criteria,
    evidence,
    mappings,
    receiptVersions,
    projectObservations,
  ] = await Promise.all([
    listCriteriaByBatch(db, ctx.workspace.id, batch.id),
    listEvidenceByBatch(db, ctx.workspace.id, batch.id),
    listCriterionMappingsByBatch(db, ctx.workspace.id, batch.id),
    listReceiptVersionsByBatch(db, ctx.workspace.id, batch.id),
    listSourceObservations(db, ctx.workspace.id, {
      projectId: batch.projectId,
      limit: 50,
    }),
  ]);

  const gapAssessment = assessBatchGaps(criteria, mappings, evidence);

  const latestVersion = receiptVersions[0] ?? null;
  const [portalTokens, clientActions, clientComments] = latestVersion
    ? await Promise.all([
        listPortalTokensByReceipt(db, ctx.workspace.id, latestVersion.id),
        listClientActionsByReceipt(db, ctx.workspace.id, latestVersion.id),
        listClientCommentsByReceipt(db, ctx.workspace.id, latestVersion.id),
      ])
    : [[], [], []];

  return {
    batch,
    criteria,
    evidence,
    mappings,
    gapAssessment,
    receiptVersions,
    projectObservations,
    portalTokens,
    clientActions,
    clientComments,
  };
}

export async function updateDeliveryBatchService(
  db: DbExecutor,
  ctx: SessionWithContext,
  batchId: string,
  input: {
    title?: string;
    summary?: string;
    internalNotes?: string;
    limitationsNote?: string;
    targetDate?: string | null;
    targetSha?: string | null;
  }
) {
  assertPermission(ctx.role, 'delivery:write');
  const batch = await findBatchById(db, ctx.workspace.id, batchId);
  if (!batch) throw new Error('Delivery batch not found.');

  await updateBatch(db, ctx.workspace.id, batch.id, input);
  await recordAuditEvent(db, {
    workspaceId: ctx.workspace.id,
    actorType: 'user',
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: 'batch.updated',
    resourceType: 'delivery_batch',
    resourceId: batch.id,
    metadata: { updatedFields: Object.keys(input) },
  });
}

export async function addAcceptanceCriterionService(
  db: DbExecutor,
  ctx: SessionWithContext,
  batchId: string,
  input: {
    title: string;
    description?: string;
    category: CriterionCategory;
    priority: CriterionPriority;
    expectedEvidence: string;
  }
) {
  assertPermission(ctx.role, 'delivery:write');
  const batch = await findBatchById(db, ctx.workspace.id, batchId);
  if (!batch) throw new Error('Delivery batch not found.');

  const existing = await listCriteriaByBatch(db, ctx.workspace.id, batch.id);
  const criterion = await createCriterion(db, {
    workspaceId: ctx.workspace.id,
    batchId: batch.id,
    ...input,
    sortOrder: existing.length,
  });

  await recordAuditEvent(db, {
    workspaceId: ctx.workspace.id,
    actorType: 'user',
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: 'criterion.created',
    resourceType: 'acceptance_criterion',
    resourceId: criterion.id,
    metadata: { batchId: batch.id, title: criterion.title },
  });

  return criterion;
}

export async function setCriterionStatusService(
  db: DbExecutor,
  ctx: SessionWithContext,
  batchId: string,
  criterionId: string,
  status: EvidenceState
) {
  assertPermission(ctx.role, 'delivery:write');
  const batch = await findBatchById(db, ctx.workspace.id, batchId);
  if (!batch) throw new Error('Delivery batch not found.');
  const criteria = await listCriteriaByBatch(db, ctx.workspace.id, batch.id);
  const criterion = criteria.find((c) => c.id === criterionId);
  if (!criterion) throw new Error('Criterion not found in batch.');

  await updateCriterionStatus(db, ctx.workspace.id, criterion.id, status);
  await recordAuditEvent(db, {
    workspaceId: ctx.workspace.id,
    actorType: 'user',
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: 'criterion.status_updated',
    resourceType: 'acceptance_criterion',
    resourceId: criterion.id,
    metadata: { previousStatus: criterion.status, nextStatus: status },
  });
}

export async function attachObservationEvidenceService(
  db: DbExecutor,
  ctx: SessionWithContext,
  batchId: string,
  input: { observationId: string; criterionIds: string[] }
) {
  assertPermission(ctx.role, 'evidence:write');
  const batch = await findBatchById(db, ctx.workspace.id, batchId);
  if (!batch) throw new Error('Delivery batch not found.');

  const obs = await findObservationById(
    db,
    ctx.workspace.id,
    input.observationId
  );
  if (!obs) throw new Error('Observation not found in workspace.');

  const targetSha = batch.targetSha || obs.mergeCommitSha || obs.headSha;
  let state: EvidenceState = 'pending';
  let stateReason = '';

  if (obs.observationType === 'check_run' || obs.observationType === 'workflow_run') {
    const res = evaluateCiState({
      conclusion: obs.rawConclusion,
      status: obs.rawState,
      testedSha: obs.testedSha || obs.headSha,
      targetSha,
    });
    state = res.state;
    stateReason = res.reason;
  } else if (
    obs.observationType === 'deployment' ||
    obs.observationType === 'deployment_status'
  ) {
    const res = evaluateDeploymentState({
      deployState: obs.rawState,
      deploySha: obs.testedSha || obs.headSha,
      targetSha,
    });
    state = res.state;
    stateReason = res.reason;
  } else if (obs.observationType === 'pull_request') {
    state = obs.rawState === 'merged' ? 'verified' : 'pending';
    stateReason =
      obs.rawState === 'merged'
        ? `PR merged at ${obs.mergeCommitSha?.slice(0, 7) || 'unknown SHA'} (proves code merge only; does not prove feature correctness or client acceptance).`
        : `Pull request is currently '${obs.rawState}'.`;
  } else if (obs.observationType === 'pull_request_review') {
    state = obs.rawState === 'approved' ? 'verified' : 'pending';
    stateReason = `Code review state: ${obs.rawState} by ${obs.actor}.`;
  } else if (obs.observationType === 'release') {
    state = 'verified';
    stateReason = `Release published targeting ${obs.headSha?.slice(0, 7) || 'unknown SHA'}.`;
  }

  const evidence = await createEvidenceItem(db, {
    workspaceId: ctx.workspace.id,
    batchId: batch.id,
    sourceObservationId: obs.id,
    title: obs.title,
    observationType: obs.observationType,
    sourceOrigin: obs.sourceOrigin,
    claimAttribution: 'observed_github',
    state,
    stateReason,
    repoFullName: obs.repoFullName,
    externalId: obs.externalId,
    externalUrl: obs.externalUrl,
    commitSha: obs.mergeCommitSha || obs.headSha,
    testedSha: obs.testedSha,
    actor: obs.actor,
    note: null,
    observedAt: obs.observedAt,
    createdByUserId: ctx.user.id,
  });

  const validCriteria = new Set(
    (await listCriteriaByBatch(db, ctx.workspace.id, batch.id)).map((c) => c.id)
  );
  for (const cid of input.criterionIds) {
    if (validCriteria.has(cid)) {
      await linkCriterionEvidence(db, {
        workspaceId: ctx.workspace.id,
        criterionId: cid,
        evidenceId: evidence.id,
      });
    }
  }

  await recordAuditEvent(db, {
    workspaceId: ctx.workspace.id,
    actorType: 'user',
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: 'evidence.attached_observation',
    resourceType: 'evidence_item',
    resourceId: evidence.id,
    metadata: {
      batchId: batch.id,
      observationId: obs.id,
      state,
      sourceOrigin: obs.sourceOrigin,
    },
  });

  return evidence;
}

export async function addManualEvidenceService(
  db: DbExecutor,
  ctx: SessionWithContext,
  batchId: string,
  input: {
    title: string;
    observationType: ObservationType;
    claimAttribution: Extract<
      ClaimAttribution,
      'agency_statement' | 'client_supplied'
    >;
    externalUrl?: string;
    note: string;
    observedAt: string;
    state: EvidenceState;
    criterionIds: string[];
  }
) {
  assertPermission(ctx.role, 'evidence:write');
  const batch = await findBatchById(db, ctx.workspace.id, batchId);
  if (!batch) throw new Error('Delivery batch not found.');

  let safeUrl: string | null = null;
  if (input.externalUrl?.trim()) {
    const check = validateSafeExternalUrl(input.externalUrl);
    if (!check.valid) {
      throw new Error(check.error || 'Unsafe external evidence URL.');
    }
    safeUrl = check.normalized ?? null;
  }

  const label =
    input.claimAttribution === 'client_supplied'
      ? 'Client-supplied evidence'
      : 'Agency statement (manual user-supplied)';

  const evidence = await createEvidenceItem(db, {
    workspaceId: ctx.workspace.id,
    batchId: batch.id,
    sourceObservationId: null,
    title: input.title,
    observationType: input.observationType,
    sourceOrigin: 'manual_user',
    claimAttribution: input.claimAttribution,
    state: input.state,
    stateReason: `${label} recorded by ${ctx.user.name}.`,
    repoFullName: null,
    externalId: null,
    externalUrl: safeUrl,
    commitSha: null,
    testedSha: null,
    actor: ctx.user.email,
    note: input.note,
    observedAt: input.observedAt,
    createdByUserId: ctx.user.id,
  });

  const validCriteria = new Set(
    (await listCriteriaByBatch(db, ctx.workspace.id, batch.id)).map((c) => c.id)
  );
  for (const cid of input.criterionIds) {
    if (validCriteria.has(cid)) {
      await linkCriterionEvidence(db, {
        workspaceId: ctx.workspace.id,
        criterionId: cid,
        evidenceId: evidence.id,
      });
    }
  }

  await recordAuditEvent(db, {
    workspaceId: ctx.workspace.id,
    actorType: 'user',
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: 'evidence.added_manual',
    resourceType: 'evidence_item',
    resourceId: evidence.id,
    metadata: {
      batchId: batch.id,
      claimAttribution: input.claimAttribution,
      state: input.state,
    },
  });

  return evidence;
}

export async function linkEvidenceToCriterionService(
  db: DbExecutor,
  ctx: SessionWithContext,
  batchId: string,
  input: { criterionId: string; evidenceId: string }
) {
  assertPermission(ctx.role, 'evidence:write');
  const [criteria, evidence] = await Promise.all([
    listCriteriaByBatch(db, ctx.workspace.id, batchId),
    listEvidenceByBatch(db, ctx.workspace.id, batchId),
  ]);
  if (!criteria.some((c) => c.id === input.criterionId)) {
    throw new Error('Criterion not found in batch.');
  }
  if (!evidence.some((e) => e.id === input.evidenceId)) {
    throw new Error('Evidence item not found in batch.');
  }
  await linkCriterionEvidence(db, {
    workspaceId: ctx.workspace.id,
    criterionId: input.criterionId,
    evidenceId: input.evidenceId,
  });
}

export async function generateAiDraftForBatchService(
  db: DbExecutor,
  ctx: SessionWithContext,
  batchId: string
) {
  assertPermission(ctx.role, 'ai:draft');
  const batch = await findBatchById(db, ctx.workspace.id, batchId);
  if (!batch) throw new Error('Delivery batch not found.');

  const [criteria, evidence] = await Promise.all([
    listCriteriaByBatch(db, ctx.workspace.id, batch.id),
    listEvidenceByBatch(db, ctx.workspace.id, batch.id),
  ]);

  const draft = await generateDeliverySummaryDraft({
    batchTitle: batch.title,
    projectName: batch.projectName,
    clientName: batch.clientName,
    criteria: criteria.map((c) => ({
      id: c.id,
      title: c.title,
      category: c.category,
      status: c.status,
    })),
    evidence: evidence.map((e) => ({
      id: e.id,
      title: e.title,
      observationType: e.observationType,
      claimAttribution: e.claimAttribution,
      state: e.state,
      commitSha: e.commitSha,
      testedSha: e.testedSha,
    })),
  });

  await updateBatch(db, ctx.workspace.id, batch.id, {
    aiDraftSummary: draft.draftText,
  });

  await recordAuditEvent(db, {
    workspaceId: ctx.workspace.id,
    actorType: 'user',
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: 'ai.summary_drafted',
    resourceType: 'delivery_batch',
    resourceId: batch.id,
    metadata: { provider: draft.provider, model: draft.model },
  });

  return draft;
}

export async function approveAiDraftForBatchService(
  db: DbExecutor,
  ctx: SessionWithContext,
  batchId: string,
  editedSummary: string
) {
  assertPermission(ctx.role, 'delivery:write');
  const batch = await findBatchById(db, ctx.workspace.id, batchId);
  if (!batch) throw new Error('Delivery batch not found.');

  const now = new Date().toISOString();
  await updateBatch(db, ctx.workspace.id, batch.id, {
    summary: editedSummary.trim(),
    aiApprovedByUserId: ctx.user.id,
    aiApprovedAt: now,
  });

  await recordAuditEvent(db, {
    workspaceId: ctx.workspace.id,
    actorType: 'user',
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: 'ai.summary_approved',
    resourceType: 'delivery_batch',
    resourceId: batch.id,
    metadata: { approvedAt: now },
  });
}

export async function publishReceiptVersionService(
  db: DbExecutor,
  ctx: SessionWithContext,
  batchId: string,
  input: {
    gapDisclosureAck: boolean;
    recipientEmail: string;
    otpRequired?: boolean;
  }
) {
  assertPermission(ctx.role, 'delivery:publish');

  const usage = await getWorkspaceUsage(db, ctx.workspace.id);
  const ent = checkEntitlement(
    ctx.workspace.planTier,
    ctx.workspace.subscriptionStatus,
    usage,
    'publish_receipt'
  );
  if (!ent.allowed) {
    throw new EntitlementError(ent.reason || 'Monthly receipt limit reached.');
  }

  const batch = await findBatchById(db, ctx.workspace.id, batchId);
  if (!batch) throw new Error('Delivery batch not found.');

  const [criteria, evidence, mappings, existingVersions] = await Promise.all([
    listCriteriaByBatch(db, ctx.workspace.id, batch.id),
    listEvidenceByBatch(db, ctx.workspace.id, batch.id),
    listCriterionMappingsByBatch(db, ctx.workspace.id, batch.id),
    listReceiptVersionsByBatch(db, ctx.workspace.id, batch.id),
  ]);

  const gapAssessment = assessBatchGaps(criteria, mappings, evidence);
  if (gapAssessment.hasGaps && !input.gapDisclosureAck) {
    const err = new Error(
      'This batch contains unverified criteria, stale/failed evidence, or unmapped claims. Explicit gap disclosure acknowledgement is required before publishing.'
    ) as Error & { status?: number };
    err.status = 400;
    throw err;
  }

  const nextVersionNumber =
    existingVersions.reduce((max, v) => Math.max(max, v.versionNumber), 0) + 1;
  const publishedAt = new Date().toISOString();

  // Strictly omit internalNotes from the client-visible immutable snapshot!
  const snapshot: CanonicalReceiptSnapshot = {
    schemaVersion: 1,
    workspaceId: ctx.workspace.id,
    workspaceName: ctx.workspace.name,
    brandAccentColor: ctx.workspace.brandAccentColor,
    clientId: batch.clientId,
    clientName: batch.clientName,
    projectId: batch.projectId,
    projectName: batch.projectName,
    batchId: batch.id,
    versionNumber: nextVersionNumber,
    title: batch.title,
    summary: batch.summary,
    limitationsNote: batch.limitationsNote,
    targetDate: batch.targetDate,
    publishedAt,
    publishedByName: ctx.user.name,
    hasGaps: gapAssessment.hasGaps,
    verificationSummaryLabel: gapAssessment.verificationSummaryLabel,
    gaps: gapAssessment.gaps,
    criteria: criteria.map((c) => {
      const evIds = mappings
        .filter((m) => m.criterionId === c.id)
        .map((m) => m.evidenceId);
      const linked = evidence.filter((e) => evIds.includes(e.id));
      return {
        criterionId: c.id,
        title: c.title,
        description: c.description,
        category: c.category,
        priority: c.priority,
        expectedEvidence: c.expectedEvidence,
        status: c.status,
        evidenceIds: evIds,
        hasIndependentObservation: linked.some(
          (e) => e.claimAttribution === 'observed_github'
        ),
      };
    }),
    evidence: evidence.map((e) => ({
      evidenceId: e.id,
      title: e.title,
      observationType: e.observationType,
      sourceOrigin: e.sourceOrigin,
      claimAttribution: e.claimAttribution,
      state: e.state,
      stateReason: e.stateReason,
      repoFullName: e.repoFullName,
      externalId: e.externalId,
      externalUrl: e.externalUrl,
      commitSha: e.commitSha,
      testedSha: e.testedSha,
      actor: e.actor,
      note: e.note,
      observedAt: e.observedAt,
    })),
    aiProvenance: {
      usedAiDraft: Boolean(batch.aiDraftSummary),
      approvedByName: batch.aiApprovedByUserId ? ctx.user.name : null,
      approvedAt: batch.aiApprovedAt,
    },
  };

  const snapshotHash = computeSnapshotHash(snapshot);
  const rawToken = generateSecureToken(24);
  const otpCode = input.otpRequired ? generateOtpCode() : null;
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  return db.transaction(async (tx) => {
    await supersedePriorReceiptVersions(tx, ctx.workspace.id, batch.id);

    const receiptVersion = await insertReceiptVersion(tx, {
      workspaceId: ctx.workspace.id,
      batchId: batch.id,
      versionNumber: nextVersionNumber,
      hasGaps: gapAssessment.hasGaps,
      gapDisclosureAck: input.gapDisclosureAck,
      snapshot,
      snapshotHash,
      publishedByUserId: ctx.user.id,
    });

    await updateBatch(tx, ctx.workspace.id, batch.id, { status: 'published' });

    const portalToken = await createPortalToken(tx, {
      workspaceId: ctx.workspace.id,
      receiptVersionId: receiptVersion.id,
      recipientEmail: input.recipientEmail,
      tokenHash: hashToken(rawToken),
      otpRequired: Boolean(input.otpRequired),
      otpCodeHash: otpCode ? hashToken(otpCode) : null,
      expiresAt,
    });

    await enqueueOutboxJob(tx, {
      workspaceId: ctx.workspace.id,
      jobType: 'send_portal_notification',
      payload: {
        recipientEmail: input.recipientEmail,
        subject: `Delivery Receipt v${nextVersionNumber}: ${batch.title}`,
        body: `Your delivery receipt for ${batch.projectName} is ready at /portal/${rawToken}`,
      },
    });

    await recordAuditEvent(tx, {
      workspaceId: ctx.workspace.id,
      actorType: 'user',
      actorId: ctx.user.id,
      actorLabel: ctx.user.email,
      eventType: 'receipt.published',
      resourceType: 'receipt_version',
      resourceId: receiptVersion.id,
      metadata: {
        batchId: batch.id,
        versionNumber: nextVersionNumber,
        hasGaps: gapAssessment.hasGaps,
        snapshotHash,
        portalTokenId: portalToken.id,
      },
    });

    return {
      receiptVersion,
      portalTokenId: portalToken.id,
      rawToken,
      otpCode,
      portalPath: `/portal/${rawToken}`,
    };
  });
}

export async function revokePortalTokenService(
  db: DbExecutor,
  ctx: SessionWithContext,
  portalTokenId: string
) {
  assertPermission(ctx.role, 'portal:manage');
  await revokePortalToken(db, ctx.workspace.id, portalTokenId);
  await recordAuditEvent(db, {
    workspaceId: ctx.workspace.id,
    actorType: 'user',
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: 'portal.token_revoked',
    resourceType: 'portal_token',
    resourceId: portalTokenId,
    metadata: {},
  });
}

export async function revokeReceiptVersionService(
  db: DbExecutor,
  ctx: SessionWithContext,
  receiptVersionId: string
) {
  assertPermission(ctx.role, 'delivery:publish');
  const receipt = await findReceiptVersionById(
    db,
    ctx.workspace.id,
    receiptVersionId
  );
  if (!receipt) throw new Error('Receipt version not found.');
  await updateReceiptVersionStatus(
    db,
    ctx.workspace.id,
    receipt.id,
    'revoked'
  );
  await updateBatch(db, ctx.workspace.id, receipt.batchId, {
    status: 'revoked',
  });
  await recordAuditEvent(db, {
    workspaceId: ctx.workspace.id,
    actorType: 'user',
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: 'receipt.revoked',
    resourceType: 'receipt_version',
    resourceId: receipt.id,
    metadata: { versionNumber: receipt.versionNumber },
  });
}
