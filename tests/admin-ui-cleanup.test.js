'use strict';

// Structural checks for the admin UI cleanup: the redundant "sheet exists"
// and "league already created" status texts are gone while the state logic
// that drives them remains.

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
