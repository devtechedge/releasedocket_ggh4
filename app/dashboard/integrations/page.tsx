import { redirect } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import IntegrationsClientView from '@/components/IntegrationsClientView';
import { getDb } from '@/db/client';
import { hasPermission } from '@/domain/rbac';
import {
  GITHUB_APP_PERMISSION_EXPLANATIONS,
  isGitHubAppConfigured,
} from '@/integrations/github';
import {
  getOptionalSessionContext,
  isDemoModeAllowed,
} from '@/services/auth.service';
import { listIntegrationsOverviewService } from '@/services/github-sync.service';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage() {
  const db = await getDb();
  const ctx = await getOptionalSessionContext(db);
  if (!ctx) redirect('/auth/signin');

  const overview = await listIntegrationsOverviewService(db, ctx);

  return (
    <DashboardShell session={ctx} breadcrumb="Integrations">
      <IntegrationsClientView
        initialData={{
          ...overview,
          gitHubAppConfigured: isGitHubAppConfigured(),
          demoModeAllowed: isDemoModeAllowed(),
          permissionExplanations: GITHUB_APP_PERMISSION_EXPLANATIONS,
          appSlug: process.env.GITHUB_APP_SLUG || 'releasedocket-app',
        }}
        canManage={hasPermission(ctx.role, 'integrations:manage')}
      />
    </DashboardShell>
  );
}
