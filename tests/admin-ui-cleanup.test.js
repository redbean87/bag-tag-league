'use strict';

// Structural checks for the admin UI cleanup: the redundant "sheet exists"
// and "League Already Created" status texts stay removed while the creation
// signal is restored fresh on the Create League Day card.

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

test('the redundant sheet-exists and league-already-created texts are gone', () => {
  assert.doesNotMatch(html, /Sheet exists:/);
  assert.doesNotMatch(html, /League Already Created/);
});

test('the date/day state logic stays even though its text is removed', () => {
  // The Active League Date status still distinguishes an existing sheet from a
  // missing one; it just no longer renders the "sheet exists" line.
  const active = functionBody('updateActiveLeagueDateStatus');
  assert.match(active, /if \(sheetExistsForDate\(activeDate\)\)/);
  assert.match(active, /statusEl\.innerHTML = ''/);
  assert.match(active, /No sheet for this date yet\./);

  // The Create League Day card still hides the form when the week exists.
  const createDay = functionBody('updateCreateLeagueDayStatus');
  assert.match(createDay, /if \(sheetExistsForDate\(activeDate\)\)/);
  assert.match(createDay, /existsEl\.style\.display = ''/);
  assert.match(createDay, /formEl\.style\.display = 'none'/);

  // The create handler still refuses a duplicate before it writes.
  const createWeek = functionBody('createWeeklyTab');
  assert.match(createWeek, /if \(sheetExistsForDate\(leagueDate\)\)/);
  assert.doesNotMatch(createWeek, /Already Created/);
});

test('the create card signals a created league day only when the sheet exists', () => {
  const createDay = functionBody('updateCreateLeagueDayStatus');
  const present = createDay.slice(createDay.indexOf('if (sheetExistsForDate(activeDate))'));
  const absent = present.slice(present.indexOf('} else {'));

  // Present: a fresh created line is written and the create form hides.
  assert.match(present, /existsEl\.innerHTML = '<p class="status ok"[^']*League day created/);
  assert.match(present, /existsEl\.style\.display = ''/);
  assert.match(present, /formEl\.style\.display = 'none'/);

  // Absent: the signal is cleared and the create form returns.
  assert.match(absent, /existsEl\.innerHTML = ''/);
  assert.match(absent, /existsEl\.style\.display = 'none'/);
  assert.match(absent, /formEl\.style\.display = ''/);

  // The restored signal is written fresh, not either removed string.
  assert.doesNotMatch(createDay, /Sheet exists:/);
  assert.doesNotMatch(createDay, /League Already Created/);
});
