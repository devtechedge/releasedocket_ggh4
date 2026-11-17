'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Lock,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import {
  EvidenceStateBadge,
  formatAttributionLabel,
  formatSourceOriginLabel,
  ReceiptStateBadge,
} from '@/components/StatusText';
import type { CanonicalReceiptSnapshot } from '@/domain/types';
import { formatUtcDate, formatUtcDateTime } from '@/lib/format';
import type { PortalReceiptPayload } from '@/services/portal.service';
import ThemeToggle from './ThemeToggle';

export default function PortalClientView({
  token,
  initialPayload,
  initialError,
}: {
  token: string;
  initialPayload: PortalReceiptPayload | null;
  initialError: string | null;
}) {
  const [payload, setPayload] = useState<PortalReceiptPayload | null>(
    initialPayload
  );
  const [error, setError] = useState<string | null>(initialError);
  const [otpInput, setOtpInput] = useState('');
  const [otpSubmitting, setOtpSubmitting] = useState(false);

  const [actorName, setActorName] = useState('');
  const [actorEmail, setActorEmail] = useState(
    initialPayload?.recipientEmail || ''
  );
  const [note, setNote] = useState('');
  const [submittingAction, setSubmittingAction] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setOtpSubmitting(true);
    try {
      const res = await fetch(
        `/api/portal/${encodeURIComponent(token)}?otp=${encodeURIComponent(otpInput)}`
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Verification failed.');
        return;
      }
      setPayload(json);
    } catch {
      setError('Network error verifying access code.');
    } finally {
      setOtpSubmitting(false);
    }
  }

  async function submitAction(
    actionType: 'accepted' | 'changes_requested' | 'commented'
  ) {
    setError(null);
    setActionSuccess(null);
    setSubmittingAction(true);
    try {
      const res = await fetch(`/api/portal/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType,
          actorName,
          actorEmail,
          note,
          otpCode: otpInput || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Could not record response.');
        return;
      }
      setPayload(json);
      setNote('');
      setActionSuccess(
        actionType === 'accepted'
          ? 'Delivery receipt accepted and recorded in the audit trail.'
          : actionType === 'changes_requested'
            ? 'Change request recorded and forwarded to the agency delivery lead.'
            : 'Comment posted to the delivery receipt.'
      );
    } catch {
      setError('Network error submitting action.');
    } finally {
      setSubmittingAction(false);
    }
  }

  if (error && !payload) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-lg border border-red-200 bg-white p-6 text-center space-y-2">
          <Lock className="h-6 w-6 text-red-700 mx-auto" aria-hidden="true" />
          <h1 className="font-display text-lg font-bold text-slate-900">
            Portal Link Unavailable
          </h1>
          <p className="text-sm text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!payload) return null;

  if (payload.otpRequired && !payload.otpVerified) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <form
          onSubmit={handleVerifyOtp}
          className="max-w-md w-full rounded-lg border border-slate-200 bg-white p-6 space-y-4"
        >
          <h1 className="font-display text-lg font-bold text-slate-900">
            Verify access to Delivery Receipt v{payload.versionNumber}
          </h1>
          <p className="text-xs text-slate-600">
            Enter the 6-digit verification code sent to {payload.recipientEmail}.
          </p>
          <div>
            <label
              htmlFor="portal-otp"
              className="block text-xs font-medium text-slate-700 mb-1"
            >
              6-digit verification code
            </label>
            <input
              id="portal-otp"
              type="text"
              required
              inputMode="numeric"
              value={otpInput}
              onChange={(e) => setOtpInput(e.target.value)}
              placeholder="123456"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-mono text-slate-900"
            />
          </div>
          {error && (
            <div
              role="alert"
              className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={otpSubmitting}
            className="w-full rounded-md bg-blue-800 px-4 py-2 text-sm font-medium text-white hover:bg-blue-900"
          >
            {otpSubmitting ? 'Verifying...' : 'Open Delivery Receipt'}
          </button>
        </form>
      </div>
    );
  }

  const snap = payload.snapshot as CanonicalReceiptSnapshot;
  const accentColor = snap.brandAccentColor || '#1E40AF';
  const canSubmitDecision =
    payload.status === 'published' || payload.status === 'changes_requested';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      <header
        className="bg-white border-b border-slate-200"
        style={{ borderTop: `3px solid ${accentColor}` }}
      >
        <div className="mx-auto max-w-4xl px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="font-display text-base font-bold text-slate-900">
              {snap.workspaceName}
            </div>
            <div className="text-xs text-slate-500">
              Client Delivery Receipt · Version {payload.versionNumber}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ThemeToggle />
            <ReceiptStateBadge state={payload.status} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 sm:px-6 pt-6 space-y-6">
        {payload.supersededByVersion && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950">
            <strong>Superseded Receipt:</strong> A newer version (v
            {payload.supersededByVersion}) of this delivery batch has been published. Actions are locked on this historical version.
          </div>
        )}

        {/* Receipt Header Card */}
        <section className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs text-slate-500">
                {snap.clientName} · {snap.projectName} · Published{' '}
                {formatUtcDate(snap.publishedAt)} by{' '}
                {snap.publishedByName}
              </div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 mt-1">
                {snap.title}
              </h1>
            </div>
          </div>

          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {snap.summary}
          </p>

          {snap.limitationsNote && (
            <div className="rounded-md border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-700">
              <strong className="text-slate-900">Known Limitations & Scope Caveats:</strong>{' '}
              {snap.limitationsNote}
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 font-mono">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-slate-600" aria-hidden="true" />
              SHA-256 Digest: {payload.snapshotHash.slice(0, 20)}... (
              {payload.hashVerified ? 'integrity verified' : 'hash mismatch'})
            </span>
            <span>Immutable Snapshot v{payload.versionNumber}</span>
          </div>
        </section>

        {/* Gap Disclosure Banner */}
        <section
          className={`rounded-lg border p-5 ${
            snap.hasGaps
              ? 'border-amber-300 bg-amber-50/80'
              : 'border-emerald-200 bg-emerald-50/60'
          }`}
        >
          <div className="flex items-start gap-3">
            {snap.hasGaps ? (
              <AlertTriangle className="h-5 w-5 text-amber-800 shrink-0 mt-0.5" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-800 shrink-0 mt-0.5" aria-hidden="true" />
            )}
            <div>
              <h2 className="font-display text-sm font-semibold text-slate-900">
                {snap.verificationSummaryLabel}
              </h2>
              {snap.gaps.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-amber-950 list-disc pl-4">
                  {snap.gaps.map((g, idx) => (
                    <li key={idx}>{g.message}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* Acceptance Criteria */}
        <section className="rounded-lg border border-slate-200 bg-white overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Acceptance Criteria & Mapped Evidence ({snap.criteria.length})
            </h2>
          </div>
          <div className="divide-y divide-slate-200">
            {snap.criteria.map((c) => {
              const linked = snap.evidence.filter((e) =>
                c.evidenceIds.includes(e.evidenceId)
              );
              return (
                <div key={c.criterionId} className="p-5 space-y-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs text-slate-500 capitalize">
                        {c.category} · {c.priority} priority
                        {!c.hasIndependentObservation && ' · Agency/Client statement only'}
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 mt-0.5">
                        {c.title}
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5">
                        Expected proof: {c.expectedEvidence}
                      </p>
                    </div>
                    <EvidenceStateBadge state={c.status} />
                  </div>

                  {linked.length > 0 && (
                    <div className="pt-2 border-t border-slate-100 space-y-1.5">
                      {linked.map((ev) => (
                        <div
                          key={ev.evidenceId}
                          className="flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-medium text-slate-800">
                              {ev.title}
                            </span>
                            <span className="text-slate-500">
                              {' '}
                              · {formatAttributionLabel(ev.claimAttribution)} ·{' '}
                              {formatSourceOriginLabel(ev.sourceOrigin)}
                              {ev.commitSha ? ` · sha ${ev.commitSha.slice(0, 7)}` : ''}
                            </span>
                            <div className="text-slate-600">{ev.stateReason}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <EvidenceStateBadge state={ev.state} />
                            {ev.externalUrl && (
                              <a
                                href={ev.externalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-800 hover:underline inline-flex items-center gap-0.5"
                              >
                                <span>Inspect</span>
                                <ExternalLink className="h-3 w-3" aria-hidden="true" />
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Client Decision & Comments */}
        <section className="rounded-lg border border-slate-200 bg-white p-5 sm:p-6 space-y-4">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Client Sign-Off & Review Log
          </h2>

          {actionSuccess && (
            <div
              role="status"
              className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800"
            >
              {actionSuccess}
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

          {canSubmitDecision ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="portal-actor-name"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Your name
                  </label>
                  <input
                    id="portal-actor-name"
                    type="text"
                    required
                    value={actorName}
                    onChange={(e) => setActorName(e.target.value)}
                    placeholder="Sarah Jenkins"
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label
                    htmlFor="portal-actor-email"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Your email
                  </label>
                  <input
                    id="portal-actor-email"
                    type="email"
                    required
                    value={actorEmail}
                    onChange={(e) => setActorEmail(e.target.value)}
                    className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="portal-note"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Acceptance note, change request details, or comment
                </label>
                <textarea
                  id="portal-note"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Record any sign-off conditions or requested changes..."
                  className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  disabled={submittingAction || !actorName.trim() || !actorEmail.trim()}
                  onClick={() => submitAction('accepted')}
                  className="min-h-[44px] rounded-md bg-emerald-700 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  Accept Delivery Receipt
                </button>
                <button
                  type="button"
                  disabled={submittingAction || !actorName.trim() || !actorEmail.trim()}
                  onClick={() => submitAction('changes_requested')}
                  className="min-h-[44px] rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                >
                  Request Changes
                </button>
                <button
                  type="button"
                  disabled={submittingAction || !actorName.trim() || !actorEmail.trim()}
                  onClick={() => submitAction('commented')}
                  className="min-h-[44px] inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-50"
                >
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Post Comment</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="text-xs text-slate-600">
              This receipt version is currently in status{' '}
              <strong className="font-mono">{payload.status}</strong>. No further sign-off changes are permitted on this version.
            </div>
          )}

          {payload.actions.length > 0 && (
            <div className="pt-4 border-t border-slate-200 space-y-2">
              <div className="text-xs font-semibold text-slate-700">
                Audited Version Actions
              </div>
              <ul className="divide-y divide-slate-100 text-xs">
                {payload.actions.map((a) => (
                  <li key={a.id} className="py-2">
                    <span className="font-medium text-slate-900">
                      {a.actorName} ({a.actorEmail})
                    </span>{' '}
                    — <span className="font-mono">{a.actionType}</span> ·{' '}
                    {formatUtcDateTime(a.createdAt)}
                    {a.note && (
                      <div className="mt-1 text-slate-600">“{a.note}”</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
