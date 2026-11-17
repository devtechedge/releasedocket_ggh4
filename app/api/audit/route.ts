import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db/client';
import { checkEntitlement, EntitlementError } from '@/domain/billing';
import { assertPermission } from '@/domain/rbac';
import { handleApiError } from '@/lib/api-helpers';
import { listAuditEvents } from '@/repositories/audit.repo';
import { getWorkspaceUsage } from '@/repositories/crm.repo';
import { requireSessionContext } from '@/services/auth.service';

export async function GET(req: NextRequest) {
  try {
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    assertPermission(ctx.role, 'audit:read');

    const eventType = req.nextUrl.searchParams.get('eventType') || undefined;
    const format = req.nextUrl.searchParams.get('format');

    if (format === 'json_export') {
      const usage = await getWorkspaceUsage(db, ctx.workspace.id);
      const ent = checkEntitlement(
        ctx.workspace.planTier,
        ctx.workspace.subscriptionStatus,
        usage,
        'export_audit_log'
      );
      if (!ent.allowed) {
        throw new EntitlementError(ent.reason || 'Audit export requires Agency or Partner.');
      }
    }

    const events = await listAuditEvents(db, ctx.workspace.id, {
      limit: 150,
      eventType,
    });

    if (format === 'json_export') {
      return new NextResponse(JSON.stringify({ workspaceId: ctx.workspace.id, events }, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="releasedocket-audit-log.json"',
        },
      });
    }

    return NextResponse.json({ events });
  } catch (err) {
    return handleApiError(err);
  }
}
