'use strict';

// After a check-in or undo the admin page patches the one row from the write
// response instead of re-fetching and rebuilding the whole roster (diagnosis
// option B): one round trip per click, the list DOM — and with it the scroll
// position and the active search filter — untouched, the summary count moved
// by one, and Refresh Check-In left as the reconciliation path. It also pins
// the "Weeks: N" label the appearances payload feeds and keeps the row markup
// the patch shares with renderCheckIn in step. Runs the page's own inline
// functions in a Node Function with a minimal fake DOM; no browser, no live
// backend.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadCode, REPO_ROOT } = require('./helpers/load-code');

const html = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');

// The inline body of a page function, sliced to the next top-level function
// declaration (sync or async).
function functionBody(name) {
  let start = html.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'expected function ' + name);
  if (start >= 6 && html.slice(start - 6, start) === 'async ') start -= 6; // keep `async` in the slice
  const rest = html.slice(start + 1);
  const next = rest.search(/\n    (?:async )?function /);
  return html.slice(start, next === -1 ? undefined : start + 1 + next);
}

function rosterPayload(overrides) {
  return Object.assign({
    status: 'ok',
    uses_tags: false,
    checked_in_count: 1,
    player_count: 3,
    players: [
      { member_number: 1, name: 'Ann Archer', on_week_sheet: true, checked_in: true, signed_in_at: '2026-10-05T22:00:00.000Z', in_tag: '', current_tag: '', appearances: 9 },
      { member_number: 2, name: 'Bo Bell', on_week_sheet: false, checked_in: false, signed_in_at: '', in_tag: '', current_tag: '', appearances: 4 },
      { member_number: 3, name: 'Cy Cole', on_week_sheet: false, checked_in: false, signed_in_at: '', in_tag: '', current_tag: '', appearances: 0 }
    ]
  }, overrides || {});
}

// The page's inline check-in functions, run with injected document/post fakes.
function loadUi() {
  const source = [
    'var checkInLastData = null;',
    functionBody('escHtml'),
    functionBody('formatCheckInTime'),
    functionBody('checkInWeeksLabel'),
    functionBody('checkInRowInner'),
    functionBody('renderCheckIn'),
    functionBody('runCheckInAction'),
    functionBody('patchCheckInRow'),
    'return { renderCheckIn, runCheckInAction, patchCheckInRow, checkInRowInner,',
    '  setLastData: function (d) { checkInLastData = d; },',
    '  getLastData: function () { return checkInLastData; } };'
  ].join('\n');
  return new Function('document', 'postCheckIn', 'setCheckInStatus', 'log', 'escHtml', source);
}

