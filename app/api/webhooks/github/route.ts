import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/db/client';
import { handleApiError } from '@/lib/api-helpers';
import { processGitHubWebhookService } from '@/services/github-sync.service';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signatureHeader = req.headers.get('x-hub-signature-256');
    const deliveryId =
      req.headers.get('x-github-delivery') || `missing-delivery-${Date.now()}`;
    const eventType = req.headers.get('x-github-event') || 'unknown';

    const db = await getDb();
    const result = await processGitHubWebhookService(db, {
      rawBody,
      signatureHeader,
      deliveryId,
      eventType,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleApiError(err);
  }
}
