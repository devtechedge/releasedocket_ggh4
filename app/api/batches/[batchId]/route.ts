import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/db/client';
import { handleApiError } from '@/lib/api-helpers';
import {
  requireSessionContext,
  verifySameOriginRequest,
} from '@/services/auth.service';
import {
  addAcceptanceCriterionService,
  addManualEvidenceService,
  approveAiDraftForBatchService,
  attachObservationEvidenceService,
  generateAiDraftForBatchService,
  getDeliveryBatchDetailService,
  linkEvidenceToCriterionService,
  publishReceiptVersionService,
  revokePortalTokenService,
  revokeReceiptVersionService,
  setCriterionStatusService,
  updateDeliveryBatchService,
} from '@/services/delivery.service';

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ batchId: string }> }
) {
  try {
    const { batchId } = await context.params;
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    const detail = await getDeliveryBatchDetailService(db, ctx, batchId);
    return NextResponse.json(detail);
  } catch (err) {
    return handleApiError(err);
  }
}

const UpdateBatchSchema = z.object({
  title: z.string().min(2).max(160).optional(),
  summary: z.string().min(2).max(3000).optional(),
  internalNotes: z.string().max(3000).optional(),
  limitationsNote: z.string().max(1500).optional(),
  targetDate: z.string().nullable().optional(),
  targetSha: z.string().max(64).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ batchId: string }> }
) {
  try {
    await verifySameOriginRequest();
    const { batchId } = await context.params;
    const body = UpdateBatchSchema.parse(await req.json());
    const db = await getDb();
    const ctx = await requireSessionContext(db);
    await updateDeliveryBatchService(db, ctx, batchId, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}

const BatchActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('add_criterion'),
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
  }),
  z.object({
    action: z.literal('set_criterion_status'),
    criterionId: z.string().min(1),
    status: z.enum([
      'pending',
      'verified',
      'stale',
      'failed',
      'unknown',
      'not_applicable',
    ]),
  }),
  z.object({
    action: z.literal('attach_observation'),
    observationId: z.string().min(1),
    criterionIds: z.array(z.string()).default([]),
  }),
  z.object({
    action: z.literal('add_manual_evidence'),
    title: z.string().min(2).max(200),
    observationType: z.literal('manual_evidence').default('manual_evidence'),
    claimAttribution: z.enum(['agency_statement', 'client_supplied']),
    externalUrl: z.string().max(500).optional(),
    note: z.string().min(2).max(1500),
    observedAt: z.string().min(4),
    state: z.enum(['pending', 'verified', 'unknown', 'not_applicable']),
    criterionIds: z.array(z.string()).default([]),
  }),
  z.object({
    action: z.literal('link_evidence'),
    criterionId: z.string().min(1),
    evidenceId: z.string().min(1),
  }),
  z.object({
    action: z.literal('ai_draft'),
  }),
  z.object({
    action: z.literal('ai_approve'),
    editedSummary: z.string().min(5).max(3000),
  }),
  z.object({
    action: z.literal('publish_receipt'),
    gapDisclosureAck: z.boolean(),
    recipientEmail: z.string().email(),
    otpRequired: z.boolean().optional(),
  }),
  z.object({
    action: z.literal('revoke_token'),
    portalTokenId: z.string().min(1),
  }),
  z.object({
    action: z.literal('revoke_receipt'),
    receiptVersionId: z.string().min(1),
  }),
]);

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ batchId: string }> }
) {
  try {
    await verifySameOriginRequest();
    const { batchId } = await context.params;
    const body = BatchActionSchema.parse(await req.json());
    const db = await getDb();
    const ctx = await requireSessionContext(db);

    switch (body.action) {
      case 'add_criterion': {
        const criterion = await addAcceptanceCriterionService(db, ctx, batchId, {
          title: body.title,
          description: body.description,
          category: body.category,
          priority: body.priority,
          expectedEvidence: body.expectedEvidence,
        });
        return NextResponse.json({ ok: true, criterion }, { status: 201 });
      }
      case 'set_criterion_status': {
        await setCriterionStatusService(
          db,
          ctx,
          batchId,
          body.criterionId,
          body.status
        );
        return NextResponse.json({ ok: true });
      }
      case 'attach_observation': {
        const evidence = await attachObservationEvidenceService(
          db,
          ctx,
          batchId,
          {
            observationId: body.observationId,
            criterionIds: body.criterionIds,
          }
        );
        return NextResponse.json({ ok: true, evidence }, { status: 201 });
      }
      case 'add_manual_evidence': {
        const evidence = await addManualEvidenceService(db, ctx, batchId, {
          title: body.title,
          observationType: body.observationType,
          claimAttribution: body.claimAttribution,
          externalUrl: body.externalUrl,
          note: body.note,
          observedAt: body.observedAt,
          state: body.state,
          criterionIds: body.criterionIds,
        });
        return NextResponse.json({ ok: true, evidence }, { status: 201 });
      }
      case 'link_evidence': {
        await linkEvidenceToCriterionService(db, ctx, batchId, {
          criterionId: body.criterionId,
          evidenceId: body.evidenceId,
        });
        return NextResponse.json({ ok: true });
      }
      case 'ai_draft': {
        const draft = await generateAiDraftForBatchService(db, ctx, batchId);
        return NextResponse.json({ ok: true, draft });
      }
      case 'ai_approve': {
        await approveAiDraftForBatchService(
          db,
          ctx,
          batchId,
          body.editedSummary
        );
        return NextResponse.json({ ok: true });
      }
      case 'publish_receipt': {
        const published = await publishReceiptVersionService(db, ctx, batchId, {
          gapDisclosureAck: body.gapDisclosureAck,
          recipientEmail: body.recipientEmail,
          otpRequired: body.otpRequired,
        });
        return NextResponse.json({ ok: true, ...published }, { status: 201 });
      }
      case 'revoke_token': {
        await revokePortalTokenService(db, ctx, body.portalTokenId);
        return NextResponse.json({ ok: true });
      }
      case 'revoke_receipt': {
        await revokeReceiptVersionService(db, ctx, body.receiptVersionId);
        return NextResponse.json({ ok: true });
      }
    }
  } catch (err) {
    return handleApiError(err);
  }
}
