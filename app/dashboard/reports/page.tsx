import { redirect } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import ReportsClientView from '@/components/ReportsClientView';
import { getDb } from '@/db/client';
import { listClients } from '@/repositories/crm.repo';
import { getOptionalSessionContext } from '@/services/auth.service';
import { generateRetainerReportService } from '@/services/reports.service';

export const dynamic = 'force-dynamic';

export default async function ReportsPage(context: {
  searchParams: Promise<{ clientId?: string }>;
}) {
  const { clientId } = await context.searchParams;
  const db = await getDb();
  const ctx = await getOptionalSessionContext(db);
  if (!ctx) redirect('/auth/signin');

  const [report, clients] = await Promise.all([
    generateRetainerReportService(db, ctx, { clientId }),
    listClients(db, ctx.workspace.id),
  ]);

  return (
    <DashboardShell session={ctx} breadcrumb="Reports">
      <ReportsClientView
        report={report}
        clients={clients}
        selectedClientId={clientId || ''}
      />
    </DashboardShell>
  );
}
