import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { ensureDemoSeeded } from '@/db/seed';
import { handleApiError } from '@/lib/api-helpers';
import { verifySameOriginRequest } from '@/services/auth.service';
import {
  getPortalReceiptService,
  submitPortalClientActionService,
} from '@/services/portal.service';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const otpCode = req.nextUrl.searchParams.get('otp') || undefined;
    const db = await getDb();
    await ensureDemoSeeded(db);
    const payload = await getPortalReceiptService(db, token, otpCode);
    return NextResponse.json(payload, {
      headers: { 'X-Robots-Tag': 'noindex, nofollow, noarchive' },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const PortalActionSchema = z.object({
  actionType: z.enum(['accepted', 'changes_requested', 'commented']),
  actorName: z.string().min(2).max(120),
  actorEmail: z.string().email().max(150),
  note: z.string().max(2000).default(''),
  otpCode: z.string().max(12).optional(),
});

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    await verifySameOriginRequest();
    const { token } = await context.params;
    const body = PortalActionSchema.parse(await req.json());
    if (body.actionType === 'commented' && !body.note.trim()) {
      return NextResponse.json(
        { error: 'Comment text is required.' },
        { status: 400 }
      );
    }
    if (body.actionType === 'changes_requested' && !body.note.trim()) {
      return NextResponse.json(
        { error: 'Please explain the requested changes.' },
        { status: 400 }
      );
    }

    const db = await getDb();
    const updated = await submitPortalClientActionService(db, {
      rawToken: token,
      otpCode: body.otpCode,
      actionType: body.actionType,
      actorName: body.actorName,
      actorEmail: body.actorEmail,
      note: body.note,
    });
    return NextResponse.json(updated, {
      headers: { 'X-Robots-Tag': 'noindex, nofollow, noarchive' },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
