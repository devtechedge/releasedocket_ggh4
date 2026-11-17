import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db/client';
import {
  GITHUB_APP_PERMISSION_EXPLANATIONS,
  isGitHubAppConfigured,
  isGitHubOAuthConfigured,
} from '@/integrations/github';
import { handleApiError } from '@/lib/api-helpers';
import {
  isDemoModeAllowed,
  requireSessionContext,
  verifySameOriginRequest,
} from '@/services/auth.service';
import {
  connectDemoGitHubService,
  listIntegrationsOverviewService,
  syncInstallationService,
} from '@/services/github-sync.service';

export async function GET() {
  try {
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    const overview = await listIntegrationsOverviewService(db, ctx);
    return NextResponse.json({
      ...overview,
      gitHubAppConfigured: isGitHubAppConfigured(),
      gitHubOAuthConfigured: isGitHubOAuthConfigured(),
      demoModeAllowed: isDemoModeAllowed(),
      permissionExplanations: GITHUB_APP_PERMISSION_EXPLANATIONS,
      appSlug: process.env.GITHUB_APP_SLUG || 'releasedocket-app',
    });
  } catch (err) {
    return handleApiError(err);
  }
}

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('connect_demo') }),
  z.object({
    action: z.literal('sync_installation'),
    installationId: z.string().min(1),
  }),
]);

export async function POST(req: NextRequest) {
  try {
    await verifySameOriginRequest();
    const body = ActionSchema.parse(await req.json());
    const db = await getDb();
    const ctx = await requireSessionContext(db);

    if (body.action === 'connect_demo') {
      const result = await connectDemoGitHubService(db, ctx);
      return NextResponse.json({ ok: true, ...result });
    }

    const result = await syncInstallationService(db, ctx, body.installationId);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return handleApiError(err);
  }
}
