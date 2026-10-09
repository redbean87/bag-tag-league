'use strict';

// Structural checks for the read-only Week View panel in the admin page.
// Behavioural checks (card visibility, button wiring, rendering) run in a real
// browser; see the task's browser-context verification.

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

test('the week view panel is present and wired to the read-only action', () => {
  assert.match(html, /id="weekViewCard"/);
  assert.match(html, /id="btnLoadWeekView" onclick="loadWeekView\(\)"/);
  assert.match(functionBody('loadWeekView'), /action: 'getWeekView'/);
  assert.match(functionBody('loadWeekView'), /spreadsheetId: getSpreadsheetId\(\)/);
});

test('the week view renders headers, every row, and the missing-column banner', () => {
  const render = functionBody('renderWeekView');
  assert.match(render, /data\.headers/);
  assert.match(render, /data\.rows/);
  assert.match(render, /data\.missing_import_columns/);
  assert.match(render, /Read-only\. Every stored cell is shown exactly as the sheet holds it\./);
  assert.doesNotMatch(render, /setValue|appendRow|commit/);
});

test('the week view resets when the active date or league changes', () => {
  const clear = functionBody('clearStaleSectionData');
  assert.match(clear, /weekViewPreview/);
  assert.match(clear, /clearWeekViewStatus\(\)/);
});
