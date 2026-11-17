import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { EntitlementError } from '@/domain/billing';
import { AuthorizationError } from '@/domain/rbac';
import { redactForLog } from '@/domain/security';

export function handleApiError(err: unknown): NextResponse {
  if (err instanceof ZodError) {
    return NextResponse.json(
      {
        error: 'Validation failed',
        issues: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      },
      { status: 400 }
    );
  }
  if (err instanceof AuthorizationError) {
    return NextResponse.json({ error: err.message }, { status: 403 });
  }
  if (err instanceof EntitlementError) {
    return NextResponse.json({ error: err.message }, { status: 402 });
  }

  const withStatus = err as Error & { status?: number };
  const status =
    typeof withStatus?.status === 'number' ? withStatus.status : 400;
  const message =
    err instanceof Error ? err.message : 'Unexpected server error.';

  if (status >= 500) {
    console.error('[ReleaseDocket API Error]', redactForLog({ message }));
  }

  return NextResponse.json({ error: message }, { status });
}
