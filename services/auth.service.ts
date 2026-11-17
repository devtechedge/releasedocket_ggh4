import { cookies, headers } from 'next/headers';
import type { DbExecutor } from '@/db/client';
import { getDb } from '@/db/client';
import { checkEntitlement, EntitlementError } from '@/domain/billing';
import {
  assertPermission,
  AuthorizationError,
  canAssignRole,
} from '@/domain/rbac';
import {
  generateSecureToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from '@/domain/security';
import type { Role } from '@/domain/types';
import { enqueueOutboxJob } from '@/jobs/outbox';
import { recordAuditEvent } from '@/repositories/audit.repo';
import {
  createInvitation,
  createMembership,
  createSessionRecord,
  createUser,
  createWorkspace,
  findSessionContextByTokenHash,
  findUserByEmail,
  listWorkspaceInvitations,
  listWorkspaceMembers,
  revokeSessionByTokenHash,
  switchSessionWorkspace,
  updateMembershipRole,
  updateWorkspaceProfile,
  type SessionWithContext,
} from '@/repositories/auth.repo';
import { getWorkspaceUsage } from '@/repositories/crm.repo';

export const SESSION_COOKIE_NAME = 'rd_session';

const loginAttempts = new Map<string, number[]>();

export function isDemoModeAllowed(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.ALLOW_DEMO_MODE !== 'false'
  );
}

export function checkAuthRateLimit(key: string, maxAttempts = 12): void {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const recent = (loginAttempts.get(key) ?? []).filter(
    (ts) => now - ts < windowMs
  );
  if (recent.length >= maxAttempts) {
    throw new Error(
      'Too many authentication attempts. Please wait a few minutes before trying again.'
    );
  }
  recent.push(now);
  loginAttempts.set(key, recent);
}

export async function verifySameOriginRequest(): Promise<void> {
  const hdrs = await headers();
  const origin = hdrs.get('origin');
  const forwardedHost = hdrs.get('x-forwarded-host');
  const host = hdrs.get('host');
  if (!origin || (!host && !forwardedHost)) return;
  try {
    const originUrl = new URL(origin);
    const allowedHosts = new Set(
      [host, forwardedHost]
        .filter((h): h is string => Boolean(h))
        .flatMap((h) => h.split(',').map((part) => part.trim()))
    );
    if (!allowedHosts.has(originUrl.host)) {
      throw new AuthorizationError('Cross-origin mutation request rejected.');
    }
  } catch (err) {
    if (err instanceof AuthorizationError) throw err;
    throw new AuthorizationError('Invalid Origin header.');
  }
}

async function getCookieSecurityAttrs(): Promise<{
  sameSite: 'lax' | 'none';
  secure: boolean;
}> {
  try {
    const hdrs = await headers();
    const proto = hdrs.get('x-forwarded-proto')?.split(',')[0]?.trim();
    const host = (hdrs.get('x-forwarded-host') || hdrs.get('host') || '').trim();
    const isHttps =
      proto === 'https' ||
      host.endsWith('.run.app') ||
      process.env.NODE_ENV === 'production';
    if (isHttps) {
      return { sameSite: 'none', secure: true };
    }
  } catch {
    // Fallback outside request context (e.g., unit tests)
  }
  return {
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  };
}

export async function setSessionCookie(rawToken: string): Promise<void> {
  const cookieStore = await cookies();
  const attrs = await getCookieSecurityAttrs();
  cookieStore.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    sameSite: attrs.sameSite,
    secure: attrs.secure,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  const attrs = await getCookieSecurityAttrs();
  cookieStore.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: attrs.sameSite,
    secure: attrs.secure,
    path: '/',
    maxAge: 0,
  });
}

export async function getOptionalSessionContext(
  dbOverride?: DbExecutor
): Promise<SessionWithContext | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) return null;
  const db = dbOverride ?? (await getDb());
  return findSessionContextByTokenHash(db, hashToken(rawToken));
}

export async function requireSessionContext(
  dbOverride?: DbExecutor
): Promise<SessionWithContext> {
  const ctx = await getOptionalSessionContext(dbOverride);
  if (!ctx) {
    const err = new Error('Authentication required.') as Error & {
      status?: number;
    };
    err.status = 401;
    throw err;
  }
  return ctx;
}

export async function registerAgencyAccount(
  db: DbExecutor,
  params: {
    name: string;
    email: string;
    password: string;
    workspaceName: string;
  }
): Promise<{ rawSessionToken: string; workspaceId: string; userId: string }> {
  const existing = await findUserByEmail(db, params.email);
  if (existing) {
    throw new Error('An account with this email address already exists.');
  }

  const passwordHash = hashPassword(params.password);
  const slugBase = params.workspaceName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 32);
  const slug = `${slugBase || 'agency'}-${generateSecureToken(4).toLowerCase()}`;
  const rawSessionToken = generateSecureToken(32);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  return db.transaction(async (tx) => {
    const user = await createUser(tx, {
      email: params.email,
      name: params.name,
      passwordHash,
    });
    const workspace = await createWorkspace(tx, {
      slug,
      name: params.workspaceName,
      planTier: 'solo',
      subscriptionStatus: 'disconnected',
      isDemo: false,
    });
    await createMembership(tx, {
      workspaceId: workspace.id,
      userId: user.id,
      role: 'OWNER',
    });
    await createSessionRecord(tx, {
      userId: user.id,
      activeWorkspaceId: workspace.id,
      tokenHash: hashToken(rawSessionToken),
      expiresAt,
    });
    await recordAuditEvent(tx, {
      workspaceId: workspace.id,
      actorType: 'user',
      actorId: user.id,
      actorLabel: user.email,
      eventType: 'workspace.created',
      resourceType: 'workspace',
      resourceId: workspace.id,
      metadata: { workspaceName: workspace.name },
    });

    return {
      rawSessionToken,
      workspaceId: workspace.id,
      userId: user.id,
    };
  });
}

