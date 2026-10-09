# Deployment

Merging to `main` is the only manual step. GitHub Actions runs the test suite
on every pull request and, when a pull request is merged, deploys the backend
and both frontends from the merged commit.

| Workflow | Trigger | What it does |
|----------|---------|--------------|
| `.github/workflows/ci.yml` | Pull request | Runs the existing suite (`npm test`) in one lightweight job. No matrix; superseded runs on the same branch are cancelled. |
| `.github/workflows/deploy.yml` | Push to `main`, or manual **Run workflow** | Deploys, from the same commit: the Apps Script backend via `scripts/deploy.sh`, the production Cloudflare Worker (`bag-tag-league`), and the dev Cloudflare Worker (`bag-tag-league-dev`). |

Both workers serve the same static assets from `src/`; `wrangler.jsonc` defines
the dev worker as the `dev` environment. They deploy together from `main`, so
there is no separate dev branch to maintain. Docs-only merges are skipped by
the deploy workflow because they cannot change the running app.

## Required repository secrets

The workflows authenticate with repository secrets. **Only the names are
listed here; never commit or paste a value into the repository.**

| Secret | What it is | Where it comes from |
|--------|------------|---------------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token that can deploy Workers | Cloudflare dashboard -> **My Profile** -> **API Tokens** -> **Create Token** -> use the **Edit Cloudflare Workers** template, scoped to the account that owns the workers |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account id that owns the workers | Cloudflare dashboard -> **Workers & Pages** -> the **Account ID** shown in the right-hand sidebar |
| `CLASP_CREDENTIALS_JSON` | Contents of the `~/.clasprc.json` file written by `clasp login`, used by `scripts/deploy.sh` to deploy the Apps Script backend | On a machine already authenticated with `clasp login`, copy the contents of `~/.clasprc.json` (it is git-ignored, and contains the OAuth client settings and refresh token) |

### One-time setup

1. Create the two Cloudflare values above and copy them.
2. On a machine with access to the Apps Script project, run `clasp login`, then
   copy the contents of `~/.clasprc.json`.
3. In GitHub, open the repository -> **Settings** -> **Secrets and variables**
   -> **Actions** -> **New repository secret**, and add each value under the
   exact names in the table (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
   `CLASP_CREDENTIALS_JSON`).

After the secrets exist, merge a pull request and the deploy runs on its own.
To redeploy the current `main` without a commit, open **Actions** -> **Deploy**
-> **Run workflow**.

## Failure behavior

- A missing secret fails in the **Verify required secrets** step before any
  deploy runs, and the error names the missing secret(s).
- Any failing deploy step fails the job loudly; a run that stops partway is
  visible as a red workflow. Production deploys are serialized and are never
  cancelled mid-run.
- `CLASP_CREDENTIALS_JSON` is parsed before use, so a malformed paste fails
  immediately with a pointer back to this document.

## Permissions

Every workflow requests only `contents: read` from the `GITHUB_TOKEN`; the
deploy exports authenticate with the repository secrets above, so no broader
token scope is granted.
