import { randomUUID } from 'node:crypto';
import type { DbExecutor } from '@/db/client';
import { parseJsonColumn } from '@/db/client';
import { sendTransactionalEmail } from '@/integrations/email';

export type OutboxJobType =
  | 'send_portal_notification'
  | 'send_team_invitation'
  | 'recompute_batch_health';

export async function enqueueOutboxJob(
  db: DbExecutor,
  params: {
    workspaceId: string;
    jobType: OutboxJobType;
    payload: Record<string, unknown>;
  }
): Promise<string> {
  const id = `job_${randomUUID()}`;
  const now = new Date().toISOString();
  await db.execute(
    `INSERT INTO outbox_jobs (id, workspace_id, job_type, payload_json, status, attempts, run_at, created_at)
     VALUES ($1, $2, $3, $4, 'pending', 0, $5, $6)`,
    [id, params.workspaceId, params.jobType, JSON.stringify(params.payload), now, now]
  );
  return id;
}

export async function processPendingOutboxJobs(
  db: DbExecutor,
  workspaceId?: string
): Promise<{ processed: number; failed: number }> {
  const now = new Date().toISOString();
  const rows = workspaceId
    ? await db.query<{
        id: string;
        workspace_id: string;
        job_type: string;
        payload_json: unknown;
        attempts: number;
      }>(
        `SELECT id, workspace_id, job_type, payload_json, attempts
         FROM outbox_jobs
         WHERE status = 'pending' AND workspace_id = $1 AND run_at <= $2
         ORDER BY created_at ASC
         LIMIT 25`,
        [workspaceId, now]
      )
    : await db.query<{
        id: string;
        workspace_id: string;
        job_type: string;
        payload_json: unknown;
        attempts: number;
      }>(
        `SELECT id, workspace_id, job_type, payload_json, attempts
         FROM outbox_jobs
         WHERE status = 'pending' AND run_at <= $1
         ORDER BY created_at ASC
         LIMIT 25`,
        [now]
      );

  let processed = 0;
  let failed = 0;

  for (const job of rows) {
    const payload = parseJsonColumn<Record<string, unknown>>(job.payload_json, {});
    try {
      if (job.job_type === 'send_portal_notification') {
        await sendTransactionalEmail({
          to: String(payload.recipientEmail || ''),
          subject: String(payload.subject || 'ReleaseDocket Delivery Receipt'),
          textBody: String(payload.body || 'A delivery receipt has been published.'),
        });
      } else if (job.job_type === 'send_team_invitation') {
        await sendTransactionalEmail({
          to: String(payload.email || ''),
          subject: 'Invitation to join ReleaseDocket workspace',
          textBody: String(payload.body || 'You have been invited to ReleaseDocket.'),
        });
      }

      await db.execute(
        `UPDATE outbox_jobs SET status = 'completed', attempts = $1 WHERE id = $2`,
        [job.attempts + 1, job.id]
      );
      processed += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown outbox failure';
      await db.execute(
        `UPDATE outbox_jobs SET status = 'failed', attempts = $1, last_error = $2 WHERE id = $3`,
        [job.attempts + 1, msg, job.id]
      );
      failed += 1;
    }
  }

  return { processed, failed };
}
