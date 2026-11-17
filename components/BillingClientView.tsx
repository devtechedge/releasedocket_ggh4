'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { PlanDefinition, WorkspaceUsageSnapshot } from '@/domain/billing';
import type { PlanTier, SubscriptionStatus } from '@/domain/types';
import { formatUsdNumber } from '@/lib/format';

interface BillingClientViewProps {
  initialData: {
    workspaceId: string;
    planTier: PlanTier;
    subscriptionStatus: SubscriptionStatus;
    stripeConfigured: boolean;
    simulatorAllowed: boolean;
    stripeCustomerId: string | null;
    currentPlan: PlanDefinition;
    usage: WorkspaceUsageSnapshot;
    catalog: PlanDefinition[];
    mrrArithmeticExample: {
      tier: PlanTier;
      unitPriceUsd: number;
      accountCount: number;
      grossMrrUsd: number;
      note: string;
    };
  };
  canManageBilling: boolean;
  checkoutQueryState?: string | null;
}

export default function BillingClientView({
  initialData,
  canManageBilling,
  checkoutQueryState,
}: BillingClientViewProps) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(
    checkoutQueryState === 'success'
      ? 'Checkout completed. Plan entitlements update as soon as Stripe delivers the verified webhook event.'
      : checkoutQueryState === 'canceled'
        ? 'Checkout canceled. No subscription changes were applied.'
        : null
  );

  const [simTier, setSimTier] = useState<PlanTier>(initialData.planTier);
  const [simStatus, setSimStatus] = useState<'active' | 'canceled' | 'past_due'>('active');

  async function refreshBilling() {
    const res = await fetch('/api/billing');
    if (res.ok) {
      const json = await res.json();
      setData(json);
      setSimTier(json.planTier);
    }
    router.refresh();
  }

  async function handleCheckout(tier: PlanTier) {
    setError(null);
    setStatusMsg(null);
    setBusyAction(`checkout:${tier}`);
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkout', tier }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not initiate Stripe Checkout.');
        return;
      }
      if (json.url) {
        window.location.assign(json.url);
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePortal() {
    setError(null);
    setStatusMsg(null);
    setBusyAction('portal');
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'portal' }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not open Stripe Customer Portal.');
        return;
      }
      if (json.url) {
        window.location.assign(json.url);
      }
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSimulateWebhook(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusMsg(null);
    setBusyAction('simulate');
    try {
      const res = await fetch('/api/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'simulate_webhook',
          tier: simTier,
          subscriptionStatus: simStatus,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Webhook simulation failed.');
        return;
      }
      await refreshBilling();
      setStatusMsg(
        `Simulated verified billing webhook: ${simTier.toUpperCase()} (${simStatus}).`
      );
    } finally {
      setBusyAction(null);
    }
  }

  const projectsPct = Math.min(
    100,
    Math.round((data.usage.projectCount / data.currentPlan.maxProjects) * 100)
  );
  const membersPct = Math.min(
    100,
    Math.round((data.usage.memberCount / data.currentPlan.maxMembers) * 100)
  );
  const receiptsLimit = data.currentPlan.maxReceiptsPerMonth;
  const receiptsPct =
    receiptsLimit === null
      ? 0
      : Math.min(
          100,
          Math.round((data.usage.receiptsPublishedThisMonth / receiptsLimit) * 100)
        );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Billing & Plan Entitlements
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Server-side workspace caps enforced from verified Stripe webhook state. Historical receipt reads are preserved across all plan changes.
          </p>
        </div>

        {canManageBilling && data.stripeConfigured && data.stripeCustomerId && (
          <button
            type="button"
            onClick={handlePortal}
            disabled={busyAction !== null}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
          >
            {busyAction === 'portal' ? 'Opening Portal...' : 'Manage Stripe Portal'}
          </button>
        )}
      </div>

      {!data.stripeConfigured && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-xs text-amber-950">
          <div className="font-semibold">
            Stripe Billing Disconnected (No Live Payments Active)
          </div>
          <p className="mt-1 text-amber-900">
            <code className="font-mono">STRIPE_SECRET_KEY</code> and{' '}
            <code className="font-mono">STRIPE_WEBHOOK_SECRET</code> are not configured in this environment. Live checkout is disabled; entitlement limits below still reflect the workspace plan tier and can be exercised in non-production via the webhook simulator.
          </p>
        </div>
      )}

      {statusMsg && (
        <div
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800"
        >
          {statusMsg}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-800"
        >
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <div className="text-xs font-medium text-slate-500">Current Plan</div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="font-display text-2xl font-bold text-slate-900">
              {data.currentPlan.name}
            </span>
            <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
              ${data.currentPlan.monthlyPriceUsd}/mo
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-600">
            Subscription state:{' '}
            <span className="font-mono font-semibold text-slate-900">
              {data.subscriptionStatus}
            </span>
          </div>
          <p className="mt-2 text-xs text-slate-500">{data.currentPlan.tagline}</p>
        </section>

        <section className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Active Workspace Usage vs. Server Limits
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Projects</span>
                <span className="font-mono font-medium text-slate-900 tabular-nums">
                  {data.usage.projectCount} / {data.currentPlan.maxProjects}
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full rounded bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-blue-800"
                  style={{ width: `${projectsPct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Team Members</span>
                <span className="font-mono font-medium text-slate-900 tabular-nums">
                  {data.usage.memberCount} / {data.currentPlan.maxMembers}
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full rounded bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-blue-800"
                  style={{ width: `${membersPct}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-600">
                <span>Receipts This Month</span>
                <span className="font-mono font-medium text-slate-900 tabular-nums">
                  {data.usage.receiptsPublishedThisMonth} /{' '}
                  {receiptsLimit === null ? 'Unlimited' : receiptsLimit}
                </span>
              </div>
              <div className="mt-1.5 h-2 w-full rounded bg-slate-100 overflow-hidden">
                <div
                  className="h-full bg-emerald-700"
                  style={{ width: `${receiptsLimit === null ? 15 : receiptsPct}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
            <span>
              Custom Portal Branding:{' '}
              <strong className="text-slate-900">
                {data.currentPlan.customBranding ? 'Included' : 'Studio+'}
              </strong>
            </span>
            <span>
              Audit Log JSON Export:{' '}
              <strong className="text-slate-900">
                {data.currentPlan.auditExports ? 'Included' : 'Agency+'}
              </strong>
            </span>
            <span>
              Multi-Pod Controls:{' '}
              <strong className="text-slate-900">
                {data.currentPlan.multiTeamControls ? 'Included' : 'Partner'}
              </strong>
            </span>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Agency Plan Catalog
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Billing upgrades and downgrades take effect strictly via verified Stripe webhook delivery.
          </p>
        </div>
        <div className="grid gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-200 md:grid-cols-4">
          {data.catalog.map((plan) => {
            const isCurrent = plan.tier === data.planTier;
            return (
              <div key={plan.tier} className="p-5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-base font-bold text-slate-900">
                      {plan.name}
                    </h3>
                    {isCurrent && (
                      <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="mt-2 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                    ${plan.monthlyPriceUsd}
                    <span className="text-xs font-normal text-slate-500">/mo</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">{plan.tagline}</p>

                  <ul className="mt-4 space-y-1.5 text-xs text-slate-700">
                    <li>Up to {plan.maxProjects} active projects</li>
                    <li>Up to {plan.maxMembers} workspace members</li>
                    <li>
                      {plan.maxReceiptsPerMonth === null
                        ? 'Unlimited receipts / month'
                        : `${plan.maxReceiptsPerMonth} receipts / month`}
                    </li>
                    <li>
                      {plan.customBranding
                        ? 'Custom portal branding'
                        : 'Standard ReleaseDocket branding'}
                    </li>
                    <li>
                      {plan.auditExports
                        ? 'Audit log JSON export included'
                        : 'In-app audit log viewer'}
                    </li>
                    {plan.multiTeamControls && <li>Multi-pod team controls</li>}
                  </ul>
                </div>

                <div className="mt-5 pt-4 border-t border-slate-100">
                  {canManageBilling ? (
                    <button
                      type="button"
                      disabled={
                        isCurrent || !data.stripeConfigured || busyAction !== null
                      }
                      onClick={() => handleCheckout(plan.tier)}
                      className={`w-full rounded-md px-3 py-2 text-xs font-medium ${
                        isCurrent
                          ? 'border border-slate-200 bg-slate-50 text-slate-500 cursor-default'
                          : data.stripeConfigured
                            ? 'bg-blue-800 text-white hover:bg-blue-900 disabled:opacity-50'
                            : 'border border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed'
                      }`}
                    >
                      {isCurrent
                        ? 'Active Tier'
                        : !data.stripeConfigured
                          ? 'Connect Stripe Keys to Subscribe'
                          : busyAction === `checkout:${plan.tier}`
                            ? 'Redirecting...'
                            : `Switch to ${plan.name}`}
                    </button>
                  ) : (
                    <span className="block text-xs text-slate-500">
                      Owner or Admin role required to change plan.
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {data.simulatorAllowed && canManageBilling && (
        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Non-Prod Test Webhook Simulator
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            Exercises the idempotent webhook billing processor locally while Stripe keys are disconnected. Automatically disabled in production or when Stripe is configured.
          </p>
          <form
            onSubmit={handleSimulateWebhook}
            className="mt-4 flex flex-wrap items-end gap-4"
          >
            <div>
              <label
                htmlFor="sim-tier"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Target Plan Tier
              </label>
              <select
                id="sim-tier"
                value={simTier}
                onChange={(e) => setSimTier(e.target.value as PlanTier)}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="solo">Solo ($99/mo · 2 projects)</option>
                <option value="studio">Studio ($249/mo · 8 projects)</option>
                <option value="agency">Agency ($499/mo · Audit export)</option>
                <option value="partner">Partner ($999/mo · 75 projects)</option>
              </select>
            </div>
            <div>
              <label
                htmlFor="sim-status"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Subscription State
              </label>
              <select
                id="sim-status"
                value={simStatus}
                onChange={(e) =>
                  setSimStatus(e.target.value as 'active' | 'canceled' | 'past_due')
                }
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="active">active</option>
                <option value="past_due">past_due (falls back to Solo caps)</option>
                <option value="canceled">canceled (preserves historical reads)</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={busyAction !== null}
              className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
            >
              {busyAction === 'simulate'
                ? 'Applying Webhook Event...'
                : 'Simulate Billing Webhook'}
            </button>
          </form>
        </section>
      )}

      <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-5 text-xs text-slate-600">
        <div className="font-semibold text-slate-800">
          Transparent Pricing Arithmetic Reference
        </div>
        <p className="mt-1 font-mono text-slate-800 tabular-nums">
          {data.mrrArithmeticExample.accountCount} accounts × $
          {data.mrrArithmeticExample.unitPriceUsd} ({data.mrrArithmeticExample.tier}{' '}
          tier) = ${formatUsdNumber(data.mrrArithmeticExample.grossMrrUsd)} gross MRR
        </p>
        <p className="mt-1 text-slate-500">
          {data.mrrArithmeticExample.note} This is a unit-economics illustration only, not reported customer traction.
        </p>
      </section>
    </div>
  );
}
