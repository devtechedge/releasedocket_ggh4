import { randomUUID } from 'node:crypto';
import type { DbExecutor } from '@/db/client';
import { toIso } from '@/db/client';
import type { WorkspaceUsageSnapshot } from '@/domain/billing';

export interface ClientRecord {
  id: string;
  workspaceId: string;
  name: string;
  contactName: string;
  contactEmail: string;
  retainerMonthlyUsd: number;
  notes: string;
  createdAt: string;
}

export interface ProjectRecord {
  id: string;
  workspaceId: string;
  clientId: string;
  clientName?: string;
  name: string;
  slug: string;
  summary: string;
  environmentUrl: string;
  status: string;
  createdAt: string;
}

export async function listClients(
  db: DbExecutor,
  workspaceId: string
): Promise<ClientRecord[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM clients WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [workspaceId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    name: String(r.name),
    contactName: String(r.contact_name),
    contactEmail: String(r.contact_email),
    retainerMonthlyUsd: Number(r.retainer_monthly_usd ?? 0),
    notes: String(r.notes ?? ''),
    createdAt: toIso(r.created_at),
  }));
}

export async function findClientById(
  db: DbExecutor,
  workspaceId: string,
  clientId: string
): Promise<ClientRecord | null> {
  const r = await db.queryOne<Record<string, unknown>>(
    `SELECT * FROM clients WHERE id = $1 AND workspace_id = $2`,
    [clientId, workspaceId]
  );
  if (!r) return null;
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    name: String(r.name),
    contactName: String(r.contact_name),
    contactEmail: String(r.contact_email),
    retainerMonthlyUsd: Number(r.retainer_monthly_usd ?? 0),
    notes: String(r.notes ?? ''),
    createdAt: toIso(r.created_at),
  };
}

export async function createClient(
  db: DbExecutor,
  params: {
    id?: string;
    workspaceId: string;
    name: string;
    contactName: string;
    contactEmail: string;
    retainerMonthlyUsd: number;
    notes?: string;
  }
): Promise<ClientRecord> {
  const id = params.id ?? `cli_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  await db.execute(
    `INSERT INTO clients
     (id, workspace_id, name, contact_name, contact_email, retainer_monthly_usd, notes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      params.workspaceId,
      params.name.trim(),
      params.contactName.trim(),
      params.contactEmail.trim().toLowerCase(),
      params.retainerMonthlyUsd,
      params.notes?.trim() ?? '',
      createdAt,
    ]
  );
  return {
    id,
    workspaceId: params.workspaceId,
    name: params.name.trim(),
    contactName: params.contactName.trim(),
    contactEmail: params.contactEmail.trim().toLowerCase(),
    retainerMonthlyUsd: params.retainerMonthlyUsd,
    notes: params.notes?.trim() ?? '',
    createdAt,
  };
}

