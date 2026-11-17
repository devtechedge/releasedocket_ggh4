import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { handleApiError } from '@/lib/api-helpers';
import {
  getOptionalSessionContext,
  requireSessionContext,
  switchWorkspaceService,
  verifySameOriginRequest,
} from '@/services/auth.service';

export async function GET() {
  try {
    const db = await getDb();
    const ctx = await getOptionalSessionContext(db);
    if (!ctx) {
      return NextResponse.json({ authenticated: false }, { status: 200 });
    }
    return NextResponse.json({
      authenticated: true,
      user: {
        id: ctx.user.id,
        name: ctx.user.name,
        email: ctx.user.email,
      },
      workspace: ctx.workspace,
      role: ctx.role,
      memberships: ctx.memberships,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const SwitchSchema = z.object({
  workspaceId: z.string().min(1),
});

export async function PATCH(req: NextRequest) {
  try {
    await verifySameOriginRequest();
    const body = SwitchSchema.parse(await req.json());
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    await switchWorkspaceService(db, ctx, body.workspaceId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
