'use client';

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  MinusCircle,
  XCircle,
} from 'lucide-react';
import type { ClaimAttribution, EvidenceState, ReceiptState, SourceOrigin } from '@/domain/types';

export function EvidenceStateBadge({ state }: { state: EvidenceState | string }) {
  switch (state) {
    case 'verified':
      return (
        <span className="inline-flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Verified
        </span>
      );
    case 'stale':
      return (
        <span className="inline-flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 whitespace-nowrap">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Stale SHA
        </span>
      );
    case 'failed':
      return (
        <span className="inline-flex items-center gap-1.5 rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 whitespace-nowrap">
          <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Failed
        </span>
      );
    case 'unknown':
      return (
        <span className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 whitespace-nowrap">
          <HelpCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Unknown
        </span>
      );
    case 'not_applicable':
      return (
        <span className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-600 whitespace-nowrap">
          <MinusCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          N/A
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Pending
        </span>
      );
  }
}

export function ReceiptStateBadge({ state }: { state: ReceiptState | string }) {
  switch (state) {
    case 'accepted':
      return (
        <span className="inline-flex items-center gap-1.5 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Accepted
        </span>
      );
    case 'published':
      return (
        <span className="inline-flex items-center gap-1.5 rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-800 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Published
        </span>
      );
    case 'changes_requested':
      return (
        <span className="inline-flex items-center gap-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 whitespace-nowrap">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Changes Requested
        </span>
      );
    case 'revoked':
      return (
        <span className="inline-flex items-center gap-1.5 rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-800 whitespace-nowrap">
          <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Revoked
        </span>
      );
    case 'superseded':
      return (
        <span className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 whitespace-nowrap">
          <MinusCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Superseded
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Draft
        </span>
      );
  }
}

export function formatSourceOriginLabel(origin: SourceOrigin | string): string {
  if (origin === 'demo_synthetic') return 'DEMO Synthetic';
  if (origin === 'github_live') return 'GitHub Live';
  return 'User-Supplied';
}

export function formatAttributionLabel(attr: ClaimAttribution | string): string {
  if (attr === 'observed_github') return 'Observed GitHub Metadata';
  if (attr === 'client_supplied') return 'Client-Supplied Evidence';
  return 'Agency Statement';
}
