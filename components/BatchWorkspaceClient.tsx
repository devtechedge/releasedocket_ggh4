'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2,
  Plus,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  EvidenceStateBadge,
  formatAttributionLabel,
  formatSourceOriginLabel,
  ReceiptStateBadge,
} from '@/components/StatusText';
import type { GapAssessment } from '@/domain/evidence';
import type { EvidenceState } from '@/domain/types';
import { formatUtcDate, formatUtcDateTime } from '@/lib/format';
import type {
  AcceptanceCriterionRecord,
  DeliveryBatchRecord,
  EvidenceItemRecord,
  PortalTokenRecord,
  ReceiptVersionRecord,
} from '@/repositories/delivery.repo';
import type { SourceObservationRecord } from '@/repositories/github.repo';

interface BatchDetailData {
  batch: DeliveryBatchRecord;
  criteria: AcceptanceCriterionRecord[];
  evidence: EvidenceItemRecord[];
  mappings: Array<{ id: string; criterionId: string; evidenceId: string }>;
  gapAssessment: GapAssessment;
  receiptVersions: ReceiptVersionRecord[];
  projectObservations: SourceObservationRecord[];
  portalTokens: PortalTokenRecord[];
  clientActions: Array<{
    id: string;
    actionType: string;
    actorName: string;
    actorEmail: string;
    note: string;
    createdAt: string;
  }>;
  clientComments: Array<{
    id: string;
    authorName: string;
    authorEmail: string;
    authorKind: string;
    body: string;
    createdAt: string;
  }>;
}

