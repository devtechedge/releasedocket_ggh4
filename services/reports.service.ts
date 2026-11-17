import type { DbExecutor } from '@/db/client';
import { assertPermission } from '@/domain/rbac';
import type { SessionWithContext } from '@/repositories/auth.repo';
import {
  listClients,
  listProjectRepoMappings,
  listProjects,
} from '@/repositories/crm.repo';
import {
  listAllWorkspaceReceipts,
  listBatches,
  listCriteriaByBatch,
  listEvidenceByBatch,
} from '@/repositories/delivery.repo';
import { listSourceObservations } from '@/repositories/github.repo';

export interface RetainerReportSnapshot {
  generatedAt: string;
  workspaceName: string;
  isDemoWorkspace: boolean;
  clientFilterId: string | null;
  clientFilterName: string | null;
  summary: {
    receiptsPublished: number;
    receiptsAccepted: number;
    receiptsChangesRequested: number;
    receiptsPendingSignOff: number;
    draftBatches: number;
    unresolvedCriteriaCount: number;
    evidenceGapReceiptsCount: number;
    githubObservationsCount: number;
    agencyStatementsCount: number;
  };
  receiptRows: Array<{
    receiptId: string;
    batchId: string;
    title: string;
    clientName: string;
    projectName: string;
    versionNumber: number;
    status: string;
    hasGaps: boolean;
    publishedAt: string;
    snapshotHash: string;
  }>;
  unresolvedCriteria: Array<{
    batchId: string;
    batchTitle: string;
    projectName: string;
    criterionTitle: string;
    priority: string;
    status: string;
  }>;
  githubFacts: Array<{
    id: string;
    repoFullName: string;
    observationType: string;
    sourceOrigin: string;
    title: string;
    sha: string | null;
    rawState: string;
    observedAt: string;
  }>;
  agencyStatements: Array<{
    batchTitle: string;
    title: string;
    claimAttribution: string;
    note: string;
    observedAt: string;
  }>;
  disclaimer: string;
  markdownExport: string;
}

