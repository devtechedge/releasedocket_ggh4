export type Role =
  | 'OWNER'
  | 'ADMIN'
  | 'DELIVERY_LEAD'
  | 'CONTRIBUTOR'
  | 'CLIENT_VIEWER';

export type EvidenceState =
  | 'pending'
  | 'verified'
  | 'stale'
  | 'failed'
  | 'unknown'
  | 'not_applicable';

export type ReceiptState =
  | 'draft'
  | 'published'
  | 'accepted'
  | 'changes_requested'
  | 'superseded'
  | 'revoked';

export type SourceOrigin = 'github_live' | 'demo_synthetic' | 'manual_user';

export type ObservationType =
  | 'pull_request'
  | 'commit'
  | 'pull_request_review'
  | 'check_run'
  | 'workflow_run'
  | 'deployment'
  | 'deployment_status'
  | 'release'
  | 'manual_evidence';

export type ClaimAttribution =
  | 'observed_github'
  | 'agency_statement'
  | 'client_supplied';

export type CriterionPriority = 'critical' | 'high' | 'standard';

export type CriterionCategory =
  | 'feature'
  | 'integration'
  | 'automation'
  | 'security'
  | 'performance'
  | 'documentation';

export type PlanTier = 'solo' | 'studio' | 'agency' | 'partner';

export type SubscriptionStatus =
  | 'disconnected'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled';

export interface GapDisclosure {
  code:
    | 'UNMAPPED_CRITERION'
    | 'CRITERION_NOT_VERIFIED'
    | 'EVIDENCE_FAILED'
    | 'EVIDENCE_STALE'
    | 'EVIDENCE_UNKNOWN'
    | 'EVIDENCE_PENDING'
    | 'UNCORROBORATED_STATEMENT';
  severity: 'blocking_disclosure' | 'advisory';
  criterionId?: string;
  criterionTitle?: string;
  evidenceId?: string;
  message: string;
}

export interface SnapshotEvidenceEntry {
  evidenceId: string;
  title: string;
  observationType: ObservationType;
  sourceOrigin: SourceOrigin;
  claimAttribution: ClaimAttribution;
  state: EvidenceState;
  stateReason: string;
  repoFullName: string | null;
  externalId: string | null;
  externalUrl: string | null;
  commitSha: string | null;
  testedSha: string | null;
  actor: string | null;
  observedAt: string;
  note: string | null;
}

export interface SnapshotCriterionEntry {
  criterionId: string;
  title: string;
  description: string;
  category: CriterionCategory;
  priority: CriterionPriority;
  expectedEvidence: string;
  status: EvidenceState;
  evidenceIds: string[];
  hasIndependentObservation: boolean;
}

export interface CanonicalReceiptSnapshot {
  schemaVersion: 1;
  workspaceId: string;
  workspaceName: string;
  brandAccentColor: string;
  clientId: string;
  clientName: string;
  projectId: string;
  projectName: string;
  batchId: string;
  versionNumber: number;
  title: string;
  summary: string;
  limitationsNote: string;
  targetDate: string | null;
  publishedAt: string;
  publishedByName: string;
  hasGaps: boolean;
  verificationSummaryLabel: string;
  gaps: GapDisclosure[];
  criteria: SnapshotCriterionEntry[];
  evidence: SnapshotEvidenceEntry[];
  aiProvenance: {
    usedAiDraft: boolean;
    approvedByName: string | null;
    approvedAt: string | null;
  };
}
