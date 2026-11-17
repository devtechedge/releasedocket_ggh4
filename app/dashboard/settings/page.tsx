import { redirect } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import SettingsClientView from '@/components/SettingsClientView';
import { getDb } from '@/db/client';
import { checkEntitlement } from '@/domain/billing';
import { hasPermission } from '@/domain/rbac';
import { listAuditEvents } from '@/repositories/audit.repo';
import { getWorkspaceUsage } from '@/repositories/crm.repo';
import { getOptionalSessionContext } from '@/services/auth.service';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const db = await getDb();
  const ctx = await getOptionalSessionContext(db);
  if (!ctx) redirect('/auth/signin');

  const canReadAudit = hasPermission(ctx.role, 'audit:read');
  const [auditEvents, usage] = await Promise.all([
    canReadAudit ? listAuditEvents(db, ctx.workspace.id, { limit: 100 }) : Promise.resolve([]),
    getWorkspaceUsage(db, ctx.workspace.id),
  ]);

  const exportEnt = checkEntitlement(
    ctx.workspace.planTier,
    ctx.workspace.subscriptionStatus,
    usage,
    'export_audit_log'
  );

  return (
    <DashboardShell session={ctx} breadcrumb="Settings">
      <SettingsClientView
        workspace={ctx.workspace}
        initialAuditEvents={auditEvents}
        canManageWorkspace={hasPermission(ctx.role, 'workspace:manage')}
        canExportAudit={canReadAudit && exportEnt.allowed}
      />
    </DashboardShell>
  );
}
