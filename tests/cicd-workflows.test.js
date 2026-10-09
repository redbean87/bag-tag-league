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
