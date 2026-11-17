'use client';

import { ArrowRight, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { ReceiptStateBadge } from '@/components/StatusText';
import type { ProjectRecord } from '@/repositories/crm.repo';

interface BatchListItem {
  id: string;
  projectId: string;
  projectName: string;
  clientName: string;
  title: string;
  summary: string;
  targetDate: string | null;
  targetSha: string | null;
  status: string;
  latestVersionNumber: number | null;
  latestHasGaps: boolean | null;
  updatedAt: string;
}

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'published', label: 'Published' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'changes_requested', label: 'Changes Requested' },
] as const;

export default function DeliveryListManager({
  initialBatches,
  projects,
  canWrite,
}: {
  initialBatches: BatchListItem[];
  projects: ProjectRecord[];
  canWrite: boolean;
}) {
  const [batches] = useState(initialBatches);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [showForm, setShowForm] = useState(false);

  const [projectId, setProjectId] = useState(projects[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [targetDate, setTargetDate] = useState('');
  const [targetSha, setTargetSha] = useState('');
  const [criterionTitle, setCriterionTitle] = useState('');
  const [criterionExpected, setCriterionExpected] = useState(
    'Merged PR + passing CI on exact merge SHA + staging verification'
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = batches.filter((b) => {
    if (statusFilter !== 'all' && b.status !== statusFilter) return false;
    if (
      query &&
      !b.title.toLowerCase().includes(query.toLowerCase()) &&
      !b.projectName.toLowerCase().includes(query.toLowerCase()) &&
      !b.clientName.toLowerCase().includes(query.toLowerCase())
    ) {
      return false;
    }
    return true;
  });

  async function handleCreateBatch(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          title,
          summary,
          targetDate: targetDate || null,
          targetSha: targetSha || null,
          criteria: criterionTitle.trim()
            ? [
                {
                  title: criterionTitle.trim(),
                  category: 'feature',
                  priority: 'high',
                  expectedEvidence: criterionExpected.trim(),
                },
              ]
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not create delivery batch.');
        setSubmitting(false);
        return;
      }
      window.location.assign(`/dashboard/delivery/${data.batchId}`);
    } catch {
      setError('Network error creating delivery batch.');
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Delivery Batches
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Define promised work, attach GitHub observations, disclose gaps, and publish immutable client receipts.
          </p>
        </div>

        {canWrite && (
          <button
            type="button"
            disabled={projects.length === 0}
            onClick={() => setShowForm((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-800 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-900 disabled:opacity-50 whitespace-nowrap"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>{showForm ? 'Close Form' : 'New Delivery Batch'}</span>
          </button>
        )}
      </div>

      {projects.length === 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          Create a client and project before opening a delivery batch.
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreateBatch}
          className="rounded-lg border border-slate-200 bg-white p-5 space-y-4"
        >
          <h2 className="font-display text-base font-semibold text-slate-900">
            Create delivery batch
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="batch-project"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Project
              </label>
              <select
                id="batch-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.clientName} — {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="batch-title"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Batch title
              </label>
              <input
                id="batch-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Sprint 15 — Webhook Signature Hardening"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="batch-date"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Target delivery date
              </label>
              <input
                id="batch-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="batch-sha"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Target commit SHA (optional; used for CI/Deploy matching)
              </label>
              <input
                id="batch-sha"
                type="text"
                value={targetSha}
                onChange={(e) => setTargetSha(e.target.value)}
                placeholder="9f3a1c2e8b41d0f3a91c"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="batch-summary"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Scope summary (client-visible when published)
            </label>
            <textarea
              id="batch-summary"
              required
              rows={2}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Implemented HMAC verification and idempotent webhook ingestion for carrier events."
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
            <div>
              <label
                htmlFor="batch-crit-title"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                First acceptance criterion (optional)
              </label>
              <input
                id="batch-crit-title"
                type="text"
                value={criterionTitle}
                onChange={(e) => setCriterionTitle(e.target.value)}
                placeholder="Reject invalid webhook signatures with HTTP 401"
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="batch-crit-exp"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Expected evidence
              </label>
              <input
                id="batch-crit-exp"
                type="text"
                value={criterionExpected}
                onChange={(e) => setCriterionExpected(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
            >
              {error}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-blue-800 px-4 py-2 text-xs font-medium text-white hover:bg-blue-900 disabled:opacity-50"
            >
              {submitting ? 'Creating Batch...' : 'Create & Open Batch'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                statusFilter === f.key
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search
            className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            aria-label="Search delivery batches"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by batch, client, project..."
            className="w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 focus:border-blue-800 focus:outline-none"
          />
        </div>
      </div>

      {/* Batches Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No delivery batches match the current filter.
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3">Batch & Scope</th>
                <th className="px-4 py-3">Client / Project</th>
                <th className="px-4 py-3">Version & Gaps</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filtered.map((b) => (
                <tr key={b.id} className="hover:bg-slate-50/70">
                  <td className="px-4 py-3.5">
                    <Link
                      href={`/dashboard/delivery/${b.id}`}
                      className="font-medium text-slate-900 hover:text-blue-800"
                    >
                      {b.title}
                    </Link>
                    <div className="text-xs text-slate-500 mt-0.5 line-clamp-1 max-w-md">
                      {b.summary}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-slate-700">
                    <div className="font-medium text-slate-900">{b.clientName}</div>
                    <div className="text-slate-500">{b.projectName}</div>
                  </td>
                  <td className="px-4 py-3.5 text-xs font-mono text-slate-600">
                    {b.latestVersionNumber ? (
                      <span>
                        v{b.latestVersionNumber}
                        {b.latestHasGaps ? ' · Gaps disclosed' : ' · Clean'}
                      </span>
                    ) : (
                      <span>Unpublished</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <ReceiptStateBadge state={b.status} />
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <Link
                      href={`/dashboard/delivery/${b.id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-blue-800 hover:underline whitespace-nowrap"
                    >
                      <span>Open</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
