import Stripe from 'stripe';
import type { PlanTier } from '@/domain/types';

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY?.trim() &&
      process.env.STRIPE_WEBHOOK_SECRET?.trim()
  );
}

export function isBillingSimulatorAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && !isStripeConfigured();
}

function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key) {
    throw new Error('Stripe is not configured (STRIPE_SECRET_KEY missing).');
  }
  return new Stripe(key);
}

export function getStripePriceIdForTier(tier: PlanTier): string | null {
  const map: Record<PlanTier, string | undefined> = {
    solo: process.env.STRIPE_PRICE_SOLO,
    studio: process.env.STRIPE_PRICE_STUDIO,
    agency: process.env.STRIPE_PRICE_AGENCY,
    partner: process.env.STRIPE_PRICE_PARTNER,
  };
  return map[tier]?.trim() || null;
}

export function resolveTierFromPriceId(priceId: string | null | undefined): PlanTier {
  if (!priceId) return 'solo';
  if (priceId === process.env.STRIPE_PRICE_PARTNER) return 'partner';
  if (priceId === process.env.STRIPE_PRICE_AGENCY) return 'agency';
  if (priceId === process.env.STRIPE_PRICE_STUDIO) return 'studio';
  return 'solo';
}

export async function createCheckoutSession(params: {
  workspaceId: string;
  customerEmail: string;
  stripeCustomerId: string | null;
  tier: PlanTier;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripeClient();
  const priceId = getStripePriceIdForTier(params.tier);
  if (!priceId) {
    throw new Error(
      `Stripe Price ID for tier '${params.tier}' is not configured.`
    );
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: params.stripeCustomerId || undefined,
    customer_email: params.stripeCustomerId ? undefined : params.customerEmail,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      workspaceId: params.workspaceId,
      planTier: params.tier,
    },
    subscription_data: {
      metadata: {
        workspaceId: params.workspaceId,
        planTier: params.tier,
      },
    },
  });

  if (!session.url) {
    throw new Error('Stripe did not return a checkout session URL.');
  }

  return { url: session.url, sessionId: session.id };
}

export async function createCustomerPortalSession(params: {
  stripeCustomerId: string;
  returnUrl: string;
}): Promise<{ url: string }> {
  const stripe = getStripeClient();
  const portal = await stripe.billingPortal.sessions.create({
    customer: params.stripeCustomerId,
    return_url: params.returnUrl,
  });
  return { url: portal.url };
}

export function verifyAndConstructStripeEvent(
  rawBody: string,
  signatureHeader: string
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
  }
  const stripe = getStripeClient();
  return stripe.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
}
