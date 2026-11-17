-- ReleaseDocket PostgreSQL Initial Migration (Neon-compatible)
-- Includes multi-tenant foreign keys, indexes, and defense-in-depth Row-Level Security (RLS).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT,
  github_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  active_workspace_id TEXT,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  agency_tagline TEXT NOT NULL DEFAULT '',
  brand_accent_color TEXT NOT NULL DEFAULT '#1E40AF',
  is_demo BOOLEAN NOT NULL DEFAULT FALSE,
  plan_tier TEXT NOT NULL DEFAULT 'solo',
  subscription_status TEXT NOT NULL DEFAULT 'disconnected',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('OWNER','ADMIN','DELIVERY_LEAD','CONTRIBUTOR','CLIENT_VIEWER')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_workspace_idx ON memberships(workspace_id);

CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  invited_by_user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS invitations_workspace_idx ON invitations(workspace_id);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  retainer_monthly_usd INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS clients_workspace_idx ON clients(workspace_id);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  environment_url TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS projects_workspace_idx ON projects(workspace_id);
CREATE INDEX IF NOT EXISTS projects_client_idx ON projects(client_id);

CREATE TABLE IF NOT EXISTS github_installations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  installation_external_id TEXT NOT NULL UNIQUE,
  account_login TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('github_live','demo_synthetic')),
  permissions_json JSONB NOT NULL,
  health_status TEXT NOT NULL DEFAULT 'healthy',
  last_sync_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gh_install_ws_idx ON github_installations(workspace_id);

CREATE TABLE IF NOT EXISTS github_repositories (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  installation_id TEXT NOT NULL REFERENCES github_installations(id) ON DELETE CASCADE,
  repo_external_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  default_branch TEXT NOT NULL DEFAULT 'main',
  is_private BOOLEAN NOT NULL DEFAULT TRUE,
  mode TEXT NOT NULL CHECK (mode IN ('github_live','demo_synthetic')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, repo_external_id)
);
CREATE INDEX IF NOT EXISTS gh_repos_ws_idx ON github_repositories(workspace_id);

CREATE TABLE IF NOT EXISTS project_repo_mappings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  repository_id TEXT NOT NULL REFERENCES github_repositories(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, repository_id)
);
CREATE INDEX IF NOT EXISTS proj_repo_ws_idx ON project_repo_mappings(workspace_id);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  delivery_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  payload_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS webhook_ws_idx ON webhook_deliveries(workspace_id);

CREATE TABLE IF NOT EXISTS source_observations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  repository_id TEXT NOT NULL REFERENCES github_repositories(id) ON DELETE CASCADE,
  repo_full_name TEXT NOT NULL,
  observation_type TEXT NOT NULL,
  source_origin TEXT NOT NULL CHECK (source_origin IN ('github_live','demo_synthetic')),
  external_id TEXT NOT NULL,
  external_url TEXT NOT NULL,
  title TEXT NOT NULL,
  actor TEXT NOT NULL,
  head_sha TEXT,
  merge_commit_sha TEXT,
  tested_sha TEXT,
  raw_state TEXT NOT NULL,
  raw_conclusion TEXT,
  environment_name TEXT,
  observed_at TIMESTAMPTZ NOT NULL,
  metadata_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, observation_type, external_id)
);
CREATE INDEX IF NOT EXISTS obs_ws_idx ON source_observations(workspace_id);

CREATE TABLE IF NOT EXISTS delivery_batches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  internal_notes TEXT NOT NULL DEFAULT '',
  limitations_note TEXT NOT NULL DEFAULT '',
  target_date TEXT,
  target_sha TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  ai_draft_summary TEXT,
  ai_approved_by_user_id TEXT,
  ai_approved_at TIMESTAMPTZ,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS batches_ws_idx ON delivery_batches(workspace_id);
CREATE INDEX IF NOT EXISTS batches_project_idx ON delivery_batches(project_id);

