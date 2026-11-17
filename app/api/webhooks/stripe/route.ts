import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db/client';
import { handleApiError } from '@/lib/api-helpers';
import { processStripeWebhookRawService } from '@/services/billing.service';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return NextResponse.json(
        { error: 'Missing stripe-signature header.' },
        { status: 400 }
      );
    }
    const db = await getDb();
    const res = await processStripeWebhookRawService(db, rawBody, signature);
    return NextResponse.json({ received: true, ...res });
  } catch (err) {
    return handleApiError(err);
  }
}
