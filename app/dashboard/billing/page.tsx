import { redirect } from 'next/navigation';
import BillingClientView from '@/components/BillingClientView';
import DashboardShell from '@/components/DashboardShell';
import { getDb } from '@/db/client';
import { hasPermission } from '@/domain/rbac';
import { getOptionalSessionContext } from '@/services/auth.service';
import { getBillingOverviewService } from '@/services/billing.service';

export const dynamic = 'force-dynamic';

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const db = await getDb();
  const ctx = await getOptionalSessionContext(db);
  if (!ctx) redirect('/auth/signin');

  const [overview, params] = await Promise.all([
    getBillingOverviewService(db, ctx),
    searchParams,
  ]);

  return (
    <DashboardShell session={ctx} breadcrumb="Billing">
      <BillingClientView
        initialData={overview}
        canManageBilling={hasPermission(ctx.role, 'billing:manage')}
        checkoutQueryState={params.checkout ?? null}
      />
    </DashboardShell>
  );
}
