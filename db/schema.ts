import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash'),
    githubUserId: text('github_user_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('users_email_idx').on(t.email)]
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    activeWorkspaceId: text('active_workspace_id'),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_idx').on(t.tokenHash),
    index('sessions_user_id_idx').on(t.userId),
  ]
);

export const workspaces = pgTable(
  'workspaces',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    agencyTagline: text('agency_tagline').default('').notNull(),
    brandAccentColor: text('brand_accent_color').default('#1E40AF').notNull(),
    isDemo: boolean('is_demo').default(false).notNull(),
    planTier: text('plan_tier').default('solo').notNull(),
    subscriptionStatus: text('subscription_status').default('disconnected').notNull(),
    stripeCustomerId: text('stripe_customer_id'),
    stripeSubscriptionId: text('stripe_subscription_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('workspaces_slug_idx').on(t.slug)]
);

export const memberships = pgTable(
  'memberships',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('memberships_ws_user_idx').on(t.workspaceId, t.userId),
    index('memberships_workspace_idx').on(t.workspaceId),
  ]
);

export const invitations = pgTable(
  'invitations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    role: text('role').notNull(),
    tokenHash: text('token_hash').notNull(),
    invitedByUserId: text('invited_by_user_id')
      .notNull()
      .references(() => users.id),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('invitations_token_hash_idx').on(t.tokenHash),
    index('invitations_workspace_idx').on(t.workspaceId),
  ]
);

export const clients = pgTable(
  'clients',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    contactName: text('contact_name').notNull(),
    contactEmail: text('contact_email').notNull(),
    retainerMonthlyUsd: integer('retainer_monthly_usd').default(0).notNull(),
    notes: text('notes').default('').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('clients_workspace_idx').on(t.workspaceId)]
);

export const projects = pgTable(
  'projects',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    clientId: text('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    summary: text('summary').default('').notNull(),
    environmentUrl: text('environment_url').default('').notNull(),
    status: text('status').default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('projects_workspace_idx').on(t.workspaceId),
    index('projects_client_idx').on(t.clientId),
  ]
);

export const githubInstallations = pgTable(
  'github_installations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    installationExternalId: text('installation_external_id').notNull(),
    accountLogin: text('account_login').notNull(),
    mode: text('mode').notNull(), // 'github_live' | 'demo_synthetic'
    permissionsJson: jsonb('permissions_json').$type<Record<string, string>>().notNull(),
    healthStatus: text('health_status').default('healthy').notNull(),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('gh_install_ext_idx').on(t.installationExternalId),
    index('gh_install_ws_idx').on(t.workspaceId),
  ]
);

export const githubRepositories = pgTable(
  'github_repositories',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    installationId: text('installation_id')
      .notNull()
      .references(() => githubInstallations.id, { onDelete: 'cascade' }),
    repoExternalId: text('repo_external_id').notNull(),
    fullName: text('full_name').notNull(),
    defaultBranch: text('default_branch').default('main').notNull(),
    isPrivate: boolean('is_private').default(true).notNull(),
    mode: text('mode').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('gh_repos_ws_idx').on(t.workspaceId),
    uniqueIndex('gh_repos_ws_ext_idx').on(t.workspaceId, t.repoExternalId),
  ]
);

export const projectRepoMappings = pgTable(
  'project_repo_mappings',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => githubRepositories.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('proj_repo_unique_idx').on(t.projectId, t.repositoryId),
    index('proj_repo_ws_idx').on(t.workspaceId),
  ]
);

export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id'),
    deliveryId: text('delivery_id').notNull(),
    eventType: text('event_type').notNull(),
    signatureValid: boolean('signature_valid').notNull(),
    payloadHash: text('payload_hash').notNull(),
    status: text('status').notNull(), // 'processed' | 'duplicate_ignored' | 'rejected' | 'unmapped'
    errorMessage: text('error_message'),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('webhook_delivery_id_idx').on(t.deliveryId),
    index('webhook_ws_idx').on(t.workspaceId),
  ]
);

