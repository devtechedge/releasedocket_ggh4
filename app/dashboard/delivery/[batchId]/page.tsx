import { notFound, redirect } from 'next/navigation';
import BatchWorkspaceClient from '@/components/BatchWorkspaceClient';
import DashboardShell from '@/components/DashboardShell';
import { getDb } from '@/db/client';
import { hasPermission } from '@/domain/rbac';
import { findClientById } from '@/repositories/crm.repo';
import { getOptionalSessionContext } from '@/services/auth.service';
import { getDeliveryBatchDetailService } from '@/services/delivery.service';

export const dynamic = 'force-dynamic';

export default async function DeliveryBatchDetailPage(context: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await context.params;
  const db = await getDb();
  const ctx = await getOptionalSessionContext(db);
  if (!ctx) redirect('/auth/signin');

  let detail;
  try {
    detail = await getDeliveryBatchDetailService(db, ctx, batchId);
  } catch {
    notFound();
  }

  const client = await findClientById(
    db,
    ctx.workspace.id,
    detail.batch.clientId
  );

  return (
    <DashboardShell
      session={ctx}
      breadcrumb={`Delivery / ${detail.batch.title}`}
    >
      <BatchWorkspaceClient
        initialData={detail}
        defaultRecipientEmail={client?.contactEmail || ctx.user.email}
        canWrite={hasPermission(ctx.role, 'delivery:write')}
        canPublish={hasPermission(ctx.role, 'delivery:publish')}
      />
    </DashboardShell>
  );
}
