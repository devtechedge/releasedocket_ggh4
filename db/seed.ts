import type { DbExecutor } from '@/db/client';
import { assessBatchGaps, computeSnapshotHash } from '@/domain/evidence';
import { hashPassword, hashToken } from '@/domain/security';
import type { CanonicalReceiptSnapshot } from '@/domain/types';
import {
  buildDemoGitHubRepositories,
  REQUIRED_GITHUB_APP_PERMISSIONS,
} from '@/integrations/github';
import { recordAuditEvent } from '@/repositories/audit.repo';
import {
  createMembership,
  createUser,
  createWorkspace,
  findWorkspaceById,
} from '@/repositories/auth.repo';
import {
  createClient,
  createProject,
  mapRepoToProject,
} from '@/repositories/crm.repo';
import {
  addClientComment,
  createBatch,
  createCriterion,
  createEvidenceItem,
  createPortalToken,
  insertReceiptVersion,
  linkCriterionEvidence,
  recordClientAction,
  updateBatch,
  updateReceiptVersionStatus,
} from '@/repositories/delivery.repo';
import {
  upsertInstallation,
  upsertRepository,
  upsertSourceObservation,
} from '@/repositories/github.repo';

export const DEMO_WORKSPACE_ID = 'ws_demo_northstar';
export const DEMO_SECOND_WORKSPACE_ID = 'ws_demo_meridian';
export const DEMO_OWNER_EMAIL = 'alex@northstar.demo';
export const DEMO_OWNER_PASSWORD = 'demo-agency-pass';
export const DEMO_PORTAL_TOKEN_VANGUARD = 'demo-vanguard-v1-token';
export const DEMO_PORTAL_TOKEN_HELIOS_CHANGES = 'demo-helios-v1-token';
export const DEMO_PORTAL_TOKEN_TREASURY_ACCEPTED = 'demo-treasury-v1-token';

export async function ensureDemoSeeded(db: DbExecutor): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    return;
  }

  const existing = await findWorkspaceById(db, DEMO_WORKSPACE_ID);
  if (existing) {
    return;
  }

  await seedDemoData(db);
}

