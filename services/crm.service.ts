import type { DbExecutor } from '@/db/client';
import { checkEntitlement, EntitlementError } from '@/domain/billing';
import { assertPermission } from '@/domain/rbac';
import { recordAuditEvent } from '@/repositories/audit.repo';
import type { SessionWithContext } from '@/repositories/auth.repo';
import {
  createClient,
  createProject,
  findClientById,
  findProjectById,
  getWorkspaceUsage,
  listClients,
  listProjectRepoMappings,
  listProjects,
  mapRepoToProject,
  unmapRepoFromProject,
} from '@/repositories/crm.repo';
import { listRepositories } from '@/repositories/github.repo';

export async function listCrmOverviewService(
  db: DbExecutor,
  ctx: SessionWithContext
) {
  assertPermission(ctx.role, 'workspace:read');
  const [clients, projects, mappings, repositories, usage] = await Promise.all([
    listClients(db, ctx.workspace.id),
    listProjects(db, ctx.workspace.id),
    listProjectRepoMappings(db, ctx.workspace.id),
    listRepositories(db, ctx.workspace.id),
    getWorkspaceUsage(db, ctx.workspace.id),
  ]);
  return { clients, projects, mappings, repositories, usage };
}

export async function createClientService(
  db: DbExecutor,
  ctx: SessionWithContext,
  input: {
    name: string;
    contactName: string;
    contactEmail: string;
    retainerMonthlyUsd: number;
    notes?: string;
  }
) {
  assertPermission(ctx.role, 'clients:write');
  const client = await createClient(db, {
    workspaceId: ctx.workspace.id,
    ...input,
  });
  await recordAuditEvent(db, {
    workspaceId: ctx.workspace.id,
    actorType: 'user',
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: 'client.created',
    resourceType: 'client',
    resourceId: client.id,
    metadata: { name: client.name, retainerMonthlyUsd: client.retainerMonthlyUsd },
  });
  return client;
}

export async function createProjectService(
  db: DbExecutor,
  ctx: SessionWithContext,
  input: {
    clientId: string;
    name: string;
    summary?: string;
    environmentUrl?: string;
  }
) {
  assertPermission(ctx.role, 'projects:write');

  const client = await findClientById(db, ctx.workspace.id, input.clientId);
  if (!client) {
    throw new Error('Selected client does not belong to this workspace.');
  }

  const usage = await getWorkspaceUsage(db, ctx.workspace.id);
  const ent = checkEntitlement(
    ctx.workspace.planTier,
    ctx.workspace.subscriptionStatus,
    usage,
    'create_project'
  );
  if (!ent.allowed) {
    throw new EntitlementError(ent.reason || 'Project quota exceeded.');
  }

  const slug =
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 48) || `project-${Date.now()}`;

  const project = await createProject(db, {
    workspaceId: ctx.workspace.id,
    clientId: client.id,
    name: input.name,
    slug,
    summary: input.summary,
    environmentUrl: input.environmentUrl,
  });

  await recordAuditEvent(db, {
    workspaceId: ctx.workspace.id,
    actorType: 'user',
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: 'project.created',
    resourceType: 'project',
    resourceId: project.id,
    metadata: { name: project.name, clientId: client.id },
  });

  return { ...project, clientName: client.name };
}

export async function mapRepoToProjectService(
  db: DbExecutor,
  ctx: SessionWithContext,
  input: { projectId: string; repositoryId: string }
) {
  assertPermission(ctx.role, 'projects:write');
  const project = await findProjectById(db, ctx.workspace.id, input.projectId);
  if (!project) {
    throw new Error('Project not found in workspace.');
  }
  const repos = await listRepositories(db, ctx.workspace.id);
  const repo = repos.find((r) => r.id === input.repositoryId);
  if (!repo) {
    throw new Error('Repository not found in workspace.');
  }

  await mapRepoToProject(db, {
    workspaceId: ctx.workspace.id,
    projectId: project.id,
    repositoryId: repo.id,
  });

  await recordAuditEvent(db, {
    workspaceId: ctx.workspace.id,
    actorType: 'user',
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: 'project.repo_mapped',
    resourceType: 'project',
    resourceId: project.id,
    metadata: { repositoryId: repo.id, repoFullName: repo.fullName },
  });
}

export async function unmapRepoFromProjectService(
  db: DbExecutor,
  ctx: SessionWithContext,
  input: { projectId: string; repositoryId: string }
) {
  assertPermission(ctx.role, 'projects:write');
  await unmapRepoFromProject(
    db,
    ctx.workspace.id,
    input.projectId,
    input.repositoryId
  );
  await recordAuditEvent(db, {
    workspaceId: ctx.workspace.id,
    actorType: 'user',
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: 'project.repo_unmapped',
    resourceType: 'project',
    resourceId: input.projectId,
    metadata: { repositoryId: input.repositoryId },
  });
}
