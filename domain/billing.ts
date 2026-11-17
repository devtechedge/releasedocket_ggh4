import type { PlanTier, SubscriptionStatus } from './types';

export interface PlanDefinition {
  tier: PlanTier;
  name: string;
  tagline: string;
  monthlyPriceUsd: number;
  maxProjects: number;
  maxMembers: number;
  maxReceiptsPerMonth: number | null; // null = unlimited
  customBranding: boolean;
  clientPortal: boolean;
  auditExports: boolean;
  multiTeamControls: boolean;
}

export const PLAN_CATALOG: Record<PlanTier, PlanDefinition> = {
  solo: {
    tier: 'solo',
    name: 'Solo',
    tagline: 'For independent delivery consultants',
    monthlyPriceUsd: 99,
    maxProjects: 2,
    maxMembers: 1,
    maxReceiptsPerMonth: 10,
    customBranding: false,
    clientPortal: true,
    auditExports: false,
    multiTeamControls: false,
  },
  studio: {
    tier: 'studio',
    name: 'Studio',
    tagline: 'For 5–12 person product studios',
    monthlyPriceUsd: 249,
    maxProjects: 8,
    maxMembers: 5,
    maxReceiptsPerMonth: 50,
    customBranding: true,
    clientPortal: true,
    auditExports: false,
    multiTeamControls: false,
  },
  agency: {
    tier: 'agency',
    name: 'Agency',
    tagline: 'For scaling software & AI-automation agencies',
    monthlyPriceUsd: 499,
    maxProjects: 25,
    maxMembers: 15,
    maxReceiptsPerMonth: null,
    customBranding: true,
    clientPortal: true,
    auditExports: true,
    multiTeamControls: false,
  },
  partner: {
    tier: 'partner',
    name: 'Partner',
    tagline: 'For multi-pod consultancies',
    monthlyPriceUsd: 999,
    maxProjects: 75,
    maxMembers: 40,
    maxReceiptsPerMonth: null,
    customBranding: true,
    clientPortal: true,
    auditExports: true,
    multiTeamControls: true,
  },
};

export interface WorkspaceUsageSnapshot {
  projectCount: number;
  memberCount: number;
  receiptsPublishedThisMonth: number;
}

export type EntitlementAction =
  | 'create_project'
  | 'invite_member'
  | 'publish_receipt'
  | 'export_audit_log'
  | 'custom_branding'
  | 'read_historical_receipt';

export interface EntitlementResult {
  allowed: boolean;
  reason?: string;
  limit?: number | null;
  current?: number;
}

export class EntitlementError extends Error {
  readonly status = 402;
  constructor(message: string) {
    super(message);
    this.name = 'EntitlementError';
  }
}

export function checkEntitlement(
  planTier: PlanTier,
  subscriptionStatus: SubscriptionStatus,
  usage: WorkspaceUsageSnapshot,
  action: EntitlementAction
): EntitlementResult {
  // Historical read access is always preserved even after downgrade or cancellation.
  if (action === 'read_historical_receipt') {
    return { allowed: true };
  }

  // When Stripe is disconnected (e.g. trial/free sandbox evaluation) or active/trialing,
  // enforce the configured plan tier caps (defaults to 'solo' or workspace plan).
  // If subscription is explicitly 'canceled' or 'past_due', fall back to Solo caps for new writes
  // except publishing/projects above Solo.
  const effectiveTier: PlanTier =
    subscriptionStatus === 'canceled' || subscriptionStatus === 'past_due'
      ? 'solo'
      : planTier;

  const plan = PLAN_CATALOG[effectiveTier];

  if (action === 'create_project') {
    if (usage.projectCount >= plan.maxProjects) {
      return {
        allowed: false,
        reason: `${plan.name} plan allows up to ${plan.maxProjects} active projects (currently ${usage.projectCount}). Upgrade to add more projects.`,
        limit: plan.maxProjects,
        current: usage.projectCount,
      };
    }
    return { allowed: true, limit: plan.maxProjects, current: usage.projectCount };
  }

  if (action === 'invite_member') {
    if (usage.memberCount >= plan.maxMembers) {
      return {
        allowed: false,
        reason: `${plan.name} plan allows up to ${plan.maxMembers} workspace members (currently ${usage.memberCount}). Upgrade to invite more team members.`,
        limit: plan.maxMembers,
        current: usage.memberCount,
      };
    }
    return { allowed: true, limit: plan.maxMembers, current: usage.memberCount };
  }

  if (action === 'publish_receipt') {
    if (
      plan.maxReceiptsPerMonth !== null &&
      usage.receiptsPublishedThisMonth >= plan.maxReceiptsPerMonth
    ) {
      return {
        allowed: false,
        reason: `${plan.name} plan allows up to ${plan.maxReceiptsPerMonth} published receipts per month (currently ${usage.receiptsPublishedThisMonth}). Upgrade to publish additional receipts.`,
        limit: plan.maxReceiptsPerMonth,
        current: usage.receiptsPublishedThisMonth,
      };
    }
    return {
      allowed: true,
      limit: plan.maxReceiptsPerMonth,
      current: usage.receiptsPublishedThisMonth,
    };
  }

  if (action === 'export_audit_log') {
    if (!plan.auditExports) {
      return {
        allowed: false,
        reason: `Audit exports require the Agency ($499/mo) or Partner ($999/mo) plan.`,
      };
    }
    return { allowed: true };
  }

  if (action === 'custom_branding') {
    if (!plan.customBranding) {
      return {
        allowed: false,
        reason: `Custom client portal branding requires Studio ($249/mo) or higher.`,
      };
    }
    return { allowed: true };
  }

  return { allowed: true };
}

export function calculateMrrArithmetic(
  tier: PlanTier,
  accountCount: number
): {
  tier: PlanTier;
  unitPriceUsd: number;
  accountCount: number;
  grossMrrUsd: number;
  note: string;
} {
  const unitPriceUsd = PLAN_CATALOG[tier].monthlyPriceUsd;
  const safeCount = Math.max(0, Math.floor(accountCount));
  return {
    tier,
    unitPriceUsd,
    accountCount: safeCount,
    grossMrrUsd: unitPriceUsd * safeCount,
    note: 'Arithmetic scenario before churn, discounts, taxes, and payment processing fees.',
  };
}
