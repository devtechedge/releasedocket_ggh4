import { createHash } from 'node:crypto';
import type { DbExecutor } from '@/db/client';
import { assertPermission } from '@/domain/rbac';
import {
  buildDemoGitHubRepositories,
  fetchLiveRepoObservations,
  REQUIRED_GITHUB_APP_PERMISSIONS,
  verifyGitHubWebhookSignature,
  type NormalizedObservationInput,
} from '@/integrations/github';
import { recordAuditEvent } from '@/repositories/audit.repo';
import type { SessionWithContext } from '@/repositories/auth.repo';
import {
  findInstallationByExternalId,
  findRepositoryByFullName,
  findWebhookDeliveryByDeliveryId,
  insertWebhookDelivery,
  listInstallations,
  listRepositories,
  listSourceObservations,
  listWebhookDeliveries,
  updateInstallationHealth,
  upsertInstallation,
  upsertRepository,
  upsertSourceObservation,
} from '@/repositories/github.repo';
import { isDemoModeAllowed } from './auth.service';

export async function listIntegrationsOverviewService(
  db: DbExecutor,
  ctx: SessionWithContext
) {
  assertPermission(ctx.role, 'workspace:read');
  const [installations, repositories, observations, deliveries] =
    await Promise.all([
      listInstallations(db, ctx.workspace.id),
      listRepositories(db, ctx.workspace.id),
      listSourceObservations(db, ctx.workspace.id, { limit: 100 }),
      listWebhookDeliveries(db, ctx.workspace.id, 25),
    ]);
  return { installations, repositories, observations, deliveries };
}

