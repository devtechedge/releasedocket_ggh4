'use client';

import { RefreshCw, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { formatSourceOriginLabel } from '@/components/StatusText';
import { formatUtcDateTime, formatUtcTime } from '@/lib/format';
import type {
  GitHubInstallationRecord,
  GitHubRepositoryRecord,
  SourceObservationRecord,
} from '@/repositories/github.repo';

interface IntegrationsData {
  installations: GitHubInstallationRecord[];
  repositories: GitHubRepositoryRecord[];
  observations: SourceObservationRecord[];
  deliveries: Array<{
    id: string;
    deliveryId: string;
    eventType: string;
    signatureValid: boolean;
    status: string;
    errorMessage: string | null;
    receivedAt: string;
  }>;
  gitHubAppConfigured: boolean;
  demoModeAllowed: boolean;
  permissionExplanations: readonly { scope: string; reason: string }[];
  appSlug: string;
}

export default function IntegrationsClientView({
  initialData,
  canManage,
}: {
  initialData: IntegrationsData;
  canManage: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState(initialData);
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch('/api/integrations/github');
    if (res.ok) {
      setData(await res.json());
    }
    router.refresh();
  }

  async function handleConnectDemo() {
    setBusy(true);
    setError(null);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/integrations/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect_demo' }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not connect Demo GitHub.');
        return;
      }
      await refresh();
      setStatusMsg(
        `Connected DEMO GitHub installation (${json.repositoriesCount} repositories, ${json.observationCount} synthetic observations).`
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleSync(installationId: string) {
    setBusy(true);
    setError(null);
    setStatusMsg(null);
    try {
      const res = await fetch('/api/integrations/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_installation', installationId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Sync failed.');
        return;
      }
      await refresh();
      setStatusMsg(
        `Sync completed (${json.syncedObservations} observations reconciled).`
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            GitHub App & Evidence Ingestion
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Read-only GitHub App integration. Never requests write access or Personal Access Tokens (PATs).
          </p>
        </div>

        {canManage && (
          <div className="flex flex-wrap items-center gap-2">
            {data.gitHubAppConfigured ? (
              <a
                href={`https://github.com/apps/${data.appSlug}/installations/new`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-md bg-blue-800 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-900 whitespace-nowrap"
              >
                Install Read-Only GitHub App
              </a>
            ) : (
              <span className="rounded-md border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-600">
                Live GitHub App disconnected (credentials not configured)
              </span>
            )}

            {data.demoModeAllowed && (
              <button
                type="button"
                disabled={busy}
                onClick={handleConnectDemo}
                className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
              >
                {busy ? 'Connecting...' : 'Connect DEMO GitHub Installation'}
              </button>
            )}
          </div>
        )}
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

      {/* Read-Only Permission Explanation */}
      <section className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-blue-800" aria-hidden="true" />
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Minimal Read-Only GitHub Permissions
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {data.permissionExplanations.map((p) => (
            <div key={p.scope} className="border-t border-slate-100 pt-2">
              <div className="font-semibold text-slate-900">{p.scope}</div>
              <p className="text-slate-600 mt-1">{p.reason}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Installations */}
      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Connected Installations ({data.installations.length})
          </h2>
        </div>
        {data.installations.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">
            No GitHub installation connected to this workspace yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {data.installations.map((inst) => (
              <div
                key={inst.id}
                className="p-4 flex flex-wrap items-center justify-between gap-4"
              >
                <div>
                  <div className="text-sm font-semibold text-slate-900">
                    {inst.accountLogin}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 font-mono">
                    ID: {inst.installationExternalId} · Mode:{' '}
                    {inst.mode === 'demo_synthetic' ? 'DEMO Synthetic' : 'GitHub Live'} · Health:{' '}
                    {inst.healthStatus} · Last sync:{' '}
                    {inst.lastSyncAt
                      ? formatUtcDateTime(inst.lastSyncAt)
                      : 'Never'}
                  </div>
                </div>
                {canManage && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => handleSync(inst.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Manual Sync</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Repositories & Observations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Discovered Repositories ({data.repositories.length})
            </h2>
          </div>
          {data.repositories.length === 0 ? (
            <div className="p-6 text-xs text-slate-500">No repositories yet.</div>
          ) : (
            <ul className="divide-y divide-slate-200 text-xs">
              {data.repositories.map((r) => (
                <li key={r.id} className="px-5 py-3 flex items-center justify-between">
                  <span className="font-mono font-medium text-slate-900">
                    {r.fullName}
                  </span>
                  <span className="text-slate-500">
                    {r.defaultBranch} · {r.mode === 'demo_synthetic' ? 'DEMO' : 'Live'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Recent Webhook Deliveries ({data.deliveries.length})
            </h2>
          </div>
          {data.deliveries.length === 0 ? (
            <div className="p-6 text-xs text-slate-500">
              No webhook deliveries recorded yet. Endpoint: <span className="font-mono">/api/webhooks/github</span>
            </div>
          ) : (
            <ul className="divide-y divide-slate-200 text-xs">
              {data.deliveries.map((d) => (
                <li key={d.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="font-mono font-medium text-slate-900">
                      {d.eventType} · {d.status}
                    </div>
                    <div className="text-slate-500 font-mono">
                      Delivery {d.deliveryId}
                    </div>
                  </div>
                  <span className="text-slate-500 font-mono">
                    {formatUtcTime(d.receivedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Observations Stream */}
      <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="font-display text-sm font-semibold text-slate-900">
            Ingested Engineering Observations (Metadata Only · {data.observations.length})
          </h2>
        </div>
        {data.observations.length === 0 ? (
          <div className="p-6 text-xs text-slate-500">
            No observations ingested yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">Title & Repo</th>
                  <th className="px-4 py-2.5">Type / Origin</th>
                  <th className="px-4 py-2.5">SHA</th>
                  <th className="px-4 py-2.5">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {data.observations.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">{o.title}</div>
                      <div className="text-slate-500 font-mono">
                        {o.repoFullName} · {o.actor}
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div>{o.observationType}</div>
                      <div className="text-slate-500">
                        {formatSourceOriginLabel(o.sourceOrigin)}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">
                      {(o.testedSha || o.mergeCommitSha || o.headSha || '—').slice(0, 7)}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-700">
                      {o.rawConclusion || o.rawState}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
