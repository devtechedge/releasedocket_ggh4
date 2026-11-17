import { createHmac, createSign, timingSafeEqual } from 'node:crypto';
import type { ObservationType } from '@/domain/types';

export const REQUIRED_GITHUB_APP_PERMISSIONS = {
  metadata: 'read',
  pull_requests: 'read',
  checks: 'read',
  actions: 'read',
  deployments: 'read',
} as const;

export const GITHUB_APP_PERMISSION_EXPLANATIONS = [
  {
    scope: 'Metadata (Read-only)',
    reason: 'Lists repositories you select for project mapping.',
  },
  {
    scope: 'Pull requests (Read-only)',
    reason: 'Ingests PR numbers, titles, authors, head SHAs, merge commits, and review states.',
  },
  {
    scope: 'Checks & Actions (Read-only)',
    reason: 'Reads check-run and workflow conclusions tied to exact tested commit SHAs.',
  },
  {
    scope: 'Deployments (Read-only)',
    reason: 'Reads deployment environments, statuses, and deployed commit SHAs.',
  },
] as const;

export function isGitHubAppConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_APP_ID?.trim() &&
      process.env.GITHUB_APP_PRIVATE_KEY?.trim() &&
      process.env.GITHUB_WEBHOOK_SECRET?.trim()
  );
}

export function isGitHubOAuthConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_OAUTH_CLIENT_ID?.trim() &&
      process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim()
  );
}

export function verifyGitHubWebhookSignature(
  rawBody: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string | undefined = process.env.GITHUB_WEBHOOK_SECRET
): boolean {
  if (!secret || !signatureHeader) return false;
  if (!signatureHeader.startsWith('sha256=')) return false;

  const expectedHex = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  const receivedHex = signatureHeader.slice('sha256='.length).trim();

  if (expectedHex.length !== receivedHex.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(expectedHex, 'hex'),
      Buffer.from(receivedHex, 'hex')
    );
  } catch {
    return false;
  }
}

function base64UrlEncode(input: string | Buffer): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

