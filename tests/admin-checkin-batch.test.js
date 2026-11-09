'use strict';

// Batch check-in (diagnosis option A): ONE server execution opens the week
// tab once, validates every member before writing anything, refuses the whole
// batch all-or-nothing, and reports each member's outcome - landing or a
// benign per-member "already checked in" skip - while the single check-in and
// undo paths stay untouched. On the page, the selection lives in a
// member-number-keyed set OUTSIDE the list DOM, so the post-action re-render
// never destroys it, and one adminCheckInBatch round trip covers N members
// before the roster refreshes from ground truth. Server side runs in the Node
// VM Sheets fake; page side runs the page's own inline functions in a Node
// Function with a fake DOM. No browser, no live sheet.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadCode, REPO_ROOT } = require('./helpers/load-code');

const WEEK_DATE = '2026-10-05';

const html = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');

// ─── Server fixtures ─────────────────────────────────────────────────────────

function weeklyRow(h, headers, fields) {
  const row = new Array(headers.length).fill('');
  for (const key in fields) {
    const index = headers.indexOf(key);
    if (index !== -1) row[index] = fields[key];
  }
  return row;
}

// Singles (tags) league: Ann and Bo active, Cy inactive on the club roster.
function buildSingles(h, weekRows) {
  const sheet = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const club = sheet.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  club.appendRow([1, 'Ann Archer', 'ann', '', 7, true, '2026-01-01', '2026-01-01']);
  club.appendRow([2, 'Bo Bell', 'bo', '', 12, true, '2026-01-01', '2026-01-01']);
  club.appendRow([3, 'Cy Cole', 'cy', '', 20, false, '2026-01-01', '2026-01-01']);
  const headers = h.bound.WEEKLY_RECORD_HEADERS;
  const week = sheet.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(headers);
  (weekRows || []).forEach((fields) => week.appendRow(weeklyRow(h, headers, fields)));
  return { sheet, week, headers, club };
}

// The full HTTP seam: every server assertion below goes through doPost, so a
// missing route branch fails here rather than in the browser.
function post(h, body) {
  return h.parse(h.fn('doPost')({
    postData: {
      contents: JSON.stringify(Object.assign({
        spreadsheetId: h.bound.SPREADSHEET_ID,
        league_date: WEEK_DATE
      }, body))
    }
  }));
}

function batch(h, members) {
  return post(h, { action: 'adminCheckInBatch', members });
}

function weekRecords(week) {
  const values = week.getDataRange().getValues();
  return values.slice(1).map((row) => {
    const record = {};
    values[0].forEach((header, i) => { record[header] = row[i]; });
    return record;
  });
}

// ─── Server: one execution, all-or-nothing, skips, outcomes ──────────────────

test('one execution checks in N members: a single doPost opens the sheet once', () => {
  const h = loadCode();
  const { week } = buildSingles(h);
  const opensBefore = h.openByIdCalls.length;

  const result = batch(h, [
    { member_number: 1, in_tag: 11 },
    { member_number: 2, in_tag: 12 },
    { member_number: 3, in_tag: 13 } // inactive: refused below, not a second run
  ]);

  // The refusal proves the whole batch shares one execution's validation pass;
  // a successful batch must open the spreadsheet exactly once for all members.
  assert.strictEqual(result.status, 'error');
  assert.strictEqual(h.openByIdCalls.length - opensBefore, 1, 'one sheet open per execution, not per member');
  assert.strictEqual(weekRecords(week).length, 0);

  const opensBeforeOk = h.openByIdCalls.length;
  const ok = batch(h, [
    { member_number: 1, in_tag: 11 },
    { member_number: 2, in_tag: 12 }
  ]);
  assert.strictEqual(ok.status, 'ok');
  assert.strictEqual(h.openByIdCalls.length - opensBeforeOk, 1, 'a successful batch of N opens the sheet once');
  assert.strictEqual(weekRecords(week).length, 2);

  // Contrast: the same two members through the single action cost one
  // execution each - exactly what the batch collapses.
  const single = loadCode();
  buildSingles(single);
  post(single, { action: 'adminCheckIn', member_number: 1, in_tag: 11 });
  post(single, { action: 'adminCheckIn', member_number: 2, in_tag: 12 });
  assert.strictEqual(single.openByIdCalls.length, 2, 'two single check-ins are two executions');
});