CREATE TABLE IF NOT EXISTS acceptance_criteria (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL REFERENCES delivery_batches(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  priority TEXT NOT NULL,
  expected_evidence TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS criteria_ws_idx ON acceptance_criteria(workspace_id);
CREATE INDEX IF NOT EXISTS criteria_batch_idx ON acceptance_criteria(batch_id);

CREATE TABLE IF NOT EXISTS evidence_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL REFERENCES delivery_batches(id) ON DELETE CASCADE,
  source_observation_id TEXT REFERENCES source_observations(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  observation_type TEXT NOT NULL,
  source_origin TEXT NOT NULL,
  claim_attribution TEXT NOT NULL,
  state TEXT NOT NULL,
  state_reason TEXT NOT NULL,
  repo_full_name TEXT,
  external_id TEXT,
  external_url TEXT,
  commit_sha TEXT,
  tested_sha TEXT,
  actor TEXT,
  note TEXT,
  observed_at TIMESTAMPTZ NOT NULL,
  created_by_user_id TEXT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS evidence_ws_idx ON evidence_items(workspace_id);
CREATE INDEX IF NOT EXISTS evidence_batch_idx ON evidence_items(batch_id);

CREATE TABLE IF NOT EXISTS criterion_evidence_mappings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  criterion_id TEXT NOT NULL REFERENCES acceptance_criteria(id) ON DELETE CASCADE,
  evidence_id TEXT NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (criterion_id, evidence_id)
);
CREATE INDEX IF NOT EXISTS crit_ev_ws_idx ON criterion_evidence_mappings(workspace_id);

CREATE TABLE IF NOT EXISTS receipt_versions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  batch_id TEXT NOT NULL REFERENCES delivery_batches(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('published','accepted','changes_requested','superseded','revoked')),
  has_gaps BOOLEAN NOT NULL,
  gap_disclosure_ack BOOLEAN NOT NULL DEFAULT FALSE,
  snapshot_json JSONB NOT NULL,
  snapshot_hash TEXT NOT NULL,
  published_by_user_id TEXT NOT NULL REFERENCES users(id),
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  superseded_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  UNIQUE (batch_id, version_number)
);
CREATE INDEX IF NOT EXISTS receipt_ws_idx ON receipt_versions(workspace_id);

CREATE TABLE IF NOT EXISTS portal_tokens (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  receipt_version_id TEXT NOT NULL REFERENCES receipt_versions(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  otp_required BOOLEAN NOT NULL DEFAULT FALSE,
  otp_code_hash TEXT,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS portal_ws_idx ON portal_tokens(workspace_id);

CREATE TABLE IF NOT EXISTS client_actions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  receipt_version_id TEXT NOT NULL REFERENCES receipt_versions(id) ON DELETE CASCADE,
  portal_token_id TEXT REFERENCES portal_tokens(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_actions_ws_idx ON client_actions(workspace_id);
CREATE INDEX IF NOT EXISTS client_actions_receipt_idx ON client_actions(receipt_version_id);

CREATE TABLE IF NOT EXISTS client_comments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  receipt_version_id TEXT NOT NULL REFERENCES receipt_versions(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  author_kind TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS client_comments_ws_idx ON client_comments(workspace_id);
CREATE INDEX IF NOT EXISTS client_comments_receipt_idx ON client_comments(receipt_version_id);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_label TEXT NOT NULL,
  event_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  metadata_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS audit_ws_created_idx ON audit_events(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_ws_type_idx ON audit_events(workspace_id, event_type);

CREATE TABLE IF NOT EXISTS outbox_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS outbox_status_run_idx ON outbox_jobs(status, run_at);

CREATE TABLE IF NOT EXISTS billing_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
  stripe_event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Defense-in-depth Row-Level Security (RLS) for PostgreSQL
-- Activated when application sets `SET LOCAL app.workspace_id = '<ws_id>'` inside transactions.
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE github_repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_repo_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE source_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE acceptance_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE evidence_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE criterion_evidence_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE portal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_jobs ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'clients','projects','github_installations','github_repositories',
    'project_repo_mappings','source_observations','delivery_batches',
    'acceptance_criteria','evidence_items','criterion_evidence_mappings',
    'receipt_versions','portal_tokens','client_actions','client_comments',
    'audit_events','outbox_jobs'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS tenant_isolation_policy ON %I; CREATE POLICY tenant_isolation_policy ON %I USING (current_setting(''app.workspace_id'', true) IS NULL OR current_setting(''app.workspace_id'', true) = '''' OR workspace_id = current_setting(''app.workspace_id'', true)) WITH CHECK (current_setting(''app.workspace_id'', true) IS NULL OR current_setting(''app.workspace_id'', true) = '''' OR workspace_id = current_setting(''app.workspace_id'', true));',
      tbl, tbl
    );
  END LOOP;
END $$;
