import { redirect } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import TeamClientView from '@/components/TeamClientView';
import { getDb } from '@/db/client';
import { hasPermission } from '@/domain/rbac';
import {
  getOptionalSessionContext,
  getTeamOverviewService,
} from '@/services/auth.service';

export const dynamic = 'force-dynamic';

export default async function TeamPage() {
  const db = await getDb();
  const ctx = await getOptionalSessionContext(db);
  if (!ctx) redirect('/auth/signin');

  const team = await getTeamOverviewService(db, ctx);

  return (
    <DashboardShell session={ctx} breadcrumb="Team">
      <TeamClientView
        initialMembers={team.members}
        initialInvitations={team.invitations}
        canInvite={hasPermission(ctx.role, 'team:invite')}
        canManageRoles={hasPermission(ctx.role, 'team:manage_roles')}
        currentUserId={ctx.user.id}
      />
    </DashboardShell>
  );
}
