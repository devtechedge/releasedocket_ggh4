import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { handleApiError } from '@/lib/api-helpers';
import {
  registerAgencyAccount,
  setSessionCookie,
  verifySameOriginRequest,
} from '@/services/auth.service';

const SignupSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(150),
  password: z.string().min(8).max(128),
  workspaceName: z.string().min(2).max(120),
});

export async function POST(req: NextRequest) {
  try {
    await verifySameOriginRequest();
    const body = SignupSchema.parse(await req.json());
    const db = await getDb();
    const { rawSessionToken, workspaceId, userId } = await registerAgencyAccount(
      db,
      body
    );
    await setSessionCookie(rawSessionToken);
    return NextResponse.json(
      { ok: true, workspaceId, userId },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}
