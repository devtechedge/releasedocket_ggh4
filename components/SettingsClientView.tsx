'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatUtcDateTime } from '@/lib/format';
import type { AuditEventRecord } from '@/repositories/audit.repo';

interface SettingsClientViewProps {
  workspace: {
    id: string;
    name: string;
    slug: string;
    agencyTagline: string;
    brandAccentColor: string;
    planTier: string;
    isDemo: boolean;
  };
  initialAuditEvents: AuditEventRecord[];
  canManageWorkspace: boolean;
  canExportAudit: boolean;
}

const EVENT_TYPES = [
  '',
  'workspace.created',
  'workspace.updated',
  'client.created',
  'project.created',
  'project.repo_mapped',
  'project.repo_unmapped',
  'batch.created',
  'batch.updated',
  'criterion.created',
  'criterion.status_updated',
  'evidence.attached_observation',
  'evidence.added_manual',
  'ai.summary_drafted',
  'ai.summary_approved',
  'receipt.published',
  'receipt.revoked',
  'portal.token_revoked',
  'portal.client_accepted',
  'portal.client_changes_requested',
  'portal.client_commented',
  'team.invited',
  'team.role_changed',
  'billing.subscription_updated',
  'integration.github_synced',
  'webhook.github_processed',
];

export default function SettingsClientView({
  workspace,
  initialAuditEvents,
  canManageWorkspace,
  canExportAudit,
}: SettingsClientViewProps) {
  const router = useRouter();
  const [name, setName] = useState(workspace.name);
  const [agencyTagline, setAgencyTagline] = useState(workspace.agencyTagline);
  const [brandAccentColor, setBrandAccentColor] = useState(
    workspace.brandAccentColor || '#1E40AF'
  );
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [events, setEvents] = useState(initialAuditEvents);
  const [eventFilter, setEventFilter] = useState('');
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatusMsg(null);
    setSaving(true);
    try {
      const res = await fetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, agencyTagline, brandAccentColor }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not update workspace settings.');
        return;
      }
      setStatusMsg('Workspace profile updated and recorded in the audit log.');
      await loadAuditEvents(eventFilter);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function loadAuditEvents(filterValue: string) {
    setLoadingEvents(true);
    setExportError(null);
    try {
      const qs = filterValue
        ? `?eventType=${encodeURIComponent(filterValue)}`
        : '';
      const res = await fetch(`/api/audit${qs}`);
      if (res.ok) {
        const json = await res.json();
        setEvents(json.events || []);
      }
    } finally {
      setLoadingEvents(false);
    }
  }

  async function handleExportJson() {
    setExportError(null);
    const res = await fetch('/api/audit?format=json_export');
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setExportError(
        json.error || 'Audit export requires the Agency or Partner plan.'
      );
      return;
    }
    const text = await res.text();
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `releasedocket-audit-${workspace.slug}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Workspace Settings & Audit Log
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Configure agency branding on client portals and inspect the append-only workspace audit trail.
        </p>
      </div>

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
        <form
          onSubmit={handleSaveProfile}
          className="lg:col-span-2 rounded-lg border border-slate-200 bg-white p-5 space-y-4"
        >
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Agency Identity & Portal Header
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                htmlFor="ws-name"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Workspace Name
              </label>
              <input
                id="ws-name"
                type="text"
                required
                minLength={2}
                maxLength={120}
                disabled={!canManageWorkspace}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
              />
            </div>
            <div>
              <label
                htmlFor="ws-color"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Portal Accent Color (Hex)
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="ws-color"
                  type="text"
                  pattern="^#[0-9a-fA-F]{6}$"
                  disabled={!canManageWorkspace}
                  value={brandAccentColor}
                  onChange={(e) => setBrandAccentColor(e.target.value)}
                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900 disabled:bg-slate-50"
                />
                <span
                  aria-hidden="true"
                  className="h-9 w-9 rounded-md border border-slate-300 shrink-0"
                  style={{ backgroundColor: brandAccentColor }}
                />
              </div>
            </div>
          </div>

          <div>
            <label
              htmlFor="ws-tagline"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              Agency Tagline (shown on published Delivery Receipts)
            </label>
            <input
              id="ws-tagline"
              type="text"
              maxLength={240}
              disabled={!canManageWorkspace}
              value={agencyTagline}
              onChange={(e) => setAgencyTagline(e.target.value)}
              placeholder="e.g. Boutique logistics & payments engineering"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50"
            />
          </div>

          {canManageWorkspace ? (
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Workspace Settings'}
            </button>
          ) : (
            <p className="text-xs text-slate-500">
              Owner or Admin role required to edit workspace profile settings.
            </p>
          )}
        </form>

        <section className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Security & Tenant Isolation Posture
          </h2>
          <dl className="space-y-2 text-xs text-slate-600">
            <div>
              <dt className="font-medium text-slate-800">Workspace ID</dt>
              <dd className="font-mono text-slate-600">{workspace.id}</dd>
            </div>
            <div>
              <dt className="font-medium text-slate-800">Client Portal Tokens</dt>
              <dd>
                256-bit cryptographic tokens stored as SHA-256 hashes;{' '}
                <code className="font-mono">X-Robots-Tag: noindex, nofollow</code> enforced.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-800">GitHub Integration Scope</dt>
              <dd>
                Read-only metadata (`pull_requests: read`, `checks: read`, `deployments: read`). Source code blobs are never stored.
              </dd>
            </div>
            <div>
              <dt className="font-medium text-slate-800">Portal Exposure</dt>
              <dd>
                Internal workspace notes are structurally omitted from all client portal payloads.
              </dd>
            </div>
          </dl>
        </section>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Workspace Audit Log ({events.length})
            </h2>
            <p className="text-xs text-slate-500">
              Append-only record of auth, evidence links, receipt publications, portal sign-offs, and billing events.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="audit-event-filter" className="sr-only">
              Filter by event type
            </label>
            <select
              id="audit-event-filter"
              value={eventFilter}
              onChange={(e) => {
                setEventFilter(e.target.value);
                loadAuditEvents(e.target.value);
              }}
              className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-900"
            >
              <option value="">All event types</option>
              {EVENT_TYPES.filter(Boolean).map((et) => (
                <option key={et} value={et}>
                  {et}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleExportJson}
              className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                canExportAudit
                  ? 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                  : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              {canExportAudit ? 'Export Audit JSON' : 'Export JSON (Agency+)'}
            </button>
          </div>
        </div>

        {exportError && (
          <div
            role="alert"
            className="mx-5 mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900"
          >
            {exportError}
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="px-4 py-2.5">Timestamp</th>
                <th className="px-4 py-2.5">Event</th>
                <th className="px-4 py-2.5">Actor</th>
                <th className="px-4 py-2.5">Resource</th>
                <th className="px-4 py-2.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loadingEvents ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    Loading audit events...
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-500">
                    No audit events match this filter.
                  </td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr key={ev.id}>
                    <td className="px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                      {formatUtcDateTime(ev.createdAt)}
                    </td>
                    <td className="px-4 py-2.5 font-mono font-medium text-slate-900 whitespace-nowrap">
                      {ev.eventType}
                    </td>
                    <td className="px-4 py-2.5 text-slate-700 max-w-[200px] break-words">
                      <span className="font-mono text-[11px] text-slate-500">
                        [{ev.actorType}]
                      </span>{' '}
                      {ev.actorLabel}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-600 whitespace-nowrap">
                      {ev.resourceType}:{ev.resourceId.slice(0, 12)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[11px] text-slate-500">
                      <div
                        className="max-w-[220px] truncate"
                        title={JSON.stringify(ev.metadata)}
                      >
                        {JSON.stringify(ev.metadata)}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
