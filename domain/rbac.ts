import type { Role } from './types';

export type Permission =
  | 'workspace:read'
  | 'workspace:manage'
  | 'team:invite'
  | 'team:manage_roles'
  | 'billing:manage'
  | 'clients:write'
  | 'projects:write'
  | 'integrations:manage'
  | 'delivery:write'
  | 'delivery:publish'
  | 'evidence:write'
  | 'ai:draft'
  | 'reports:export'
  | 'audit:read'
  | 'portal:manage'
  | 'portal:client_action';

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  OWNER: new Set<Permission>([
    'workspace:read',
    'workspace:manage',
    'team:invite',
    'team:manage_roles',
    'billing:manage',
    'clients:write',
    'projects:write',
    'integrations:manage',
    'delivery:write',
    'delivery:publish',
    'evidence:write',
    'ai:draft',
    'reports:export',
    'audit:read',
    'portal:manage',
    'portal:client_action',
  ]),
  ADMIN: new Set<Permission>([
    'workspace:read',
    'workspace:manage',
    'team:invite',
    'team:manage_roles',
    'clients:write',
    'projects:write',
    'integrations:manage',
    'delivery:write',
    'delivery:publish',
    'evidence:write',
    'ai:draft',
    'reports:export',
    'audit:read',
    'portal:manage',
    'portal:client_action',
  ]),
  DELIVERY_LEAD: new Set<Permission>([
    'workspace:read',
    'clients:write',
    'projects:write',
    'delivery:write',
    'delivery:publish',
    'evidence:write',
    'ai:draft',
    'reports:export',
    'audit:read',
    'portal:manage',
  ]),
  CONTRIBUTOR: new Set<Permission>([
    'workspace:read',
    'delivery:write',
    'evidence:write',
    'ai:draft',
  ]),
  CLIENT_VIEWER: new Set<Permission>(['portal:client_action']),
};

export const ROLE_RANK: Record<Role, number> = {
  OWNER: 5,
  ADMIN: 4,
  DELIVERY_LEAD: 3,
  CONTRIBUTOR: 2,
  CLIENT_VIEWER: 1,
};

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export class AuthorizationError extends Error {
  readonly status = 403;
  constructor(message: string) {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export function assertPermission(role: Role, permission: Permission): void {
  if (!hasPermission(role, permission)) {
    throw new AuthorizationError(
      `Role ${role} does not have permission '${permission}'.`
    );
  }
}

export function canAssignRole(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === 'OWNER') return true;
  if (actorRole === 'ADMIN') {
    return targetRole !== 'OWNER' && targetRole !== 'ADMIN';
  }
  return false;
}