test('a refusal is all-or-nothing: no member is written and the refusal names who and why', () => {
  const h = loadCode();
  const { week } = buildSingles(h);

  // One inactive member among valid ones refuses the whole batch.
  const inactive = batch(h, [
    { member_number: 1, in_tag: 11 },
    { member_number: 3, in_tag: 13 },
    { member_number: 2, in_tag: 12 }
  ]);
  assert.strictEqual(inactive.status, 'error');
  assert.match(inactive.message, /nothing was checked in/);
  assert.match(inactive.message, /member 3/);
  assert.ok(inactive.refused.some((r) => String(r.member_number) === '3' && /inactive/.test(r.reason)),
    'the refusal carries the member and the reason');
  assert.strictEqual(weekRecords(week).length, 0, 'the two valid members must not be written either');

  // A member who is neither on the sheet nor in the club refuses with the
  // new-player path spelled out - batch never creates members.
  const missing = batch(h, [
    { member_number: 2, in_tag: 12 },
    { member_number: 99, in_tag: 19 }
  ]);
  assert.strictEqual(missing.status, 'error');
  assert.match(missing.message, /member 99/);
  assert.match(missing.message, /sign in first/);
  assert.strictEqual(weekRecords(week).length, 0);

  // A bad tag anywhere refuses everything, exactly like the single handler's
  // tag bar (tests/admin-checkin.test.js pins it there for one member).
  const badTag = batch(h, [
    { member_number: 1, in_tag: 11 },
    { member_number: 2, in_tag: '4x' }
  ]);
  assert.strictEqual(badTag.status, 'error');
  assert.match(badTag.message, /valid tag number/);
  assert.ok(badTag.refused.some((r) => String(r.member_number) === '2'));
  assert.strictEqual(weekRecords(week).length, 0);

  // After every refusal, a clean batch still lands - nothing leaked.
  assert.strictEqual(batch(h, [{ member_number: 1, in_tag: 11 }, { member_number: 2, in_tag: 12 }]).status, 'ok');
  assert.strictEqual(weekRecords(week).length, 2);
});

test('an already-checked-in member is a per-member skip, never a batch abort', () => {
  const h = loadCode();
  const { week } = buildSingles(h, [
    { member_number: 1, player_name_snapshot: 'Ann Archer', checked_in: true, signed_in_at: '2026-10-05T21:00:00.000Z', in_tag: 7 }
  ]);

  const result = batch(h, [
    { member_number: 1, in_tag: 11 }, // benign state: already in
    { member_number: 2, in_tag: 12 }
  ]);

  assert.strictEqual(result.status, 'ok', 'a benign skip must not abort the batch');
  assert.strictEqual(result.checked_in_count, 1);
  assert.strictEqual(result.skipped_count, 1);
  const records = weekRecords(week);
  assert.strictEqual(records.length, 2);
  const ann = records.find((r) => String(r.member_number) === '1');
  assert.strictEqual(ann.signed_in_at, '2026-10-05T21:00:00.000Z', 'the skipped row is untouched');
  assert.strictEqual(ann.in_tag, 7);
  const bo = records.find((r) => String(r.member_number) === '2');
  assert.strictEqual(bo.checked_in, true);
  assert.strictEqual(bo.in_tag, 12);
});

test('the response carries one outcome per member: landed, or already in with its stamp', () => {
  const h = loadCode();
  const { week } = buildSingles(h, [
    { member_number: 1, player_name_snapshot: 'Ann Archer', checked_in: true, signed_in_at: '2026-10-05T21:00:00.000Z' }
  ]);

  const result = batch(h, [
    { member_number: 1, in_tag: 11 },
    { member_number: 2, in_tag: 12 }
  ]);

  assert.strictEqual(result.status, 'ok');
  assert.strictEqual(result.requested_count, 2);
  assert.strictEqual(result.league_date, WEEK_DATE);
  assert.ok(Array.isArray(result.results), 'per-member outcomes ride the response');
  assert.strictEqual(result.results.length, 2, 'exactly one outcome per selected member');
  assert.deepStrictEqual(
    result.results.map((r) => [String(r.member_number), r.result]),
    [['1', 'already_checked_in'], ['2', 'checked_in']],
    'outcomes follow the requested order'
  );
  assert.strictEqual(result.results[0].signed_in_at, '2026-10-05T21:00:00.000Z');
  assert.ok(Date.parse(result.results[1].signed_in_at) >= Date.parse('2026-10-05T00:00:00.000Z'),
    'the landed member carries its signed_in_at so the page can show it');
  // The batch stamps every write with one `now`; the count matches the rows.
  assert.strictEqual(weekRecords(week).filter((r) => r.checked_in === true).length, 2);
});

