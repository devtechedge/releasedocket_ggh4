import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { ensureDemoSeeded } from '@/db/seed';
import { handleApiError } from '@/lib/api-helpers';
import {
  setSessionCookie,
  signInWithEmailPassword,
  verifySameOriginRequest,
} from '@/services/auth.service';

const SigninSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    await verifySameOriginRequest();
    const body = SigninSchema.parse(await req.json());
    const db = await getDb();
    await ensureDemoSeeded(db);
    const { rawSessionToken } = await signInWithEmailPassword(db, body);
    await setSessionCookie(rawSessionToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
