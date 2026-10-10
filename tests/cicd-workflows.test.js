'use strict';

// Guardrails for the CI/CD automation.
//
// Merging to main is the only manual step: the suite runs on every pull
// request and, on push to main, the backend and both frontends deploy from the
// merged commit. The workflows read repository secrets by name (never a value),
// so this test pins those names to the names documented in
// docs/deployment.md and keeps the triggers, permissions, and concurrency
// settings from drifting.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers/load-code');

const WORKFLOWS = path.join(REPO_ROOT, '.github', 'workflows');
const DOC = path.join(REPO_ROOT, 'docs', 'deployment.md');

// Sorted so the set comparison is stable.
const REQUIRED_SECRETS = [
  'CLASP_CREDENTIALS_JSON',
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN'
];

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

test('the pull-request workflow runs the suite once and cancels superseded runs', () => {
  const ci = read(path.join(WORKFLOWS, 'ci.yml'));

  assert.match(ci, /pull_request/, 'the suite must run on pull requests');
  assert.match(ci, /npm test/, 'the existing suite is the test command');
  assert.match(ci, /cancel-in-progress:\s*true/, 'superseded PR runs must be cancelled');
  assert.match(ci, /permissions:\s*\n\s*contents:\s*read/, 'least-privilege permissions');
  assert.doesNotMatch(ci, /matrix:/, 'no heavyweight matrix');
});

test('the deploy workflow deploys prod, dev, and backend from main', () => {
  const deploy = read(path.join(WORKFLOWS, 'deploy.yml'));

  assert.match(deploy, /branches:\s*\[\s*main\s*\]/, 'the deploy must trigger from main');
  assert.match(deploy, /workflow_dispatch/, 'manual redeploy must be available');
  assert.match(deploy, /wrangler deploy --env=""/, 'the production worker must deploy');
  assert.match(deploy, /wrangler deploy --env dev/, 'the dev worker must deploy');
  assert.match(deploy, /bash scripts\/deploy\.sh/, 'the backend must use the existing deploy script');
  assert.match(deploy, /cancel-in-progress:\s*false/, 'an in-flight deploy must never be cancelled');
  assert.match(deploy, /permissions:\s*\n\s*contents:\s*read/, 'least-privilege permissions');
  // The dev worker deploys from main; there is no branch-based dev deploy.
  assert.doesNotMatch(deploy, /branches:\s*\[[^\]]*dev[^\]]*\]/, 'no dev branch trigger');
});

test('every secret the workflows read is an allow-listed, documented name', () => {
  const combined =
    read(path.join(WORKFLOWS, 'ci.yml')) + read(path.join(WORKFLOWS, 'deploy.yml'));
  const referenced = [...combined.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((match) => match[1]);

  assert.deepEqual([...new Set(referenced)].sort(), REQUIRED_SECRETS);

  const docs = read(DOC);
  for (const name of REQUIRED_SECRETS) {
    assert.ok(docs.includes(name), 'docs/deployment.md must document ' + name);
  }
});

// ─── clasp push surface ──────────────────────────────────────────────────────

const SCRIPTS = path.join(REPO_ROOT, 'scripts');
const CLASP_IGNORE = path.join(SCRIPTS, '.claspignore');

// clasp (rootDir: scripts/) pushes every supported file it is not told to
// ignore, and the Apps Script parser rejects Node helper scripts - pushing
// gen-code-map.js's shebang failed the Deploy run from the navigation-map
// merge. Only the manifest and the two .gs sources may ever reach the API.
const CLASP_ALLOWED = ['Code.gs', 'ProvisionDoubles.gs', 'appsscript.json'];

function claspIgnorePatterns() {
  return read(CLASP_IGNORE)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
}

function claspAllowlist() {
  return claspIgnorePatterns()
    .filter((pattern) => pattern.startsWith('!'))
    .map((pattern) => pattern.slice(1));
}

// The deny-all first pattern is what makes a future helper script safe by
// default: an unlisted file is never pushed, so it cannot break a deploy
// until someone deliberately allowlists it (which fails this test first).
test('scripts/.claspignore denies everything except the allowlisted app files', () => {
  const patterns = claspIgnorePatterns();

  assert.equal(
    patterns[0],
    '**/**',
    'the first pattern must deny everything so an unlisted file is never pushed'
  );

  assert.deepEqual(
    [...claspAllowlist()].sort(),
    [...CLASP_ALLOWED].sort(),
    'only the manifest and the .gs sources may be allowlisted for clasp push'
  );
});

// The allowlist must also match the files that actually exist, so a rename or
// deletion cannot leave clasp pushing a stale name or nothing at all.
test('every file clasp would push under scripts/ exists and is a .gs source or the manifest', () => {
  const present = fs.readdirSync(SCRIPTS);

  const missing = CLASP_ALLOWED.filter((file) => !present.includes(file));
  assert.deepEqual(missing, [], 'allowlisted app files must exist under scripts/');

  const pushedNonGs = claspAllowlist().filter((file) => !file.endsWith('.gs'));
  assert.deepEqual(
    pushedNonGs,
    ['appsscript.json'],
    'the manifest is the only non-.gs file that may be pushed'
  );
});
