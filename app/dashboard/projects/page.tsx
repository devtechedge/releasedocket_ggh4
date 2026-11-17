import { redirect } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import ProjectsManager from '@/components/ProjectsManager';
import { getDb } from '@/db/client';
import { hasPermission } from '@/domain/rbac';
import { getOptionalSessionContext } from '@/services/auth.service';
import { listCrmOverviewService } from '@/services/crm.service';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const db = await getDb();
  const ctx = await getOptionalSessionContext(db);
  if (!ctx) redirect('/auth/signin');

  const crm = await listCrmOverviewService(db, ctx);

  return (
    <DashboardShell session={ctx} breadcrumb="Projects">
      <ProjectsManager
        initialProjects={crm.projects}
        clients={crm.clients}
        initialMappings={crm.mappings}
        repositories={crm.repositories}
        canWrite={hasPermission(ctx.role, 'projects:write')}
      />
    </DashboardShell>
  );
}
