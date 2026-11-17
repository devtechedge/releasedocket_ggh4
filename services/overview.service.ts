import type { DbExecutor } from '@/db/client';
import { assertPermission } from '@/domain/rbac';
import type { SessionWithContext } from '@/repositories/auth.repo';
import { getWorkspaceUsage, listClients, listProjects } from '@/repositories/crm.repo';
import {
  listAllWorkspaceReceipts,
  listBatches,
  listEvidenceByBatch,
} from '@/repositories/delivery.repo';
import { listInstallations } from '@/repositories/github.repo';

export async function getAgencyOverviewService(
  db: DbExecutor,
  ctx: SessionWithContext
) {
  assertPermission(ctx.role, 'workspace:read');
  const [clients, projects, batches, receipts, installations, usage] =
    await Promise.all([
      listClients(db, ctx.workspace.id),
      listProjects(db, ctx.workspace.id),
      listBatches(db, ctx.workspace.id),
      listAllWorkspaceReceipts(db, ctx.workspace.id),
      listInstallations(db, ctx.workspace.id),
      getWorkspaceUsage(db, ctx.workspace.id),
    ]);

  const awaitingPublication = batches.filter((b) => b.status === 'draft');
  const pendingSignOffs = receipts.filter(
    (r) => r.status === 'published' || r.status === 'changes_requested'
  );

  const staleOrFailedEvidence: Array<{
    batchId: string;
    batchTitle: string;
    evidenceTitle: string;
    state: string;
    reason: string;
  }> = [];

  for (const batch of batches.slice(0, 15)) {
    const evList = await listEvidenceByBatch(db, ctx.workspace.id, batch.id);
    for (const ev of evList) {
      if (ev.state === 'stale' || ev.state === 'failed') {
        staleOrFailedEvidence.push({
          batchId: batch.id,
          batchTitle: batch.title,
          evidenceTitle: ev.title,
          state: ev.state,
          reason: ev.stateReason,
        });
      }
    }
  }

  return {
    workspace: ctx.workspace,
    role: ctx.role,
    usage,
    counts: {
      clients: clients.length,
      projects: projects.length,
      awaitingPublication: awaitingPublication.length,
      pendingSignOffs: pendingSignOffs.length,
      staleOrFailedEvidence: staleOrFailedEvidence.length,
      installations: installations.length,
    },
    awaitingPublication,
    pendingSignOffs: pendingSignOffs.map((r) => ({
      receiptId: r.id,
      batchId: r.batchId,
      title: r.snapshot.title,
      clientName: r.snapshot.clientName,
      projectName: r.snapshot.projectName,
      versionNumber: r.versionNumber,
      status: r.status,
      hasGaps: r.hasGaps,
      publishedAt: r.publishedAt,
    })),
    staleOrFailedEvidence,
    installations,
  };
}
