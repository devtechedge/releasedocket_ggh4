import { NextResponse } from 'next/server';
import { getDb } from '@/db/client';
import { handleApiError } from '@/lib/api-helpers';
import { requireSessionContext } from '@/services/auth.service';
import { getAgencyOverviewService } from '@/services/overview.service';

export async function GET() {
  try {
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    const overview = await getAgencyOverviewService(db, ctx);
    return NextResponse.json(overview);
  } catch (err) {
    return handleApiError(err);
  }
}
