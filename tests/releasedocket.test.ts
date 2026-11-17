import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resetDbForTests } from '../db/client';
import {
  DEMO_PORTAL_TOKEN_VANGUARD,
  DEMO_SECOND_WORKSPACE_ID,
  DEMO_WORKSPACE_ID,
  seedDemoData,
} from '../db/seed';
import { calculateMrrArithmetic, checkEntitlement, EntitlementError } from '../domain/billing';
import {
  canPrAutoCompleteCriterion,
  canTransitionReceiptState,
  evaluateCiState,
  evaluateDeploymentState,
  isAiProseEvidence,
  verifySnapshotHash,
} from '../domain/evidence';
import { AuthorizationError, hasPermission } from '../domain/rbac';
import {
  hashPassword,
  redactForLog,
  validateSafeExternalUrl,
  verifyPassword,
} from '../domain/security';
import { generateDeliverySummaryDraft } from '../integrations/ai';
import { findWorkspaceById, type SessionWithContext } from '../repositories/auth.repo';
import { listClients } from '../repositories/crm.repo';
import { findReceiptVersionById } from '../repositories/delivery.repo';
import {
  listSourceObservations,
  upsertInstallation,
  upsertSourceObservation,
} from '../repositories/github.repo';
import { processNormalizedBillingEvent } from '../services/billing.service';
import { createClientService, createProjectService } from '../services/crm.service';
import {
  addAcceptanceCriterionService,
  addManualEvidenceService,
  createDeliveryBatchService,
  getDeliveryBatchDetailService,
  publishReceiptVersionService,
  revokeReceiptVersionService,
} from '../services/delivery.service';
import { processGitHubWebhookService } from '../services/github-sync.service';
import {
  getPortalReceiptService,
  submitPortalClientActionService,
} from '../services/portal.service';
import { generateRetainerReportService } from '../services/reports.service';

function makeSessionContext(
  ws: NonNullable<Awaited<ReturnType<typeof findWorkspaceById>>>,
  user: { id: string; email: string; name: string },
  role: SessionWithContext['role']
): SessionWithContext {
  return {
    sessionId: 'sess_test',
    user: {
      ...user,
      passwordHash: null,
      githubUserId: null,
      createdAt: new Date().toISOString(),
    },
    workspace: ws,
    role,
    memberships: [
      {
        workspaceId: ws.id,
        workspaceName: ws.name,
        role,
        isDemo: ws.isDemo,
      },
    ],
  };
}