export async function generateRetainerReportService(
  db: DbExecutor,
  ctx: SessionWithContext,
  options?: { clientId?: string | null }
): Promise<RetainerReportSnapshot> {
  assertPermission(ctx.role, 'workspace:read');
  const clientFilterId = options?.clientId?.trim() || null;

  const [clients, projects, repoMappings, batches, allReceipts, observations] =
    await Promise.all([
      listClients(db, ctx.workspace.id),
      listProjects(db, ctx.workspace.id),
      listProjectRepoMappings(db, ctx.workspace.id),
      listBatches(db, ctx.workspace.id),
      listAllWorkspaceReceipts(db, ctx.workspace.id),
      listSourceObservations(db, ctx.workspace.id, { limit: 150 }),
    ]);

  const selectedClient = clientFilterId
    ? clients.find((c) => c.id === clientFilterId) ?? null
    : null;

  const filteredBatches = clientFilterId
    ? batches.filter((b) => b.clientId === clientFilterId)
    : batches;
  const filteredBatchIds = new Set(filteredBatches.map((b) => b.id));
  const filteredReceipts = allReceipts.filter(
    (r) => filteredBatchIds.has(r.batchId) && r.status !== 'superseded'
  );

  const unresolvedCriteria: RetainerReportSnapshot['unresolvedCriteria'] = [];
  const agencyStatements: RetainerReportSnapshot['agencyStatements'] = [];

  for (const batch of filteredBatches) {
    const [criteria, evidence] = await Promise.all([
      listCriteriaByBatch(db, ctx.workspace.id, batch.id),
      listEvidenceByBatch(db, ctx.workspace.id, batch.id),
    ]);
    for (const c of criteria) {
      if (c.status !== 'verified' && c.status !== 'not_applicable') {
        unresolvedCriteria.push({
          batchId: batch.id,
          batchTitle: batch.title,
          projectName: batch.projectName,
          criterionTitle: c.title,
          priority: c.priority,
          status: c.status,
        });
      }
    }
    for (const ev of evidence) {
      if (
        ev.claimAttribution === 'agency_statement' ||
        ev.claimAttribution === 'client_supplied'
      ) {
        agencyStatements.push({
          batchTitle: batch.title,
          title: ev.title,
          claimAttribution: ev.claimAttribution,
          note: ev.note || ev.stateReason,
          observedAt: ev.observedAt,
        });
      }
    }
  }

  const filteredProjectIds = new Set(
    projects
      .filter((p) => !clientFilterId || p.clientId === clientFilterId)
      .map((p) => p.id)
  );
  const filteredRepoIds = new Set(
    repoMappings
      .filter((m) => filteredProjectIds.has(m.projectId))
      .map((m) => m.repositoryId)
  );

  const scopedObservations = clientFilterId
    ? observations.filter((o) => filteredRepoIds.has(o.repositoryId))
    : observations;

  const githubFacts = scopedObservations
    .slice(0, 30)
    .map((o) => ({
      id: o.id,
      repoFullName: o.repoFullName,
      observationType: o.observationType,
      sourceOrigin: o.sourceOrigin,
      title: o.title,
      sha: o.mergeCommitSha || o.headSha || o.testedSha,
      rawState: o.rawConclusion || o.rawState,
      observedAt: o.observedAt,
    }));

  const receiptRows = filteredReceipts.map((r) => ({
    receiptId: r.id,
    batchId: r.batchId,
    title: r.snapshot.title || 'Delivery Receipt',
    clientName: r.snapshot.clientName || '',
    projectName: r.snapshot.projectName || '',
    versionNumber: r.versionNumber,
    status: r.status,
    hasGaps: r.hasGaps,
    publishedAt: r.publishedAt,
    snapshotHash: r.snapshotHash,
  }));

  const summary = {
    receiptsPublished: receiptRows.length,
    receiptsAccepted: receiptRows.filter((r) => r.status === 'accepted').length,
    receiptsChangesRequested: receiptRows.filter(
      (r) => r.status === 'changes_requested'
    ).length,
    receiptsPendingSignOff: receiptRows.filter((r) => r.status === 'published')
      .length,
    draftBatches: filteredBatches.filter((b) => b.status === 'draft').length,
    unresolvedCriteriaCount: unresolvedCriteria.length,
    evidenceGapReceiptsCount: receiptRows.filter((r) => r.hasGaps).length,
    githubObservationsCount:
      filteredProjectIds.size > 0 ? githubFacts.length : 0,
    agencyStatementsCount: agencyStatements.length,
  };

  const generatedAt = new Date().toISOString();
  const disclaimer =
    'Engineering activity (merged PRs, commits, or deployment metadata) is not equivalent to business value or browser acceptance. GitHub observations are strictly separated from agency statements and client sign-offs.';

  const mdLines: string[] = [
    `# Retainer Delivery Snapshot — ${ctx.workspace.name}${ctx.workspace.isDemo ? ' (DEMO DATA)' : ''}`,
    `Generated: ${generatedAt}`,
    `Scope: ${selectedClient ? selectedClient.name : 'All Clients'}`,
    '',
    `> ${disclaimer}`,
    '',
    '## Receipt Summary',
    `- Published Receipts: ${summary.receiptsPublished}`,
    `- Client Accepted: ${summary.receiptsAccepted}`,
    `- Changes Requested: ${summary.receiptsChangesRequested}`,
    `- Pending Client Sign-Off: ${summary.receiptsPendingSignOff}`,
    `- Receipts with Disclosed Evidence Gaps: ${summary.evidenceGapReceiptsCount}`,
    `- Unresolved Acceptance Criteria: ${summary.unresolvedCriteriaCount}`,
    '',
    '## Delivery Receipts',
    ...(receiptRows.length > 0
      ? receiptRows.map(
          (r) =>
            `- **${r.title}** (v${r.versionNumber}) · ${r.clientName} / ${r.projectName} · Status: \`${r.status}\` · Gaps: ${r.hasGaps ? 'Yes (disclosed)' : 'None'} · SHA-256: \`${r.snapshotHash.slice(0, 12)}\``
        )
      : ['- No published receipts in this scope.']),
    '',
    '## Unresolved Criteria & Evidence Gaps',
    ...(unresolvedCriteria.length > 0
      ? unresolvedCriteria.map(
          (u) =>
            `- [${u.priority.toUpperCase()}] **${u.criterionTitle}** (${u.projectName} — ${u.batchTitle}) · Status: \`${u.status}\``
        )
      : ['- No unresolved criteria in active batches.']),
    '',
    '## Observed GitHub Facts (Metadata Only)',
    ...(githubFacts.length > 0
      ? githubFacts.map(
          (g) =>
            `- [${g.sourceOrigin}] ${g.repoFullName} · ${g.observationType}: ${g.title} (${g.rawState}${g.sha ? `, sha ${g.sha.slice(0, 7)}` : ''})`
        )
      : ['- No GitHub observations ingested.']),
    '',
    '## Agency & Client-Supplied Statements (Non-GitHub Claims)',
    ...(agencyStatements.length > 0
      ? agencyStatements.map(
          (s) => `- [${s.claimAttribution}] ${s.batchTitle}: **${s.title}** — ${s.note}`
        )
      : ['- None recorded.']),
  ];

  return {
    generatedAt,
    workspaceName: ctx.workspace.name,
    isDemoWorkspace: ctx.workspace.isDemo,
    clientFilterId,
    clientFilterName: selectedClient?.name ?? null,
    summary,
    receiptRows,
    unresolvedCriteria,
    githubFacts,
    agencyStatements,
    disclaimer,
    markdownExport: mdLines.join('\n'),
  };
}