export async function listProjects(
  db: DbExecutor,
  workspaceId: string
): Promise<ProjectRecord[]> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT p.*, c.name as client_name
     FROM projects p
     JOIN clients c ON c.id = p.client_id AND c.workspace_id = p.workspace_id
     WHERE p.workspace_id = $1
     ORDER BY p.created_at DESC`,
    [workspaceId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    clientId: String(r.client_id),
    clientName: String(r.client_name),
    name: String(r.name),
    slug: String(r.slug),
    summary: String(r.summary ?? ''),
    environmentUrl: String(r.environment_url ?? ''),
    status: String(r.status),
    createdAt: toIso(r.created_at),
  }));
}

export async function findProjectById(
  db: DbExecutor,
  workspaceId: string,
  projectId: string
): Promise<ProjectRecord | null> {
  const r = await db.queryOne<Record<string, unknown>>(
    `SELECT p.*, c.name as client_name
     FROM projects p
     JOIN clients c ON c.id = p.client_id AND c.workspace_id = p.workspace_id
     WHERE p.id = $1 AND p.workspace_id = $2`,
    [projectId, workspaceId]
  );
  if (!r) return null;
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    clientId: String(r.client_id),
    clientName: String(r.client_name),
    name: String(r.name),
    slug: String(r.slug),
    summary: String(r.summary ?? ''),
    environmentUrl: String(r.environment_url ?? ''),
    status: String(r.status),
    createdAt: toIso(r.created_at),
  };
}

export async function createProject(
  db: DbExecutor,
  params: {
    id?: string;
    workspaceId: string;
    clientId: string;
    name: string;
    slug: string;
    summary?: string;
    environmentUrl?: string;
  }
): Promise<ProjectRecord> {
  const id = params.id ?? `prj_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  await db.execute(
    `INSERT INTO projects
     (id, workspace_id, client_id, name, slug, summary, environment_url, status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8)`,
    [
      id,
      params.workspaceId,
      params.clientId,
      params.name.trim(),
      params.slug,
      params.summary?.trim() ?? '',
      params.environmentUrl?.trim() ?? '',
      createdAt,
    ]
  );
  return {
    id,
    workspaceId: params.workspaceId,
    clientId: params.clientId,
    name: params.name.trim(),
    slug: params.slug,
    summary: params.summary?.trim() ?? '',
    environmentUrl: params.environmentUrl?.trim() ?? '',
    status: 'active',
    createdAt,
  };
}

export async function mapRepoToProject(
  db: DbExecutor,
  params: { workspaceId: string; projectId: string; repositoryId: string }
): Promise<void> {
  const existing = await db.queryOne<Record<string, unknown>>(
    `SELECT id FROM project_repo_mappings WHERE workspace_id = $1 AND project_id = $2 AND repository_id = $3`,
    [params.workspaceId, params.projectId, params.repositoryId]
  );
  if (existing) return;

  await db.execute(
    `INSERT INTO project_repo_mappings (id, workspace_id, project_id, repository_id, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      `prm_${randomUUID()}`,
      params.workspaceId,
      params.projectId,
      params.repositoryId,
      new Date().toISOString(),
    ]
  );
}

export async function unmapRepoFromProject(
  db: DbExecutor,
  workspaceId: string,
  projectId: string,
  repositoryId: string
): Promise<void> {
  await db.execute(
    `DELETE FROM project_repo_mappings WHERE workspace_id = $1 AND project_id = $2 AND repository_id = $3`,
    [workspaceId, projectId, repositoryId]
  );
}

export async function listProjectRepoMappings(
  db: DbExecutor,
  workspaceId: string
): Promise<
  Array<{
    id: string;
    projectId: string;
    repositoryId: string;
    repoFullName: string;
    mode: string;
  }>
> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT m.id, m.project_id, m.repository_id, r.full_name, r.mode
     FROM project_repo_mappings m
     JOIN github_repositories r ON r.id = m.repository_id AND r.workspace_id = m.workspace_id
     WHERE m.workspace_id = $1
     ORDER BY m.created_at DESC`,
    [workspaceId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    projectId: String(r.project_id),
    repositoryId: String(r.repository_id),
    repoFullName: String(r.full_name),
    mode: String(r.mode),
  }));
}

export async function getWorkspaceUsage(
  db: DbExecutor,
  workspaceId: string
): Promise<WorkspaceUsageSnapshot> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const projRow = await db.queryOne<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM projects WHERE workspace_id = $1`,
    [workspaceId]
  );
  const memRow = await db.queryOne<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM memberships WHERE workspace_id = $1`,
    [workspaceId]
  );
  const recRow = await db.queryOne<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM receipt_versions WHERE workspace_id = $1 AND published_at >= $2`,
    [workspaceId, monthStart.toISOString()]
  );

  return {
    projectCount: Number(projRow?.cnt ?? 0),
    memberCount: Number(memRow?.cnt ?? 0),
    receiptsPublishedThisMonth: Number(recRow?.cnt ?? 0),
  };
}
