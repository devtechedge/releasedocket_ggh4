import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { handleApiError } from '@/lib/api-helpers';
import {
  getTeamOverviewService,
  inviteMemberService,
  requireSessionContext,
  updateMemberRoleService,
  updateWorkspaceProfileService,
  verifySameOriginRequest,
} from '@/services/auth.service';

export async function GET() {
  try {
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    const team = await getTeamOverviewService(db, ctx);
    return NextResponse.json({
      workspace: ctx.workspace,
      role: ctx.role,
      ...team,
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const ProfileSchema = z.object({
  name: z.string().min(2).max(120),
  agencyTagline: z.string().max(240).default(''),
  brandAccentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Must be a 6-digit hex color')
    .default('#1E40AF'),
});

export async function PATCH(req: NextRequest) {
  try {
    await verifySameOriginRequest();
    const body = ProfileSchema.parse(await req.json());
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    await updateWorkspaceProfileService(db, ctx, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

const InviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['ADMIN', 'DELIVERY_LEAD', 'CONTRIBUTOR', 'CLIENT_VIEWER']),
});

export async function POST(req: NextRequest) {
  try {
    await verifySameOriginRequest();
    const body = InviteSchema.parse(await req.json());
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    const result = await inviteMemberService(db, ctx, body);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

const RoleSchema = z.object({
  membershipId: z.string().min(1),
  role: z.enum(['OWNER', 'ADMIN', 'DELIVERY_LEAD', 'CONTRIBUTOR', 'CLIENT_VIEWER']),
});

export async function PUT(req: NextRequest) {
  try {
    await verifySameOriginRequest();
    const body = RoleSchema.parse(await req.json());
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    await updateMemberRoleService(db, ctx, body.membershipId, body.role);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
