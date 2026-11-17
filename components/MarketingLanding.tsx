'use client';

import {
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  GitPullRequest,
  Lock,
  FileCheck2,
} from 'lucide-react';
import { motion } from 'motion/react';
import Link from 'next/link';
import { useState } from 'react';
import { calculateMrrArithmetic, PLAN_CATALOG } from '@/domain/billing';
import { formatUsdNumber } from '@/lib/format';

export default function MarketingLanding({
  demoAllowed,
  isAuthenticated,
}: {
  demoAllowed: boolean;
  isAuthenticated: boolean;
}) {
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);

  const mrrExample = calculateMrrArithmetic('agency', 21);
  const plans = Object.values(PLAN_CATALOG);

  async function handleLaunchDemo() {
    setLoadingDemo(true);
    setDemoError(null);
    try {
      const res = await fetch('/api/auth/demo', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setDemoError(data.error || 'Could not start demo workspace.');
        setLoadingDemo(false);
        return;
      }
      window.location.assign('/dashboard');
    } catch {
      setDemoError('Network error starting demo workspace.');
      setLoadingDemo(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between gap-8">
          <Link
            href="/"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            ReleaseDocket
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600"
          >
            <a
              href="#workflow"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Workflow
            </a>
            <a
              href="#integrity"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Integrity
            </a>
            <a
              href="#pricing"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Pricing
            </a>
            <a
              href="#security"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Security
            </a>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              href={isAuthenticated ? '/dashboard' : '/auth/signin'}
              className="rounded-md bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900 transition-colors whitespace-nowrap shrink-0"
            >
              {isAuthenticated ? 'Open Workspace' : 'Sign In'}
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Split Section */}
      <section className="mx-auto max-w-6xl px-6 pt-14 pb-16 lg:pt-20 lg:pb-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="lg:col-span-6 flex flex-col justify-between"
          >
            <div>
              <p className="text-sm font-medium text-blue-800 mb-3">
                For 5–30 person software & AI-automation agencies
              </p>
              <h1
                className="font-display font-bold tracking-tight text-slate-900 leading-[1.1] mb-5"
                style={{
                  fontSize: 'clamp(2.25rem, 4vw, 3.35rem)',
                  textWrap: 'balance',
                }}
              >
                Turn merged commits into signed client delivery receipts.
              </h1>
              <p className="text-base text-slate-600 leading-relaxed max-w-xl mb-8">
                Connect read-only GitHub repositories, map them to client projects and human acceptance criteria, and publish immutable, evidence-backed Delivery Receipts that separate engineering observations from agency statements.
              </p>

              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/auth/signup"
                  className="inline-flex items-center gap-2 rounded-md bg-blue-800 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-900 transition-colors whitespace-nowrap"
                >
                  <span>Create Agency Workspace</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                {demoAllowed && (
                  <button
                    type="button"
                    onClick={handleLaunchDemo}
                    disabled={loadingDemo}
                    className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap disabled:opacity-50"
                  >
                    <span>
                      {loadingDemo
                        ? 'Opening Demo Agency...'
                        : 'Launch Seeded Demo'}
                    </span>
                  </button>
                )}
              </div>

              {demoError && (
                <p role="alert" className="mt-3 text-sm text-red-700">
                  {demoError}
                </p>
              )}
            </div>

            <div className="mt-8 pt-5 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600">
              <span>Read-only GitHub App (no PATs)</span>
              <span>SHA-exact CI &amp; deploy match</span>
              <span>Immutable SHA-256 receipts</span>
            </div>
          </motion.div>

          {/* Interactive Specimen Card (single-level elevation, zero nested cards) */}
          <div className="lg:col-span-6 rounded-lg border border-slate-200 bg-white p-6">
            <div>
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <div className="text-xs text-slate-500">
                    Specimen Delivery Receipt · Version 1 · Sample Data
                  </div>
                  <h2 className="font-display text-lg font-semibold text-slate-900 mt-1">
                    Sprint 14 — Manifest CSV Importer &amp; Retry Queue
                  </h2>
                  <div className="text-xs text-slate-500 mt-1">
                    Vanguard Logistics · Freight Dispatch Portal · Published Nov 15, 2026
                  </div>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 whitespace-nowrap shrink-0">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                  Gaps Disclosed
                </span>
              </div>

              <div className="py-4 border-b border-slate-200 space-y-3.5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      01. Multi-leg manifest CSV import validation
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono">
                      Observed GitHub · PR #142 merged · CI passed @ 9f3a1c2
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 whitespace-nowrap shrink-0">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    Verified
                  </span>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      02. Carrier webhook retry &amp; dead-letter routing
                    </div>
                    <div className="text-xs text-amber-800 mt-0.5 font-mono">
                      CI ran on a1100ff; target head moved to c4d8e91 (stale)
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 whitespace-nowrap shrink-0">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    Stale SHA
                  </span>
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-900">
                      03. Staging CSV export walkthrough &amp; caveats
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 font-mono">
                      Agency Statement (User-Supplied) · 10,400-row run recorded
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 whitespace-nowrap shrink-0">
                    Attributed
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500 font-mono">
                SHA-256: e4b9c21088a7... · Client Sign-Off Pending
              </div>
              {demoAllowed && (
                <Link
                  href="/portal/demo-vanguard-v1-token"
                  className="text-xs font-medium text-blue-800 hover:underline whitespace-nowrap"
                >
                  Open Interactive Client Portal Specimen →
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Core Workflow Section */}
      <section id="workflow" className="border-t border-slate-200 bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl mb-10">
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
              Own commit → evidence → client delivery → acceptance
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              ReleaseDocket integrates with your existing GitHub workflow rather than replacing Jira, Linear, or CI runners.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="border-t border-slate-200 pt-4">
              <h3 className="font-display text-base font-semibold text-slate-900">
                01. Map Repositories
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Install our read-only GitHub App without Personal Access Tokens and map repositories to client retainers.
              </p>
            </div>
            <div className="border-t border-slate-200 pt-4">
              <h3 className="font-display text-base font-semibold text-slate-900">
                02. Define Criteria
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Record promised scope and human-written acceptance criteria with expected proof before publishing.
              </p>
            </div>
            <div className="border-t border-slate-200 pt-4">
              <h3 className="font-display text-base font-semibold text-slate-900">
                03. Attach Evidence
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Link PRs, reviews, check runs, deployments, and user-supplied notes. Missing or mismatched SHAs never turn green.
              </p>
            </div>
            <div className="border-t border-slate-200 pt-4">
              <h3 className="font-display text-base font-semibold text-slate-900">
                04. Publish & Sign Off
              </h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                Publish a SHA-256 hashed receipt version to a noindex client link for audited acceptance or change requests.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Evidence Integrity Guarantee */}
      <section id="integrity" className="border-t border-slate-200 bg-slate-50 py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="max-w-2xl mb-8">
            <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
              Evidence integrity enforced in domain logic
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Clients can immediately distinguish observed repository facts from agency statements and formal sign-off.
            </p>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Signal Layer</th>
                  <th className="px-4 py-3">What It Proves</th>
                  <th className="px-4 py-3">What It Never Proves</th>
                  <th className="px-4 py-3">Failure / Mismatch Rule</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-slate-700">
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-900">Merged Pull Request</td>
                  <td className="px-4 py-3">Code merged to branch at merge SHA</td>
                  <td className="px-4 py-3">Feature correctness or criterion pass</td>
                  <td className="px-4 py-3">Never auto-completes human criteria</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-900">CI Check / Workflow</td>
                  <td className="px-4 py-3">Automated suite result on tested SHA</td>
                  <td className="px-4 py-3">Subsequent commits or staging health</td>
                  <td className="px-4 py-3 font-mono text-xs">testedSha !== targetSha → Stale</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-900">Deployment Status</td>
                  <td className="px-4 py-3">Environment trigger on deployed SHA</td>
                  <td className="px-4 py-3">Browser acceptance or UX sign-off</td>
                  <td className="px-4 py-3 font-mono text-xs">Missing SHA → Unknown</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-slate-900">AI Draft Summary</td>
                  <td className="px-4 py-3">Human-approved summary phrasing</td>
                  <td className="px-4 py-3">Engineering evidence of any kind</td>
                  <td className="px-4 py-3">Cites evidence IDs or Agency Statement</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Pricing & Transparent MRR Arithmetic */}
      <section id="pricing" className="border-t border-slate-200 bg-white py-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-10">
            <div>
              <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900">
                Agency plans built around project & receipt volume
              </h2>
              <p className="mt-2 text-sm text-slate-600">
                Historical receipt read access is preserved permanently on every tier, even after downgrade.
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-700 font-mono">
              Target model arithmetic: {mrrExample.accountCount} Agency accounts × ${mrrExample.unitPriceUsd} = ${formatUsdNumber(mrrExample.grossMrrUsd)} gross MRR (before churn, discounts, tax & fees)
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.tier}
                className={`rounded-lg border p-6 flex flex-col justify-between ${
                  plan.tier === 'agency'
                    ? 'border-blue-800 bg-blue-50/20'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {plan.name}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{plan.tagline}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="font-display text-3xl font-bold text-slate-900 tabular-nums">
                      ${plan.monthlyPriceUsd}
                    </span>
                    <span className="text-xs text-slate-500">/month</span>
                  </div>

                  <dl className="mt-5 space-y-2 border-t border-slate-200 pt-4 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Active Projects</dt>
                      <dd className="font-mono font-medium text-slate-900">
                        {plan.maxProjects}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Team Members</dt>
                      <dd className="font-mono font-medium text-slate-900">
                        {plan.maxMembers}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Receipts / Month</dt>
                      <dd className="font-mono font-medium text-slate-900">
                        {plan.maxReceiptsPerMonth ?? 'Unlimited'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Portal Branding</dt>
                      <dd className="font-medium text-slate-900">
                        {plan.customBranding ? 'Included' : 'Standard'}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Audit Exports</dt>
                      <dd className="font-medium text-slate-900">
                        {plan.auditExports ? 'Included' : 'Agency+'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <Link
                  href="/auth/signup"
                  className={`mt-6 block w-full rounded-md px-4 py-2 text-center text-xs font-medium transition-colors ${
                    plan.tier === 'agency'
                      ? 'bg-blue-800 text-white hover:bg-blue-900'
                      : 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                  }`}
                >
                  Start with {plan.name}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security & Minimal Permissions */}
      <section id="security" className="border-t border-slate-200 bg-slate-50 py-14">
        <div className="mx-auto max-w-6xl px-6 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex items-start gap-3">
            <GitPullRequest className="h-5 w-5 text-blue-800 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Read-Only GitHub App
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Requests read access only for metadata, pull requests, checks, actions, and deployments. Never stores repository source code or asks for Personal Access Tokens.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-blue-800 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Zero-Leak Client Portal
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Portal links are SHA-256 hashed, expire automatically, support 6-digit OTP verification, set noindex headers, and omit all internal agency notes.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-blue-800 shrink-0 mt-0.5" aria-hidden="true" />
            <div>
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Audited & Tenant-Isolated
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Every workspace query is server-scoped by tenant ID with PostgreSQL RLS defense-in-depth and an append-only audit log of publishes and client actions.
              </p>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-8">
        <div className="mx-auto max-w-6xl px-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <FileCheck2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
            <span>ReleaseDocket — Verifiable Delivery Receipts for Software Agencies</span>
          </div>
          <div className="flex items-center gap-6">
            <Link href="/auth/signin" className="hover:text-slate-800">
              Sign In
            </Link>
            <Link href="/auth/signup" className="hover:text-slate-800">
              Create Workspace
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