export async function signInWithEmailPassword(
  db: DbExecutor,
  params: { email: string; password: string }
): Promise<{ rawSessionToken: string }> {
  const normalizedEmail = params.email.trim().toLowerCase();
  checkAuthRateLimit(`login:${normalizedEmail}`);

  const user = await findUserByEmail(db, normalizedEmail);
  if (!user || !user.passwordHash) {
    throw new Error('Invalid email or password.');
  }

  if (!verifyPassword(params.password, user.passwordHash)) {
    throw new Error('Invalid email or password.');
  }

  const rows = await db.query<{ workspace_id: string }>(
    `SELECT workspace_id FROM memberships WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1`,
    [user.id]
  );
  if (rows.length === 0) {
    throw new Error('No workspace membership found for this account.');
  }

  const rawSessionToken = generateSecureToken(32);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await createSessionRecord(db, {
    userId: user.id,
    activeWorkspaceId: String(rows[0].workspace_id),
    tokenHash: hashToken(rawSessionToken),
    expiresAt,
  });

  return { rawSessionToken };
}

export async function signOutCurrentSession(db: DbExecutor): Promise<void> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (rawToken) {
    await revokeSessionByTokenHash(db, hashToken(rawToken));
  }
  await clearSessionCookie();
}

export async function switchWorkspaceService(
  db: DbExecutor,
  ctx: SessionWithContext,
  targetWorkspaceId: string
): Promise<void> {
  const ok = await switchSessionWorkspace(
    db,
    ctx.sessionId,
    ctx.user.id,
    targetWorkspaceId
  );
  if (!ok) {
    throw new AuthorizationError('You are not a member of the requested workspace.');
  }
}

export async function updateWorkspaceProfileService(
  db: DbExecutor,
  ctx: SessionWithContext,
  input: { name: string; agencyTagline: string; brandAccentColor: string }
): Promise<void> {
  assertPermission(ctx.role, 'workspace:manage');
  await updateWorkspaceProfile(db, ctx.workspace.id, input);
  await recordAuditEvent(db, {
    workspaceId: ctx.workspace.id,
    actorType: 'user',
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: 'workspace.updated',
    resourceType: 'workspace',
    resourceId: ctx.workspace.id,
    metadata: { name: input.name },
  });
}

export async function getTeamOverviewService(
  db: DbExecutor,
  ctx: SessionWithContext
) {
  assertPermission(ctx.role, 'workspace:read');
  const [members, invitations] = await Promise.all([
    listWorkspaceMembers(db, ctx.workspace.id),
    listWorkspaceInvitations(db, ctx.workspace.id),
  ]);
  return { members, invitations };
}

export async function inviteMemberService(
  db: DbExecutor,
  ctx: SessionWithContext,
  input: { email: string; role: Role }
): Promise<{ invitationId: string; rawInviteToken: string }> {
  assertPermission(ctx.role, 'team:invite');
  if (!canAssignRole(ctx.role, input.role)) {
    throw new AuthorizationError(
      `Role ${ctx.role} cannot invite a member with role ${input.role}.`
    );
  }

  const usage = await getWorkspaceUsage(db, ctx.workspace.id);
  const ent = checkEntitlement(
    ctx.workspace.planTier,
    ctx.workspace.subscriptionStatus,
    usage,
    'invite_member'
  );
  if (!ent.allowed) {
    throw new EntitlementError(ent.reason || 'Member limit reached.');
  }

  const rawInviteToken = generateSecureToken(24);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { id } = await createInvitation(db, {
    workspaceId: ctx.workspace.id,
    email: input.email,
    role: input.role,
    tokenHash: hashToken(rawInviteToken),
    invitedByUserId: ctx.user.id,
    expiresAt,
  });

  await enqueueOutboxJob(db, {
    workspaceId: ctx.workspace.id,
    jobType: 'send_team_invitation',
    payload: {
      email: input.email,
      role: input.role,
      workspaceName: ctx.workspace.name,
      body: `You have been invited as ${input.role} to ${ctx.workspace.name} on ReleaseDocket.`,
    },
  });

  await recordAuditEvent(db, {
    workspaceId: ctx.workspace.id,
    actorType: 'user',
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: 'team.invited',
    resourceType: 'invitation',
    resourceId: id,
    metadata: { email: input.email.toLowerCase(), role: input.role },
  });

  return { invitationId: id, rawInviteToken };
}

export async function updateMemberRoleService(
  db: DbExecutor,
  ctx: SessionWithContext,
  membershipId: string,
  newRole: Role
): Promise<void> {
  assertPermission(ctx.role, 'team:manage_roles');
  if (!canAssignRole(ctx.role, newRole)) {
    throw new AuthorizationError(
      `Role ${ctx.role} cannot assign role ${newRole}.`
    );
  }
  await updateMembershipRole(db, ctx.workspace.id, membershipId, newRole);
  await recordAuditEvent(db, {
    workspaceId: ctx.workspace.id,
    actorType: 'user',
    actorId: ctx.user.id,
    actorLabel: ctx.user.email,
    eventType: 'team.role_changed',
    resourceType: 'membership',
    resourceId: membershipId,
    metadata: { newRole },
  });
}