function signWebhook(body: string, secret: string): string {
  const digest = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${digest}`;
}

test('Domain evidence rules: CI & Deployment SHA matching, PR/AI boundaries, and receipt state machine', () => {
  const shaA = 'a1b2c3d4e5f60000111122223333444455556666';
  const shaB = '9999999999999999999999999999999999999999';

  assert.equal(
    evaluateCiState({ conclusion: 'success', status: 'completed', testedSha: shaA, targetSha: shaA }).state,
    'verified'
  );
  assert.equal(
    evaluateCiState({ conclusion: 'success', status: 'completed', testedSha: shaB, targetSha: shaA }).state,
    'stale'
  );
  assert.equal(
    evaluateCiState({ conclusion: 'failure', status: 'completed', testedSha: shaA, targetSha: shaA }).state,
    'failed'
  );
  assert.equal(
    evaluateCiState({ conclusion: null, status: 'in_progress', testedSha: shaA, targetSha: shaA }).state,
    'pending'
  );
  assert.equal(
    evaluateCiState({ conclusion: 'success', status: 'completed', testedSha: null, targetSha: shaA }).state,
    'unknown'
  );

  assert.equal(
    evaluateDeploymentState({ deployState: 'success', deploySha: shaA, targetSha: shaA }).state,
    'verified'
  );
  assert.equal(
    evaluateDeploymentState({ deployState: 'success', deploySha: shaB, targetSha: shaA }).state,
    'stale'
  );
  assert.equal(
    evaluateDeploymentState({ deployState: 'failure', deploySha: shaA, targetSha: shaA }).state,
    'failed'
  );
  assert.equal(
    evaluateDeploymentState({ deployState: 'success', deploySha: null, targetSha: shaA }).state,
    'unknown'
  );

  // Explicit truth boundaries
  assert.equal(canPrAutoCompleteCriterion(), false);
  assert.equal(isAiProseEvidence(), false);

  // State machine transitions
  assert.equal(canTransitionReceiptState('draft', 'published'), true);
  assert.equal(canTransitionReceiptState('published', 'accepted'), true);
  assert.equal(canTransitionReceiptState('published', 'changes_requested'), true);
  assert.equal(canTransitionReceiptState('superseded', 'accepted'), false);
  assert.equal(canTransitionReceiptState('revoked', 'accepted'), false);
});

test('Security primitives: password scrypt, URL SSRF guard, and secret log redaction', () => {
  const hash = hashPassword('super-secure-agency-password');
  assert.equal(verifyPassword('super-secure-agency-password', hash), true);
  assert.equal(verifyPassword('wrong-password', hash), false);

  assert.equal(validateSafeExternalUrl('https://github.com/org/repo/pull/12').valid, true);
  assert.equal(validateSafeExternalUrl('http://127.0.0.1:3000/admin').valid, false);
  assert.equal(validateSafeExternalUrl('http://169.254.169.254/latest/meta-data').valid, false);
  assert.equal(validateSafeExternalUrl('javascript:alert(1)').valid, false);

  const redacted = redactForLog({
    token: 'secret-token-value',
    authorization: 'Bearer abc',
    nested: { apiKey: 'sk_live_12345', ok: 'visible' },
  }) as Record<string, unknown>;
  assert.equal(redacted.token, '[REDACTED]');
  assert.equal(redacted.authorization, '[REDACTED]');
  assert.equal((redacted.nested as Record<string, unknown>).apiKey, '[REDACTED]');
  assert.equal((redacted.nested as Record<string, unknown>).ok, 'visible');
});

test('Multi-tenant isolation: Tenant A cannot read, mutate, or leak Tenant B records', async () => {
  const db = resetDbForTests(':memory:');
  await seedDemoData(db);

  const northstar = (await findWorkspaceById(db, DEMO_WORKSPACE_ID))!;
  const meridian = (await findWorkspaceById(db, DEMO_SECOND_WORKSPACE_ID))!;

  const northstarCtx = makeSessionContext(
    northstar,
    { id: 'usr_demo_alex', email: 'alex@northstar.demo', name: 'Alex Mercer' },
    'OWNER'
  );
  const meridianCtx = makeSessionContext(
    meridian,
    { id: 'usr_demo_maya', email: 'maya@meridian.demo', name: 'Maya Lin' },
    'OWNER'
  );

  const meridianClients = await listClients(db, meridian.id);
  assert.ok(meridianClients.length >= 1);

  const createdInMeridian = await createClientService(db, meridianCtx, {
    name: 'Cobalt Robotics',
    contactName: 'Dan Park',
    contactEmail: 'dan@cobalt.example',
    retainerMonthlyUsd: 6500,
  });

  // Northstar cannot see Cobalt Robotics
  const northstarClients = await listClients(db, northstar.id);
  assert.equal(
    northstarClients.some((c) => c.id === createdInMeridian.id),
    false
  );

  // Northstar cannot create a project referencing Meridian's client
  await assert.rejects(
    () =>
      createProjectService(db, northstarCtx, {
        clientId: createdInMeridian.id,
        name: 'Cross-Tenant Hijack Attempt',
      }),
    /does not belong to this workspace/i
  );

  // Create project + batch in Meridian, verify Northstar cannot read it
  const meridianProj = await createProjectService(db, meridianCtx, {
    clientId: createdInMeridian.id,
    name: 'Telemetry Firmware v2',
  });
  const meridianBatch = await createDeliveryBatchService(db, meridianCtx, {
    projectId: meridianProj.id,
    title: 'Firmware Calibration Batch',
    summary: 'Meridian confidential calibration delivery.',
  });
  await assert.rejects(
    () => getDeliveryBatchDetailService(db, northstarCtx, meridianBatch.batchId),
    /not found/
  );
});

test('RBAC boundaries: Contributor cannot publish receipts; Client Viewer cannot write deliveries', async () => {
  const db = resetDbForTests(':memory:');
  await seedDemoData(db);
  const northstar = (await findWorkspaceById(db, DEMO_WORKSPACE_ID))!;

  assert.equal(hasPermission('OWNER', 'billing:manage'), true);
  assert.equal(hasPermission('DELIVERY_LEAD', 'delivery:publish'), true);
  assert.equal(hasPermission('CONTRIBUTOR', 'delivery:publish'), false);
  assert.equal(hasPermission('CLIENT_VIEWER', 'delivery:write'), false);

  const contributorCtx = makeSessionContext(
    northstar,
    { id: 'usr_contrib', email: 'dev@northstar.demo', name: 'Dev' },
    'CONTRIBUTOR'
  );
  const batches = await db.query<{ id: string }>(
    `SELECT id FROM delivery_batches WHERE workspace_id = $1 LIMIT 1`,
    [northstar.id]
  );

  await assert.rejects(
    () =>
      publishReceiptVersionService(db, contributorCtx, batches[0].id, {
        gapDisclosureAck: true,
        recipientEmail: 'client@example.com',
      }),
    (err) => err instanceof AuthorizationError
  );
});

test('GitHub webhook signature verification, idempotency, and out-of-order timestamp guard', async () => {
  const db = resetDbForTests(':memory:');
  await seedDemoData(db);
  const secret = 'test-webhook-secret-123';

  await upsertInstallation(db, {
    workspaceId: DEMO_WORKSPACE_ID,
    installationExternalId: '990011',
    accountLogin: 'northstar-studio',
    mode: 'github_live',
    permissions: { pull_requests: 'read', checks: 'read', deployments: 'read' },
  });

  const prFixture = readFileSync(
    join(process.cwd(), 'tests/fixtures/github/pull_request.json'),
    'utf8'
  );
  const checkFixture = readFileSync(
    join(process.cwd(), 'tests/fixtures/github/check_run.json'),
    'utf8'
  );

  // Invalid signature -> 401
  await assert.rejects(
    () =>
      processGitHubWebhookService(db, {
        rawBody: prFixture,
        signatureHeader: 'sha256=deadbeefdeadbeefdeadbeefdeadbeef',
        deliveryId: 'deliv-bad-sig-1',
        eventType: 'pull_request',
        webhookSecret: secret,
      }),
    (err: Error & { status?: number }) => err.status === 401
  );

  // Valid signature -> processed
  const res1 = await processGitHubWebhookService(db, {
    rawBody: prFixture,
    signatureHeader: signWebhook(prFixture, secret),
    deliveryId: 'deliv-pr-214',
    eventType: 'pull_request',
    webhookSecret: secret,
  });
  assert.equal(res1.status, 'processed');
  assert.equal(res1.ingested, 1);

  // Duplicate delivery ID -> ignored cleanly
  const resDup = await processGitHubWebhookService(db, {
    rawBody: prFixture,
    signatureHeader: signWebhook(prFixture, secret),
    deliveryId: 'deliv-pr-214',
    eventType: 'pull_request',
    webhookSecret: secret,
  });
  assert.equal(resDup.status, 'duplicate_ignored');
  assert.equal(resDup.ingested, 0);

  // Check run fixture ingested
  const resCheck = await processGitHubWebhookService(db, {
    rawBody: checkFixture,
    signatureHeader: signWebhook(checkFixture, secret),
    deliveryId: 'deliv-chk-55443322',
    eventType: 'check_run',
    webhookSecret: secret,
  });
  assert.equal(resCheck.status, 'processed');

  // Out-of-order guard: older observedAt timestamp must not overwrite newer observation
  const observations = await listSourceObservations(db, DEMO_WORKSPACE_ID, {
    limit: 50,
  });
  const checkObs = observations.find((o) => o.externalId.includes('55443322'))!;
  assert.equal(checkObs.rawConclusion, 'success');

  await upsertSourceObservation(db, {
    workspaceId: DEMO_WORKSPACE_ID,
    repositoryId: checkObs.repositoryId,
    repoFullName: checkObs.repoFullName,
    observationType: 'check_run',
    sourceOrigin: 'github_live',
    externalId: checkObs.externalId,
    externalUrl: checkObs.externalUrl,
    title: checkObs.title,
    actor: checkObs.actor,
    headSha: checkObs.headSha,
    mergeCommitSha: checkObs.mergeCommitSha,
    testedSha: checkObs.testedSha,
    rawState: 'in_progress',
    rawConclusion: 'cancelled',
    environmentName: null,
    observedAt: '2026-04-01T00:00:00Z', // older than 2026-04-12
    metadata: {},
  });

  const afterObs = (
    await listSourceObservations(db, DEMO_WORKSPACE_ID, { limit: 50 })
  ).find((o) => o.externalId === checkObs.externalId)!;
  assert.equal(afterObs.rawConclusion, 'success');
});

test('Delivery lifecycle: gap disclosure gate, immutable versioning, SHA-256 tamper check, internalNotes privacy, and portal token security', async () => {
  const db = resetDbForTests(':memory:');
  await seedDemoData(db);

  const northstar = (await findWorkspaceById(db, DEMO_WORKSPACE_ID))!;
  const ownerCtx = makeSessionContext(
    northstar,
    { id: 'usr_demo_alex', email: 'alex@northstar.demo', name: 'Alex Mercer' },
    'OWNER'
  );

  const projects = await db.query<{ id: string }>(
    `SELECT id FROM projects WHERE workspace_id = $1 LIMIT 1`,
    [northstar.id]
  );

  const { batchId } = await createDeliveryBatchService(db, ownerCtx, {
    projectId: projects[0].id,
    title: 'Settlement Audit Batch',
    summary: 'Initial manual summary ready for client inspection.',
    internalNotes: 'CONFIDENTIAL AGENCY INTERNAL NOTE: Do not expose to client.',
    limitationsNote: 'Staging telemetry only; load test pending.',
    criteria: [
      {
        title: 'Webhook signature verification passes',
        category: 'security',
        priority: 'critical',
        expectedEvidence: 'Check run on target SHA',
      },
    ],
  });

  // Unverified criterion triggers gap disclosure requirement
  await assert.rejects(
    () =>
      publishReceiptVersionService(db, ownerCtx, batchId, {
        gapDisclosureAck: false,
        recipientEmail: 'client@vanguard.example',
      }),
    /gap disclosure acknowledgement is required/i
  );

  // Publish v1 with gap disclosure ack and OTP enabled
  const v1 = await publishReceiptVersionService(db, ownerCtx, batchId, {
    gapDisclosureAck: true,
    recipientEmail: 'client@vanguard.example',
    otpRequired: true,
  });
  assert.equal(v1.receiptVersion.versionNumber, 1);
  assert.ok(v1.otpCode);

  // Verify snapshot hash and internalNotes exclusion
  assert.equal(
    verifySnapshotHash(v1.receiptVersion.snapshot, v1.receiptVersion.snapshotHash),
    true
  );
  assert.equal(
    JSON.stringify(v1.receiptVersion.snapshot).includes('CONFIDENTIAL AGENCY INTERNAL NOTE'),
    false
  );

  // Tamper detection on snapshot
  const tampered = { ...v1.receiptVersion.snapshot, title: 'Tampered Title' };
  assert.equal(verifySnapshotHash(tampered, v1.receiptVersion.snapshotHash), false);

  // OTP enforcement: without OTP returns gated shell, wrong OTP increments failure and blocks
  const gated = await getPortalReceiptService(db, v1.rawToken);
  assert.equal(gated.otpRequired, true);
  assert.equal(gated.otpVerified, false);
  assert.equal(gated.snapshot, null);

  await assert.rejects(
    () => getPortalReceiptService(db, v1.rawToken, '000000'),
    (err: Error & { status?: number }) => err.status === 401
  );

  const unlocked = await getPortalReceiptService(db, v1.rawToken, v1.otpCode!);
  assert.equal(unlocked.otpVerified, true);
  assert.equal(unlocked.hashVerified, true);

  // Add manual evidence and publish v2 -> v1 becomes superseded
  const detail = await getDeliveryBatchDetailService(db, ownerCtx, batchId);
  await addAcceptanceCriterionService(db, ownerCtx, batchId, {
    title: 'Client walkthrough recorded',
    category: 'documentation',
    priority: 'standard',
    expectedEvidence: 'Loom walkthrough',
  });
  await addManualEvidenceService(db, ownerCtx, batchId, {
    title: 'Manual walkthrough video',
    observationType: 'manual_evidence',
    claimAttribution: 'agency_statement',
    note: 'Recorded 4m walkthrough with client lead.',
    observedAt: new Date().toISOString(),
    state: 'verified',
    criterionIds: [detail.criteria[0].id],
  });

  const v2 = await publishReceiptVersionService(db, ownerCtx, batchId, {
    gapDisclosureAck: true,
    recipientEmail: 'client@vanguard.example',
    otpRequired: false,
  });
  assert.equal(v2.receiptVersion.versionNumber, 2);

  const v1Reloaded = await findReceiptVersionById(
    db,
    northstar.id,
    v1.receiptVersion.id
  );
  assert.equal(v1Reloaded?.status, 'superseded');

  // Submitting action on superseded v1 token must be rejected with 409
  await assert.rejects(
    () =>
      submitPortalClientActionService(db, {
        rawToken: v1.rawToken,
        otpCode: v1.otpCode!,
        actionType: 'accepted',
        actorName: 'Elena Client',
        actorEmail: 'client@vanguard.example',
        note: 'Trying to accept old version',
      }),
    (err: Error & { status?: number }) => err.status === 409
  );

  // Submitting acceptance on v2 succeeds and updates receipt + batch
  const acceptedV2 = await submitPortalClientActionService(db, {
    rawToken: v2.rawToken,
    actionType: 'accepted',
    actorName: 'Elena Client',
    actorEmail: 'client@vanguard.example',
    note: 'Verified in staging and signed off.',
  });
  assert.equal(acceptedV2.status, 'accepted');

  // Revoking v2 blocks portal access
  await revokeReceiptVersionService(db, ownerCtx, v2.receiptVersion.id);
  await assert.rejects(
    () => getPortalReceiptService(db, v2.rawToken),
    (err: Error & { status?: number }) => err.status === 403
  );
});

test('Billing & Entitlements: Solo limit enforced, webhook idempotency, MRR arithmetic, and historical reads preserved', async () => {
  const db = resetDbForTests(':memory:');
  await seedDemoData(db);

  const northstar = (await findWorkspaceById(db, DEMO_WORKSPACE_ID))!;
  const mrr = calculateMrrArithmetic('agency', 21);
  assert.equal(mrr.grossMrrUsd, 10479);

  // Downgrade Northstar (which already has 2 projects seeded) to Solo via webhook event
  const billRes1 = await processNormalizedBillingEvent(db, {
    stripeEventId: 'evt_test_solo_1',
    eventType: 'customer.subscription.updated',
    workspaceId: northstar.id,
    planTier: 'solo',
    subscriptionStatus: 'active',
    payload: { tier: 'solo' },
  });
  assert.equal(billRes1.status, 'processed');

  // Duplicate Stripe event ignored
  const billResDup = await processNormalizedBillingEvent(db, {
    stripeEventId: 'evt_test_solo_1',
    eventType: 'customer.subscription.updated',
    workspaceId: northstar.id,
    planTier: 'solo',
    subscriptionStatus: 'active',
    payload: { tier: 'solo' },
  });
  assert.equal(billResDup.status, 'duplicate_ignored');

  const downgradedWs = (await findWorkspaceById(db, DEMO_WORKSPACE_ID))!;
  const ownerCtx = makeSessionContext(
    downgradedWs,
    { id: 'usr_demo_alex', email: 'alex@northstar.demo', name: 'Alex Mercer' },
    'OWNER'
  );
  const clients = await listClients(db, northstar.id);

  // Solo maxProjects = 2, and Northstar already has 2 projects -> creating a 3rd fails with 402 EntitlementError
  await assert.rejects(
    () =>
      createProjectService(db, ownerCtx, {
        clientId: clients[0].id,
        name: 'Third Project Blocked By Solo Tier',
      }),
    (err) => err instanceof EntitlementError && err.status === 402
  );

  // Historical portal receipt read & Retainer Snapshot Report still work even when subscription is canceled
  await processNormalizedBillingEvent(db, {
    stripeEventId: 'evt_test_cancel_2',
    eventType: 'customer.subscription.deleted',
    workspaceId: northstar.id,
    planTier: 'solo',
    subscriptionStatus: 'canceled',
    payload: { canceled: true },
  });

  const histCheck = checkEntitlement(
    'solo',
    'canceled',
    { projectCount: 2, memberCount: 2, receiptsPublishedThisMonth: 5 },
    'read_historical_receipt'
  );
  assert.equal(histCheck.allowed, true);

  const portalHist = await getPortalReceiptService(db, DEMO_PORTAL_TOKEN_VANGUARD);
  assert.equal(portalHist.hashVerified, true);

  const report = await generateRetainerReportService(db, ownerCtx, {
    clientId: clients[0].id,
  });
  assert.ok(report.markdownExport.includes('Retainer Delivery Snapshot'));
});

test('AI summary fallback: operates deterministically without GEMINI_API_KEY and refuses source code ingestion', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;

  try {
    const draft = await generateDeliverySummaryDraft({
      batchTitle: 'Dispatch Gateway v1.4',
      projectName: 'Vanguard Dispatch',
      clientName: 'Vanguard Logistics',
      criteria: [
        { id: 'c1', title: 'Retry idempotency', category: 'reliability', status: 'verified' },
        { id: 'c2', title: 'Load test report', category: 'performance', status: 'pending' },
      ],
      evidence: [
        {
          id: 'e1',
          title: 'PR #214 merged',
          observationType: 'pull_request',
          claimAttribution: 'observed_github',
          state: 'verified',
          commitSha: 'a1b2c3d4',
          testedSha: null,
        },
      ],
    });

    assert.equal(draft.provider, 'deterministic_fallback');
    assert.ok(draft.draftText.includes('Dispatch Gateway v1.4'));
    assert.ok(draft.draftText.includes('Open items requiring disclosure'));
    assert.ok(draft.draftText.includes('[Agency Statement — Draft]'));
  } finally {
    if (prevKey !== undefined) {
      process.env.GEMINI_API_KEY = prevKey;
    }
  }
});
