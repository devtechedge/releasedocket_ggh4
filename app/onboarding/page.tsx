import { CheckCircle2, Circle } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import { getDb } from '@/db/client';
import { getOptionalSessionContext } from '@/services/auth.service';
import { listCrmOverviewService } from '@/services/crm.service';
import { listDeliveryBatchesService } from '@/services/delivery.service';
import { listIntegrationsOverviewService } from '@/services/github-sync.service';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const db = await getDb();
  const ctx = await getOptionalSessionContext(db);
  if (!ctx) redirect('/auth/signin');

  const [crm, integrations, batches] = await Promise.all([
    listCrmOverviewService(db, ctx),
    listIntegrationsOverviewService(db, ctx),
    listDeliveryBatchesService(db, ctx),
  ]);

  const steps = [
    {
      title: '01. Agency profile & portal accent',
      description: 'Configure your agency name, tagline, and brand accent color for client receipts.',
      done: Boolean(ctx.workspace.name),
      href: '/dashboard/settings',
      cta: 'Review Settings',
    },
    {
      title: '02. Add your first retainer client',
      description: 'Record the client contact who will receive Delivery Receipt portal links.',
      done: crm.clients.length > 0,
      href: '/dashboard/clients',
      cta: 'Add Client',
    },
    {
      title: '03. Create a project',
      description: 'Group repositories and delivery batches under a client project.',
      done: crm.projects.length > 0,
      href: '/dashboard/projects',
      cta: 'Create Project',
    },
    {
      title: '04. Connect read-only GitHub App (or Demo mode)',
      description: 'We request read-only metadata, PRs, checks, and deployments — never Personal Access Tokens.',
      done: integrations.installations.length > 0,
      href: '/dashboard/integrations',
      cta: 'Configure GitHub',
    },
    {
      title: '05. Map a repository to your project',
      description: 'Bind ingested GitHub repositories to the matching client project.',
      done: crm.mappings.length > 0,
      href: '/dashboard/projects',
      cta: 'Map Repository',
    },
    {
      title: '06. Create & publish your first Delivery Batch',
      description: 'Define human acceptance criteria, attach observations, and publish an immutable receipt.',
      done: batches.some((b) => b.latestReceiptId !== null),
      href: '/dashboard/delivery',
      cta: 'Open Delivery',
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;

  return (
    <DashboardShell
      session={ctx}
      breadcrumb="Onboarding"
      primaryAction={
        <Link
          href="/dashboard"
          className="rounded-md bg-blue-800 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-900 whitespace-nowrap"
        >
          Go to Overview
        </Link>
      }
    >
      <div className="max-w-3xl">
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Agency workspace onboarding
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Complete these setup milestones to begin publishing evidence-backed Delivery Receipts ({completedCount}/{steps.length} complete).
        </p>

        <div className="mt-6 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {steps.map((step) => (
            <div
              key={step.title}
              className="p-5 flex items-center justify-between gap-4"
            >
              <div className="flex items-start gap-3">
                {step.done ? (
                  <CheckCircle2
                    className="h-5 w-5 text-emerald-700 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                ) : (
                  <Circle
                    className="h-5 w-5 text-slate-300 shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                )}
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">
                    {step.title}
                  </h2>
                  <p className="text-xs text-slate-600 mt-1">
                    {step.description}
                  </p>
                </div>
              </div>
              <Link
                href={step.href}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                {step.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
