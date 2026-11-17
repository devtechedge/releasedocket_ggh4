# GitHub App Setup (Read-Only Metadata Scope)

ReleaseDocket strictly requests **read-only metadata permissions** so agency client codebases never leave GitHub:

- `Metadata`: Read-only
- `Pull requests`: Read-only
- `Checks`: Read-only
- `Commit statuses`: Read-only
- `Deployments`: Read-only
- `Contents`: **None / Not Requested**

## Webhook Events to Subscribe

Configure your GitHub App webhook endpoint to:
`https://<your-domain>/api/webhooks/github`

Subscribe to:
- `pull_request`
- `pull_request_review`
- `check_run`
- `workflow_run`
- `deployment`
- `deployment_status`
- `release`

## Required Environment Variables

- `GITHUB_APP_ID`: Numeric GitHub App ID
- `GITHUB_APP_PRIVATE_KEY`: PEM-encoded private key (newlines escaped as `\n` in single-line env vars)
- `GITHUB_WEBHOOK_SECRET`: Webhook secret used for `X-Hub-Signature-256` HMAC-SHA256 verification

When these variables are omitted in non-production, ReleaseDocket operates safely in **Labelled Demo Mode** (`demo_synthetic`), preventing silent blending with `github_live` data.
