import { redirect } from 'next/navigation';
import ClientsManager from '@/components/ClientsManager';
import DashboardShell from '@/components/DashboardShell';
import { getDb } from '@/db/client';
import { hasPermission } from '@/domain/rbac';
import { getOptionalSessionContext } from '@/services/auth.service';
import { listCrmOverviewService } from '@/services/crm.service';

export const dynamic = 'force-dynamic';

export default async function ClientsPage() {
  const db = await getDb();
  const ctx = await getOptionalSessionContext(db);
  if (!ctx) redirect('/auth/signin');

  const crm = await listCrmOverviewService(db, ctx);

  return (
    <DashboardShell session={ctx} breadcrumb="Clients">
      <ClientsManager
        initialClients={crm.clients}
        canWrite={hasPermission(ctx.role, 'clients:write')}
      />
    </DashboardShell>
  );
}
