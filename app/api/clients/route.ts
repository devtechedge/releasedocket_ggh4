import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { handleApiError } from '@/lib/api-helpers';
import {
  requireSessionContext,
  verifySameOriginRequest,
} from '@/services/auth.service';
import {
  createClientService,
  listCrmOverviewService,
} from '@/services/crm.service';

export async function GET() {
  try {
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    const data = await listCrmOverviewService(db, ctx);
    return NextResponse.json({ clients: data.clients });
  } catch (err) {
    return handleApiError(err);
  }
}

const CreateClientSchema = z.object({
  name: z.string().min(2).max(120),
  contactName: z.string().min(2).max(120),
  contactEmail: z.string().email().max(150),
  retainerMonthlyUsd: z.coerce.number().int().min(0).max(500000).default(0),
  notes: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  try {
    await verifySameOriginRequest();
    const body = CreateClientSchema.parse(await req.json());
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    const client = await createClientService(db, ctx, body);
    return NextResponse.json({ client }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
