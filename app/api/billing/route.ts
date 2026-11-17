import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { isBillingSimulatorAllowed } from '@/integrations/stripe';
import { handleApiError } from '@/lib/api-helpers';
import {
  requireSessionContext,
  verifySameOriginRequest,
} from '@/services/auth.service';
import {
  getBillingOverviewService,
  processNormalizedBillingEvent,
  startBillingCheckoutService,
  startBillingPortalService,
} from '@/services/billing.service';

export async function GET() {
  try {
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    const overview = await getBillingOverviewService(db, ctx);
    return NextResponse.json(overview);
  } catch (err) {
    return handleApiError(err);
  }
}

const BillingActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('checkout'),
    tier: z.enum(['solo', 'studio', 'agency', 'partner']),
  }),
  z.object({
    action: z.literal('portal'),
  }),
  z.object({
    action: z.literal('simulate_webhook'),
    tier: z.enum(['solo', 'studio', 'agency', 'partner']),
    subscriptionStatus: z.enum(['active', 'canceled', 'past_due']),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    await verifySameOriginRequest();
    const body = BillingActionSchema.parse(await req.json());
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    const baseUrl =
      process.env.APP_URL?.trim() || `${req.nextUrl.protocol}//${req.nextUrl.host}`;

    if (body.action === 'checkout') {
      const session = await startBillingCheckoutService(ctx, body.tier, baseUrl);
      return NextResponse.json({ ok: true, ...session });
    }

    if (body.action === 'portal') {
      const portal = await startBillingPortalService(ctx, baseUrl);
      return NextResponse.json({ ok: true, ...portal });
    }

    // Explicitly gated non-production test webhook simulator when Stripe keys are disconnected
    if (!isBillingSimulatorAllowed()) {
      return NextResponse.json(
        {
          error:
            'Test billing webhook simulation is disabled when Stripe is configured or in production.',
        },
        { status: 403 }
      );
    }

    const res = await processNormalizedBillingEvent(db, {
      stripeEventId: `evt_test_sim_${Date.now()}`,
      eventType: 'customer.subscription.updated',
      workspaceId: ctx.workspace.id,
      planTier: body.tier,
      subscriptionStatus: body.subscriptionStatus,
      payload: { simulated: true, tier: body.tier },
    });

    return NextResponse.json({ ok: true, ...res });
  } catch (err) {
    return handleApiError(err);
  }
}
