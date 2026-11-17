import { redirect } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import DeliveryListManager from '@/components/DeliveryListManager';
import { getDb } from '@/db/client';
import { hasPermission } from '@/domain/rbac';
import { getOptionalSessionContext } from '@/services/auth.service';
import { listCrmOverviewService } from '@/services/crm.service';
import { listDeliveryBatchesService } from '@/services/delivery.service';

export const dynamic = 'force-dynamic';

export default async function DeliveryPage() {
  const db = await getDb();
  const ctx = await getOptionalSessionContext(db);
  if (!ctx) redirect('/auth/signin');

  const [batches, crm] = await Promise.all([
    listDeliveryBatchesService(db, ctx),
    listCrmOverviewService(db, ctx),
  ]);

  return (
    <DashboardShell session={ctx} breadcrumb="Delivery">
      <DeliveryListManager
        initialBatches={batches}
        projects={crm.projects}
        canWrite={hasPermission(ctx.role, 'delivery:write')}
      />
    </DashboardShell>
  );
}
