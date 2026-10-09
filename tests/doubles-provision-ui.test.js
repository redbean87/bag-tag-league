'use strict';

// Structural checks for the doubles provisioning guard in the admin page.
// Behavioural checks (disabled action, already-provisioned handling) run in a
// real browser; see the task's browser-context verification.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers/load-code');

const html = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');

function functionBody(name) {
  const start = html.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'expected function ' + name);
  const next = html.indexOf('\n    function ', start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

test('the provision card loads authoritative state from the backend', () => {
  assert.match(html, /action: 'getDoublesProvisioningState'/);
  assert.match(html, /spreadsheetId: getSpreadsheetId\(\)/);
  assert.match(html, /function loadDoublesProvisioningState\(\)/);

  const apply = functionBody('applyLeague');
  assert.match(apply, /loadDoublesProvisioningState\(\)/);
});

test('a provisioned state disables the action and states it explicitly', () => {
  const apply = functionBody('applyDoublesProvisioningState');
  assert.match(apply, /state\.provisioned/);
  assert.match(apply, /btn\.disabled = provisioned/);
  assert.match(apply, /btn\.textContent = 'Doubles Provisioned'/);
  assert.match(apply, /Doubles provisioned\./);
});

test('the already_provisioned response is handled without a false success or retry', () => {
  const provision = functionBody('provisionDoublesSpreadsheet');
  assert.match(provision, /data\.status === 'already_provisioned'/);
  assert.match(provision, /applyDoublesProvisioningState\(data\.state/);
  assert.match(provision, /no action taken/);

  // Only an explicit ok may present the seed success message.
  const okIndex = provision.indexOf("data.status === 'ok'");
  const alreadyIndex = provision.indexOf("data.status === 'already_provisioned'");
  assert.notEqual(okIndex, -1, 'expected an ok branch');
  assert.notEqual(alreadyIndex, -1, 'expected an already_provisioned branch');
  assert.ok(okIndex < alreadyIndex, 'the ok branch owns the success message');
  const okBranch = provision.slice(okIndex, alreadyIndex);
  assert.match(okBranch, /Roster seeded/);
  const alreadyBranch = provision.slice(alreadyIndex);
  assert.doesNotMatch(alreadyBranch, /Roster seeded/);
});

test('the club-members setup card and its wiring are removed', () => {
  // Provisioning seeds the roster, so the separate setup surface is gone:
  // no card, no button/status elements, and no client functions or calls.
  assert.doesNotMatch(html, /id="clubMembersCard"/);
  assert.doesNotMatch(html, /id="btnCreateMaster"/);
  assert.doesNotMatch(html, /id="masterResult"/);
  assert.doesNotMatch(html, /function createClubMembersTab\(/);
  assert.doesNotMatch(html, /function loadClubMembersStatus\(/);
  assert.doesNotMatch(html, /function applyClubMembersState\(/);
  assert.doesNotMatch(html, /getClubMembersStatus/);

  // The provisioning card itself is untouched and stays hidden for singles.
  const apply = functionBody('applyLeague');
  assert.match(apply, /provisionCard\.style\.display = rules\.hasPairs \? '' : 'none'/);
});

test('an unprovisioned sheet with a metadata mismatch banners the drift', () => {
  const apply = functionBody('applyDoublesProvisioningState');
  assert.match(apply, /state\.league_format_matches === false/);
  assert.match(apply, /state\.scoring_matches === false/);
  assert.match(apply, /Configuration mismatch\./);
  assert.match(apply, /backfill the metadata columns/);
});

test('the provisioning card is the only setup card and sits above the log', () => {
  const provisionIndex = html.indexOf('id="doublesProvisionCard"');
  const lastWorkflowIndex = html.indexOf('id="pointsCalcCard"');
  const activityIndex = html.indexOf('<!-- 10. Activity Log -->');
  assert.notEqual(provisionIndex, -1, 'expected the doubles provisioning card');
  assert.notEqual(activityIndex, -1, 'expected the activity log');

  // Provisioning sits below the weekly workflow and above the activity log.
  assert.ok(provisionIndex > lastWorkflowIndex, 'provisioning sits below the workflow');
  assert.ok(provisionIndex < activityIndex, 'provisioning stays above the activity log');

  // No club-members setup card remains anywhere on the page.
  assert.equal(html.indexOf('id="clubMembersCard"'), -1, 'no setup club members card');

  // The provisioning card keeps its single-panel structure: one heading, one
  // help paragraph, one action button, one status line.
  const provisionCard = html.slice(provisionIndex, activityIndex);
  assert.match(provisionCard, /<h2>Doubles Provisioning<\/h2>/);
  assert.match(provisionCard, /class="help-text"/);
  assert.match(provisionCard, /id="btnProvisionDoubles" onclick="provisionDoublesSpreadsheet\(\)"/);
  assert.match(provisionCard, /id="doublesProvisionResult" class="status hidden"/);
});