test('points leagues batch without tags and tags leagues store the entered tag per member', () => {
  // Tags league: each member's own entered tag lands, not current_tag.
  const tags = loadCode();
  const { week } = buildSingles(tags);
  const tagged = batch(tags, [{ member_number: 1, in_tag: 5 }, { member_number: 2, in_tag: 14 }]);
  assert.strictEqual(tagged.status, 'ok');
  const tagRecords = weekRecords(week);
  assert.strictEqual(tagRecords.find((r) => String(r.member_number) === '1').in_tag, 5);
  assert.strictEqual(tagRecords.find((r) => String(r.member_number) === '2').in_tag, 14);
  // A tags batch that omits a tag refuses before the lock, nothing written.
  const noTag = batch(tags, [{ member_number: 1, in_tag: 5 }, { member_number: 2 }]);
  assert.strictEqual(noTag.status, 'error');
  assert.ok(noTag.refused.some((r) => String(r.member_number) === '2' && /in_tag is required/.test(r.reason)));

  // Points league: no tag anywhere in the request or the written row.
  const points = loadCode();
  const doubles = points.makeSpreadsheet(points.bound.SPREADSHEET_ID_DOUBLES);
  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(points.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  club.appendRow([1, 'Damon Forsythe', 'damon31', '', true, '', '', 0]);
  club.appendRow([2, 'Evan Eclair', 'evan77', '', true, '', '', 0]);
  const pWeek = doubles.insertSheet('Week ' + WEEK_DATE);
  pWeek.appendRow(points.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  const pointsResult = points.parse(points.fn('doPost')({
    postData: {
      contents: JSON.stringify({
        spreadsheetId: points.bound.SPREADSHEET_ID_DOUBLES,
        league_date: WEEK_DATE,
        action: 'adminCheckInBatch',
        members: [{ member_number: 1 }, { member_number: 2 }]
      })
    }
  }));
  assert.strictEqual(pointsResult.status, 'ok');
  const records = weekRecords(pWeek);
  assert.strictEqual(records.length, 2);
  assert.ok(records.every((r) => r.checked_in === true));
  assert.ok(records.every((r) => r.in_tag === undefined || r.in_tag === ''), 'points rows never gain a tag');
});

test('the single check-in and undo paths are untouched alongside batch', () => {
  const h = loadCode();
  const { week } = buildSingles(h);
  assert.strictEqual(post(h, { action: 'adminCheckIn', member_number: 1, in_tag: 4 }).status, 'ok');
  assert.strictEqual(weekRecords(week).length, 1);
  // The single path's duplicate bar still errors; batch would skip instead.
  assert.strictEqual(post(h, { action: 'adminCheckIn', member_number: 1, in_tag: 4 }).status, 'error');
  assert.strictEqual(post(h, { action: 'adminUndoCheckIn', member_number: 1 }).status, 'ok');
  assert.strictEqual(weekRecords(week)[0].checked_in, false);
  assert.strictEqual(post(h, { action: 'getAdminCheckInRoster' }).checked_in_count, 0);
});

// ─── Page: selection outside the DOM, one round trip, the report ─────────────

// The page's own inline functions, run in a Node Function with injected
// document/post fakes - same style as tests/admin-checkin-row-patch.test.js.
function functionBody(name) {
  let start = html.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'expected function ' + name);
  if (start >= 6 && html.slice(start - 6, start) === 'async ') start -= 6;
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

function loadUi() {
  const source = [
    'var checkInLastData = null;',
    'var checkInSelection = new Set();',
    functionBody('escHtml'),
    functionBody('formatCheckInTime'),
    functionBody('checkInWeeksLabel'),
    functionBody('checkInRowInner'),
    functionBody('renderCheckIn'),
    functionBody('updateCheckInBatchBar'),
    functionBody('toggleCheckInPick'),
    functionBody('describeBatchCheckInReport'),
    functionBody('loadCheckIn'),
    functionBody('adminCheckInSelected'),
    'return { renderCheckIn, toggleCheckInPick, updateCheckInBatchBar,',
    '  describeBatchCheckInReport, loadCheckIn, adminCheckInSelected,',
    '  setLastData: function (d) { checkInLastData = d; },',
    '  getSelection: function () { return checkInSelection; },',
    '  getLastData: function () { return checkInLastData; } };'
  ].join('\n');
  return new Function('document', 'postCheckIn', 'setCheckInStatus', 'log', 'escHtml', 'getActiveLeagueDate', source);
}

function makeHarness(roster, options) {
  const opts = options || {};
  const elements = {
    checkInPanel: { innerHTML: '', style: {} },
    checkInSummary: { innerHTML: '' },
    checkInSearch: { value: '' },
    checkInResult: { className: '', innerHTML: '' },
    btnCheckInSelected: { textContent: '', disabled: false }
  };
  const buttons = [{ disabled: false }, { disabled: false }];
  const document = {
    getElementById(id) {
      if (Object.prototype.hasOwnProperty.call(elements, id)) return elements[id];
      if (id.indexOf('checkInTag-') === 0 && opts.tags && Object.prototype.hasOwnProperty.call(opts.tags, id)) {
        return opts.tags[id];
      }
      return null;
    },
    querySelector(selector) { throw new Error('unexpected selector: ' + selector); },
    querySelectorAll(selector) {
      if (selector === '#checkInList button') return buttons;
      throw new Error('unexpected selector list: ' + selector);
    }
  };
  const calls = [];
  const statuses = [];
  const logs = [];
  let refreshedRoster = roster;
  const postCheckIn = async (action, payload) => {
    calls.push({ action, payload });
    if (action === 'getAdminCheckInRoster') return refreshedRoster;
    if (action === 'adminCheckInBatch') return opts.batchResult || { status: 'error', message: 'unexpected batch call' };
    throw new Error('unexpected action: ' + action);
  };
  const setCheckInStatus = (type, message) => statuses.push([type, message]);
  const log = (message) => logs.push(message);
  const escHtml = (str) => {
    if (str === null || str === undefined) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  const ui = loadUi()(document, postCheckIn, setCheckInStatus, log, escHtml, () => WEEK_DATE);
  ui.setLastData(roster);
  ui.renderCheckIn(roster);
  return {
    ui, elements, buttons, calls, statuses, logs,
    setRefreshedRoster(r) { refreshedRoster = r; }
  };
}

function rowHtml(panelHtml, memberNumber) {
  const match = new RegExp('<li[^>]*data-member="' + memberNumber + '"[^>]*>([\\s\\S]*?)</li>').exec(panelHtml);
  assert.ok(match, 'expected a rendered row for member ' + memberNumber);
  return match[1];
}

test('selection survives a re-render: the set lives outside the list DOM', () => {
  const h = makeHarness(rosterPayload());

  h.ui.toggleCheckInPick('2', true);
  assert.strictEqual(h.ui.getSelection().size, 1);
  assert.strictEqual(h.elements.btnCheckInSelected.textContent, 'Check in selected (1)');
  assert.strictEqual(h.elements.btnCheckInSelected.disabled, false);

  // Refresh / a post-action reload rebuilds panel.innerHTML wholesale; the
  // ticks must come back because they are re-applied from the set, not read
  // from the destroyed nodes.
  h.ui.renderCheckIn(rosterPayload());

  assert.strictEqual(h.ui.getSelection().size, 1, 'the set is untouched by the re-render');
  assert.match(rowHtml(h.elements.checkInPanel.innerHTML, '2'), /data-pick="2" checked/);
  assert.doesNotMatch(rowHtml(h.elements.checkInPanel.innerHTML, '3'), /data-pick="3" checked/);
  assert.doesNotMatch(rowHtml(h.elements.checkInPanel.innerHTML, '1'), /data-pick=/,
    'a member already checked in offers no tickbox');
  assert.match(h.elements.checkInPanel.innerHTML, />Check in selected \(1\)</,
    'the re-rendered toolbar shows the live count from the set');
});

test('one round trip checks in the whole selection, then the roster refreshes from ground truth', async () => {
  const batchResult = {
    status: 'ok',
    message: 'Batch check-in complete: 1 checked in, 1 already checked in.',
    checked_in_count: 1,
    skipped_count: 1,
    results: [
      { member_number: 2, result: 'checked_in', signed_in_at: '2026-10-05T23:00:00.000Z' },
      { member_number: 3, result: 'already_checked_in', signed_in_at: '2026-10-05T21:00:00.000Z' }
    ]
  };
  const h = makeHarness(rosterPayload(), { batchResult });
  h.setRefreshedRoster(rosterPayload({
    checked_in_count: 3,
    players: [
      { member_number: 1, name: 'Ann Archer', on_week_sheet: true, checked_in: true, signed_in_at: '2026-10-05T22:00:00.000Z', in_tag: '', current_tag: '', appearances: 9 },
      { member_number: 2, name: 'Bo Bell', on_week_sheet: true, checked_in: true, signed_in_at: '2026-10-05T23:00:00.000Z', in_tag: '', current_tag: '', appearances: 4 },
      { member_number: 3, name: 'Cy Cole', on_week_sheet: true, checked_in: true, signed_in_at: '2026-10-05T21:00:00.000Z', in_tag: '', current_tag: '', appearances: 0 }
    ]
  }));

  h.ui.toggleCheckInPick('2', true);
  h.ui.toggleCheckInPick('3', true);
  await h.ui.adminCheckInSelected();

  assert.deepStrictEqual(h.calls.map((c) => c.action), ['adminCheckInBatch', 'getAdminCheckInRoster'],
    'N members cost one write execution plus one ground-truth refresh');
  assert.deepStrictEqual(h.calls[0].payload.members, [{ member_number: 2 }, { member_number: 3 }]);

  // The report names who landed and who was already in.
  const lastStatus = h.statuses[h.statuses.length - 1];
  assert.strictEqual(lastStatus[0], 'ok');
  assert.match(lastStatus[1], /Checked in: Bo Bell\./);
  assert.match(lastStatus[1], /Already checked in: Cy Cole\./);

  assert.strictEqual(h.ui.getSelection().size, 0, 'a successful batch consumes the selection');
  assert.match(h.elements.checkInPanel.innerHTML, /disabled>Check in selected \(0\)</,
    'the refreshed render bakes the empty count back in');
  assert.match(h.elements.checkInPanel.innerHTML, /3 checked in/,
    'the summary came from the refreshed roster, not the click');
  assert.ok(h.buttons.every((b) => !b.disabled), 'row buttons are re-enabled');
});

test('a refused batch keeps the selection for retry and names the reason; no refresh runs', async () => {
  const h = makeHarness(rosterPayload(), {
    batchResult: {
      status: 'error',
      message: 'Batch refused - nothing was checked in (member 3: selected member not found or is inactive - a brand-new player must sign in first (QR self sign-in or an import), then can be checked in normally.).',
      refused: [{ member_number: 3, reason: 'selected member not found or is inactive' }],
      writes: false
    }
  });

  h.ui.toggleCheckInPick('2', true);
  h.ui.toggleCheckInPick('3', true);
  await h.ui.adminCheckInSelected();

  assert.deepStrictEqual(h.calls.map((c) => c.action), ['adminCheckInBatch'],
    'nothing was written, so the roster still holds ground truth - no refresh needed');
  const lastStatus = h.statuses[h.statuses.length - 1];
  assert.strictEqual(lastStatus[0], 'error');
  assert.match(lastStatus[1], /nothing was checked in/);
  assert.match(lastStatus[1], /member 3/);
  assert.strictEqual(h.ui.getSelection().size, 2, 'the selection survives a refusal so the admin can retry');
  assert.strictEqual(h.elements.btnCheckInSelected.textContent, 'Check in selected (2)');
  assert.strictEqual(h.elements.btnCheckInSelected.disabled, false);
  assert.ok(h.buttons.every((b) => !b.disabled));
});

test('a tags league batch reads each ticked row\'s tag input and blocks on a bad one before any request', async () => {
  const tagsRoster = rosterPayload({
    uses_tags: true,
    players: [
      { member_number: 1, name: 'Ann Archer', on_week_sheet: true, checked_in: true, signed_in_at: '2026-10-05T22:00:00.000Z', in_tag: 7, current_tag: 7, appearances: 9 },
      { member_number: 2, name: 'Bo Bell', on_week_sheet: false, checked_in: false, signed_in_at: '', in_tag: '', current_tag: 12, appearances: 4 },
      { member_number: 3, name: 'Cy Cole', on_week_sheet: false, checked_in: false, signed_in_at: '', in_tag: '', current_tag: 20, appearances: 0 }
    ]
  });
  const h = makeHarness(tagsRoster, {
    tags: {
      'checkInTag-2': { value: ' 7 ', focus() { this.focused = true; } },
      'checkInTag-3': { value: 'bad', focus() { this.focused = true; } }
    }
  });

  h.ui.toggleCheckInPick('2', true);
  h.ui.toggleCheckInPick('3', true);
  await h.ui.adminCheckInSelected();

  assert.deepStrictEqual(h.calls, [], 'a bad tag blocks the request entirely, like the single path');
  const lastStatus = h.statuses[h.statuses.length - 1];
  assert.strictEqual(lastStatus[0], 'error');
  assert.match(lastStatus[1], /tag number each selected player is carrying/);
  assert.strictEqual(h.ui.getSelection().size, 2, 'the selection is kept for the fix');

  // Fix the tag: the request now carries each member's entered tag.
  const fixed = makeHarness(tagsRoster, {
    tags: {
      'checkInTag-2': { value: '7', focus() {} },
      'checkInTag-3': { value: '14', focus() {} }
    },
    batchResult: {
      status: 'ok',
      message: 'Batch check-in complete: 2 checked in, 0 already checked in.',
      checked_in_count: 2,
      skipped_count: 0,
      results: [
        { member_number: 2, result: 'checked_in', signed_in_at: '2026-10-05T23:00:00.000Z' },
        { member_number: 3, result: 'checked_in', signed_in_at: '2026-10-05T23:00:00.000Z' }
      ]
    }
  });
  fixed.ui.toggleCheckInPick('2', true);
  fixed.ui.toggleCheckInPick('3', true);
  await fixed.ui.adminCheckInSelected();
  assert.deepStrictEqual(fixed.calls[0].payload.members, [
    { member_number: 2, in_tag: 7 },
    { member_number: 3, in_tag: 14 }
  ], 'each member carries its own entered tag');
});

test('a batch of one: ticking a single row and confirming checks that one person in', async () => {
  const batchResult = {
    status: 'ok',
    message: 'Batch check-in complete: 1 checked in, 0 already checked in.',
    checked_in_count: 2,
    skipped_count: 0,
    results: [
      { member_number: 2, result: 'checked_in', signed_in_at: '2026-10-05T23:00:00.000Z' }
    ]
  };
  const h = makeHarness(rosterPayload(), { batchResult });
  h.setRefreshedRoster(rosterPayload({
    checked_in_count: 2,
    players: [
      { member_number: 1, name: 'Ann Archer', on_week_sheet: true, checked_in: true, signed_in_at: '2026-10-05T22:00:00.000Z', in_tag: '', current_tag: '', appearances: 9 },
      { member_number: 2, name: 'Bo Bell', on_week_sheet: true, checked_in: true, signed_in_at: '2026-10-05T23:00:00.000Z', in_tag: '', current_tag: '', appearances: 4 },
      { member_number: 3, name: 'Cy Cole', on_week_sheet: false, checked_in: false, signed_in_at: '', in_tag: '', current_tag: '', appearances: 0 }
    ]
  }));

  h.ui.toggleCheckInPick('2', true);
  await h.ui.adminCheckInSelected();

  assert.deepStrictEqual(h.calls.map((c) => c.action), ['adminCheckInBatch', 'getAdminCheckInRoster']);
  assert.deepStrictEqual(h.calls[0].payload.members, [{ member_number: 2 }],
    'a ticked row of one still travels the batch path with a single member');
  assert.strictEqual(h.ui.getSelection().size, 0);
  assert.match(h.elements.checkInPanel.innerHTML, /2 checked in/);
  assert.ok(h.buttons.every((b) => !b.disabled));
});

test('the card renders no per-row check-in button anywhere: the footer batch action is the only one', () => {
  const h = makeHarness(rosterPayload());
  const panel = h.elements.checkInPanel.innerHTML;
  // Rows: checked-in shows Undo, pending shows the tick - never a check-in button.
  assert.doesNotMatch(panel, /onclick="adminCheckIn\('/, 'no row wires a single check-in');
  assert.doesNotMatch(panel, />Check in</, 'no per-row "Check in" label exists');
  // The only check-in control is the footer button, after the list.
  const listEnd = panel.indexOf('</ul>');
  assert.notEqual(listEnd, -1, 'the roster list renders');
  const footer = panel.slice(listEnd);
  assert.match(footer, /id="btnCheckInSelected"/);
  assert.match(footer, /onclick="adminCheckInSelected\(\)"/);
  assert.match(footer, /Check in selected/);
});
