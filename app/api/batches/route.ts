import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { handleApiError } from '@/lib/api-helpers';
import {
  requireSessionContext,
  verifySameOriginRequest,
} from '@/services/auth.service';
import {
  createDeliveryBatchService,
  listDeliveryBatchesService,
} from '@/services/delivery.service';

export async function GET() {
  try {
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    const batches = await listDeliveryBatchesService(db, ctx);
    return NextResponse.json({ batches });
  } catch (err) {
    return handleApiError(err);
  }
}

const CreateBatchSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(2).max(160),
  summary: z.string().min(2).max(2000),
  internalNotes: z.string().max(2000).optional(),
  limitationsNote: z.string().max(1000).optional(),
  targetDate: z.string().nullable().optional(),
  targetSha: z.string().max(64).nullable().optional(),
  criteria: z
    .array(
      z.object({
        title: z.string().min(2).max(200),
        description: z.string().max(500).optional(),
        category: z.enum([
          'feature',
          'integration',
          'automation',
          'security',
          'performance',
          'documentation',
        ]),
        priority: z.enum(['critical', 'high', 'standard']),
        expectedEvidence: z.string().min(2).max(300),
      })
    )
    .optional(),
});

export async function POST(req: NextRequest) {
  try {
    await verifySameOriginRequest();
    const body = CreateBatchSchema.parse(await req.json());
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    const result = await createDeliveryBatchService(db, ctx, body);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
