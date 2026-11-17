'use client';

import { Download, Printer } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { ReceiptStateBadge } from '@/components/StatusText';
import { formatUtcDateTime } from '@/lib/format';
import type { ClientRecord } from '@/repositories/crm.repo';
import type { RetainerReportSnapshot } from '@/services/reports.service';

export default function ReportsClientView({
  report,
  clients,
  selectedClientId,
}: {
  report: RetainerReportSnapshot;
  clients: ClientRecord[];
  selectedClientId: string;
}) {
  const router = useRouter();

  function handleClientChange(nextClientId: string) {
    const query = nextClientId ? `?clientId=${encodeURIComponent(nextClientId)}` : '';
    router.push(`/dashboard/reports${query}`);
  }

  function handleDownloadMarkdown() {
    const query = selectedClientId
      ? `?clientId=${encodeURIComponent(selectedClientId)}&format=markdown`
      : '?format=markdown';
    window.location.href = `/api/reports/retainer${query}`;
  }

  function handlePrintPdf() {
    window.print();
  }

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Retainer Delivery Snapshot
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Dated summary separating observed GitHub metadata from agency statements and client sign-offs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter report by client"
            value={selectedClientId}
            onChange={(e) => handleClientChange(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900"
          >
            <option value="">All Clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleDownloadMarkdown}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 whitespace-nowrap"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Export Markdown</span>
          </button>

          <button
            type="button"
            onClick={handlePrintPdf}
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-800 px-3 py-2 text-xs font-medium text-white hover:bg-blue-900 whitespace-nowrap"
          >
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Print / Save PDF</span>
          </button>
        </div>
      </div>

      {/* Report Document Body */}
      <div className="print-surface rounded-lg border border-slate-200 bg-white p-6 space-y-6">
        <div className="border-b border-slate-200 pb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500 font-mono">
              Snapshot Generated: {formatUtcDateTime(report.generatedAt)}
              {report.isDemoWorkspace ? ' · DEMO DATA' : ''}
            </div>
            <h2 className="font-display text-xl font-bold text-slate-900 mt-1">
              {report.workspaceName} — {report.clientFilterName || 'All Retainer Clients'}
            </h2>
          </div>
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
          <strong>Evidence Boundary Notice:</strong> {report.disclaimer}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border border-slate-200 rounded-md p-3.5">
            <div className="text-xs text-slate-500">Published Receipts</div>
            <div className="mt-1 font-display text-xl font-bold text-slate-900 tabular-nums">
              {report.summary.receiptsPublished}
            </div>
          </div>
          <div className="border border-slate-200 rounded-md p-3.5">
            <div className="text-xs text-slate-500">Client Accepted</div>
            <div className="mt-1 font-display text-xl font-bold text-emerald-800 tabular-nums">
              {report.summary.receiptsAccepted}
            </div>
          </div>
          <div className="border border-slate-200 rounded-md p-3.5">
            <div className="text-xs text-slate-500">Pending / Changes Req.</div>
            <div className="mt-1 font-display text-xl font-bold text-amber-800 tabular-nums">
              {report.summary.receiptsPendingSignOff +
                report.summary.receiptsChangesRequested}
            </div>
          </div>
          <div className="border border-slate-200 rounded-md p-3.5">
            <div className="text-xs text-slate-500">Unresolved Criteria</div>
            <div className="mt-1 font-display text-xl font-bold text-slate-900 tabular-nums">
              {report.summary.unresolvedCriteriaCount}
            </div>
          </div>
        </div>

        {/* Receipt Table */}
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900 mb-3">
            01. Delivery Receipts Status
          </h3>
          {report.receiptRows.length === 0 ? (
            <p className="text-xs text-slate-500">No published receipts in scope.</p>
          ) : (
            <div className="overflow-x-auto border border-slate-200 rounded-md">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="px-3 py-2.5">Receipt</th>
                    <th className="px-3 py-2.5">Client / Project</th>
                    <th className="px-3 py-2.5">Version</th>
                    <th className="px-3 py-2.5">Gaps</th>
                    <th className="px-3 py-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {report.receiptRows.map((r) => (
                    <tr key={r.receiptId}>
                      <td className="px-3 py-2.5 font-medium text-slate-900">
                        {r.title}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">
                        {r.clientName} · {r.projectName}
                      </td>
                      <td className="px-3 py-2.5 font-mono">v{r.versionNumber}</td>
                      <td className="px-3 py-2.5">
                        {r.hasGaps ? 'Yes (disclosed)' : 'None'}
                      </td>
                      <td className="px-3 py-2.5">
                        <ReceiptStateBadge state={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Unresolved Criteria */}
        <div>
          <h3 className="font-display text-sm font-semibold text-slate-900 mb-3">
            02. Unresolved Criteria & Evidence Gaps
          </h3>
          {report.unresolvedCriteria.length === 0 ? (
            <p className="text-xs text-slate-500">No unresolved criteria.</p>
          ) : (
            <ul className="divide-y divide-slate-200 border border-slate-200 rounded-md text-xs">
              {report.unresolvedCriteria.map((u, i) => (
                <li key={i} className="px-3.5 py-2.5 flex justify-between gap-3">
                  <span>
                    <strong>{u.criterionTitle}</strong> ({u.projectName} · {u.batchTitle})
                  </span>
                  <span className="font-mono text-amber-800">{u.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Observed GitHub Facts vs Agency Statements */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 mb-2">
              03. Observed GitHub Facts (Activity Only)
            </h3>
            <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-72 overflow-y-auto text-xs">
              {report.githubFacts.length === 0 ? (
                <div className="p-3 text-slate-500">No GitHub facts recorded.</div>
              ) : (
                report.githubFacts.map((g) => (
                  <div key={g.id} className="p-2.5">
                    <div className="font-medium text-slate-900">{g.title}</div>
                    <div className="text-slate-500 font-mono">
                      {g.repoFullName} · {g.observationType} · {g.rawState}
                      {g.sha ? ` · ${g.sha.slice(0, 7)}` : ''}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 mb-2">
              04. Agency & Client-Supplied Statements
            </h3>
            <div className="border border-slate-200 rounded-md divide-y divide-slate-100 max-h-72 overflow-y-auto text-xs">
              {report.agencyStatements.length === 0 ? (
                <div className="p-3 text-slate-500">
                  No manual agency or client-supplied statements recorded.
                </div>
              ) : (
                report.agencyStatements.map((s, idx) => (
                  <div key={idx} className="p-2.5">
                    <div className="font-medium text-slate-900">{s.title}</div>
                    <div className="text-slate-500">
                      {s.claimAttribution} · {s.batchTitle}
                    </div>
                    <div className="text-slate-700 mt-0.5">{s.note}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
