'use strict';

// Structural checks for the doubles Points panel in the admin page.
// Behavioural checks (card visibility, controls, roster grouping, re-key,
// void, unlock) run in a real browser; see the task's browser-context
// verification and tests/points-roster.test.js for the server contract.

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

test('the points panel is present and doubles-only', () => {
  assert.match(html, /id="pointsCalcCard"/);
  assert.match(html, /id="btnPreviewPoints" onclick="previewPoints\(\)"/);
  assert.match(html, /id="btnConfirmPoints" onclick="confirmPoints\(\)"/);
  assert.match(html, /id="btnFinalizePoints" onclick="finalizePoints\(\)"/);
  assert.match(html, /id="btnUnlockPoints" onclick="unlockPoints\(\)"/);
  assert.match(html, /id="pointsWeekState"/);

  const apply = functionBody('applyLeague');
  assert.match(apply, /pointsCard\.style\.display = isDoubles \? '' : 'none'/);
});

test('the points actions post to the format-gated server actions', () => {
  assert.match(functionBody('fetchPointsPreviewData'), /action: 'calculatePoints'/);
  assert.match(functionBody('confirmPoints'), /action: 'confirmPoints'/);
  assert.match(functionBody('finalizePoints'), /action: 'finalizePoints'/);
  assert.match(functionBody('unlockPoints'), /action: 'unlockPoints'/);
  assert.match(functionBody('rekeyPointsPair'), /action: 'rekeyPoints'/);
  assert.match(functionBody('voidPointsPair'), /action: 'voidPoints'/);
  // Every request is scoped to the selected league spreadsheet.
  for (const name of ['fetchPointsPreviewData', 'confirmPoints', 'finalizePoints', 'unlockPoints', 'rekeyPointsPair', 'voidPointsPair']) {
    assert.match(functionBody(name), /spreadsheetId: getSpreadsheetId\(\)/, name + ' must scope its request');
  }
});

test('the preview renders no-write messaging, warnings, and the pair roster', () => {
  const render = functionBody('renderPointsPreview');
  assert.match(render, /Preview only\. No writes were made\./);
  assert.match(render, /data\.warnings/);
  assert.match(render, /data\.players/);
  assert.match(render, /pointsStatusLabel\(pl\.stored_status\)/);
  // The roster carries the pre-confirm pair controls.
  assert.match(render, /rekeyPointsPair/);
  assert.match(render, /voidPointsPair/);
  assert.match(render, /data\.pairs/);
});

test('the results table has exactly Pair / Place / Points / Status columns', () => {
  const render = functionBody('renderPointsPreview');
  for (const column of ['Pair', 'Place', 'Points', 'Status']) {
    assert.ok(render.includes('>' + column + '</th>'), 'results table needs a ' + column + ' column');
  }
});

test('the points controls are gated by the week state', () => {
  const controls = functionBody('updatePointsControls');
  assert.match(controls, /confirmBtn\.disabled = state === 'finalized'/);
  assert.match(controls, /finalizeBtn\.disabled = state !== 'confirmed'/);
  assert.match(controls, /unlockBtn\.style\.display = state === 'finalized'/);
});

test('the points panel resets when the active date or league changes', () => {
  const clear = functionBody('clearStaleSectionData');
  assert.match(clear, /pointsPreview/);
  assert.match(clear, /clearPointsStatus\(\)/);
  assert.match(clear, /updatePointsControls\(null\)/);
});

test('the points panel never references tag actions or tag fields', () => {
  for (const name of ['fetchPointsPreviewData', 'previewPoints', 'renderPointsPreview', 'confirmPoints', 'finalizePoints', 'unlockPoints', 'rekeyPointsPair', 'voidPointsPair']) {
    const body = functionBody(name);
    assert.doesNotMatch(body, /calculateTags|confirmTags|finalizeRound/);
    assert.doesNotMatch(body, /out_tag|current_tag/);
  }
});
