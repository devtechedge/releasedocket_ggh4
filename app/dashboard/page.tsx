import { AlertTriangle, ArrowRight, CheckCircle2, GitPullRequest } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import DashboardShell from '@/components/DashboardShell';
import { ReceiptStateBadge, EvidenceStateBadge } from '@/components/StatusText';
import { getDb } from '@/db/client';
import { formatUtcDate } from '@/lib/format';
import { getOptionalSessionContext } from '@/services/auth.service';
import { getAgencyOverviewService } from '@/services/overview.service';

export const dynamic = 'force-dynamic';

export default async function DashboardOverviewPage() {
  const db = await getDb();
  const ctx = await getOptionalSessionContext(db);
  if (!ctx) redirect('/auth/signin');

  const overview = await getAgencyOverviewService(db, ctx);

  return (
    <DashboardShell
      session={ctx}
      breadcrumb="Overview"
      primaryAction={
        <Link
          href="/dashboard/delivery"
          className="rounded-md bg-blue-800 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-900 whitespace-nowrap"
        >
          New Delivery Batch
        </Link>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-slate-900">
              Operations Overview
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Actionable delivery queues, pending client sign-offs, stale/failed evidence, and GitHub sync health.
            </p>
          </div>
          <Link
            href="/onboarding"
            className="text-xs font-medium text-blue-800 hover:underline whitespace-nowrap"
          >
            View Onboarding Checklist →
          </Link>
        </div>

        {/* Actionable KPI Strip (single-level border, tabular-nums, no decorative icons) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">
              Awaiting Publication
            </div>
            <div className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">
              {overview.counts.awaitingPublication}
            </div>
            <div className="mt-1 text-xs text-slate-500">Draft batches</div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">
              Pending / Changes Requested
            </div>
            <div className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">
              {overview.counts.pendingSignOffs}
            </div>
            <div className="mt-1 text-xs text-slate-500">Client sign-offs</div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">
              Stale or Failed Evidence
            </div>
            <div className="mt-2 font-display text-2xl font-bold text-amber-800 tabular-nums">
              {overview.counts.staleOrFailedEvidence}
            </div>
            <div className="mt-1 text-xs text-slate-500">Requires review</div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-xs font-medium text-slate-500">
              GitHub Installations
            </div>
            <div className="mt-2 font-display text-2xl font-bold text-slate-900 tabular-nums">
              {overview.counts.installations}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {overview.counts.projects} active projects
            </div>
          </div>
        </div>

        {/* Two-column actionable queues */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pending Client Sign-Offs */}
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Client Sign-Offs & Change Requests
              </h2>
              <Link
                href="/dashboard/delivery"
                className="text-xs font-medium text-blue-800 hover:underline"
              >
                All batches
              </Link>
            </div>
            {overview.pendingSignOffs.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">
                No published receipts are awaiting client action.
              </div>
            ) : (
              <ul className="divide-y divide-slate-200">
                {overview.pendingSignOffs.map((item) => (
                  <li key={item.receiptId} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/dashboard/delivery/${item.batchId}`}
                          className="text-sm font-medium text-slate-900 hover:text-blue-800"
                        >
                          {item.title}
                        </Link>
                        <div className="mt-1 text-xs text-slate-500">
                          {item.clientName} · {item.projectName} · v{item.versionNumber}
                          {item.hasGaps ? ' · Gaps disclosed' : ''}
                        </div>
                      </div>
                      <ReceiptStateBadge state={item.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Stale or Failed Evidence */}
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Stale & Failed Evidence Attention
              </h2>
              <Link
                href="/dashboard/reports"
                className="text-xs font-medium text-blue-800 hover:underline"
              >
                Retainer Report
              </Link>
            </div>
            {overview.staleOrFailedEvidence.length === 0 ? (
              <div className="p-6 text-sm text-slate-500 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
                <span>No stale SHA or failed CI observations in recent batches.</span>
              </div>
            ) : (
              <ul className="divide-y divide-slate-200">
                {overview.staleOrFailedEvidence.map((ev, idx) => (
                  <li key={`${ev.batchId}-${idx}`} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/dashboard/delivery/${ev.batchId}`}
                          className="text-sm font-medium text-slate-900 hover:text-blue-800"
                        >
                          {ev.evidenceTitle}
                        </Link>
                        <div className="mt-1 text-xs text-slate-600">
                          {ev.batchTitle} — {ev.reason}
                        </div>
                      </div>
                      <EvidenceStateBadge state={ev.state} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Batches Awaiting Publication + Sync Health */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Draft Batches Awaiting Publication
              </h2>
              <Link
                href="/dashboard/delivery"
                className="text-xs font-medium text-blue-800 hover:underline"
              >
                Create batch
              </Link>
            </div>
            {overview.awaitingPublication.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">
                No unpublished draft batches. Create a delivery batch when a milestone is ready for evidence mapping.
              </div>
            ) : (
              <ul className="divide-y divide-slate-200">
                {overview.awaitingPublication.map((b) => (
                  <li key={b.id} className="px-5 py-3.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/delivery/${b.id}`}
                        className="text-sm font-medium text-slate-900 hover:text-blue-800"
                      >
                        {b.title}
                      </Link>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {b.clientName} · {b.projectName}
                      </div>
                    </div>
                    <Link
                      href={`/dashboard/delivery/${b.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-800 hover:underline whitespace-nowrap"
                    >
                      <span>Prepare</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border border-slate-200 bg-white">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                GitHub Integration Health
              </h2>
              <Link
                href="/dashboard/integrations"
                className="text-xs font-medium text-blue-800 hover:underline"
              >
                Manage sync
              </Link>
            </div>
            {overview.installations.length === 0 ? (
              <div className="p-6 text-sm text-slate-500 flex items-center justify-between gap-3">
                <span>No GitHub installation connected yet.</span>
                <Link
                  href="/dashboard/integrations"
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
                >
                  Connect GitHub
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-slate-200">
                {overview.installations.map((inst) => (
                  <li key={inst.id} className="px-5 py-4 flex items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5">
                      <GitPullRequest className="h-4 w-4 text-slate-500 mt-0.5" aria-hidden="true" />
                      <div>
                        <div className="text-sm font-medium text-slate-900">
                          {inst.accountLogin}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Mode: {inst.mode === 'demo_synthetic' ? 'DEMO Synthetic' : 'GitHub Live'} · Health: {inst.healthStatus}
                        </div>
                        {inst.lastError && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-red-700">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{inst.lastError}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="font-mono text-xs text-slate-500 whitespace-nowrap">
                      {inst.lastSyncAt
                        ? formatUtcDate(inst.lastSyncAt)
                        : 'Never synced'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </DashboardShell>
  );
}