export async function seedDemoData(db: DbExecutor): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo seeding is strictly disabled in production.');
  }

  const demoPasswordHash = hashPassword(DEMO_OWNER_PASSWORD);
  const meridianPasswordHash = hashPassword('demo-meridian-pass');

  await db.transaction(async (tx) => {
    // 1. Primary Synthetic Agency Workspace: Northstar Digital Studio
    const northstar = await createWorkspace(tx, {
      id: DEMO_WORKSPACE_ID,
      slug: 'northstar-digital-demo',
      name: 'Northstar Digital Studio',
      agencyTagline: 'Custom product engineering & AI workflow automation',
      brandAccentColor: '#1E40AF',
      isDemo: true,
      planTier: 'agency',
      subscriptionStatus: 'active',
    });

    const alex = await createUser(tx, {
      id: 'usr_demo_alex',
      email: DEMO_OWNER_EMAIL,
      name: 'Alex Mercer',
      passwordHash: demoPasswordHash,
    });
    const elena = await createUser(tx, {
      id: 'usr_demo_elena',
      email: 'elena@northstar.demo',
      name: 'Elena Rostova',
      passwordHash: demoPasswordHash,
    });

    await createMembership(tx, {
      workspaceId: northstar.id,
      userId: alex.id,
      role: 'OWNER',
    });
    await createMembership(tx, {
      workspaceId: northstar.id,
      userId: elena.id,
      role: 'DELIVERY_LEAD',
    });

    // 2. Second Isolated Tenant Workspace (for tenancy tests)
    const meridian = await createWorkspace(tx, {
      id: DEMO_SECOND_WORKSPACE_ID,
      slug: 'meridian-labs-demo',
      name: 'Meridian Labs',
      agencyTagline: 'Embedded robotics & firmware consultancy',
      brandAccentColor: '#0F172A',
      isDemo: true,
      planTier: 'studio',
      subscriptionStatus: 'active',
    });
    const maya = await createUser(tx, {
      id: 'usr_demo_maya',
      email: 'maya@meridian.demo',
      name: 'Maya Lin',
      passwordHash: meridianPasswordHash,
    });
    await createMembership(tx, {
      workspaceId: meridian.id,
      userId: maya.id,
      role: 'OWNER',
    });
    const apexClient = await createClient(tx, {
      id: 'cli_meridian_apex',
      workspaceId: meridian.id,
      name: 'Apex Robotics',
      contactName: 'Victor Chen',
      contactEmail: 'vchen@apex-robotics.example',
      retainerMonthlyUsd: 9500,
    });
    await createProject(tx, {
      id: 'prj_meridian_nav',
      workspaceId: meridian.id,
      clientId: apexClient.id,
      name: 'Autonomous Warehouse Pathing',
      slug: 'warehouse-pathing',
      summary: 'Private tenant B project used for isolation verification.',
    });

    // 3. Two Clients & Three Projects in Northstar
    const vanguard = await createClient(tx, {
      id: 'cli_demo_vanguard',
      workspaceId: northstar.id,
      name: 'Vanguard Logistics',
      contactName: 'Sarah Jenkins',
      contactEmail: 's.jenkins@vanguard-freight.example',
      retainerMonthlyUsd: 8500,
      notes: 'Bi-weekly Friday delivery receipts required by VP Ops.',
    });
    const helios = await createClient(tx, {
      id: 'cli_demo_helios',
      workspaceId: northstar.id,
      name: 'Helios FinTech',
      contactName: 'David Park',
      contactEmail: 'dpark@helios-fintech.example',
      retainerMonthlyUsd: 12000,
      notes: 'SOC-ready evidence trails on every production release.',
    });

    const freightProject = await createProject(tx, {
      id: 'prj_demo_freight',
      workspaceId: northstar.id,
      clientId: vanguard.id,
      name: 'Freight Dispatch Portal',
      slug: 'freight-dispatch-portal',
      summary: 'Carrier manifest ingestion, SLA tracking, and retry queues.',
      environmentUrl: 'https://vanguard-portal.example',
    });
    const invoiceProject = await createProject(tx, {
      id: 'prj_demo_invoice',
      workspaceId: northstar.id,
      clientId: helios.id,
      name: 'AI Invoice Triage Agent',
      slug: 'ai-invoice-triage-agent',
      summary: 'Structured VAT extraction and human-in-the-loop review queue.',
      environmentUrl: 'https://triage-staging.helios.example',
    });
    const treasuryProject = await createProject(tx, {
      id: 'prj_demo_treasury',
      workspaceId: northstar.id,
      clientId: helios.id,
      name: 'Treasury Reconciliation API',
      slug: 'treasury-reconciliation-api',
      summary: 'Idempotent ledger reconciliation endpoints and audit exports.',
      environmentUrl: 'https://treasury.helios.example',
    });

    // 4. Demo Synthetic GitHub App Installation + Repos + Observations
    const installation = await upsertInstallation(tx, {
      id: 'ghi_demo_northstar',
      workspaceId: northstar.id,
      installationExternalId: `demo-inst-${northstar.id}`,
      accountLogin: 'northstar-studio (DEMO)',
      mode: 'demo_synthetic',
      permissions: { ...REQUIRED_GITHUB_APP_PERMISSIONS },
      healthStatus: 'healthy',
    });

    const repoTemplates = buildDemoGitHubRepositories();
    const projectIdsByRepo = [
      freightProject.id,
      invoiceProject.id,
      treasuryProject.id,
    ];
    const observationMap = new Map<string, string>();

    for (let i = 0; i < repoTemplates.length; i += 1) {
      const tpl = repoTemplates[i];
      const repo = await upsertRepository(tx, {
        id: `repo_demo_${i + 1}`,
        workspaceId: northstar.id,
        installationId: installation.id,
        repoExternalId: `${tpl.repoExternalId}-${northstar.id}`,
        fullName: tpl.fullName,
        defaultBranch: tpl.defaultBranch,
        isPrivate: true,
        mode: 'demo_synthetic',
      });
      await mapRepoToProject(tx, {
        workspaceId: northstar.id,
        projectId: projectIdsByRepo[i],
        repositoryId: repo.id,
      });

      for (const obs of tpl.observations) {
        const saved = await upsertSourceObservation(tx, {
          workspaceId: northstar.id,
          repositoryId: repo.id,
          repoFullName: repo.fullName,
          observationType: obs.observationType,
          sourceOrigin: 'demo_synthetic',
          externalId: obs.externalId,
          externalUrl: obs.externalUrl,
          title: obs.title,
          actor: obs.actor,
          headSha: obs.headSha,
          mergeCommitSha: obs.mergeCommitSha,
          testedSha: obs.testedSha,
          rawState: obs.rawState,
          rawConclusion: obs.rawConclusion,
          environmentName: obs.environmentName,
          observedAt: obs.observedAt,
          metadata: obs.metadata,
        });
        observationMap.set(obs.externalId, saved.id);
      }
    }

    // 5. Batch 1: Vanguard Freight — Published v1 with disclosed gaps (stale CI on PR #145)
    const { id: batch1Id } = await createBatch(tx, {
      id: 'bat_demo_vanguard_s2',
      workspaceId: northstar.id,
      projectId: freightProject.id,
      title: 'Sprint 14 — Manifest CSV Importer & Carrier Retry Queue',
      summary:
        'Delivered multi-leg manifest CSV ingestion (PR #142) with verified CI and production deploy, plus carrier webhook retry queue (PR #145) awaiting fresh CI run on latest commit.',
      internalNotes:
        'Internal note (never exposed to client): Remind Elena to re-trigger CI on PR #145 merge commit c4d8e91 before Sprint 15.',
      limitationsNote:
        'PR #145 CI suite ran on superseded SHA a1100ff prior to final force-push c4d8e91 and staging deploy has not been promoted to production.',
      targetDate: '2026-11-15',
      targetSha: 'c4d8e9107a22b19f0044',
      createdByUserId: alex.id,
    });

    const b1c1 = await createCriterion(tx, {
      id: 'cri_demo_b1_1',
      workspaceId: northstar.id,
      batchId: batch1Id,
      title: 'Multi-leg manifest CSV import rejects malformed rows with row numbers',
      description: 'Validates carrier codes, ISO dates, and leg weights before persisting.',
      category: 'feature',
      priority: 'critical',
      expectedEvidence: 'Merged PR #142, passing CI check on merge SHA, production deploy.',
      status: 'verified',
      sortOrder: 0,
    });
    const b1c2 = await createCriterion(tx, {
      id: 'cri_demo_b1_2',
      workspaceId: northstar.id,
      batchId: batch1Id,
      title: 'Carrier webhook retry queue routes failures to dead-letter alert',
      description: 'Exponential backoff up to 5 retries before Slack/email alert.',
      category: 'integration',
      priority: 'high',
      expectedEvidence: 'Merged PR #145, passing CI on exact merge SHA, staging deploy.',
      status: 'stale',
      sortOrder: 1,
    });

    const b1e1 = await createEvidenceItem(tx, {
      id: 'ev_demo_b1_1',
      workspaceId: northstar.id,
      batchId: batch1Id,
      sourceObservationId: observationMap.get('demo-pr-142'),
      title: 'PR #142: Multi-leg manifest CSV importer with row-level validation',
      observationType: 'pull_request',
      sourceOrigin: 'demo_synthetic',
      claimAttribution: 'observed_github',
      state: 'verified',
      stateReason: 'PR merged at 9f3a1c2 (proves merge only; not feature acceptance).',
      repoFullName: 'northstar-studio/vanguard-freight-portal',
      externalId: 'demo-pr-142',
      externalUrl: 'https://github.com/northstar-studio/vanguard-freight-portal/pull/142',
      commitSha: '9f3a1c2e8b41d0f3a91c',
      testedSha: null,
      actor: 'elena-rostova',
      observedAt: '2026-11-12T17:40:00.000Z',
      createdByUserId: alex.id,
    });
    const b1e2 = await createEvidenceItem(tx, {
      id: 'ev_demo_b1_2',
      workspaceId: northstar.id,
      batchId: batch1Id,
      sourceObservationId: observationMap.get('demo-chk-142-ci'),
      title: 'CI / Vitest + Typecheck Suite (PR #142)',
      observationType: 'check_run',
      sourceOrigin: 'demo_synthetic',
      claimAttribution: 'observed_github',
      state: 'verified',
      stateReason: 'CI passed on exact SHA 9f3a1c2.',
      repoFullName: 'northstar-studio/vanguard-freight-portal',
      externalId: 'demo-chk-142-ci',
      externalUrl: 'https://github.com/northstar-studio/vanguard-freight-portal/actions/runs/882104',
      commitSha: '9f3a1c2e8b41d0f3a91c',
      testedSha: '9f3a1c2e8b41d0f3a91c',
      actor: 'github-actions[bot]',
      observedAt: '2026-11-12T17:38:00.000Z',
      createdByUserId: alex.id,
    });
    const b1e3 = await createEvidenceItem(tx, {
      id: 'ev_demo_b1_3',
      workspaceId: northstar.id,
      batchId: batch1Id,
      sourceObservationId: observationMap.get('demo-dep-142-prod'),
      title: 'Production deployment (vanguard-portal.example)',
      observationType: 'deployment_status',
      sourceOrigin: 'demo_synthetic',
      claimAttribution: 'observed_github',
      state: 'verified',
      stateReason: 'Deployment succeeded for exact SHA 9f3a1c2 (infrastructure metadata only).',
      repoFullName: 'northstar-studio/vanguard-freight-portal',
      externalId: 'demo-dep-142-prod',
      externalUrl: 'https://github.com/northstar-studio/vanguard-freight-portal/deployments',
      commitSha: '9f3a1c2e8b41d0f3a91c',
      testedSha: '9f3a1c2e8b41d0f3a91c',
      actor: 'deploy-bot',
      observedAt: '2026-11-12T18:05:00.000Z',
      createdByUserId: alex.id,
    });
    const b1e4 = await createEvidenceItem(tx, {
      id: 'ev_demo_b1_4',
      workspaceId: northstar.id,
      batchId: batch1Id,
      sourceObservationId: observationMap.get('demo-chk-145-stale'),
      title: 'CI / Integration Suite (PR #145 earlier SHA)',
      observationType: 'check_run',
      sourceOrigin: 'demo_synthetic',
      claimAttribution: 'observed_github',
      state: 'stale',
      stateReason: 'CI ran on a1100ff, which does not match current target SHA c4d8e91.',
      repoFullName: 'northstar-studio/vanguard-freight-portal',
      externalId: 'demo-chk-145-stale',
      externalUrl: 'https://github.com/northstar-studio/vanguard-freight-portal/actions/runs/884019',
      commitSha: 'c4d8e9107a22b19f0044',
      testedSha: 'a1100ff2319c882011bb',
      actor: 'github-actions[bot]',
      observedAt: '2026-11-14T14:22:00.000Z',
      createdByUserId: alex.id,
    });

    await linkCriterionEvidence(tx, { workspaceId: northstar.id, criterionId: b1c1.id, evidenceId: b1e1.id });
    await linkCriterionEvidence(tx, { workspaceId: northstar.id, criterionId: b1c1.id, evidenceId: b1e2.id });
    await linkCriterionEvidence(tx, { workspaceId: northstar.id, criterionId: b1c1.id, evidenceId: b1e3.id });
    await linkCriterionEvidence(tx, { workspaceId: northstar.id, criterionId: b1c2.id, evidenceId: b1e4.id });

    const b1Criteria = [b1c1, b1c2];
    const b1Evidence = [b1e1, b1e2, b1e3, b1e4];
    const b1Mappings = [
      { criterionId: b1c1.id, evidenceId: b1e1.id },
      { criterionId: b1c1.id, evidenceId: b1e2.id },
      { criterionId: b1c1.id, evidenceId: b1e3.id },
      { criterionId: b1c2.id, evidenceId: b1e4.id },
    ];
    const b1Gaps = assessBatchGaps(b1Criteria, b1Mappings, b1Evidence);

    const b1Snapshot: CanonicalReceiptSnapshot = {
      schemaVersion: 1,
      workspaceId: northstar.id,
      workspaceName: northstar.name,
      brandAccentColor: northstar.brandAccentColor,
      clientId: vanguard.id,
      clientName: vanguard.name,
      projectId: freightProject.id,
      projectName: freightProject.name,
      batchId: batch1Id,
      versionNumber: 1,
      title: 'Sprint 14 — Manifest CSV Importer & Carrier Retry Queue',
      summary:
        'Delivered multi-leg manifest CSV ingestion (PR #142) with verified CI and production deploy, plus carrier webhook retry queue (PR #145) awaiting fresh CI run on latest commit.',
      limitationsNote:
        'PR #145 CI suite ran on superseded SHA a1100ff prior to final force-push c4d8e91 and staging deploy has not been promoted to production.',
      targetDate: '2026-11-15',
      publishedAt: '2026-11-15T16:00:00.000Z',
      publishedByName: alex.name,
      hasGaps: b1Gaps.hasGaps,
      verificationSummaryLabel: b1Gaps.verificationSummaryLabel,
      gaps: b1Gaps.gaps,
      criteria: b1Criteria.map((c) => ({
        criterionId: c.id,
        title: c.title,
        description: c.description,
        category: c.category,
        priority: c.priority,
        expectedEvidence: c.expectedEvidence,
        status: c.status,
        evidenceIds: b1Mappings.filter((m) => m.criterionId === c.id).map((m) => m.evidenceId),
        hasIndependentObservation: true,
      })),
      evidence: b1Evidence.map((e) => ({
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
        observedAt: e.observedAt,
        note: e.note,
      })),
      aiProvenance: { usedAiDraft: false, approvedByName: null, approvedAt: null },
    };

    const rec1 = await insertReceiptVersion(tx, {
      id: 'rec_demo_vanguard_v1',
      workspaceId: northstar.id,
      batchId: batch1Id,
      versionNumber: 1,
      hasGaps: b1Gaps.hasGaps,
      gapDisclosureAck: true,
      snapshot: b1Snapshot,
      snapshotHash: computeSnapshotHash(b1Snapshot),
      publishedByUserId: alex.id,
    });
    await updateBatch(tx, northstar.id, batch1Id, { status: 'published' });

    await createPortalToken(tx, {
      id: 'ptk_demo_vanguard_v1',
      workspaceId: northstar.id,
      receiptVersionId: rec1.id,
      recipientEmail: vanguard.contactEmail,
      tokenHash: hashToken(DEMO_PORTAL_TOKEN_VANGUARD),
      otpRequired: false,
      otpCodeHash: null,
      expiresAt: '2027-01-01T00:00:00.000Z',
    });

    // 6. Batch 2: Helios AI Invoice Triage — Changes Requested (failing CI disclosed)
    const { id: batch2Id } = await createBatch(tx, {
      id: 'bat_demo_helios_triage',
      workspaceId: northstar.id,
      projectId: invoiceProject.id,
      title: 'VAT Extraction Fallback & Confidence Thresholds',
      summary:
        'Added structured vendor VAT extraction rules (PR #38) deployed to staging; EU reverse-charge regression fixture failed CI and requires remediation.',
      internalNotes: 'Need sample German reverse-charge PDF from David Park.',
      limitationsNote: 'CI regression fixture eu-reverse-charge-pdf currently failing.',
      targetDate: '2026-11-14',
      targetSha: '77bc1209fe4a812c3310',
      createdByUserId: elena.id,
    });

    const b2c1 = await createCriterion(tx, {
      id: 'cri_demo_b2_1',
      workspaceId: northstar.id,
      batchId: batch2Id,
      title: 'EU reverse-charge VAT PDFs route to human review below 0.85 confidence',
      description: 'Prevents automatic ledger posting on ambiguous reverse-charge invoices.',
      category: 'automation',
      priority: 'critical',
      expectedEvidence: 'Passing CI regression fixture + staging validation.',
      status: 'failed',
      sortOrder: 0,
    });
    const b2e1 = await createEvidenceItem(tx, {
      id: 'ev_demo_b2_1',
      workspaceId: northstar.id,
      batchId: batch2Id,
      sourceObservationId: observationMap.get('demo-chk-38-fail'),
      title: 'CI / Extraction Regression Fixture',
      observationType: 'check_run',
      sourceOrigin: 'demo_synthetic',
      claimAttribution: 'observed_github',
      state: 'failed',
      stateReason: "CI concluded 'failure' on SHA 77bc120.",
      repoFullName: 'northstar-studio/helios-invoice-triage',
      externalId: 'demo-chk-38-fail',
      externalUrl: 'https://github.com/northstar-studio/helios-invoice-triage/actions/runs/770122',
      commitSha: '77bc1209fe4a812c3310',
      testedSha: '77bc1209fe4a812c3310',
      actor: 'github-actions[bot]',
      observedAt: '2026-11-13T11:25:00.000Z',
      createdByUserId: elena.id,
    });
    await linkCriterionEvidence(tx, { workspaceId: northstar.id, criterionId: b2c1.id, evidenceId: b2e1.id });
    const b2Gaps = assessBatchGaps([b2c1], [{ criterionId: b2c1.id, evidenceId: b2e1.id }], [b2e1]);

    const b2Snapshot: CanonicalReceiptSnapshot = {
      schemaVersion: 1,
      workspaceId: northstar.id,
      workspaceName: northstar.name,
      brandAccentColor: northstar.brandAccentColor,
      clientId: helios.id,
      clientName: helios.name,
      projectId: invoiceProject.id,
      projectName: invoiceProject.name,
      batchId: batch2Id,
      versionNumber: 1,
      title: 'VAT Extraction Fallback & Confidence Thresholds',
      summary:
        'Added structured vendor VAT extraction rules (PR #38) deployed to staging; EU reverse-charge regression fixture failed CI and requires remediation.',
      limitationsNote: 'CI regression fixture eu-reverse-charge-pdf currently failing.',
      targetDate: '2026-11-14',
      publishedAt: '2026-11-14T10:00:00.000Z',
      publishedByName: elena.name,
      hasGaps: b2Gaps.hasGaps,
      verificationSummaryLabel: b2Gaps.verificationSummaryLabel,
      gaps: b2Gaps.gaps,
      criteria: [
        {
          criterionId: b2c1.id,
          title: b2c1.title,
          description: b2c1.description,
          category: b2c1.category,
          priority: b2c1.priority,
          expectedEvidence: b2c1.expectedEvidence,
          status: b2c1.status,
          evidenceIds: [b2e1.id],
          hasIndependentObservation: true,
        },
      ],
      evidence: [
        {
          evidenceId: b2e1.id,
          title: b2e1.title,
          observationType: b2e1.observationType,
          sourceOrigin: b2e1.sourceOrigin,
          claimAttribution: b2e1.claimAttribution,
          state: b2e1.state,
          stateReason: b2e1.stateReason,
          repoFullName: b2e1.repoFullName,
          externalId: b2e1.externalId,
          externalUrl: b2e1.externalUrl,
          commitSha: b2e1.commitSha,
          testedSha: b2e1.testedSha,
          actor: b2e1.actor,
          observedAt: b2e1.observedAt,
          note: b2e1.note,
        },
      ],
      aiProvenance: { usedAiDraft: false, approvedByName: null, approvedAt: null },
    };

    const rec2 = await insertReceiptVersion(tx, {
      id: 'rec_demo_helios_v1',
      workspaceId: northstar.id,
      batchId: batch2Id,
      versionNumber: 1,
      hasGaps: b2Gaps.hasGaps,
      gapDisclosureAck: true,
      snapshot: b2Snapshot,
      snapshotHash: computeSnapshotHash(b2Snapshot),
      publishedByUserId: elena.id,
    });
    await updateReceiptVersionStatus(tx, northstar.id, rec2.id, 'changes_requested');
    await updateBatch(tx, northstar.id, batch2Id, { status: 'changes_requested' });

    const ptk2 = await createPortalToken(tx, {
      id: 'ptk_demo_helios_v1',
      workspaceId: northstar.id,
      receiptVersionId: rec2.id,
      recipientEmail: helios.contactEmail,
      tokenHash: hashToken(DEMO_PORTAL_TOKEN_HELIOS_CHANGES),
      otpRequired: false,
      otpCodeHash: null,
      expiresAt: '2027-01-01T00:00:00.000Z',
    });

    await recordClientAction(tx, {
      workspaceId: northstar.id,
      receiptVersionId: rec2.id,
      portalTokenId: ptk2.id,
      actionType: 'changes_requested',
      actorName: 'David Park',
      actorEmail: helios.contactEmail,
      note: 'Please fix the EU reverse-charge regression before we sign off on production rollout.',
    });
    await addClientComment(tx, {
      workspaceId: northstar.id,
      receiptVersionId: rec2.id,
      authorName: 'David Park',
      authorEmail: helios.contactEmail,
      authorKind: 'client',
      body: 'Please fix the EU reverse-charge regression before we sign off on production rollout.',
    });

    // 7. Batch 3: Helios Treasury Reconciliation v1.4 — Accepted
    const { id: batch3Id } = await createBatch(tx, {
      id: 'bat_demo_treasury_v14',
      workspaceId: northstar.id,
      projectId: treasuryProject.id,
      title: 'Treasury Reconciliation API v1.4.0',
      summary:
        'Shipped idempotent ledger reconciliation endpoint and daily snapshot job (PR #19, Release v1.4.0) with passing contract tests.',
      internalNotes: 'Signed off cleanly by Helios finance controller.',
      limitationsNote: '',
      targetDate: '2026-11-15',
      targetSha: '55e21aa89b0c71e4201f',
      createdByUserId: alex.id,
    });
    const b3c1 = await createCriterion(tx, {
      id: 'cri_demo_b3_1',
      workspaceId: northstar.id,
      batchId: batch3Id,
      title: 'Reconciliation endpoint enforces idempotency keys across duplicate POSTs',
      category: 'security',
      priority: 'critical',
      expectedEvidence: 'Contract test suite pass on merge SHA + Release v1.4.0.',
      status: 'verified',
      sortOrder: 0,
    });
    const b3e1 = await createEvidenceItem(tx, {
      id: 'ev_demo_b3_1',
      workspaceId: northstar.id,
      batchId: batch3Id,
      sourceObservationId: observationMap.get('demo-chk-19-pass'),
      title: 'CI / Ledger Contract Tests',
      observationType: 'check_run',
      sourceOrigin: 'demo_synthetic',
      claimAttribution: 'observed_github',
      state: 'verified',
      stateReason: 'CI passed on exact SHA 55e21aa.',
      repoFullName: 'northstar-studio/helios-treasury-sync',
      externalId: 'demo-chk-19-pass',
      externalUrl: 'https://github.com/northstar-studio/helios-treasury-sync/actions/runs/619201',
      commitSha: '55e21aa89b0c71e4201f',
      testedSha: '55e21aa89b0c71e4201f',
      actor: 'github-actions[bot]',
      observedAt: '2026-11-15T09:12:00.000Z',
      createdByUserId: alex.id,
    });
    await linkCriterionEvidence(tx, { workspaceId: northstar.id, criterionId: b3c1.id, evidenceId: b3e1.id });
    const b3Gaps = assessBatchGaps([b3c1], [{ criterionId: b3c1.id, evidenceId: b3e1.id }], [b3e1]);

    const b3Snapshot: CanonicalReceiptSnapshot = {
      schemaVersion: 1,
      workspaceId: northstar.id,
      workspaceName: northstar.name,
      brandAccentColor: northstar.brandAccentColor,
      clientId: helios.id,
      clientName: helios.name,
      projectId: treasuryProject.id,
      projectName: treasuryProject.name,
      batchId: batch3Id,
      versionNumber: 1,
      title: 'Treasury Reconciliation API v1.4.0',
      summary:
        'Shipped idempotent ledger reconciliation endpoint and daily snapshot job (PR #19, Release v1.4.0) with passing contract tests.',
      limitationsNote: '',
      targetDate: '2026-11-15',
      publishedAt: '2026-11-15T10:00:00.000Z',
      publishedByName: alex.name,
      hasGaps: b3Gaps.hasGaps,
      verificationSummaryLabel: b3Gaps.verificationSummaryLabel,
      gaps: b3Gaps.gaps,
      criteria: [
        {
          criterionId: b3c1.id,
          title: b3c1.title,
          description: b3c1.description,
          category: b3c1.category,
          priority: b3c1.priority,
          expectedEvidence: b3c1.expectedEvidence,
          status: b3c1.status,
          evidenceIds: [b3e1.id],
          hasIndependentObservation: true,
        },
      ],
      evidence: [
        {
          evidenceId: b3e1.id,
          title: b3e1.title,
          observationType: b3e1.observationType,
          sourceOrigin: b3e1.sourceOrigin,
          claimAttribution: b3e1.claimAttribution,
          state: b3e1.state,
          stateReason: b3e1.stateReason,
          repoFullName: b3e1.repoFullName,
          externalId: b3e1.externalId,
          externalUrl: b3e1.externalUrl,
          commitSha: b3e1.commitSha,
          testedSha: b3e1.testedSha,
          actor: b3e1.actor,
          observedAt: b3e1.observedAt,
          note: b3e1.note,
        },
      ],
      aiProvenance: { usedAiDraft: false, approvedByName: null, approvedAt: null },
    };

    const rec3 = await insertReceiptVersion(tx, {
      id: 'rec_demo_treasury_v1',
      workspaceId: northstar.id,
      batchId: batch3Id,
      versionNumber: 1,
      hasGaps: b3Gaps.hasGaps,
      gapDisclosureAck: true,
      snapshot: b3Snapshot,
      snapshotHash: computeSnapshotHash(b3Snapshot),
      publishedByUserId: alex.id,
    });
    await updateReceiptVersionStatus(tx, northstar.id, rec3.id, 'accepted');
    await updateBatch(tx, northstar.id, batch3Id, { status: 'accepted' });

    const ptk3 = await createPortalToken(tx, {
      id: 'ptk_demo_treasury_v1',
      workspaceId: northstar.id,
      receiptVersionId: rec3.id,
      recipientEmail: helios.contactEmail,
      tokenHash: hashToken(DEMO_PORTAL_TOKEN_TREASURY_ACCEPTED),
      otpRequired: false,
      otpCodeHash: null,
      expiresAt: '2027-01-01T00:00:00.000Z',
    });

    await recordClientAction(tx, {
      workspaceId: northstar.id,
      receiptVersionId: rec3.id,
      portalTokenId: ptk3.id,
      actionType: 'accepted',
      actorName: 'David Park',
      actorEmail: helios.contactEmail,
      note: 'Verified against sandbox treasury ledger and accepted for billing milestone.',
    });

    // 8. Audit Events
    await recordAuditEvent(tx, {
      workspaceId: northstar.id,
      actorType: 'user',
      actorId: alex.id,
      actorLabel: alex.email,
      eventType: 'receipt.published',
      resourceType: 'receipt_version',
      resourceId: rec1.id,
      metadata: { versionNumber: 1, hasGaps: true, demoSeed: true },
    });
    await recordAuditEvent(tx, {
      workspaceId: northstar.id,
      actorType: 'client_portal',
      actorId: ptk2.id,
      actorLabel: helios.contactEmail,
      eventType: 'portal.client_changes_requested',
      resourceType: 'receipt_version',
      resourceId: rec2.id,
      metadata: { versionNumber: 1, demoSeed: true },
    });
    await recordAuditEvent(tx, {
      workspaceId: northstar.id,
      actorType: 'client_portal',
      actorId: ptk3.id,
      actorLabel: helios.contactEmail,
      eventType: 'portal.client_accepted',
      resourceType: 'receipt_version',
      resourceId: rec3.id,
      metadata: { versionNumber: 1, demoSeed: true },
    });
  });
}
