'use strict';

// Structural checks for the doubles Points panel in the admin page.
// Behavioural checks (card visibility, buttons, warning rendering) run in a
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

test('the points panel is present and doubles-only', () => {
  assert.match(html, /id="pointsCalcCard"/);
  assert.match(html, /id="btnPreviewPoints" onclick="previewPoints\(\)"/);
  assert.match(html, /id="btnConfirmPoints" onclick="confirmPoints\(\)"/);
  assert.match(html, /id="btnFinalizePoints" onclick="finalizePoints\(\)"/);

  const apply = functionBody('applyLeague');
  assert.match(apply, /pointsCard\.style\.display = isDoubles \? '' : 'none'/);
});

test('the points actions post to the format-gated server actions', () => {
  assert.match(functionBody('previewPoints'), /action: 'calculatePoints'/);
  assert.match(functionBody('confirmPoints'), /action: 'confirmPoints'/);
  assert.match(functionBody('finalizePoints'), /action: 'finalizePoints'/);
  // Every request is scoped to the selected league spreadsheet.
  for (const name of ['previewPoints', 'confirmPoints', 'finalizePoints']) {
    assert.match(functionBody(name), /spreadsheetId: getSpreadsheetId\(\)/);
  }
});

test('the preview renders no-write messaging and blank-position warnings', () => {
  const render = functionBody('renderPointsPreview');
  assert.match(render, /Preview only\. No writes were made\./);
  assert.match(render, /data\.warnings/);
  assert.match(render, /data\.players/);
  assert.match(render, /pointsStatusLabel\(pl\.stored_status\)/);
});

test('the points panel resets when the active date or league changes', () => {
  const clear = functionBody('clearStaleSectionData');
  assert.match(clear, /pointsPreview/);
  assert.match(clear, /clearPointsStatus\(\)/);
});

test('the points panel never references tag actions or tag fields', () => {
  for (const name of ['previewPoints', 'confirmPoints', 'finalizePoints', 'renderPointsPreview']) {
    const body = functionBody(name);
    assert.doesNotMatch(body, /calculateTags|confirmTags|finalizeRound/);
    assert.doesNotMatch(body, /out_tag|current_tag/);
  }
});