export function createGitHubAppJwt(): string {
  const appId = process.env.GITHUB_APP_ID?.trim();
  const rawKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, '\n');
  if (!appId || !rawKey) {
    throw new Error('GitHub App credentials are not configured.');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iat: now - 60,
      exp: now + 540,
      iss: appId,
    })
  );
  const signingInput = `${header}.${payload}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  const signature = base64UrlEncode(signer.sign(rawKey));
  return `${signingInput}.${signature}`;
}

async function fetchGitHubJson<T>(
  url: string,
  token: string,
  attempt = 1
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'ReleaseDocket-App',
      },
      signal: controller.signal,
    });

    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 300 * attempt));
      return fetchGitHubJson<T>(url, token, attempt + 1);
    }

    if (!res.ok) {
      throw new Error(`GitHub API error (${res.status}) on ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getGitHubInstallationToken(
  installationExternalId: string
): Promise<string> {
  const jwt = createGitHubAppJwt();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(
      `https://api.github.com/app/installations/${encodeURIComponent(installationExternalId)}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'ReleaseDocket-App',
        },
        signal: controller.signal,
      }
    );
    if (!res.ok) {
      throw new Error(`Failed to obtain GitHub installation token (${res.status})`);
    }
    const data = (await res.json()) as { token: string };
    return data.token;
  } finally {
    clearTimeout(timeout);
  }
}

export interface NormalizedObservationInput {
  observationType: ObservationType;
  externalId: string;
  externalUrl: string;
  title: string;
  actor: string;
  headSha: string | null;
  mergeCommitSha: string | null;
  testedSha: string | null;
  rawState: string;
  rawConclusion: string | null;
  environmentName: string | null;
  observedAt: string;
  metadata: Record<string, unknown>;
}

export async function fetchLiveRepoObservations(
  installationExternalId: string,
  repoFullName: string
): Promise<NormalizedObservationInput[]> {
  const token = await getGitHubInstallationToken(installationExternalId);
  const base = `https://api.github.com/repos/${repoFullName}`;

  const [prs, deployments, releases] = await Promise.all([
    fetchGitHubJson<
      Array<{
        number: number;
        title: string;
        html_url: string;
        state: string;
        merged_at: string | null;
        merge_commit_sha: string | null;
        updated_at: string;
        user: { login: string } | null;
        head: { sha: string };
      }>
    >(`${base}/pulls?state=all&sort=updated&direction=desc&per_page=15`, token),
    fetchGitHubJson<
      Array<{
        id: number;
        sha: string;
        environment: string;
        html_url?: string;
        created_at: string;
        creator: { login: string } | null;
      }>
    >(`${base}/deployments?per_page=10`, token),
    fetchGitHubJson<
      Array<{
        id: number;
        tag_name: string;
        name: string | null;
        html_url: string;
        target_commitish: string;
        published_at: string | null;
        created_at: string;
        author: { login: string } | null;
      }>
    >(`${base}/releases?per_page=5`, token),
  ]);

  const observations: NormalizedObservationInput[] = [];

  for (const pr of prs) {
    observations.push({
      observationType: 'pull_request',
      externalId: `pr-${repoFullName}-${pr.number}`,
      externalUrl: pr.html_url,
      title: `PR #${pr.number}: ${pr.title}`,
      actor: pr.user?.login ?? 'unknown',
      headSha: pr.head.sha,
      mergeCommitSha: pr.merge_commit_sha,
      testedSha: null,
      rawState: pr.merged_at ? 'merged' : pr.state,
      rawConclusion: pr.merged_at ? 'merged' : pr.state,
      environmentName: null,
      observedAt: pr.merged_at ?? pr.updated_at,
      metadata: { number: pr.number, mergedAt: pr.merged_at },
    });

    if (pr.head?.sha) {
      const checks = await fetchGitHubJson<{
        check_runs: Array<{
          id: number;
          name: string;
          html_url: string;
          head_sha: string;
          status: string;
          conclusion: string | null;
          completed_at: string | null;
        }>;
      }>(`${base}/commits/${pr.head.sha}/check-runs?per_page=10`, token);

      for (const run of checks.check_runs ?? []) {
        observations.push({
          observationType: 'check_run',
          externalId: `chk-${repoFullName}-${run.id}`,
          externalUrl: run.html_url,
          title: `Check: ${run.name}`,
          actor: 'github-actions[bot]',
          headSha: run.head_sha,
          mergeCommitSha: null,
          testedSha: run.head_sha,
          rawState: run.status,
          rawConclusion: run.conclusion,
          environmentName: null,
          observedAt: run.completed_at ?? new Date().toISOString(),
          metadata: { checkRunId: run.id, prNumber: pr.number },
        });
      }
    }
  }

  for (const dep of deployments) {
    const statuses = await fetchGitHubJson<
      Array<{
        id: number;
        state: string;
        environment: string;
        target_url?: string;
        created_at: string;
      }>
    >(`${base}/deployments/${dep.id}/statuses?per_page=1`, token);

    const latest = statuses[0];
    observations.push({
      observationType: 'deployment_status',
      externalId: `dep-${repoFullName}-${dep.id}`,
      externalUrl:
        latest?.target_url || `https://github.com/${repoFullName}/deployments`,
      title: `Deployment to ${dep.environment}`,
      actor: dep.creator?.login ?? 'github-actions[bot]',
      headSha: dep.sha,
      mergeCommitSha: null,
      testedSha: dep.sha,
      rawState: latest?.state ?? 'pending',
      rawConclusion: latest?.state ?? null,
      environmentName: dep.environment,
      observedAt: latest?.created_at ?? dep.created_at,
      metadata: { deploymentId: dep.id },
    });
  }

  for (const rel of releases) {
    observations.push({
      observationType: 'release',
      externalId: `rel-${repoFullName}-${rel.id}`,
      externalUrl: rel.html_url,
      title: `Release ${rel.tag_name}${rel.name ? `: ${rel.name}` : ''}`,
      actor: rel.author?.login ?? 'release-bot',
      headSha: rel.target_commitish,
      mergeCommitSha: null,
      testedSha: rel.target_commitish,
      rawState: 'published',
      rawConclusion: 'published',
      environmentName: 'production',
      observedAt: rel.published_at ?? rel.created_at,
      metadata: { tagName: rel.tag_name },
    });
  }

  return observations;
}

export interface DemoRepositoryTemplate {
  repoExternalId: string;
  fullName: string;
  defaultBranch: string;
  observations: NormalizedObservationInput[];
}

export function buildDemoGitHubRepositories(): DemoRepositoryTemplate[] {
  return [
    {
      repoExternalId: 'demo-repo-freight-portal',
      fullName: 'northstar-studio/vanguard-freight-portal',
      defaultBranch: 'main',
      observations: [
        {
          observationType: 'pull_request',
          externalId: 'demo-pr-142',
          externalUrl:
            'https://github.com/northstar-studio/vanguard-freight-portal/pull/142',
          title: 'PR #142: Multi-leg manifest CSV importer with row-level validation',
          actor: 'elena-rostova',
          headSha: '9f3a1c2e8b41d0f3a91c',
          mergeCommitSha: '9f3a1c2e8b41d0f3a91c',
          testedSha: null,
          rawState: 'merged',
          rawConclusion: 'merged',
          environmentName: null,
          observedAt: '2026-11-12T17:40:00.000Z',
          metadata: { number: 142, additions: 412, deletions: 68 },
        },
        {
          observationType: 'pull_request_review',
          externalId: 'demo-rev-142-1',
          externalUrl:
            'https://github.com/northstar-studio/vanguard-freight-portal/pull/142#pullrequestreview-901',
          title: 'PR #142 Review: Approved by marcus-vance',
          actor: 'marcus-vance',
          headSha: '9f3a1c2e8b41d0f3a91c',
          mergeCommitSha: null,
          testedSha: '9f3a1c2e8b41d0f3a91c',
          rawState: 'approved',
          rawConclusion: 'approved',
          environmentName: null,
          observedAt: '2026-11-12T17:15:00.000Z',
          metadata: { prNumber: 142, state: 'APPROVED' },
        },
        {
          observationType: 'check_run',
          externalId: 'demo-chk-142-ci',
          externalUrl:
            'https://github.com/northstar-studio/vanguard-freight-portal/actions/runs/882104',
          title: 'CI / Vitest + Typecheck Suite',
          actor: 'github-actions[bot]',
          headSha: '9f3a1c2e8b41d0f3a91c',
          mergeCommitSha: null,
          testedSha: '9f3a1c2e8b41d0f3a91c',
          rawState: 'completed',
          rawConclusion: 'success',
          environmentName: null,
          observedAt: '2026-11-12T17:38:00.000Z',
          metadata: { prNumber: 142, durationSeconds: 94 },
        },
        {
          observationType: 'deployment_status',
          externalId: 'demo-dep-142-prod',
          externalUrl:
            'https://github.com/northstar-studio/vanguard-freight-portal/deployments',
          title: 'Production deployment (vanguard-portal.example)',
          actor: 'deploy-bot',
          headSha: '9f3a1c2e8b41d0f3a91c',
          mergeCommitSha: null,
          testedSha: '9f3a1c2e8b41d0f3a91c',
          rawState: 'success',
          rawConclusion: 'success',
          environmentName: 'production',
          observedAt: '2026-11-12T18:05:00.000Z',
          metadata: { environment: 'production' },
        },
        {
          observationType: 'pull_request',
          externalId: 'demo-pr-145',
          externalUrl:
            'https://github.com/northstar-studio/vanguard-freight-portal/pull/145',
          title: 'PR #145: Carrier webhook retry queue & dead-letter alert',
          actor: 'elena-rostova',
          headSha: 'c4d8e9107a22b19f0044',
          mergeCommitSha: 'c4d8e9107a22b19f0044',
          testedSha: null,
          rawState: 'merged',
          rawConclusion: 'merged',
          environmentName: null,
          observedAt: '2026-11-14T15:10:00.000Z',
          metadata: { number: 145, additions: 280, deletions: 41 },
        },
        {
          observationType: 'check_run',
          externalId: 'demo-chk-145-stale',
          externalUrl:
            'https://github.com/northstar-studio/vanguard-freight-portal/actions/runs/884019',
          title: 'CI / Integration Suite (ran on earlier commit)',
          actor: 'github-actions[bot]',
          headSha: 'a1100ff2319c882011bb',
          mergeCommitSha: null,
          testedSha: 'a1100ff2319c882011bb',
          rawState: 'completed',
          rawConclusion: 'success',
          environmentName: null,
          observedAt: '2026-11-14T14:22:00.000Z',
          metadata: { prNumber: 145, note: 'SHA superseded by force-push c4d8e91' },
        },
        {
          observationType: 'deployment_status',
          externalId: 'demo-dep-145-mismatch',
          externalUrl:
            'https://github.com/northstar-studio/vanguard-freight-portal/deployments',
          title: 'Staging deployment (older SHA)',
          actor: 'deploy-bot',
          headSha: 'a1100ff2319c882011bb',
          mergeCommitSha: null,
          testedSha: 'a1100ff2319c882011bb',
          rawState: 'success',
          rawConclusion: 'success',
          environmentName: 'staging',
          observedAt: '2026-11-14T14:35:00.000Z',
          metadata: { environment: 'staging' },
        },
      ],
    },
    {
      repoExternalId: 'demo-repo-invoice-agent',
      fullName: 'northstar-studio/helios-invoice-triage',
      defaultBranch: 'main',
      observations: [
        {
          observationType: 'pull_request',
          externalId: 'demo-pr-38',
          externalUrl:
            'https://github.com/northstar-studio/helios-invoice-triage/pull/38',
          title: 'PR #38: Structured vendor VAT extraction fallback & confidence threshold',
          actor: 'dev-kapoor',
          headSha: '77bc1209fe4a812c3310',
          mergeCommitSha: '77bc1209fe4a812c3310',
          testedSha: null,
          rawState: 'merged',
          rawConclusion: 'merged',
          environmentName: null,
          observedAt: '2026-11-13T11:30:00.000Z',
          metadata: { number: 38 },
        },
        {
          observationType: 'check_run',
          externalId: 'demo-chk-38-fail',
          externalUrl:
            'https://github.com/northstar-studio/helios-invoice-triage/actions/runs/770122',
          title: 'CI / Extraction Regression Fixture',
          actor: 'github-actions[bot]',
          headSha: '77bc1209fe4a812c3310',
          mergeCommitSha: null,
          testedSha: '77bc1209fe4a812c3310',
          rawState: 'completed',
          rawConclusion: 'failure',
          environmentName: null,
          observedAt: '2026-11-13T11:25:00.000Z',
          metadata: { prNumber: 38, failedCase: 'eu-reverse-charge-pdf' },
        },
        {
          observationType: 'deployment_status',
          externalId: 'demo-dep-38-prod',
          externalUrl:
            'https://github.com/northstar-studio/helios-invoice-triage/deployments',
          title: 'Staging deployment (Helios triage worker)',
          actor: 'deploy-bot',
          headSha: '77bc1209fe4a812c3310',
          mergeCommitSha: null,
          testedSha: '77bc1209fe4a812c3310',
          rawState: 'success',
          rawConclusion: 'success',
          environmentName: 'staging',
          observedAt: '2026-11-13T12:00:00.000Z',
          metadata: { environment: 'staging' },
        },
      ],
    },
    {
      repoExternalId: 'demo-repo-treasury-api',
      fullName: 'northstar-studio/helios-treasury-sync',
      defaultBranch: 'main',
      observations: [
        {
          observationType: 'pull_request',
          externalId: 'demo-pr-19',
          externalUrl:
            'https://github.com/northstar-studio/helios-treasury-sync/pull/19',
          title: 'PR #19: Idempotent ledger reconciliation endpoint & daily snapshot job',
          actor: 'marcus-vance',
          headSha: '55e21aa89b0c71e4201f',
          mergeCommitSha: '55e21aa89b0c71e4201f',
          testedSha: null,
          rawState: 'merged',
          rawConclusion: 'merged',
          environmentName: null,
          observedAt: '2026-11-15T09:15:00.000Z',
          metadata: { number: 19 },
        },
        {
          observationType: 'check_run',
          externalId: 'demo-chk-19-pass',
          externalUrl:
            'https://github.com/northstar-studio/helios-treasury-sync/actions/runs/619201',
          title: 'CI / Ledger Contract Tests',
          actor: 'github-actions[bot]',
          headSha: '55e21aa89b0c71e4201f',
          mergeCommitSha: null,
          testedSha: '55e21aa89b0c71e4201f',
          rawState: 'completed',
          rawConclusion: 'success',
          environmentName: null,
          observedAt: '2026-11-15T09:12:00.000Z',
          metadata: { prNumber: 19 },
        },
        {
          observationType: 'release',
          externalId: 'demo-rel-19',
          externalUrl:
            'https://github.com/northstar-studio/helios-treasury-sync/releases/tag/v1.4.0',
          title: 'Release v1.4.0: Ledger Reconciliation API',
          actor: 'marcus-vance',
          headSha: '55e21aa89b0c71e4201f',
          mergeCommitSha: null,
          testedSha: '55e21aa89b0c71e4201f',
          rawState: 'published',
          rawConclusion: 'published',
          environmentName: 'production',
          observedAt: '2026-11-15T09:40:00.000Z',
          metadata: { tagName: 'v1.4.0' },
        },
      ],
    },
  ];
}
