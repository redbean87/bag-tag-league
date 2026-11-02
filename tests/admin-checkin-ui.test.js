'use strict';

// Structural checks for the admin Check-In card. The behaviour (check in,
// count, undo, mobile layout) is verified in a real browser.

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

test('the check-in card is wired to the roster and write actions', () => {
  assert.match(html, /id="checkInCard"/);
  assert.match(html, /id="btnLoadCheckIn" onclick="loadCheckIn\(\)"/);
  assert.match(functionBody('loadCheckIn'), /'getAdminCheckInRoster'/);
  assert.match(functionBody('adminCheckIn'), /'adminCheckIn'/);
  assert.match(functionBody('adminUndoCheckIn'), /'adminUndoCheckIn'/);
});

test('the roster shows a checked-in count, undo, and a tag input defaulting to current_tag', () => {
  const render = functionBody('renderCheckIn');
  assert.match(render, /checked_in_count/);
  assert.match(render, /Undo/);
  assert.match(render, /p\.current_tag/);
  assert.match(render, /checkin-tag/);
  assert.doesNotMatch(render, /udisc_checked_in/);
});

test('check-in requires a valid entered tag and the card resets on date change', () => {
  assert.match(functionBody('adminCheckIn'), /\[1-9\]/);
  assert.match(functionBody('clearStaleSectionData'), /clearCheckIn\(\)/);
});