export default function BatchWorkspaceClient({
  initialData,
  defaultRecipientEmail,
  canWrite,
  canPublish,
}: {
  initialData: BatchDetailData;
  defaultRecipientEmail: string;
  canWrite: boolean;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [data, setData] = useState<BatchDetailData>(initialData);
  const [activeTab, setActiveTab] = useState<
    'criteria' | 'evidence' | 'ai' | 'publish'
  >('criteria');

  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Batch edit fields
  const [summaryEdit, setSummaryEdit] = useState(data.batch.summary);
  const [limitationsEdit, setLimitationsEdit] = useState(
    data.batch.limitationsNote
  );
  const [internalNotesEdit, setInternalNotesEdit] = useState(
    data.batch.internalNotes
  );
  const [targetShaEdit, setTargetShaEdit] = useState(data.batch.targetSha || '');

  // New criterion form
  const [critTitle, setCritTitle] = useState('');
  const [critCategory, setCritCategory] = useState('feature');
  const [critPriority, setCritPriority] = useState('high');
  const [critExpected, setCritExpected] = useState(
    'Passing CI on exact SHA + verified deployment'
  );

  // Manual evidence form
  const [manTitle, setManTitle] = useState('');
  const [manAttr, setManAttr] = useState<'agency_statement' | 'client_supplied'>(
    'agency_statement'
  );
  const [manUrl, setManUrl] = useState('');
  const [manNote, setManNote] = useState('');
  const [manState, setManState] = useState<'verified' | 'pending' | 'unknown'>(
    'verified'
  );
  const [manCriteriaIds, setManCriteriaIds] = useState<string[]>([]);

  // Attach observation selection
  const [obsCriterionId, setObsCriterionId] = useState<string>(
    data.criteria[0]?.id || ''
  );

  // AI Draft state
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDraftText, setAiDraftText] = useState(
    data.batch.aiDraftSummary || data.batch.summary
  );
  const [aiProviderLabel, setAiProviderLabel] = useState<string | null>(
    data.batch.aiDraftSummary && !data.batch.aiApprovedAt
      ? 'Saved draft ready for review'
      : null
  );
  const [aiSuggestions, setAiSuggestions] = useState<
    Array<{ criterionId: string; evidenceId: string; rationale: string }>
  >([]);

  // Publish state
  const [gapAck, setGapAck] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(defaultRecipientEmail);
  const [otpRequired, setOtpRequired] = useState(false);
  const [publishedLink, setPublishedLink] = useState<{
    portalPath: string;
    otpCode: string | null;
    versionNumber: number;
  } | null>(null);

  async function reloadDetail() {
    const res = await fetch(`/api/batches/${data.batch.id}`);
    if (res.ok) {
      const updated = (await res.json()) as BatchDetailData;
      setData(updated);
      if (!obsCriterionId && updated.criteria[0]) {
        setObsCriterionId(updated.criteria[0].id);
      }
    }
    router.refresh();
  }

  async function postAction(payload: Record<string, unknown>) {
    setError(null);
    setFeedback(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/batches/${data.batch.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Action failed.');
        return null;
      }
      await reloadDetail();
      return json;
    } catch {
      setError('Network error executing action.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveBatchMetadata(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/batches/${data.batch.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          summary: summaryEdit,
          limitationsNote: limitationsEdit,
          internalNotes: internalNotesEdit,
          targetSha: targetShaEdit.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not update batch.');
        return;
      }
      await reloadDetail();
      setFeedback('Batch metadata saved.');
    } finally {
      setBusy(false);
    }
  }

  async function handleAddCriterion(e: React.FormEvent) {
    e.preventDefault();
    const res = await postAction({
      action: 'add_criterion',
      title: critTitle,
      category: critCategory,
      priority: critPriority,
      expectedEvidence: critExpected,
    });
    if (res) {
      setCritTitle('');
      setFeedback('Acceptance criterion added (status: pending).');
    }
  }

  async function handleCriterionStatusChange(
    criterionId: string,
    status: EvidenceState
  ) {
    const res = await postAction({
      action: 'set_criterion_status',
      criterionId,
      status,
    });
    if (res) setFeedback('Criterion status updated.');
  }

  async function handleAttachObservation(observationId: string) {
    const res = await postAction({
      action: 'attach_observation',
      observationId,
      criterionIds: obsCriterionId ? [obsCriterionId] : [],
    });
    if (res) {
      setFeedback(
        'Observation attached as evidence. Remember: PR merges do not auto-verify human criteria.'
      );
    }
  }

  async function handleAddManualEvidence(e: React.FormEvent) {
    e.preventDefault();
    const res = await postAction({
      action: 'add_manual_evidence',
      title: manTitle,
      observationType: 'manual_evidence',
      claimAttribution: manAttr,
      externalUrl: manUrl || undefined,
      note: manNote,
      observedAt: new Date().toISOString(),
      state: manState,
      criterionIds: manCriteriaIds,
    });
    if (res) {
      setManTitle('');
      setManUrl('');
      setManNote('');
      setManCriteriaIds([]);
      setFeedback('Manual user-supplied evidence recorded.');
    }
  }

  async function handleGenerateAiDraft() {
    setAiGenerating(true);
    try {
      const res = await postAction({ action: 'ai_draft' });
      if (res?.draft) {
        setAiDraftText(res.draft.draftText);
        setAiProviderLabel(`${res.draft.provider} (${res.draft.model})`);
        setAiSuggestions(res.draft.suggestedMappings || []);
        setFeedback('AI summary draft generated. Review and edit before approving.');
      }
    } finally {
      setAiGenerating(false);
    }
  }

  async function handleApproveAiDraft() {
    const res = await postAction({
      action: 'ai_approve',
      editedSummary: aiDraftText,
    });
    if (res) {
      setSummaryEdit(aiDraftText);
      setFeedback('Summary approved and saved with reviewer timestamp.');
    }
  }

  async function handlePublishReceipt(e: React.FormEvent) {
    e.preventDefault();
    const res = await postAction({
      action: 'publish_receipt',
      gapDisclosureAck: gapAck,
      recipientEmail,
      otpRequired,
    });
    if (res) {
      setPublishedLink({
        portalPath: res.portalPath,
        otpCode: res.otpCode ?? null,
        versionNumber: res.receiptVersion.versionNumber,
      });
      setGapAck(false);
      setFeedback(
        `Published immutable Delivery Receipt v${res.receiptVersion.versionNumber}.`
      );
    }
  }

  const latestVersion = data.receiptVersions[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Batch Header */}
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs text-slate-500">
              {data.batch.clientName} · {data.batch.projectName}
              {data.batch.targetDate ? ` · Target ${data.batch.targetDate}` : ''}
              {data.batch.targetSha
                ? ` · Target SHA ${data.batch.targetSha.slice(0, 7)}`
                : ''}
            </div>
            <h1 className="font-display text-xl font-bold text-slate-900 mt-1">
              {data.batch.title}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <ReceiptStateBadge state={data.batch.status} />
            {latestVersion && (
              <span className="font-mono text-xs text-slate-600">
                Latest: v{latestVersion.versionNumber}
              </span>
            )}
          </div>
        </div>

        {/* Segmented Tab Bar */}
        <div className="mt-5 flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1 w-fit">
          {[
            { id: 'criteria', label: `01. Criteria (${data.criteria.length})` },
            { id: 'evidence', label: `02. Evidence (${data.evidence.length})` },
            { id: 'ai', label: '03. Summary & AI Draft' },
            {
              id: 'publish',
              label: `04. Preview & Publish (${data.receiptVersions.length})`,
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() =>
                setActiveTab(tab.id as 'criteria' | 'evidence' | 'ai' | 'publish')
              }
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800"
        >
          {feedback}
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

      {/* TAB 1: CRITERIA */}
      {activeTab === 'criteria' && (
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Human-written acceptance criteria
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Staff explicitly set criterion verification status after reviewing mapped evidence.
                </p>
              </div>
            </div>

            {data.criteria.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">
                No acceptance criteria added yet. Add criteria below before publishing.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {data.criteria.map((c) => {
                  const linkedEvidenceIds = data.mappings
                    .filter((m) => m.criterionId === c.id)
                    .map((m) => m.evidenceId);
                  const linkedEvidence = data.evidence.filter((e) =>
                    linkedEvidenceIds.includes(e.id)
                  );

                  return (
                    <div key={c.id} className="p-5 space-y-3">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs text-slate-500 capitalize">
                            {c.category} · {c.priority} priority
                          </div>
                          <h3 className="text-sm font-semibold text-slate-900 mt-0.5">
                            {c.title}
                          </h3>
                          <p className="text-xs text-slate-600 mt-1">
                            Expected evidence: {c.expectedEvidence}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <EvidenceStateBadge state={c.status} />
                          {canWrite && (
                            <select
                              aria-label={`Set status for ${c.title}`}
                              value={c.status}
                              disabled={busy}
                              onChange={(e) =>
                                handleCriterionStatusChange(
                                  c.id,
                                  e.target.value as EvidenceState
                                )
                              }
                              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-800"
                            >
                              <option value="pending">pending</option>
                              <option value="verified">verified</option>
                              <option value="stale">stale</option>
                              <option value="failed">failed</option>
                              <option value="unknown">unknown</option>
                              <option value="not_applicable">not_applicable</option>
                            </select>
                          )}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 text-xs">
                        <span className="font-medium text-slate-700">
                          Linked Evidence ({linkedEvidence.length}):{' '}
                        </span>
                        {linkedEvidence.length === 0 ? (
                          <span className="text-amber-700">
                            None linked yet — attach an observation or manual note in tab 02.
                          </span>
                        ) : (
                          <span className="text-slate-600">
                            {linkedEvidence
                              .map((e) => `${e.title} [${e.state}]`)
                              .join(' · ')}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {canWrite && (
            <form
              onSubmit={handleAddCriterion}
              className="rounded-lg border border-slate-200 bg-white p-5 space-y-4"
            >
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Add acceptance criterion
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label
                    htmlFor="crit-title"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Criterion statement
                  </label>
                  <input
                    id="crit-title"
                    type="text"
                    required
                    value={critTitle}
                    onChange={(e) => setCritTitle(e.target.value)}
                    placeholder="CSV export handles UTF-8 BOM and 10,000+ rows"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor="crit-cat"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Category
                    </label>
                    <select
                      id="crit-cat"
                      value={critCategory}
                      onChange={(e) => setCritCategory(e.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                    >
                      <option value="feature">feature</option>
                      <option value="integration">integration</option>
                      <option value="automation">automation</option>
                      <option value="security">security</option>
                      <option value="performance">performance</option>
                      <option value="documentation">documentation</option>
                    </select>
                  </div>
                  <div>
                    <label
                      htmlFor="crit-prio"
                      className="block text-xs font-medium text-slate-700 mb-1"
                    >
                      Priority
                    </label>
                    <select
                      id="crit-prio"
                      value={critPriority}
                      onChange={(e) => setCritPriority(e.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900"
                    >
                      <option value="critical">critical</option>
                      <option value="high">high</option>
                      <option value="standard">standard</option>
                    </select>
                  </div>
                </div>
              </div>
              <div>
                <label
                  htmlFor="crit-exp"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Expected evidence
                </label>
                <input
                  id="crit-exp"
                  type="text"
                  required
                  value={critExpected}
                  onChange={(e) => setCritExpected(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-md bg-blue-800 px-4 py-2 text-xs font-medium text-white hover:bg-blue-900 disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add Criterion</span>
              </button>
            </form>
          )}
        </div>
      )}

      {/* TAB 2: EVIDENCE BROWSER & ATTACHMENT */}
      {activeTab === 'evidence' && (
        <div className="space-y-6">
          {/* Attached Evidence Table */}
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Attached batch evidence ({data.evidence.length})
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                GitHub observations are evaluated against batch target SHA ({data.batch.targetSha?.slice(0, 7) || 'not set'}). User-supplied notes are visibly labelled.
              </p>
            </div>
            {data.evidence.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">
                No evidence attached to this batch yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {data.evidence.map((ev) => (
                  <div key={ev.id} className="p-4 flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{formatAttributionLabel(ev.claimAttribution)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatSourceOriginLabel(ev.sourceOrigin)}</span>
                        {ev.repoFullName && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{ev.repoFullName}</span>
                          </>
                        )}
                        {ev.commitSha && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">
                              sha {ev.commitSha.slice(0, 7)}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900">
                          {ev.title}
                        </span>
                        {ev.externalUrl && (
                          <a
                            href={ev.externalUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-800 hover:underline inline-flex items-center gap-0.5 text-xs"
                          >
                            <span>Source</span>
                            <ExternalLink className="h-3 w-3" aria-hidden="true" />
                          </a>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 mt-1">
                        {ev.stateReason}
                        {ev.note ? ` — "${ev.note}"` : ''}
                      </div>
                    </div>
                    <EvidenceStateBadge state={ev.state} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Ingested Project Observations */}
          {canWrite && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-display text-sm font-semibold text-slate-900">
                    Ingested GitHub observations for {data.batch.projectName}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Select a criterion and attach matching PRs, CI checks, deployments, or releases.
                  </p>
                </div>
                {data.criteria.length > 0 && (
                  <div className="flex items-center gap-2">
                    <label
                      htmlFor="obs-link-crit"
                      className="text-xs font-medium text-slate-700"
                    >
                      Link to criterion:
                    </label>
                    <select
                      id="obs-link-crit"
                      value={obsCriterionId}
                      onChange={(e) => setObsCriterionId(e.target.value)}
                      className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 max-w-xs"
                    >
                      {data.criteria.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.title}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {data.projectObservations.length === 0 ? (
                <div className="text-xs text-slate-500 py-3">
                  No observations mapped to this project yet. Map a repository on Projects or sync GitHub on Integrations.
                </div>
              ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-md">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                      <tr>
                        <th className="px-3 py-2.5">Observation</th>
                        <th className="px-3 py-2.5">Type / Origin</th>
                        <th className="px-3 py-2.5">SHA</th>
                        <th className="px-3 py-2.5">Raw State</th>
                        <th className="px-3 py-2.5 text-right">Attach</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {data.projectObservations.map((obs) => (
                        <tr key={obs.id}>
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-slate-900">
                              {obs.title}
                            </div>
                            <div className="text-slate-500">
                              {obs.repoFullName} · {obs.actor}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-slate-700">
                            <div>{obs.observationType}</div>
                            <div className="text-slate-500">
                              {formatSourceOriginLabel(obs.sourceOrigin)}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-700">
                            {(obs.testedSha || obs.mergeCommitSha || obs.headSha || '—').slice(0, 7)}
                          </td>
                          <td className="px-3 py-2.5 font-mono text-slate-700">
                            {obs.rawConclusion || obs.rawState}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => handleAttachObservation(obs.id)}
                              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                            >
                              <Link2 className="h-3 w-3" aria-hidden="true" />
                              <span>Attach</span>
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Manual User-Supplied Evidence Form */}
          {canWrite && (
            <form
              onSubmit={handleAddManualEvidence}
              className="rounded-lg border border-slate-200 bg-white p-5 space-y-4"
            >
              <div>
                <h3 className="font-display text-sm font-semibold text-slate-900">
                  Add manual user-supplied evidence
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Visibly labelled as Agency Statement or Client-Supplied — never disguised as automated GitHub verification.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label
                    htmlFor="man-title"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Evidence title
                  </label>
                  <input
                    id="man-title"
                    type="text"
                    required
                    value={manTitle}
                    onChange={(e) => setManTitle(e.target.value)}
                    placeholder="Staging walkthrough Loom recording"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="man-attr"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Attribution
                  </label>
                  <select
                    id="man-attr"
                    value={manAttr}
                    onChange={(e) =>
                      setManAttr(
                        e.target.value as 'agency_statement' | 'client_supplied'
                      )
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="agency_statement">
                      Agency Statement (User-Supplied)
                    </option>
                    <option value="client_supplied">
                      Client-Supplied Evidence
                    </option>
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="man-state"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Evidence state
                  </label>
                  <select
                    id="man-state"
                    value={manState}
                    onChange={(e) =>
                      setManState(
                        e.target.value as 'verified' | 'pending' | 'unknown'
                      )
                    }
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                  >
                    <option value="verified">verified</option>
                    <option value="pending">pending</option>
                    <option value="unknown">unknown</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="man-url"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    HTTPS reference URL (optional)
                  </label>
                  <input
                    id="man-url"
                    type="url"
                    value={manUrl}
                    onChange={(e) => setManUrl(e.target.value)}
                    placeholder="https://loom.com/share/example"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="man-note"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Observation note
                  </label>
                  <input
                    id="man-note"
                    type="text"
                    required
                    value={manNote}
                    onChange={(e) => setManNote(e.target.value)}
                    placeholder="Confirmed CSV export downloads 10,400 rows in staging."
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </div>
              </div>

              {data.criteria.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-slate-700 mb-1.5">
                    Link to acceptance criteria
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {data.criteria.map((c) => (
                      <label
                        key={c.id}
                        className="inline-flex items-center gap-1.5 text-xs text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={manCriteriaIds.includes(c.id)}
                          onChange={(e) => {
                            setManCriteriaIds((prev) =>
                              e.target.checked
                                ? [...prev, c.id]
                                : prev.filter((id) => id !== c.id)
                            );
                          }}
                        />
                        <span>{c.title}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
              >
                Add Manual Evidence
              </button>
            </form>
          )}
        </div>
      )}

      {/* TAB 3: SUMMARY & AI DRAFTING */}
      {activeTab === 'ai' && (
        <div className="space-y-6">
          <form
            onSubmit={handleSaveBatchMetadata}
            className="rounded-lg border border-slate-200 bg-white p-5 space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  Client-facing summary & internal notes
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Internal notes stay private to agency staff and are stripped from every published receipt snapshot.
                </p>
              </div>
              {canWrite && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleGenerateAiDraft}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5 text-blue-800" aria-hidden="true" />
                  <span>
                    {aiGenerating
                      ? 'Generating Draft...'
                      : 'Draft Summary from Evidence'}
                  </span>
                </button>
              )}
            </div>

            {aiProviderLabel && (
              <div className="rounded-md border border-blue-200 bg-blue-50/70 p-3 text-xs text-blue-950 space-y-2">
                <div className="font-medium">
                  AI Draft Ready ({aiProviderLabel}) — Human approval required
                </div>
                <textarea
                  aria-label="Editable AI draft summary"
                  rows={4}
                  value={aiDraftText}
                  onChange={(e) => setAiDraftText(e.target.value)}
                  className="w-full rounded border border-blue-200 bg-white p-2 text-xs text-slate-900"
                />
                {aiSuggestions.length > 0 && (
                  <div className="text-xs text-slate-700">
                    Suggested mappings:{' '}
                    {aiSuggestions
                      .map((s) => `${s.evidenceId} → ${s.criterionId} (${s.rationale})`)
                      .join('; ')}
                  </div>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleApproveAiDraft}
                  className="rounded-md bg-blue-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-900"
                >
                  Approve & Apply Draft to Summary
                </button>
              </div>
            )}

            <div>
              <label
                htmlFor="edit-summary"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Client-visible batch summary
              </label>
              <textarea
                id="edit-summary"
                rows={3}
                value={summaryEdit}
                onChange={(e) => setSummaryEdit(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="edit-limitations"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Known limitations / caveats (client-visible)
                </label>
                <textarea
                  id="edit-limitations"
                  rows={2}
                  value={limitationsEdit}
                  onChange={(e) => setLimitationsEdit(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </div>

              <div>
                <label
                  htmlFor="edit-target-sha"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Target commit SHA
                </label>
                <input
                  id="edit-target-sha"
                  type="text"
                  value={targetShaEdit}
                  onChange={(e) => setTargetShaEdit(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="edit-internal"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Internal agency notes (private — never exposed in Client Portal)
              </label>
              <textarea
                id="edit-internal"
                rows={2}
                value={internalNotesEdit}
                onChange={(e) => setInternalNotesEdit(e.target.value)}
                className="w-full rounded-md border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900"
              />
            </div>

            {canWrite && (
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-blue-800 px-4 py-2 text-xs font-medium text-white hover:bg-blue-900 disabled:opacity-50"
              >
                Save Batch Details
              </button>
            )}
          </form>
        </div>
      )}

      {/* TAB 4: PREVIEW & PUBLISH */}
      {activeTab === 'publish' && (
        <div className="space-y-6">
          {/* Gap Assessment Disclosure Box */}
          <div
            className={`rounded-lg border p-5 ${
              data.gapAssessment.hasGaps
                ? 'border-amber-300 bg-amber-50/70'
                : 'border-emerald-200 bg-emerald-50/60'
            }`}
          >
            <div className="flex items-start gap-3">
              {data.gapAssessment.hasGaps ? (
                <ShieldAlert className="h-5 w-5 text-amber-800 shrink-0 mt-0.5" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-800 shrink-0 mt-0.5" aria-hidden="true" />
              )}
              <div className="flex-1">
                <h2 className="font-display text-sm font-semibold text-slate-900">
                  {data.gapAssessment.verificationSummaryLabel}
                </h2>
                {data.gapAssessment.gaps.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-amber-950 list-disc pl-4">
                    {data.gapAssessment.gaps.map((g, idx) => (
                      <li key={idx}>{g.message}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-emerald-900">
                    All criteria have reviewed evidence linked. Client acceptance remains independent from engineering observations.
                  </p>
                )}
              </div>
            </div>
          </div>

          {publishedLink && (
            <div
              role="status"
              className="rounded-lg border border-blue-200 bg-blue-50 p-5 space-y-2"
            >
              <div className="text-sm font-semibold text-blue-950">
                Receipt v{publishedLink.versionNumber} Published
              </div>
              <div className="text-xs text-blue-900">
                Shareable noindex client portal URL:{' '}
                <Link
                  href={publishedLink.portalPath}
                  className="font-mono underline font-medium"
                >
                  {publishedLink.portalPath}
                </Link>
              </div>
              {publishedLink.otpCode && (
                <div className="text-xs font-mono text-blue-950">
                  One-time verification code (shown once):{' '}
                  <strong>{publishedLink.otpCode}</strong>
                </div>
              )}
            </div>
          )}

          {canPublish && (
            <form
              onSubmit={handlePublishReceipt}
              className="rounded-lg border border-slate-200 bg-white p-5 space-y-4"
            >
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Publish immutable Delivery Receipt version
              </h3>
              <p className="text-xs text-slate-600">
                Publishing creates a frozen, SHA-256 hashed snapshot and supersedes any prior unaccepted version.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="pub-email"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Client recipient email
                  </label>
                  <input
                    id="pub-email"
                    type="email"
                    required
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={otpRequired}
                      onChange={(e) => setOtpRequired(e.target.checked)}
                    />
                    <span>Require 6-digit OTP verification on portal link</span>
                  </label>
                </div>
              </div>

              {data.gapAssessment.hasGaps && (
                <label className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
                  <input
                    type="checkbox"
                    required
                    checked={gapAck}
                    onChange={(e) => setGapAck(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    I acknowledge these evidence gaps and understand they will be conspicuously disclosed to the client in the published receipt.
                  </span>
                </label>
              )}

              <button
                type="submit"
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md bg-blue-800 px-4 py-2 text-xs font-medium text-white hover:bg-blue-900 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  Publish Receipt v{data.receiptVersions.length + 1}
                </span>
              </button>
            </form>
          )}

          {/* Published Version History & Portal Tokens */}
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Receipt versions & portal links
              </h3>
            </div>
            {data.receiptVersions.length === 0 ? (
              <div className="p-6 text-sm text-slate-500">
                No receipt versions published yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-200">
                {data.receiptVersions.map((rv) => (
                  <div key={rv.id} className="p-4 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display text-sm font-semibold text-slate-900">
                          Version {rv.versionNumber}
                        </span>
                        <ReceiptStateBadge state={rv.status} />
                        {rv.hasGaps && (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-800">
                            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                            Gaps disclosed
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono text-slate-500 mt-1">
                        Published {formatUtcDateTime(rv.publishedAt)} · SHA-256 {rv.snapshotHash.slice(0, 16)}...
                      </div>
                    </div>

                    {canPublish && rv.status !== 'revoked' && rv.status !== 'superseded' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          postAction({
                            action: 'revoke_receipt',
                            receiptVersionId: rv.id,
                          })
                        }
                        className="inline-flex items-center gap-1 rounded border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="h-3 w-3" aria-hidden="true" />
                        <span>Revoke Receipt</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {data.portalTokens.length > 0 && (
              <div className="border-t border-slate-200 bg-slate-50/70 px-5 py-3 space-y-2">
                <div className="text-xs font-semibold text-slate-700">
                  Issued Portal Links (Latest Version)
                </div>
                {data.portalTokens.map((pt) => (
                  <div
                    key={pt.id}
                    className="flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <span className="text-slate-700">
                      Recipient: <span className="font-mono">{pt.recipientEmail}</span> · Expires{' '}
                      {formatUtcDate(pt.expiresAt)}
                      {pt.revokedAt ? ' · REVOKED' : ''}
                    </span>
                    {!pt.revokedAt && canPublish && (
                      <button
                        type="button"
                        onClick={() =>
                          postAction({
                            action: 'revoke_token',
                            portalTokenId: pt.id,
                          })
                        }
                        className="text-red-700 hover:underline font-medium"
                      >
                        Revoke Link
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Client Actions & Comments History */}
          {(data.clientActions.length > 0 || data.clientComments.length > 0) && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 space-y-3">
              <h3 className="font-display text-sm font-semibold text-slate-900">
                Client Portal Activity (Latest Version)
              </h3>
              <ul className="divide-y divide-slate-100 text-xs">
                {data.clientActions.map((act) => (
                  <li key={act.id} className="py-2.5">
                    <span className="font-medium text-slate-900">
                      {act.actorName} ({act.actorEmail})
                    </span>{' '}
                    recorded <strong className="font-mono">{act.actionType}</strong> on{' '}
                    {formatUtcDateTime(act.createdAt)}
                    {act.note && (
                      <div className="mt-1 text-slate-600">“{act.note}”</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
