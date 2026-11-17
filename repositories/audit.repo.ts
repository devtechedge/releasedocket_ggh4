import { randomUUID } from 'node:crypto';
import type { DbExecutor } from '@/db/client';
import { parseJsonColumn, toIso } from '@/db/client';

export interface AuditEventRecord {
  id: string;
  workspaceId: string;
  actorType: 'user' | 'client_portal' | 'webhook' | 'system';
  actorId: string;
  actorLabel: string;
  eventType: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export async function recordAuditEvent(
  db: DbExecutor,
  params: {
    workspaceId: string;
    actorType: AuditEventRecord['actorType'];
    actorId: string;
    actorLabel: string;
    eventType: string;
    resourceType: string;
    resourceId: string;
    metadata?: Record<string, unknown>;
  }
): Promise<AuditEventRecord> {
  const id = `aud_${randomUUID()}`;
  const createdAt = new Date().toISOString();
  const metadata = params.metadata ?? {};
  await db.execute(
    `INSERT INTO audit_events
     (id, workspace_id, actor_type, actor_id, actor_label, event_type, resource_type, resource_id, metadata_json, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      id,
      params.workspaceId,
      params.actorType,
      params.actorId,
      params.actorLabel,
      params.eventType,
      params.resourceType,
      params.resourceId,
      JSON.stringify(metadata),
      createdAt,
    ]
  );
  return {
    id,
    workspaceId: params.workspaceId,
    actorType: params.actorType,
    actorId: params.actorId,
    actorLabel: params.actorLabel,
    eventType: params.eventType,
    resourceType: params.resourceType,
    resourceId: params.resourceId,
    metadata,
    createdAt,
  };
}

export async function listAuditEvents(
  db: DbExecutor,
  workspaceId: string,
  options?: { limit?: number; eventType?: string }
): Promise<AuditEventRecord[]> {
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 250);
  const rows = options?.eventType
    ? await db.query<Record<string, unknown>>(
        `SELECT * FROM audit_events
         WHERE workspace_id = $1 AND event_type = $2
         ORDER BY created_at DESC
         LIMIT $3`,
        [workspaceId, options.eventType, limit]
      )
    : await db.query<Record<string, unknown>>(
        `SELECT * FROM audit_events
         WHERE workspace_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [workspaceId, limit]
      );

  return rows.map((r) => ({
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    actorType: r.actor_type as AuditEventRecord['actorType'],
    actorId: String(r.actor_id),
    actorLabel: String(r.actor_label),
    eventType: String(r.event_type),
    resourceType: String(r.resource_type),
    resourceId: String(r.resource_id),
    metadata: parseJsonColumn<Record<string, unknown>>(r.metadata_json, {}),
    createdAt: toIso(r.created_at),
  }));
}
