'use strict';

// Structural checks for the read-only doubles Points Results panel in the
// admin page. Behavioural checks (card visibility, button wiring, rendering)
// run in a real browser; see the task's browser-context verification.

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

test('the points results panel is present and doubles-only', () => {
  assert.match(html, /id="pointsCalcCard"/);
  assert.match(html, /id="btnLoadPoints" onclick="loadPoints\(\)"/);

  const apply = functionBody('applyLeague');
  assert.match(apply, /pointsCard\.style\.display = rules\.usesPoints \? '' : 'none'/);
});

test('the retired lifecycle controls are gone from the panel', () => {
  for (const id of ['btnPreviewPoints', 'btnConfirmPoints', 'btnFinalizePoints', 'btnUnlockPoints']) {
    assert.doesNotMatch(html, new RegExp('id="' + id + '"'), id + ' must not exist');
  }
  for (const name of ['confirmPoints', 'finalizePoints', 'unlockPoints', 'rekeyPointsPair', 'voidPointsPair', 'updatePointsControls']) {
    assert.equal(html.indexOf('function ' + name + '('), -1, name + ' must not exist');
  }
});

test('the points panel reads results from the format-gated server action', () => {
  assert.match(functionBody('fetchPointsResults'), /action: 'calculatePoints'/);
  assert.match(functionBody('fetchPointsResults'), /spreadsheetId: getSpreadsheetId\(\)/);
  assert.match(functionBody('loadPoints'), /fetchPointsResults\(\)/);
});

test('the results view renders committed points, warnings, and no lifecycle state', () => {
  const render = functionBody('renderPointsResults');
  assert.match(render, /Read-only\. Points are computed from each committed placement at import commit\./);
  assert.match(render, /data\.warnings/);
  assert.match(render, /data\.players/);
  assert.match(render, /pair\.members/);
  assert.doesNotMatch(render, /pointsStatusLabel|week_state|stored_status|voided/);
});

test('the results view renders the weekly pool and a note when second place is unpaid', () => {
  const render = functionBody('renderPointsResults');
  assert.match(render, /payout\.pool/);
  assert.match(render, /payout\.second_paid/);
  assert.match(render, /Second place is not paid:/);
  assert.match(render, /payout\.winners_total/);
  assert.match(render, /payout\.second_min_players/);
});

test('the points panel resets when the active date or league changes', () => {
  const clear = functionBody('clearStaleSectionData');
  assert.match(clear, /pointsPreview/);
  assert.match(clear, /clearPointsStatus\(\)/);
});

test('committing a doubles import refreshes the results view and member totals', () => {
  const commit = functionBody('commitUdiscImportDoubles');
  assert.match(commit, /refreshPointsPanel\(\)/);
  assert.match(commit, /loadMembers\(\)/);
});

test('the points panel never references tag actions or tag fields', () => {
  for (const name of ['loadPoints', 'refreshPointsPanel', 'renderPointsResults']) {
    const body = functionBody(name);
    assert.doesNotMatch(body, /calculateTags|confirmTags|finalizeRound/);
    assert.doesNotMatch(body, /out_tag|current_tag/);
  }
});
