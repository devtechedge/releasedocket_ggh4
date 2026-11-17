import { NextResponse } from 'next/server';
import { getDb } from '@/db/client';
import { handleApiError } from '@/lib/api-helpers';
import {
  signOutCurrentSession,
  verifySameOriginRequest,
} from '@/services/auth.service';

export async function POST() {
  try {
    await verifySameOriginRequest();
    const db = await getDb();
    await signOutCurrentSession(db);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
