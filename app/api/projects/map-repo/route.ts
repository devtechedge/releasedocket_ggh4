import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { handleApiError } from '@/lib/api-helpers';
import {
  requireSessionContext,
  verifySameOriginRequest,
} from '@/services/auth.service';
import {
  mapRepoToProjectService,
  unmapRepoFromProjectService,
} from '@/services/crm.service';

const MapSchema = z.object({
  projectId: z.string().min(1),
  repositoryId: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    await verifySameOriginRequest();
    const body = MapSchema.parse(await req.json());
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    await mapRepoToProjectService(db, ctx, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await verifySameOriginRequest();
    const body = MapSchema.parse(await req.json());
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    await unmapRepoFromProjectService(db, ctx, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
