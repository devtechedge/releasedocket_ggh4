import { randomUUID } from 'node:crypto';
import type { DbExecutor } from '@/db/client';
import { toBool, toIso, toNullableIso } from '@/db/client';
import type { PlanTier, Role, SubscriptionStatus } from '@/domain/types';

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  githubUserId: string | null;
  createdAt: string;
}

export interface WorkspaceRecord {
  id: string;
  slug: string;
  name: string;
  agencyTagline: string;
  brandAccentColor: string;
  isDemo: boolean;
  planTier: PlanTier;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  createdAt: string;
}

export interface MembershipRecord {
  id: string;
  workspaceId: string;
  userId: string;
  role: Role;
  createdAt: string;
}

export interface SessionWithContext {
  sessionId: string;
  user: UserRecord;
  workspace: WorkspaceRecord;
  role: Role;
  memberships: Array<{ workspaceId: string; workspaceName: string; role: Role; isDemo: boolean }>;
}

function mapUser(r: Record<string, unknown>): UserRecord {
  return {
    id: String(r.id),
    email: String(r.email),
    name: String(r.name),
    passwordHash: r.password_hash ? String(r.password_hash) : null,
    githubUserId: r.github_user_id ? String(r.github_user_id) : null,
    createdAt: toIso(r.created_at),
  };
}

function mapWorkspace(r: Record<string, unknown>): WorkspaceRecord {
  return {
    id: String(r.id),
    slug: String(r.slug),
    name: String(r.name),
    agencyTagline: String(r.agency_tagline ?? ''),
    brandAccentColor: String(r.brand_accent_color ?? '#1E40AF'),
    isDemo: toBool(r.is_demo),
    planTier: (r.plan_tier as PlanTier) || 'solo',
    subscriptionStatus: (r.subscription_status as SubscriptionStatus) || 'disconnected',
    stripeCustomerId: r.stripe_customer_id ? String(r.stripe_customer_id) : null,
    stripeSubscriptionId: r.stripe_subscription_id
      ? String(r.stripe_subscription_id)
      : null,
    createdAt: toIso(r.created_at),
  };
}

export async function findUserByEmail(
  db: DbExecutor,
  email: string
): Promise<UserRecord | null> {
  const row = await db.queryOne<Record<string, unknown>>(
    `SELECT * FROM users WHERE lower(email) = lower($1)`,
    [email.trim()]
  );
  return row ? mapUser(row) : null;
}

export async function findUserById(
  db: DbExecutor,
  id: string
): Promise<UserRecord | null> {
  const row = await db.queryOne<Record<string, unknown>>(
    `SELECT * FROM users WHERE id = $1`,
    [id]
  );
  return row ? mapUser(row) : null;
}

export async function createUser(
  db: DbExecutor,
  params: {
    id?: string;
    email: string;
    name: string;
    passwordHash: string | null;
    githubUserId?: string | null;
  }
): Promise<UserRecord> {
  const id = params.id ?? `usr_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  await db.execute(
    `INSERT INTO users (id, email, name, password_hash, github_user_id, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      id,
      params.email.trim().toLowerCase(),
      params.name.trim(),
      params.passwordHash,
      params.githubUserId ?? null,
      createdAt,
    ]
  );
  return {
    id,
    email: params.email.trim().toLowerCase(),
    name: params.name.trim(),
    passwordHash: params.passwordHash,
    githubUserId: params.githubUserId ?? null,
    createdAt,
  };
}

