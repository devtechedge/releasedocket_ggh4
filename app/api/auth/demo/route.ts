import { NextResponse } from 'next/server';
import { getDb } from '@/db/client';
import {
  DEMO_OWNER_EMAIL,
  DEMO_OWNER_PASSWORD,
  ensureDemoSeeded,
} from '@/db/seed';
import { handleApiError } from '@/lib/api-helpers';
import {
  isDemoModeAllowed,
  setSessionCookie,
  signInWithEmailPassword,
  verifySameOriginRequest,
} from '@/services/auth.service';

export async function POST() {
  try {
    await verifySameOriginRequest();
    if (!isDemoModeAllowed()) {
      return NextResponse.json(
        { error: 'Demo workspace access is disabled in production.' },
        { status: 403 }
      );
    }
    const db = await getDb();
    await ensureDemoSeeded(db);
    const { rawSessionToken } = await signInWithEmailPassword(db, {
      email: DEMO_OWNER_EMAIL,
      password: DEMO_OWNER_PASSWORD,
    });
    await setSessionCookie(rawSessionToken);
    return NextResponse.json({ ok: true, workspace: 'Northstar Digital Studio (DEMO)' });
  } catch (err) {
    return handleApiError(err);
  }
}
