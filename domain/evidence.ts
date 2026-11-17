import { createHash } from 'node:crypto';
import type {
  ClaimAttribution,
  CriterionCategory,
  CriterionPriority,
  EvidenceState,
  GapDisclosure,
  ObservationType,
  ReceiptState,
  SourceOrigin,
} from './types';

export interface CiEvaluationInput {
  conclusion: string | null | undefined;
  status?: string | null | undefined;
  testedSha: string | null | undefined;
  targetSha: string | null | undefined;
}

export interface StateEvaluationResult {
  state: EvidenceState;
  reason: string;
}

/**
 * CI check/workflow success applies ONLY to the exact tested SHA.
 * Changed SHA makes it stale; missing status or SHA is never green.
 */
export function evaluateCiState(input: CiEvaluationInput): StateEvaluationResult {
  const tested = input.testedSha?.trim() || null;
  const target = input.targetSha?.trim() || null;
  const status = input.status?.toLowerCase().trim() || null;
  const conclusion = input.conclusion?.toLowerCase().trim() || null;

  if (!tested || !target) {
    return {
      state: 'unknown',
      reason: 'Missing tested commit SHA or target commit SHA; cannot verify CI.',
    };
  }

  if (tested !== target) {
    return {
      state: 'stale',
      reason: `CI ran on ${tested.slice(0, 7)}, which does not match current target SHA ${target.slice(0, 7)}.`,
    };
  }

  if (status && status !== 'completed' && !conclusion) {
    return {
      state: 'pending',
      reason: `CI run is currently '${status}' on SHA ${tested.slice(0, 7)}.`,
    };
  }

  if (!conclusion) {
    return {
      state: 'unknown',
      reason: 'CI conclusion is absent; missing status is never treated as passing.',
    };
  }

  if (conclusion === 'success') {
    return {
      state: 'verified',
      reason: `CI passed on exact SHA ${tested.slice(0, 7)}.`,
    };
  }

  if (
    conclusion === 'failure' ||
    conclusion === 'timed_out' ||
    conclusion === 'cancelled' ||
    conclusion === 'action_required' ||
    conclusion === 'startup_failure'
  ) {
    return {
      state: 'failed',
      reason: `CI concluded '${conclusion}' on SHA ${tested.slice(0, 7)}.`,
    };
  }

  if (conclusion === 'neutral' || conclusion === 'skipped') {
    return {
      state: 'not_applicable',
      reason: `CI check concluded '${conclusion}' on SHA ${tested.slice(0, 7)}.`,
    };
  }

  return {
    state: 'pending',
    reason: `CI state '${conclusion}' awaiting final completion on ${tested.slice(0, 7)}.`,
  };
}

export interface DeploymentEvaluationInput {
  deployState: string | null | undefined;
  deploySha: string | null | undefined;
  targetSha: string | null | undefined;
}

/**
 * Deployment verifies only on matching SHA; absent SHA is 'unknown'.
 * Deployment metadata proves deployment trigger/status, never browser acceptance.
 */
export function evaluateDeploymentState(
  input: DeploymentEvaluationInput
): StateEvaluationResult {
  const deploySha = input.deploySha?.trim() || null;
  const targetSha = input.targetSha?.trim() || null;
  const deployState = input.deployState?.toLowerCase().trim() || null;

  if (!deploySha || !targetSha) {
    return {
      state: 'unknown',
      reason: 'Deployment SHA or target SHA is missing; deployment cannot be verified.',
    };
  }

  if (deploySha !== targetSha) {
    return {
      state: 'stale',
      reason: `Deployment targeted ${deploySha.slice(0, 7)}, which differs from target SHA ${targetSha.slice(0, 7)}.`,
    };
  }

  if (!deployState) {
    return {
      state: 'unknown',
      reason: 'Deployment status state is missing.',
    };
  }

  if (deployState === 'success') {
    return {
      state: 'verified',
      reason: `Deployment succeeded for exact SHA ${deploySha.slice(0, 7)} (infrastructure metadata only; not user acceptance).`,
    };
  }

  if (deployState === 'failure' || deployState === 'error') {
    return {
      state: 'failed',
      reason: `Deployment reported '${deployState}' on SHA ${deploySha.slice(0, 7)}.`,
    };
  }

  if (deployState === 'inactive') {
    return {
      state: 'not_applicable',
      reason: `Deployment marked inactive for SHA ${deploySha.slice(0, 7)}.`,
    };
  }

  return {
    state: 'pending',
    reason: `Deployment is '${deployState}' on SHA ${deploySha.slice(0, 7)}.`,
  };
}

/**
 * Merged PRs prove code merged to a branch, never feature correctness or acceptance.
 */
export function canPrAutoCompleteCriterion(): false {
  return false;
}

/**
 * AI-generated prose is never engineering evidence.
 */
export function isAiProseEvidence(): false {
  return false;
}

export const RECEIPT_ALLOWED_TRANSITIONS: Record<
  ReceiptState,
  ReadonlySet<ReceiptState>
> = {
  draft: new Set(['published']),
  published: new Set(['accepted', 'changes_requested', 'superseded', 'revoked']),
  changes_requested: new Set(['superseded', 'revoked', 'accepted']),
  accepted: new Set(['superseded', 'revoked']),
  superseded: new Set([]),
  revoked: new Set([]),
};

export function canTransitionReceiptState(
  from: ReceiptState,
  to: ReceiptState
): boolean {
  return RECEIPT_ALLOWED_TRANSITIONS[from]?.has(to) ?? false;
}

