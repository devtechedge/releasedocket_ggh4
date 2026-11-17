import type { DbExecutor } from '@/db/client';
import { verifySnapshotHash } from '@/domain/evidence';
import { hashToken } from '@/domain/security';
import { recordAuditEvent } from '@/repositories/audit.repo';
import {
  addClientComment,
  findPortalTokenByHash,
  findReceiptVersionById,
  incrementPortalTokenFailure,
  listClientActionsByReceipt,
  listClientCommentsByReceipt,
  listReceiptVersionsByBatch,
  markPortalTokenAccessed,
  recordClientAction,
  updateBatch,
  updateReceiptVersionStatus,
} from '@/repositories/delivery.repo';

export interface PortalReceiptPayload {
  receiptVersionId: string;
  versionNumber: number;
  status: string;
  publishedAt: string;
  snapshotHash: string;
  hashVerified: boolean;
  otpRequired: boolean;
  otpVerified: boolean;
  recipientEmail: string;
  supersededByVersion: number | null;
  snapshot: ReturnType<typeof Object> | null;
  actions: Array<{
    id: string;
    actionType: string;
    actorName: string;
    actorEmail: string;
    note: string;
    createdAt: string;
  }>;
  comments: Array<{
    id: string;
    authorName: string;
    authorEmail: string;
    authorKind: string;
    body: string;
    createdAt: string;
  }>;
}

export async function getPortalReceiptService(
  db: DbExecutor,
  rawToken: string,
  otpCode?: string
): Promise<PortalReceiptPayload> {
  const token = await findPortalTokenByHash(db, hashToken(rawToken));
  if (!token) {
    const err = new Error('Portal link is invalid or does not exist.') as Error & {
      status?: number;
    };
    err.status = 404;
    throw err;
  }

  if (token.revokedAt) {
    const err = new Error('This portal link has been revoked by the agency.') as Error & {
      status?: number;
    };
    err.status = 403;
    throw err;
  }

  if (token.expiresAt <= new Date().toISOString()) {
    const err = new Error('This portal link has expired.') as Error & {
      status?: number;
    };
    err.status = 410;
    throw err;
  }

  if (token.failedAttempts >= 5) {
    const err = new Error(
      'This portal link is locked due to too many invalid verification attempts.'
    ) as Error & { status?: number };
    err.status = 429;
    throw err;
  }

  const receipt = await findReceiptVersionById(
    db,
    token.workspaceId,
    token.receiptVersionId
  );
  if (!receipt || receipt.status === 'revoked') {
    const err = new Error('This delivery receipt has been revoked.') as Error & {
      status?: number;
    };
    err.status = 403;
    throw err;
  }

  let otpVerified = !token.otpRequired;
  if (token.otpRequired && otpCode) {
    if (token.otpCodeHash && hashToken(otpCode.trim()) === token.otpCodeHash) {
      otpVerified = true;
    } else {
      await incrementPortalTokenFailure(db, token.id);
      const err = new Error('Invalid verification code.') as Error & {
        status?: number;
      };
      err.status = 401;
      throw err;
    }
  }

  if (!otpVerified) {
    return {
      receiptVersionId: receipt.id,
      versionNumber: receipt.versionNumber,
      status: receipt.status,
      publishedAt: receipt.publishedAt,
      snapshotHash: receipt.snapshotHash,
      hashVerified: true,
      otpRequired: true,
      otpVerified: false,
      recipientEmail: token.recipientEmail,
      supersededByVersion: null,
      snapshot: null,
      actions: [],
      comments: [],
    };
  }

  await markPortalTokenAccessed(db, token.id);

  const [versions, actions, comments] = await Promise.all([
    listReceiptVersionsByBatch(db, token.workspaceId, receipt.batchId),
    listClientActionsByReceipt(db, token.workspaceId, receipt.id),
    listClientCommentsByReceipt(db, token.workspaceId, receipt.id),
  ]);

  const newer = versions.find(
    (v) => v.versionNumber > receipt.versionNumber && v.status !== 'revoked'
  );
  const hashVerified = verifySnapshotHash(
    receipt.snapshot,
    receipt.snapshotHash
  );

  return {
    receiptVersionId: receipt.id,
    versionNumber: receipt.versionNumber,
    status: receipt.status,
    publishedAt: receipt.publishedAt,
    snapshotHash: receipt.snapshotHash,
    hashVerified,
    otpRequired: token.otpRequired,
    otpVerified: true,
    recipientEmail: token.recipientEmail,
    supersededByVersion: newer?.versionNumber ?? null,
    snapshot: receipt.snapshot,
    actions,
    comments,
  };
}

export async function submitPortalClientActionService(
  db: DbExecutor,
  params: {
    rawToken: string;
    otpCode?: string;
    actionType: 'accepted' | 'changes_requested' | 'commented';
    actorName: string;
    actorEmail: string;
    note: string;
  }
) {
  const token = await findPortalTokenByHash(db, hashToken(params.rawToken));
  if (!token || token.revokedAt || token.expiresAt <= new Date().toISOString()) {
    const err = new Error('Portal link is invalid, expired, or revoked.') as Error & {
      status?: number;
    };
    err.status = 403;
    throw err;
  }

  if (token.failedAttempts >= 5) {
    const err = new Error('Portal link locked after failed attempts.') as Error & {
      status?: number;
    };
    err.status = 429;
    throw err;
  }

  if (token.otpRequired) {
    if (
      !params.otpCode ||
      !token.otpCodeHash ||
      hashToken(params.otpCode.trim()) !== token.otpCodeHash
    ) {
      await incrementPortalTokenFailure(db, token.id);
      const err = new Error('Valid verification code is required.') as Error & {
        status?: number;
      };
      err.status = 401;
      throw err;
    }
  }

  const receipt = await findReceiptVersionById(
    db,
    token.workspaceId,
    token.receiptVersionId
  );
  if (!receipt) {
    throw new Error('Receipt version not found.');
  }
  if (receipt.status === 'superseded' || receipt.status === 'revoked') {
    const err = new Error(
      `Actions cannot be recorded on a '${receipt.status}' receipt version.`
    ) as Error & { status?: number };
    err.status = 409;
    throw err;
  }

  await db.transaction(async (tx) => {
    await recordClientAction(tx, {
      workspaceId: token.workspaceId,
      receiptVersionId: receipt.id,
      portalTokenId: token.id,
      actionType: params.actionType,
      actorName: params.actorName,
      actorEmail: params.actorEmail,
      note: params.note,
    });

    if (params.note.trim()) {
      await addClientComment(tx, {
        workspaceId: token.workspaceId,
        receiptVersionId: receipt.id,
        authorName: params.actorName,
        authorEmail: params.actorEmail,
        authorKind: 'client',
        body: params.note,
      });
    }

    if (
      params.actionType === 'accepted' ||
      params.actionType === 'changes_requested'
    ) {
      await updateReceiptVersionStatus(
        tx,
        token.workspaceId,
        receipt.id,
        params.actionType
      );
      await updateBatch(tx, token.workspaceId, receipt.batchId, {
        status: params.actionType,
      });
    }

    await recordAuditEvent(tx, {
      workspaceId: token.workspaceId,
      actorType: 'client_portal',
      actorId: token.id,
      actorLabel: params.actorEmail.toLowerCase(),
      eventType: `portal.client_${params.actionType}`,
      resourceType: 'receipt_version',
      resourceId: receipt.id,
      metadata: {
        versionNumber: receipt.versionNumber,
        actorName: params.actorName,
        noteLength: params.note.trim().length,
      },
    });
  });

  return getPortalReceiptService(db, params.rawToken, params.otpCode);
}