export async function connectDemoGitHubService(
  db: DbExecutor,
  ctx: SessionWithContext
) {
  assertPermission(ctx.role, 'integrations:manage');
  if (!isDemoModeAllowed()) {
    throw new Error('Demo GitHub mode is disabled in production.');
  }

  return db.transaction(async (tx) => {
    const installation = await upsertInstallation(tx, {
      workspaceId: ctx.workspace.id,
      installationExternalId: `demo-inst-${ctx.workspace.id}`,
      accountLogin: 'northstar-studio (DEMO)',
      mode: 'demo_synthetic',
      permissions: { ...REQUIRED_GITHUB_APP_PERMISSIONS },
      healthStatus: 'healthy',
    });

    const templates = buildDemoGitHubRepositories();
    let observationCount = 0;

    for (const tpl of templates) {
      const repo = await upsertRepository(tx, {
        workspaceId: ctx.workspace.id,
        installationId: installation.id,
        repoExternalId: `${tpl.repoExternalId}-${ctx.workspace.id}`,
        fullName: tpl.fullName,
        defaultBranch: tpl.defaultBranch,
        isPrivate: true,
        mode: 'demo_synthetic',
      });

      for (const obs of tpl.observations) {
        await upsertSourceObservation(tx, {
          workspaceId: ctx.workspace.id,
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
        observationCount += 1;
      }
    }

    await recordAuditEvent(tx, {
      workspaceId: ctx.workspace.id,
      actorType: 'user',
      actorId: ctx.user.id,
      actorLabel: ctx.user.email,
      eventType: 'integration.github_demo_connected',
      resourceType: 'github_installation',
      resourceId: installation.id,
      metadata: {
        repositories: templates.length,
        observations: observationCount,
      },
    });

    return { installation, repositoriesCount: templates.length, observationCount };
  });
}

export async function syncInstallationService(
  db: DbExecutor,
  ctx: SessionWithContext,
  installationId: string
): Promise<{ syncedObservations: number; mode: string }> {
  assertPermission(ctx.role, 'integrations:manage');
  const installations = await listInstallations(db, ctx.workspace.id);
  const inst = installations.find((i) => i.id === installationId);
  if (!inst) {
    throw new Error('GitHub installation not found in this workspace.');
  }

  if (inst.mode === 'demo_synthetic') {
    const res = await connectDemoGitHubService(db, ctx);
    return { syncedObservations: res.observationCount, mode: 'demo_synthetic' };
  }

  const repos = (await listRepositories(db, ctx.workspace.id)).filter(
    (r) => r.installationId === inst.id
  );

  let synced = 0;
  try {
    for (const repo of repos) {
      const obsList = await fetchLiveRepoObservations(
        inst.installationExternalId,
        repo.fullName
      );
      for (const obs of obsList) {
        await upsertSourceObservation(db, {
          workspaceId: ctx.workspace.id,
          repositoryId: repo.id,
          repoFullName: repo.fullName,
          observationType: obs.observationType,
          sourceOrigin: 'github_live',
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
        synced += 1;
      }
    }
    await updateInstallationHealth(db, ctx.workspace.id, inst.id, 'healthy', null);
    await recordAuditEvent(db, {
      workspaceId: ctx.workspace.id,
      actorType: 'user',
      actorId: ctx.user.id,
      actorLabel: ctx.user.email,
      eventType: 'integration.github_synced',
      resourceType: 'github_installation',
      resourceId: inst.id,
      metadata: { syncedObservations: synced },
    });
    return { syncedObservations: synced, mode: 'github_live' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'GitHub sync failed';
    await updateInstallationHealth(db, ctx.workspace.id, inst.id, 'degraded', msg);
    throw err;
  }
}

export function normalizeGitHubWebhookEvent(
  eventType: string,
  payload: Record<string, unknown>
): NormalizedObservationInput[] {
  const repo = payload.repository as
    | { full_name?: string; html_url?: string }
    | undefined;
  const repoName = repo?.full_name || 'unknown/repo';
  const repoUrl = repo?.html_url || `https://github.com/${repoName}`;

  if (eventType === 'pull_request') {
    const pr = payload.pull_request as Record<string, unknown> | undefined;
    if (!pr) return [];
    const num = Number(pr.number);
    const mergedAt = pr.merged_at ? String(pr.merged_at) : null;
    const head = (pr.head as Record<string, unknown> | undefined) ?? {};
    const user = (pr.user as Record<string, unknown> | undefined) ?? {};
    return [
      {
        observationType: 'pull_request',
        externalId: `pr-${repoName}-${num}`,
        externalUrl: String(pr.html_url || `${repoUrl}/pull/${num}`),
        title: `PR #${num}: ${String(pr.title || 'Untitled PR')}`,
        actor: String(user.login || 'unknown'),
        headSha: head.sha ? String(head.sha) : null,
        mergeCommitSha: pr.merge_commit_sha ? String(pr.merge_commit_sha) : null,
        testedSha: null,
        rawState: mergedAt ? 'merged' : String(pr.state || 'open'),
        rawConclusion: mergedAt ? 'merged' : String(pr.state || 'open'),
        environmentName: null,
        observedAt: String(mergedAt || pr.updated_at || new Date().toISOString()),
        metadata: { action: payload.action, number: num },
      },
    ];
  }

  if (eventType === 'pull_request_review') {
    const review = payload.review as Record<string, unknown> | undefined;
    const pr = payload.pull_request as Record<string, unknown> | undefined;
    if (!review || !pr) return [];
    const num = Number(pr.number);
    const head = (pr.head as Record<string, unknown> | undefined) ?? {};
    const user = (review.user as Record<string, unknown> | undefined) ?? {};
    return [
      {
        observationType: 'pull_request_review',
        externalId: `rev-${repoName}-${review.id}`,
        externalUrl: String(review.html_url || pr.html_url || repoUrl),
        title: `PR #${num} Review: ${String(review.state || 'commented')} by ${String(user.login || 'reviewer')}`,
        actor: String(user.login || 'reviewer'),
        headSha: head.sha ? String(head.sha) : null,
        mergeCommitSha: null,
        testedSha: review.commit_id ? String(review.commit_id) : null,
        rawState: String(review.state || 'commented').toLowerCase(),
        rawConclusion: String(review.state || 'commented').toLowerCase(),
        environmentName: null,
        observedAt: String(review.submitted_at || new Date().toISOString()),
        metadata: { prNumber: num },
      },
    ];
  }

  if (eventType === 'check_run') {
    const run = payload.check_run as Record<string, unknown> | undefined;
    if (!run) return [];
    return [
      {
        observationType: 'check_run',
        externalId: `chk-${repoName}-${run.id}`,
        externalUrl: String(run.html_url || `${repoUrl}/actions`),
        title: `Check: ${String(run.name || 'CI Check')}`,
        actor: 'github-actions[bot]',
        headSha: run.head_sha ? String(run.head_sha) : null,
        mergeCommitSha: null,
        testedSha: run.head_sha ? String(run.head_sha) : null,
        rawState: String(run.status || 'completed'),
        rawConclusion: run.conclusion ? String(run.conclusion) : null,
        environmentName: null,
        observedAt: String(
          run.completed_at || run.started_at || new Date().toISOString()
        ),
        metadata: { checkRunId: run.id },
      },
    ];
  }

  if (eventType === 'workflow_run') {
    const wf = payload.workflow_run as Record<string, unknown> | undefined;
    if (!wf) return [];
    return [
      {
        observationType: 'workflow_run',
        externalId: `wfr-${repoName}-${wf.id}`,
        externalUrl: String(wf.html_url || `${repoUrl}/actions`),
        title: `Workflow: ${String(wf.name || 'Workflow')}`,
        actor: String(
          (wf.triggering_actor as { login?: string } | undefined)?.login ||
            'github-actions[bot]'
        ),
        headSha: wf.head_sha ? String(wf.head_sha) : null,
        mergeCommitSha: null,
        testedSha: wf.head_sha ? String(wf.head_sha) : null,
        rawState: String(wf.status || 'completed'),
        rawConclusion: wf.conclusion ? String(wf.conclusion) : null,
        environmentName: null,
        observedAt: String(wf.updated_at || new Date().toISOString()),
        metadata: { workflowRunId: wf.id },
      },
    ];
  }

  if (eventType === 'deployment_status' || eventType === 'deployment') {
    const dep = payload.deployment as Record<string, unknown> | undefined;
    const statusObj = payload.deployment_status as
      | Record<string, unknown>
      | undefined;
    if (!dep) return [];
    const env = String(statusObj?.environment || dep.environment || 'production');
    const state = String(statusObj?.state || 'pending');
    return [
      {
        observationType: 'deployment_status',
        externalId: `dep-${repoName}-${dep.id}`,
        externalUrl: String(
          statusObj?.target_url || `${repoUrl}/deployments`
        ),
        title: `Deployment to ${env}`,
        actor: String(
          (dep.creator as { login?: string } | undefined)?.login || 'deploy-bot'
        ),
        headSha: dep.sha ? String(dep.sha) : null,
        mergeCommitSha: null,
        testedSha: dep.sha ? String(dep.sha) : null,
        rawState: state,
        rawConclusion: state,
        environmentName: env,
        observedAt: String(
          statusObj?.created_at || dep.created_at || new Date().toISOString()
        ),
        metadata: { deploymentId: dep.id },
      },
    ];
  }

  if (eventType === 'release') {
    const rel = payload.release as Record<string, unknown> | undefined;
    if (!rel) return [];
    const tag = String(rel.tag_name || 'v0.0.0');
    return [
      {
        observationType: 'release',
        externalId: `rel-${repoName}-${rel.id}`,
        externalUrl: String(rel.html_url || `${repoUrl}/releases`),
        title: `Release ${tag}${rel.name ? `: ${String(rel.name)}` : ''}`,
        actor: String(
          (rel.author as { login?: string } | undefined)?.login || 'release-bot'
        ),
        headSha: rel.target_commitish ? String(rel.target_commitish) : null,
        mergeCommitSha: null,
        testedSha: rel.target_commitish ? String(rel.target_commitish) : null,
        rawState: 'published',
        rawConclusion: 'published',
        environmentName: 'production',
        observedAt: String(
          rel.published_at || rel.created_at || new Date().toISOString()
        ),
        metadata: { tagName: tag },
      },
    ];
  }

  return [];
}

export async function processGitHubWebhookService(
  db: DbExecutor,
  params: {
    rawBody: string;
    signatureHeader: string | null;
    deliveryId: string;
    eventType: string;
    webhookSecret?: string;
  }
): Promise<{ status: 'processed' | 'duplicate_ignored' | 'unmapped' | 'rejected'; ingested: number }> {
  const payloadHash = createHash('sha256')
    .update(params.rawBody)
    .digest('hex');

  const sigOk = verifyGitHubWebhookSignature(
    params.rawBody,
    params.signatureHeader,
    params.webhookSecret
  );

  if (!sigOk) {
    const existingRejected = await findWebhookDeliveryByDeliveryId(
      db,
      params.deliveryId
    );
    if (!existingRejected) {
      await insertWebhookDelivery(db, {
        workspaceId: null,
        deliveryId: params.deliveryId,
        eventType: params.eventType,
        signatureValid: false,
        payloadHash,
        status: 'rejected',
        errorMessage: 'Invalid X-Hub-Signature-256 header.',
      });
    }
    const err = new Error('Invalid GitHub webhook signature.') as Error & {
      status?: number;
    };
    err.status = 401;
    throw err;
  }

  const existingDelivery = await findWebhookDeliveryByDeliveryId(
    db,
    params.deliveryId
  );
  if (existingDelivery) {
    return { status: 'duplicate_ignored', ingested: 0 };
  }

  const payload = JSON.parse(params.rawBody) as Record<string, unknown>;
  const installationExternalId = (
    payload.installation as { id?: number | string } | undefined
  )?.id;

  if (!installationExternalId) {
    await insertWebhookDelivery(db, {
      workspaceId: null,
      deliveryId: params.deliveryId,
      eventType: params.eventType,
      signatureValid: true,
      payloadHash,
      status: 'unmapped',
      errorMessage: 'Missing installation.id in webhook payload.',
    });
    return { status: 'unmapped', ingested: 0 };
  }

  const inst = await findInstallationByExternalId(
    db,
    String(installationExternalId)
  );
  if (!inst) {
    await insertWebhookDelivery(db, {
      workspaceId: null,
      deliveryId: params.deliveryId,
      eventType: params.eventType,
      signatureValid: true,
      payloadHash,
      status: 'unmapped',
      errorMessage: `Installation ${installationExternalId} is not connected to any workspace.`,
    });
    return { status: 'unmapped', ingested: 0 };
  }

  const repoPayload = payload.repository as
    | { id?: number | string; full_name?: string; default_branch?: string; private?: boolean }
    | undefined;

  let repoRecord = repoPayload?.full_name
    ? await findRepositoryByFullName(db, inst.workspaceId, repoPayload.full_name)
    : null;

  if (!repoRecord && repoPayload?.full_name && repoPayload?.id) {
    repoRecord = await upsertRepository(db, {
      workspaceId: inst.workspaceId,
      installationId: inst.id,
      repoExternalId: String(repoPayload.id),
      fullName: repoPayload.full_name,
      defaultBranch: repoPayload.default_branch || 'main',
      isPrivate: Boolean(repoPayload.private ?? true),
      mode: inst.mode,
    });
  }

  const normalized = normalizeGitHubWebhookEvent(params.eventType, payload);
  let ingested = 0;

  await db.transaction(async (tx) => {
    if (repoRecord) {
      for (const obs of normalized) {
        await upsertSourceObservation(tx, {
          workspaceId: inst.workspaceId,
          repositoryId: repoRecord.id,
          repoFullName: repoRecord.fullName,
          observationType: obs.observationType,
          sourceOrigin: inst.mode === 'demo_synthetic' ? 'demo_synthetic' : 'github_live',
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
        ingested += 1;
      }
    }

    await insertWebhookDelivery(tx, {
      workspaceId: inst.workspaceId,
      deliveryId: params.deliveryId,
      eventType: params.eventType,
      signatureValid: true,
      payloadHash,
      status: 'processed',
    });

    await updateInstallationHealth(tx, inst.workspaceId, inst.id, 'healthy', null);

    await recordAuditEvent(tx, {
      workspaceId: inst.workspaceId,
      actorType: 'webhook',
      actorId: params.deliveryId,
      actorLabel: `github:${params.eventType}`,
      eventType: 'webhook.github_processed',
      resourceType: 'github_installation',
      resourceId: inst.id,
      metadata: {
        deliveryId: params.deliveryId,
        eventType: params.eventType,
        ingested,
      },
    });
  });

  return { status: 'processed', ingested };
}
