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

test('each row has one button whose label and action follow the check-in state', () => {
  const render = functionBody('renderCheckIn');
  const checkedIn = render.slice(render.indexOf('if (p.checked_in)'), render.indexOf('} else {'));
  const notIn = render.slice(render.indexOf('} else {'), render.indexOf("html += '</li>'"));
  const buttons = (s) => s.match(/<button /g) || [];
  assert.equal(buttons(checkedIn).length, 1);
  assert.equal(buttons(notIn).length, 1);
  assert.match(checkedIn, /class="undo" onclick="adminUndoCheckIn\([^)]*\)">Undo</);
  assert.doesNotMatch(checkedIn, />Check in</);
  assert.match(notIn, /onclick="adminCheckIn\([^)]*\)">Check in</);
  assert.doesNotMatch(notIn, />Undo</);
});

test('rows stay on one line with a 44px tap target and the state under the name', () => {
  assert.match(html, /\.checkin-row \{[^}]*display: flex;[^}]*\}/);
  assert.doesNotMatch(html, /\.checkin-row \{[^}]*flex-wrap/);
  assert.doesNotMatch(html, /\.checkin-state \{[^}]*flex: 1 1 100%/);
  assert.match(html, /\.checkin-row button \{[^}]*min-height: 44px/);
  assert.match(html, /\.checkin-tag \{[^}]*min-height: 44px/);
  assert.match(functionBody('renderCheckIn'), /class="checkin-who"/);
});