export const sourceObservations = pgTable(
  'source_observations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repositoryId: text('repository_id')
      .notNull()
      .references(() => githubRepositories.id, { onDelete: 'cascade' }),
    repoFullName: text('repo_full_name').notNull(),
    observationType: text('observation_type').notNull(),
    sourceOrigin: text('source_origin').notNull(), // 'github_live' | 'demo_synthetic'
    externalId: text('external_id').notNull(),
    externalUrl: text('external_url').notNull(),
    title: text('title').notNull(),
    actor: text('actor').notNull(),
    headSha: text('head_sha'),
    mergeCommitSha: text('merge_commit_sha'),
    testedSha: text('tested_sha'),
    rawState: text('raw_state').notNull(),
    rawConclusion: text('raw_conclusion'),
    environmentName: text('environment_name'),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('obs_ws_idx').on(t.workspaceId),
    uniqueIndex('obs_ws_type_ext_idx').on(
      t.workspaceId,
      t.observationType,
      t.externalId
    ),
  ]
);

export const deliveryBatches = pgTable(
  'delivery_batches',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    summary: text('summary').notNull(),
    internalNotes: text('internal_notes').default('').notNull(),
    limitationsNote: text('limitations_note').default('').notNull(),
    targetDate: text('target_date'),
    targetSha: text('target_sha'),
    status: text('status').default('draft').notNull(),
    aiDraftSummary: text('ai_draft_summary'),
    aiApprovedByUserId: text('ai_approved_by_user_id'),
    aiApprovedAt: timestamp('ai_approved_at', { withTimezone: true }),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('batches_ws_idx').on(t.workspaceId),
    index('batches_project_idx').on(t.projectId),
  ]
);

export const acceptanceCriteria = pgTable(
  'acceptance_criteria',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    batchId: text('batch_id')
      .notNull()
      .references(() => deliveryBatches.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').default('').notNull(),
    category: text('category').notNull(),
    priority: text('priority').notNull(),
    expectedEvidence: text('expected_evidence').notNull(),
    status: text('status').default('pending').notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('criteria_ws_idx').on(t.workspaceId),
    index('criteria_batch_idx').on(t.batchId),
  ]
);

export const evidenceItems = pgTable(
  'evidence_items',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    batchId: text('batch_id')
      .notNull()
      .references(() => deliveryBatches.id, { onDelete: 'cascade' }),
    sourceObservationId: text('source_observation_id').references(
      () => sourceObservations.id,
      { onDelete: 'set null' }
    ),
    title: text('title').notNull(),
    observationType: text('observation_type').notNull(),
    sourceOrigin: text('source_origin').notNull(),
    claimAttribution: text('claim_attribution').notNull(),
    state: text('state').notNull(),
    stateReason: text('state_reason').notNull(),
    repoFullName: text('repo_full_name'),
    externalId: text('external_id'),
    externalUrl: text('external_url'),
    commitSha: text('commit_sha'),
    testedSha: text('tested_sha'),
    actor: text('actor'),
    note: text('note'),
    observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
    createdByUserId: text('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('evidence_ws_idx').on(t.workspaceId),
    index('evidence_batch_idx').on(t.batchId),
  ]
);

export const criterionEvidenceMappings = pgTable(
  'criterion_evidence_mappings',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    criterionId: text('criterion_id')
      .notNull()
      .references(() => acceptanceCriteria.id, { onDelete: 'cascade' }),
    evidenceId: text('evidence_id')
      .notNull()
      .references(() => evidenceItems.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('crit_ev_unique_idx').on(t.criterionId, t.evidenceId),
    index('crit_ev_ws_idx').on(t.workspaceId),
  ]
);

