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

test('singles provisioning controls are unchanged', () => {
  assert.match(html, /id="btnCreateMaster" onclick="createClubMembersTab\(\)"/);
  assert.match(html, /function createClubMembersTab\(\)/);
  // The provisioning card stays hidden for the singles league.
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

test('the provisioning and setup cards are unified and grouped at the bottom', () => {
  const provisionIndex = html.indexOf('id="doublesProvisionCard"');
  const clubIndex = html.indexOf('id="clubMembersCard"');
  const lastWorkflowIndex = html.indexOf('id="pointsCalcCard"');
  const activityIndex = html.indexOf('<!-- 10. Activity Log -->');
  assert.notEqual(provisionIndex, -1, 'expected the doubles provisioning card');
  assert.notEqual(clubIndex, -1, 'expected the setup club members card');
  assert.notEqual(activityIndex, -1, 'expected the activity log');

  // The setup cards form one group below the weekly workflow, in event-setup
  // order: provision the spreadsheet first, then set up the club members.
  assert.ok(provisionIndex > lastWorkflowIndex, 'provisioning sits below the workflow');
  assert.ok(provisionIndex < clubIndex, 'provisioning precedes club-member setup');
  assert.ok(clubIndex < activityIndex, 'the setup group stays above the activity log');

  // The setup card mirrors the provisioning card's single-panel structure:
  // one heading, one help paragraph, one action button, one status line.
  const clubCard = html.slice(clubIndex, html.indexOf('<!-- Dev-only test-data reset.'));
  assert.match(clubCard, /<h2>Setup Club Members<\/h2>/);
  assert.match(clubCard, /class="help-text"/);
  assert.match(clubCard, /id="btnCreateMaster" onclick="createClubMembersTab\(\)"/);
  assert.match(clubCard, /id="masterResult" class="status hidden"/);
  assert.doesNotMatch(clubCard, /clubMembersMissing|clubMembersExists/);

  // The setup card mirrors the provisioning disabled state for an existing
  // roster instead of swapping in a separate panel.
  const apply = functionBody('applyClubMembersState');
  assert.match(apply, /btn\.disabled = exists/);
  assert.match(apply, /'Club Members Set Up'/);
});
