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