export const receiptVersions = pgTable(
  'receipt_versions',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    batchId: text('batch_id')
      .notNull()
      .references(() => deliveryBatches.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    status: text('status').notNull(), // 'published' | 'accepted' | 'changes_requested' | 'superseded' | 'revoked'
    hasGaps: boolean('has_gaps').notNull(),
    gapDisclosureAck: boolean('gap_disclosure_ack').default(false).notNull(),
    snapshotJson: jsonb('snapshot_json').notNull(),
    snapshotHash: text('snapshot_hash').notNull(),
    publishedByUserId: text('published_by_user_id')
      .notNull()
      .references(() => users.id),
    publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow().notNull(),
    supersededAt: timestamp('superseded_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('receipt_batch_version_idx').on(t.batchId, t.versionNumber),
    index('receipt_ws_idx').on(t.workspaceId),
  ]
);

export const portalTokens = pgTable(
  'portal_tokens',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    receiptVersionId: text('receipt_version_id')
      .notNull()
      .references(() => receiptVersions.id, { onDelete: 'cascade' }),
    recipientEmail: text('recipient_email').notNull(),
    tokenHash: text('token_hash').notNull(),
    otpRequired: boolean('otp_required').default(false).notNull(),
    otpCodeHash: text('otp_code_hash'),
    failedAttempts: integer('failed_attempts').default(0).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastAccessedAt: timestamp('last_accessed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('portal_token_hash_idx').on(t.tokenHash),
    index('portal_ws_idx').on(t.workspaceId),
  ]
);

export const clientActions = pgTable(
  'client_actions',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    receiptVersionId: text('receipt_version_id')
      .notNull()
      .references(() => receiptVersions.id, { onDelete: 'cascade' }),
    portalTokenId: text('portal_token_id').references(() => portalTokens.id, {
      onDelete: 'set null',
    }),
    actionType: text('action_type').notNull(), // 'accepted' | 'changes_requested' | 'commented'
    actorName: text('actor_name').notNull(),
    actorEmail: text('actor_email').notNull(),
    note: text('note').default('').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('client_actions_ws_idx').on(t.workspaceId),
    index('client_actions_receipt_idx').on(t.receiptVersionId),
  ]
);

export const clientComments = pgTable(
  'client_comments',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    receiptVersionId: text('receipt_version_id')
      .notNull()
      .references(() => receiptVersions.id, { onDelete: 'cascade' }),
    authorName: text('author_name').notNull(),
    authorEmail: text('author_email').notNull(),
    authorKind: text('author_kind').notNull(), // 'client' | 'agency'
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('client_comments_ws_idx').on(t.workspaceId),
    index('client_comments_receipt_idx').on(t.receiptVersionId),
  ]
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    actorType: text('actor_type').notNull(), // 'user' | 'client_portal' | 'webhook' | 'system'
    actorId: text('actor_id').notNull(),
    actorLabel: text('actor_label').notNull(),
    eventType: text('event_type').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id').notNull(),
    metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('audit_ws_created_idx').on(t.workspaceId, t.createdAt),
    index('audit_ws_type_idx').on(t.workspaceId, t.eventType),
  ]
);

export const outboxJobs = pgTable(
  'outbox_jobs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    jobType: text('job_type').notNull(),
    payloadJson: jsonb('payload_json').$type<Record<string, unknown>>().notNull(),
    status: text('status').default('pending').notNull(), // 'pending' | 'processing' | 'completed' | 'failed'
    attempts: integer('attempts').default(0).notNull(),
    runAt: timestamp('run_at', { withTimezone: true }).defaultNow().notNull(),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('outbox_status_run_idx').on(t.status, t.runAt)]
);

export const billingEvents = pgTable(
  'billing_events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').references(() => workspaces.id, {
      onDelete: 'set null',
    }),
    stripeEventId: text('stripe_event_id').notNull(),
    eventType: text('event_type').notNull(),
    payloadJson: jsonb('payload_json').$type<Record<string, unknown>>().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('billing_stripe_event_idx').on(t.stripeEventId)]
);