function makeHarness(roster, options) {
  const opts = options || {};
  const rows = roster.players.map((p) => ({
    member: String(p.member_number),
    className: 'checkin-row' + (p.checked_in ? ' in' : ''),
    innerHTML: '<div data-fixture="row-' + p.member_number + '"></div>',
    style: { display: '' },
    getAttribute(name) { return name === 'data-member' ? this.member : null; }
  }));
  const buttons = [{ disabled: false }, { disabled: false }];
  const elements = {
    checkInPanel: { innerHTML: '', style: {} },
    checkInSummary: { innerHTML: roster.checked_in_count + ' checked in <span>of ' + roster.player_count + '</span>' },
    checkInSearch: { value: 'fox' },
    checkInResult: { className: '', innerHTML: '' }
  };
  const document = {
    getElementById(id) {
      return Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null;
    },
    querySelector(selector) {
      const match = /^#checkInList \[data-member="([^"]*)"\]$/.exec(selector);
      assert.ok(match, 'unexpected selector: ' + selector);
      return rows.find((r) => r.member === match[1]) || null;
    },
    querySelectorAll(selector) {
      if (selector === '#checkInList button') return buttons;
      if (selector === '#checkInList .checkin-row') return rows;
      assert.fail('unexpected selector list: ' + selector);
    }
  };
  const calls = [];
  const statuses = [];
  const logs = [];
  const postCheckIn = async (action, payload) => {
    calls.push({ action, payload });
    if (action === 'getAdminCheckInRoster') {
      return { status: 'error', message: 'roster must not be re-fetched after a write' };
    }
    if (opts.writeResult) return opts.writeResult;
    if (action === 'adminCheckIn') {
      return { status: 'ok', message: 'Player checked in.', member_number: payload.member_number, league_date: '2026-10-05', signed_in_at: '2026-10-05T23:00:00.000Z' };
    }
    return { status: 'ok', message: 'Check-in undone.', member_number: payload.member_number, league_date: '2026-10-05' };
  };
  const setCheckInStatus = (type, message) => statuses.push([type, message]);
  const log = (message) => logs.push(message);
  const escHtml = (str) => {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  const ui = loadUi()(document, postCheckIn, setCheckInStatus, log, escHtml);
  ui.setLastData(roster);
  return { ui, rows, buttons, elements, calls, statuses, logs };
}

function extractRow(panelHtml, memberNumber) {
  const match = new RegExp('<li[^>]*data-member="' + memberNumber + '"[^>]*>([\\s\\S]*?)</li>').exec(panelHtml);
  assert.ok(match, 'expected a rendered row for member ' + memberNumber);
  return match[1];
}

test('a check-in flips the one row in place with a single round trip', async () => {
  const h = makeHarness(rosterPayload());
  // A row the search filter has hidden must stay hidden after the patch.
  h.rows[2].style.display = 'none';

  await h.ui.runCheckInAction('adminCheckIn', '2', {}, 'Player checked in.');

  assert.deepEqual(h.calls.map((c) => c.action), ['adminCheckIn'],
    'the roster must not be re-fetched after the write');
  const row = h.rows[1];
  assert.match(row.className, /\bin\b/);
  assert.match(row.innerHTML, /class="undo" onclick="adminUndoCheckIn\('2'\)">Undo</);
  assert.match(row.innerHTML, /Checked in at/);
  assert.match(row.innerHTML, /Weeks: 4/);
  assert.doesNotMatch(row.innerHTML, /Check in</);
  // The rest of the list is untouched: no rebuild, no filter reset.
  assert.strictEqual(h.rows[0].innerHTML, '<div data-fixture="row-1"></div>');
  assert.strictEqual(h.rows[2].style.display, 'none');
  assert.strictEqual(h.elements.checkInPanel.innerHTML, '', 'the panel must not be re-rendered');
  assert.strictEqual(h.elements.checkInSearch.value, 'fox');
  // The cached payload and the summary count move with the row.
  assert.strictEqual(h.ui.getLastData().checked_in_count, 2);
  assert.strictEqual(h.ui.getLastData().players[1].checked_in, true);
  assert.strictEqual(h.ui.getLastData().players[1].signed_in_at, '2026-10-05T23:00:00.000Z');
  assert.match(h.elements.checkInSummary.innerHTML, /^2 checked in/);
  assert.deepEqual(h.statuses, [['ok', 'Player checked in.']]);
  assert.ok(h.buttons.every((b) => !b.disabled), 'buttons are re-enabled after the patch');
});

test('undo flips the row back and decrements the count', async () => {
  const h = makeHarness(rosterPayload());

  await h.ui.runCheckInAction('adminUndoCheckIn', '1', {}, 'Check-in undone.');

  assert.deepEqual(h.calls.map((c) => c.action), ['adminUndoCheckIn']);
  const row = h.rows[0];
  assert.strictEqual(row.className, 'checkin-row');
  assert.match(row.innerHTML, /onclick="adminCheckIn\('1'\)">Check in</);
  assert.doesNotMatch(row.innerHTML, /Undo</);
  assert.match(row.innerHTML, /Weeks: 9/);
  assert.strictEqual(h.ui.getLastData().checked_in_count, 0);
  assert.strictEqual(h.ui.getLastData().players[0].checked_in, false);
  assert.strictEqual(h.ui.getLastData().players[0].signed_in_at, '');
  assert.match(h.elements.checkInSummary.innerHTML, /^0 checked in/);
  assert.ok(h.buttons.every((b) => !b.disabled));
});

test('a rejected write leaves the row, the count, and the search untouched', async () => {
  const h = makeHarness(rosterPayload(), {
    writeResult: { status: 'error', message: 'That player is already checked in.' }
  });

  await h.ui.runCheckInAction('adminCheckIn', '2', {}, 'Player checked in.');

  assert.strictEqual(h.rows[1].innerHTML, '<div data-fixture="row-2"></div>');
  assert.strictEqual(h.rows[1].className, 'checkin-row');
  assert.strictEqual(h.ui.getLastData().checked_in_count, 1);
  assert.strictEqual(h.elements.checkInSummary.innerHTML, '1 checked in <span>of 3</span>');
  assert.match(h.statuses[0][0], /error/);
  assert.match(h.statuses[0][1], /already checked in/);
  assert.ok(h.buttons.every((b) => !b.disabled), 'buttons are re-enabled after a rejection');
});

test('the patched row markup is byte-identical to a full render of the same state', () => {
  const states = [
    { checked_in: false, uses_tags: false, in_tag: '' },
    { checked_in: true, uses_tags: false, in_tag: '' },
    { checked_in: false, uses_tags: true, in_tag: '' },
    { checked_in: true, uses_tags: true, in_tag: 5 }
  ];
  for (const state of states) {
    const player = {
      member_number: 2,
      name: 'Bo Bell',
      on_week_sheet: false,
      checked_in: state.checked_in,
      signed_in_at: state.checked_in ? '2026-10-05T23:00:00.000Z' : '',
      in_tag: state.in_tag,
      current_tag: state.uses_tags ? 12 : '',
      appearances: 4
    };
    const data = rosterPayload({ uses_tags: state.uses_tags, players: [player] });
    const h = makeHarness(data);
    h.ui.renderCheckIn(data);
    assert.strictEqual(
      extractRow(h.elements.checkInPanel.innerHTML, '2'),
      h.ui.checkInRowInner(player, state.uses_tags),
      'state checked_in=' + state.checked_in + ' uses_tags=' + state.uses_tags
    );
  }
});

test('each rendered row shows its stored Weeks count, blank reads as 0', () => {
  const data = rosterPayload();
  const h = makeHarness(data);
  h.ui.renderCheckIn(data);
  assert.match(extractRow(h.elements.checkInPanel.innerHTML, '1'), /<span class="checkin-weeks">Weeks: 9<\/span>/);
  assert.match(extractRow(h.elements.checkInPanel.innerHTML, '3'), /<span class="checkin-weeks">Weeks: 0<\/span>/);
});

// ─── The server seam the patch relies on ─────────────────────────────────────

test('the check-in write response carries signed_in_at end to end through doPost', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  club.appendRow([1, 'Damon Forsythe', 'damon31', '', true, '', '', 0]);
  doubles.insertSheet('Week 2026-10-05').appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);

  const post = (body) => h.parse(h.fn('doPost')({ postData: { contents: JSON.stringify(Object.assign({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: '2026-10-05'
  }, body)) } }));

  const before = Date.now();
  const checkedIn = post({ action: 'adminCheckIn', member_number: 1 });
  assert.strictEqual(checkedIn.status, 'ok');
  assert.ok(Date.parse(checkedIn.signed_in_at) >= before,
    'signed_in_at rides back so the row can be patched without a roster read');
  const undone = post({ action: 'adminUndoCheckIn', member_number: 1 });
  assert.strictEqual(undone.status, 'ok');
});
