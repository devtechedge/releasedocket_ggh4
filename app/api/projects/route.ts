import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { handleApiError } from '@/lib/api-helpers';
import {
  requireSessionContext,
  verifySameOriginRequest,
} from '@/services/auth.service';
import {
  createProjectService,
  listCrmOverviewService,
} from '@/services/crm.service';

export async function GET() {
  try {
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    const data = await listCrmOverviewService(db, ctx);
    return NextResponse.json({
      projects: data.projects,
      clients: data.clients,
      mappings: data.mappings,
      repositories: data.repositories,
      usage: data.usage,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const CreateProjectSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(2).max(120),
  summary: z.string().max(500).optional(),
  environmentUrl: z.string().max(300).optional(),
});

export async function POST(req: NextRequest) {
  try {
    await verifySameOriginRequest();
    const body = CreateProjectSchema.parse(await req.json());
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    const project = await createProjectService(db, ctx, body);
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