export interface CriterionForGapCheck {
  id: string;
  title: string;
  category: CriterionCategory;
  priority: CriterionPriority;
  status: EvidenceState;
}

export interface EvidenceForGapCheck {
  id: string;
  title: string;
  observationType: ObservationType;
  sourceOrigin: SourceOrigin;
  claimAttribution: ClaimAttribution;
  state: EvidenceState;
}

export interface MappingForGapCheck {
  criterionId: string;
  evidenceId: string;
}

export interface GapAssessment {
  hasGaps: boolean;
  gaps: GapDisclosure[];
  verificationSummaryLabel: string;
  requiresDisclosureAcknowledgement: boolean;
}

export function assessBatchGaps(
  criteria: CriterionForGapCheck[],
  mappings: MappingForGapCheck[],
  evidenceList: EvidenceForGapCheck[]
): GapAssessment {
  const gaps: GapDisclosure[] = [];
  const evidenceById = new Map(evidenceList.map((e) => [e.id, e]));

  if (criteria.length === 0) {
    gaps.push({
      code: 'UNMAPPED_CRITERION',
      severity: 'blocking_disclosure',
      message: 'No acceptance criteria have been recorded for this delivery batch.',
    });
  }

  for (const criterion of criteria) {
    const linkedIds = mappings
      .filter((m) => m.criterionId === criterion.id)
      .map((m) => m.evidenceId);

    const linkedEvidence = linkedIds
      .map((id) => evidenceById.get(id))
      .filter((e): e is EvidenceForGapCheck => Boolean(e));

    if (linkedEvidence.length === 0 && criterion.status !== 'not_applicable') {
      gaps.push({
        code: 'UNMAPPED_CRITERION',
        severity: 'blocking_disclosure',
        criterionId: criterion.id,
        criterionTitle: criterion.title,
        message: `Criterion "${criterion.title}" has no attached evidence.`,
      });
    }

    if (
      criterion.status !== 'verified' &&
      criterion.status !== 'not_applicable'
    ) {
      gaps.push({
        code: 'CRITERION_NOT_VERIFIED',
        severity: 'blocking_disclosure',
        criterionId: criterion.id,
        criterionTitle: criterion.title,
        message: `Criterion "${criterion.title}" is currently '${criterion.status}'.`,
      });
    }

    const hasObservedGithub = linkedEvidence.some(
      (ev) => ev.claimAttribution === 'observed_github'
    );
    if (
      linkedEvidence.length > 0 &&
      !hasObservedGithub &&
      criterion.status !== 'not_applicable'
    ) {
      gaps.push({
        code: 'UNCORROBORATED_STATEMENT',
        severity: 'advisory',
        criterionId: criterion.id,
        criterionTitle: criterion.title,
        message: `Criterion "${criterion.title}" relies solely on agency/client-supplied notes without GitHub observation.`,
      });
    }

    for (const ev of linkedEvidence) {
      if (ev.state === 'failed') {
        gaps.push({
          code: 'EVIDENCE_FAILED',
          severity: 'blocking_disclosure',
          criterionId: criterion.id,
          criterionTitle: criterion.title,
          evidenceId: ev.id,
          message: `Linked evidence "${ev.title}" is in state 'failed'.`,
        });
      } else if (ev.state === 'stale') {
        gaps.push({
          code: 'EVIDENCE_STALE',
          severity: 'blocking_disclosure',
          criterionId: criterion.id,
          criterionTitle: criterion.title,
          evidenceId: ev.id,
          message: `Linked evidence "${ev.title}" is stale (tested SHA differs from current target SHA).`,
        });
      } else if (ev.state === 'unknown') {
        gaps.push({
          code: 'EVIDENCE_UNKNOWN',
          severity: 'blocking_disclosure',
          criterionId: criterion.id,
          criterionTitle: criterion.title,
          evidenceId: ev.id,
          message: `Linked evidence "${ev.title}" has unknown verification state.`,
        });
      } else if (ev.state === 'pending') {
        gaps.push({
          code: 'EVIDENCE_PENDING',
          severity: 'blocking_disclosure',
          criterionId: criterion.id,
          criterionTitle: criterion.title,
          evidenceId: ev.id,
          message: `Linked evidence "${ev.title}" is still pending.`,
        });
      }
    }
  }

  const hasBlockingGaps = gaps.some(
    (g) => g.severity === 'blocking_disclosure'
  );
  const hasGaps = gaps.length > 0;

  let verificationSummaryLabel =
    'All criteria backed by reviewed evidence; awaiting client acceptance';
  if (hasBlockingGaps) {
    verificationSummaryLabel =
      'Published with disclosed evidence gaps — incomplete verification';
  } else if (hasGaps) {
    verificationSummaryLabel =
      'Published with agency-statement disclosures (no independent GitHub observation on some items)';
  }

  return {
    hasGaps,
    gaps,
    verificationSummaryLabel,
    requiresDisclosureAcknowledgement: hasGaps,
  };
}

function sortKeysCanonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysCanonical);
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortKeysCanonical(record[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(sortKeysCanonical(value));
}

export function computeSnapshotHash(snapshot: unknown): string {
  const canonical = canonicalSerialize(snapshot);
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export function verifySnapshotHash(
  snapshot: unknown,
  expectedHash: string
): boolean {
  return computeSnapshotHash(snapshot) === expectedHash;
}
