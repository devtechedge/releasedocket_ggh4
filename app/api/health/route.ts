import { NextResponse } from 'next/server';
import { getDb } from '@/db/client';
import { ensureDemoSeeded } from '@/db/seed';
import { processPendingOutboxJobs } from '@/jobs/outbox';

export async function GET() {
  const db = await getDb();
  await ensureDemoSeeded(db);
  await processPendingOutboxJobs(db);
  return NextResponse.json({
    ok: true,
    dialect: db.dialect,
    timestamp: new Date().toISOString(),
  });
}