export async function createWorkspace(
  db: DbExecutor,
  params: {
    id?: string;
    slug: string;
    name: string;
    agencyTagline?: string;
    brandAccentColor?: string;
    isDemo?: boolean;
    planTier?: PlanTier;
    subscriptionStatus?: SubscriptionStatus;
  }
): Promise<WorkspaceRecord> {
  const id = params.id ?? `ws_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  await db.execute(
    `INSERT INTO workspaces
     (id, slug, name, agency_tagline, brand_accent_color, is_demo, plan_tier, subscription_status, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      id,
      params.slug,
      params.name.trim(),
      params.agencyTagline ?? '',
      params.brandAccentColor ?? '#1E40AF',
      params.isDemo ? 1 : 0,
      params.planTier ?? 'solo',
      params.subscriptionStatus ?? 'disconnected',
      createdAt,
    ]
  );
  return {
    id,
    slug: params.slug,
    name: params.name.trim(),
    agencyTagline: params.agencyTagline ?? '',
    brandAccentColor: params.brandAccentColor ?? '#1E40AF',
    isDemo: Boolean(params.isDemo),
    planTier: params.planTier ?? 'solo',
    subscriptionStatus: params.subscriptionStatus ?? 'disconnected',
    stripeCustomerId: null,
    stripeSubscriptionId: null,
    createdAt,
  };
}

export async function findWorkspaceById(
  db: DbExecutor,
  workspaceId: string
): Promise<WorkspaceRecord | null> {
  const row = await db.queryOne<Record<string, unknown>>(
    `SELECT * FROM workspaces WHERE id = $1`,
    [workspaceId]
  );
  return row ? mapWorkspace(row) : null;
}

export async function updateWorkspaceProfile(
  db: DbExecutor,
  workspaceId: string,
  params: { name: string; agencyTagline: string; brandAccentColor: string }
): Promise<void> {
  await db.execute(
    `UPDATE workspaces SET name = $1, agency_tagline = $2, brand_accent_color = $3 WHERE id = $4`,
    [params.name.trim(), params.agencyTagline.trim(), params.brandAccentColor, workspaceId]
  );
}

export async function updateWorkspaceBilling(
  db: DbExecutor,
  workspaceId: string,
  params: {
    planTier: PlanTier;
    subscriptionStatus: SubscriptionStatus;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
  }
): Promise<void> {
  await db.execute(
    `UPDATE workspaces
     SET plan_tier = $1,
         subscription_status = $2,
         stripe_customer_id = COALESCE($3, stripe_customer_id),
         stripe_subscription_id = COALESCE($4, stripe_subscription_id)
     WHERE id = $5`,
    [
      params.planTier,
      params.subscriptionStatus,
      params.stripeCustomerId ?? null,
      params.stripeSubscriptionId ?? null,
      workspaceId,
    ]
  );
}

export async function createMembership(
  db: DbExecutor,
  params: { workspaceId: string; userId: string; role: Role }
): Promise<MembershipRecord> {
  const id = `mem_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  await db.execute(
    `INSERT INTO memberships (id, workspace_id, user_id, role, created_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, params.workspaceId, params.userId, params.role, createdAt]
  );
  return {
    id,
    workspaceId: params.workspaceId,
    userId: params.userId,
    role: params.role,
    createdAt,
  };
}

export async function listWorkspaceMembers(
  db: DbExecutor,
  workspaceId: string
): Promise<
  Array<{
    membershipId: string;
    userId: string;
    name: string;
    email: string;
    role: Role;
    createdAt: string;
  }>
> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT m.id as membership_id, m.user_id, m.role, m.created_at, u.name, u.email
     FROM memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.workspace_id = $1
     ORDER BY m.created_at ASC`,
    [workspaceId]
  );
  return rows.map((r) => ({
    membershipId: String(r.membership_id),
    userId: String(r.user_id),
    name: String(r.name),
    email: String(r.email),
    role: r.role as Role,
    createdAt: toIso(r.created_at),
  }));
}

export async function updateMembershipRole(
  db: DbExecutor,
  workspaceId: string,
  membershipId: string,
  role: Role
): Promise<void> {
  await db.execute(
    `UPDATE memberships SET role = $1 WHERE id = $2 AND workspace_id = $3`,
    [role, membershipId, workspaceId]
  );
}

export async function createInvitation(
  db: DbExecutor,
  params: {
    workspaceId: string;
    email: string;
    role: Role;
    tokenHash: string;
    invitedByUserId: string;
    expiresAt: string;
  }
): Promise<{ id: string }> {
  const id = `inv_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  await db.execute(
    `INSERT INTO invitations
     (id, workspace_id, email, role, token_hash, invited_by_user_id, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      params.workspaceId,
      params.email.trim().toLowerCase(),
      params.role,
      params.tokenHash,
      params.invitedByUserId,
      params.expiresAt,
      createdAt,
    ]
  );
  return { id };
}

export async function listWorkspaceInvitations(
  db: DbExecutor,
  workspaceId: string
): Promise<
  Array<{
    id: string;
    email: string;
    role: Role;
    expiresAt: string;
    acceptedAt: string | null;
    revokedAt: string | null;
    createdAt: string;
  }>
> {
  const rows = await db.query<Record<string, unknown>>(
    `SELECT * FROM invitations WHERE workspace_id = $1 ORDER BY created_at DESC`,
    [workspaceId]
  );
  return rows.map((r) => ({
    id: String(r.id),
    email: String(r.email),
    role: r.role as Role,
    expiresAt: toIso(r.expires_at),
    acceptedAt: toNullableIso(r.accepted_at),
    revokedAt: toNullableIso(r.revoked_at),
    createdAt: toIso(r.created_at),
  }));
}

export async function createSessionRecord(
  db: DbExecutor,
  params: {
    userId: string;
    activeWorkspaceId: string;
    tokenHash: string;
    expiresAt: string;
  }
): Promise<{ id: string }> {
  const id = `ses_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  await db.execute(
    `INSERT INTO sessions (id, user_id, active_workspace_id, token_hash, expires_at, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id, params.userId, params.activeWorkspaceId, params.tokenHash, params.expiresAt, createdAt]
  );
  return { id };
}

export async function findSessionContextByTokenHash(
  db: DbExecutor,
  tokenHash: string
): Promise<SessionWithContext | null> {
  const now = new Date().toISOString();
  const ses = await db.queryOne<Record<string, unknown>>(
    `SELECT * FROM sessions
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > $2`,
    [tokenHash, now]
  );
  if (!ses) return null;

  const user = await findUserById(db, String(ses.user_id));
  if (!user) return null;

  const membershipRows = await db.query<Record<string, unknown>>(
    `SELECT m.workspace_id, m.role, w.name as workspace_name, w.is_demo
     FROM memberships m
     JOIN workspaces w ON w.id = m.workspace_id
     WHERE m.user_id = $1
     ORDER BY m.created_at ASC`,
    [user.id]
  );

  if (membershipRows.length === 0) return null;

  const activeWsId = ses.active_workspace_id
    ? String(ses.active_workspace_id)
    : String(membershipRows[0].workspace_id);

  const selected =
    membershipRows.find((m) => String(m.workspace_id) === activeWsId) ??
    membershipRows[0];

  const workspace = await findWorkspaceById(db, String(selected.workspace_id));
  if (!workspace) return null;

  return {
    sessionId: String(ses.id),
    user,
    workspace,
    role: selected.role as Role,
    memberships: membershipRows.map((m) => ({
      workspaceId: String(m.workspace_id),
      workspaceName: String(m.workspace_name),
      role: m.role as Role,
      isDemo: toBool(m.is_demo),
    })),
  };
}

export async function switchSessionWorkspace(
  db: DbExecutor,
  sessionId: string,
  userId: string,
  targetWorkspaceId: string
): Promise<boolean> {
  const mem = await db.queryOne<Record<string, unknown>>(
    `SELECT id FROM memberships WHERE workspace_id = $1 AND user_id = $2`,
    [targetWorkspaceId, userId]
  );
  if (!mem) return false;
  await db.execute(
    `UPDATE sessions SET active_workspace_id = $1 WHERE id = $2 AND user_id = $3`,
    [targetWorkspaceId, sessionId, userId]
  );
  return true;
}

export async function revokeSessionByTokenHash(
  db: DbExecutor,
  tokenHash: string
): Promise<void> {
  await db.execute(
    `UPDATE sessions SET revoked_at = $1 WHERE token_hash = $2`,
    [new Date().toISOString(), tokenHash]
  );
}
