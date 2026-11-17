import type { DbExecutor } from '@/db/client';
import {
  calculateMrrArithmetic,
  PLAN_CATALOG,
  type PlanDefinition,
} from '@/domain/billing';
import { assertPermission } from '@/domain/rbac';
import type { PlanTier, SubscriptionStatus } from '@/domain/types';
import {
  createCheckoutSession,
  createCustomerPortalSession,
  isBillingSimulatorAllowed,
  isStripeConfigured,
  resolveTierFromPriceId,
  verifyAndConstructStripeEvent,
} from '@/integrations/stripe';
import { recordAuditEvent } from '@/repositories/audit.repo';
import {
  findWorkspaceById,
  updateWorkspaceBilling,
  type SessionWithContext,
} from '@/repositories/auth.repo';
import { getWorkspaceUsage } from '@/repositories/crm.repo';
import {
  findBillingEventByStripeId,
  insertBillingEvent,
} from '@/repositories/delivery.repo';

export async function getBillingOverviewService(
  db: DbExecutor,
  ctx: SessionWithContext
) {
  assertPermission(ctx.role, 'workspace:read');
  const usage = await getWorkspaceUsage(db, ctx.workspace.id);
  const currentPlan: PlanDefinition = PLAN_CATALOG[ctx.workspace.planTier];

  return {
    workspaceId: ctx.workspace.id,
    planTier: ctx.workspace.planTier,
    subscriptionStatus: ctx.workspace.subscriptionStatus,
    stripeConfigured: isStripeConfigured(),
    simulatorAllowed: isBillingSimulatorAllowed(),
    stripeCustomerId: ctx.workspace.stripeCustomerId,
    currentPlan,
    usage,
    catalog: Object.values(PLAN_CATALOG),
    mrrArithmeticExample: calculateMrrArithmetic('agency', 21),
  };
}

export async function startBillingCheckoutService(
  ctx: SessionWithContext,
  tier: PlanTier,
  baseUrl: string
): Promise<{ url: string; sessionId: string }> {
  assertPermission(ctx.role, 'billing:manage');
  return createCheckoutSession({
    workspaceId: ctx.workspace.id,
    customerEmail: ctx.user.email,
    stripeCustomerId: ctx.workspace.stripeCustomerId,
    tier,
    successUrl: `${baseUrl}/dashboard/billing?checkout=success`,
    cancelUrl: `${baseUrl}/dashboard/billing?checkout=canceled`,
  });
}

export async function startBillingPortalService(
  ctx: SessionWithContext,
  baseUrl: string
): Promise<{ url: string }> {
  assertPermission(ctx.role, 'billing:manage');
  if (!ctx.workspace.stripeCustomerId) {
    throw new Error('No Stripe customer ID is linked to this workspace yet.');
  }
  return createCustomerPortalSession({
    stripeCustomerId: ctx.workspace.stripeCustomerId,
    returnUrl: `${baseUrl}/dashboard/billing`,
  });
}

export async function processNormalizedBillingEvent(
  db: DbExecutor,
  params: {
    stripeEventId: string;
    eventType: string;
    workspaceId: string;
    planTier: PlanTier;
    subscriptionStatus: SubscriptionStatus;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    payload: Record<string, unknown>;
  }
): Promise<{ status: 'processed' | 'duplicate_ignored' }> {
  const alreadyProcessed = await findBillingEventByStripeId(
    db,
    params.stripeEventId
  );
  if (alreadyProcessed) {
    return { status: 'duplicate_ignored' };
  }

  const ws = await findWorkspaceById(db, params.workspaceId);
  if (!ws) {
    throw new Error(`Workspace ${params.workspaceId} not found for billing event.`);
  }

  await db.transaction(async (tx) => {
    await updateWorkspaceBilling(tx, params.workspaceId, {
      planTier: params.planTier,
      subscriptionStatus: params.subscriptionStatus,
      stripeCustomerId: params.stripeCustomerId,
      stripeSubscriptionId: params.stripeSubscriptionId,
    });

    await insertBillingEvent(tx, {
      workspaceId: params.workspaceId,
      stripeEventId: params.stripeEventId,
      eventType: params.eventType,
      payload: params.payload,
    });

    await recordAuditEvent(tx, {
      workspaceId: params.workspaceId,
      actorType: 'webhook',
      actorId: params.stripeEventId,
      actorLabel: 'stripe-webhook',
      eventType: 'billing.subscription_updated',
      resourceType: 'workspace',
      resourceId: params.workspaceId,
      metadata: {
        eventType: params.eventType,
        planTier: params.planTier,
        subscriptionStatus: params.subscriptionStatus,
      },
    });
  });

  return { status: 'processed' };
}

export async function processStripeWebhookRawService(
  db: DbExecutor,
  rawBody: string,
  signatureHeader: string
): Promise<{ status: 'processed' | 'duplicate_ignored' | 'ignored' }> {
  const event = verifyAndConstructStripeEvent(rawBody, signatureHeader);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as {
      metadata?: { workspaceId?: string; planTier?: string };
      customer?: string;
      subscription?: string;
    };
    const workspaceId = session.metadata?.workspaceId;
    if (!workspaceId) return { status: 'ignored' };
    const planTier = (session.metadata?.planTier as PlanTier) || 'solo';

    return processNormalizedBillingEvent(db, {
      stripeEventId: event.id,
      eventType: event.type,
      workspaceId,
      planTier,
      subscriptionStatus: 'active',
      stripeCustomerId:
        typeof session.customer === 'string' ? session.customer : null,
      stripeSubscriptionId:
        typeof session.subscription === 'string' ? session.subscription : null,
      payload: { sessionId: event.id },
    });
  }

  if (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const sub = event.data.object as {
      id: string;
      status: string;
      customer?: string;
      metadata?: { workspaceId?: string; planTier?: string };
      items?: { data?: Array<{ price?: { id?: string } }> };
    };
    const workspaceId = sub.metadata?.workspaceId;
    if (!workspaceId) return { status: 'ignored' };

    const priceId = sub.items?.data?.[0]?.price?.id;
    const planTier =
      (sub.metadata?.planTier as PlanTier) || resolveTierFromPriceId(priceId);
    const subscriptionStatus: SubscriptionStatus =
      event.type === 'customer.subscription.deleted'
        ? 'canceled'
        : sub.status === 'active'
          ? 'active'
          : sub.status === 'trialing'
            ? 'trialing'
            : sub.status === 'past_due'
              ? 'past_due'
              : 'canceled';

    return processNormalizedBillingEvent(db, {
      stripeEventId: event.id,
      eventType: event.type,
      workspaceId,
      planTier,
      subscriptionStatus,
      stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : null,
      stripeSubscriptionId: sub.id,
      payload: { subscriptionId: sub.id, status: sub.status },
    });
  }

  return { status: 'ignored' };
}
