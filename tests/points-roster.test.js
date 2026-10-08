'use strict';

// Doubles Points panel roster operations — pair-grouped roster, pre-confirm
// re-key, void-a-row, and the finalized-week unlock. These exercise the same
// in-memory Sheets fake as the lifecycle tests: no Google credentials, network
// access, or live sheet writes are involved.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

const WEEK_DATE = '2026-10-05';

function makeWeekRow(h, fields) {
  const headers = h.bound.WEEKLY_RECORD_HEADERS_DOUBLES;
  const row = new Array(headers.length).fill('');
  for (const key in fields) {
    const index = headers.indexOf(key);
    if (index !== -1) row[index] = fields[key];
  }
  return row;
}

function buildDoubles(h, weeks, clubRows) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  (clubRows || [
    [1, 'Ann', 'ann', '', '', true, '', ''],
    [2, 'Bob', 'bob', '', '', true, '', ''],
    [3, 'Cid', 'cid', '', '', true, '', ''],
    [4, 'Dee', 'dee', '', '', true, '', '']
  ]).forEach((row) => club.appendRow(row));

  const weekSheets = {};
  Object.keys(weeks || {}).forEach((date) => {
    const week = doubles.insertSheet('Week ' + date);
    week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
    (weeks[date] || []).forEach((row) => week.appendRow(row));
    weekSheets[date] = week;
  });

  return { doubles, club, weekSheets };
}

// A week with two pairs (p1, p2) and one solo (blank key).
function sampleWeek(h) {
  return [
    makeWeekRow(h, { member_number: 1, player_name_snapshot: 'Ann', pair_key: 'p1', partner_member_number: 2, team_position: '1', team_position_raw: 1, weekly_points: '', weekly_points_status: 'pending' }),
    makeWeekRow(h, { member_number: 2, player_name_snapshot: 'Bob', pair_key: 'p1', partner_member_number: 1, team_position: '1', team_position_raw: 1, weekly_points: '', weekly_points_status: 'pending' }),
    makeWeekRow(h, { member_number: 3, player_name_snapshot: 'Cid', pair_key: 'p2', partner_member_number: 4, team_position: '2', team_position_raw: 2, weekly_points: '', weekly_points_status: 'pending' }),
    makeWeekRow(h, { member_number: 4, player_name_snapshot: 'Dee', pair_key: 'p2', partner_member_number: 3, team_position: '2', team_position_raw: 2, weekly_points: '', weekly_points_status: 'pending' })
  ];
}

function call(h, handler, extra) {
  const payload = {
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: WEEK_DATE
  };
  if (extra) Object.assign(payload, extra);
  return h.parse(h.fn(handler)(payload));
}

function column(sheet, header) {
  const index = sheet.rows[0].indexOf(header);
  return sheet.rows.slice(1).map((row) => row[index]);
}

function rowByMember(sheet, memberNumber) {
  const memberIndex = sheet.rows[0].indexOf('member_number');
  return sheet.rows.slice(1).find((row) => row[memberIndex] === memberNumber);
}

function pairByKey(result, key) {
  return (result.pairs || []).find((pair) => pair.pair_key === key);
}

// ─── Roster grouping + results shape ─────────────────────────────────────────

test('calculatePoints groups the roster by pair_key with pair/place/points/status', () => {
  const h = loadCode();
  buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });

  const result = call(h, 'handleCalculatePoints');
  assert.equal(result.status, 'ok');
  assert.equal(result.week_state, 'preview');
  assert.equal(result.pairs.length, 2, 'one pair per pair_key');

  const p1 = pairByKey(result, 'p1');
  assert.equal(p1.label, 'Ann / Bob');
  assert.equal(p1.place, '1');
  assert.equal(p1.points, 2);
  assert.equal(p1.status, 'preview');
  assert.equal(p1.members.length, 2);
  assert.deepEqual(p1.members.map((m) => m.member_number), [1, 2]);
  assert.deepEqual(p1.members.map((m) => m.points), [2, 2]);

  const p2 = pairByKey(result, 'p2');
  assert.equal(p2.place, '2');
  assert.equal(p2.points, 1.5);
});

test('calculatePoints groups a keyless solo as its own pair', () => {
  const h = loadCode();
  buildDoubles(h, { [WEEK_DATE]: [
    makeWeekRow(h, { member_number: 1, player_name_snapshot: 'Ann', pair_key: 'p1', team_position: '1', team_position_raw: 1, weekly_points: '', weekly_points_status: 'pending' }),
    makeWeekRow(h, { member_number: 2, player_name_snapshot: 'Bob', pair_key: 'p1', team_position: '1', team_position_raw: 1, weekly_points: '', weekly_points_status: 'pending' }),
    makeWeekRow(h, { member_number: 9, player_name_snapshot: 'Ivy', pair_key: '', team_position: '3', team_position_raw: 3, weekly_points: '', weekly_points_status: 'pending' })
  ] });

  const result = call(h, 'handleCalculatePoints');
  assert.equal(result.pairs.length, 2);
  const solo = result.pairs.find((pair) => pair.pair_key === '');
  assert.equal(solo.label, 'Ivy');
  assert.equal(solo.members.length, 1);
  assert.equal(solo.points, 1, 'a solo earns the full team value');
});

test('groupDoublesPointsPairs reports a voided pair as 0 points and voided status', () => {
  const h = loadCode();
  buildDoubles(h, { [WEEK_DATE]: [
    makeWeekRow(h, { member_number: 1, player_name_snapshot: 'Ann', pair_key: 'p1', team_position: '1', team_position_raw: 1, weekly_points: 0, weekly_points_status: 'voided' }),
    makeWeekRow(h, { member_number: 2, player_name_snapshot: 'Bob', pair_key: 'p1', team_position: '1', team_position_raw: 1, weekly_points: 0, weekly_points_status: 'voided' })
  ] });

  const result = call(h, 'handleCalculatePoints');
  const p1 = pairByKey(result, 'p1');
  assert.equal(p1.points, 0);
  assert.equal(p1.status, 'voided');
  assert.equal(p1.voided, true);
  assert.equal(result.summary.voided, 2);
  assert.equal(result.summary.warnings, 0, 'a voided row is not a blank-position warning');
});

// ─── Re-key (pre-confirm) ────────────────────────────────────────────────────

test('rekeyPoints renames a pair before confirmation and keeps the grouping stable', () => {
  const h = loadCode();
  const { weekSheets } = buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });
  const week = weekSheets[WEEK_DATE];

  const result = call(h, 'handleRekeyPoints', { pair_key: 'p1', new_pair_key: 'pair-A' });
  assert.equal(result.status, 'ok');
  assert.equal(result.week_state, 'preview');
  assert.equal(result.changed, 2);

  assert.deepEqual(column(week, 'pair_key'), ['pair-A', 'pair-A', 'p2', 'p2']);
  const group = pairByKey(result, 'pair-A');
  assert.equal(group.members.length, 2);
  assert.equal(group.points, 2);
  assert.equal(pairByKey(result, 'p1'), undefined, 'the old key no longer groups');
  assert.equal(rowByMember(week, 1)[week.rows[0].indexOf('partner_member_number')], 2);
  assert.equal(rowByMember(week, 2)[week.rows[0].indexOf('partner_member_number')], 1);
});

test('rekeyPoints moves one player between pairs before confirmation', () => {
  const h = loadCode();
  const { weekSheets } = buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });
  const week = weekSheets[WEEK_DATE];

  const result = call(h, 'handleRekeyPoints', { member_number: 4, new_pair_key: 'p1' });
  assert.equal(result.status, 'ok');

  assert.deepEqual(column(week, 'pair_key'), ['p1', 'p1', 'p2', 'p1']);
  const p1 = pairByKey(result, 'p1');
  assert.equal(p1.members.length, 3, 'the moved player joined the target pair');
  assert.equal(p1.points, 2, 'the pair keeps the leading team score');
  // A three-member group has no single partner, so the convenience column is
  // cleared for the moved row rather than left stale.
  assert.equal(rowByMember(week, 4)[week.rows[0].indexOf('partner_member_number')], '');
});

test('rekeyPoints is refused after confirmation without touching the sheet', () => {
  const h = loadCode();
  const { weekSheets } = buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });
  const week = weekSheets[WEEK_DATE];

  call(h, 'handleConfirmPoints');
  const before = column(week, 'pair_key').slice();

  const result = call(h, 'handleRekeyPoints', { pair_key: 'p1', new_pair_key: 'pair-A' });
  assert.equal(result.status, 'error');
  assert.match(result.message, /before confirmation/i);
  assert.deepEqual(column(week, 'pair_key'), before, 'a confirmed week is not re-keyed');
});

test('rekeyPoints rejects blank, formula, and oversized keys', () => {
  const h = loadCode();
  buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });

  for (const bad of ['', '   ', '=SUM(A1:A2)', '+1', '-x', '@x', 'x'.repeat(h.bound.DOUBLES_PAIR_KEY_MAX_LENGTH + 1)]) {
    const result = call(h, 'handleRekeyPoints', { pair_key: 'p1', new_pair_key: bad });
    assert.equal(result.status, 'error', JSON.stringify(bad) + ' must be rejected');
  }
});

test('rekeyPoints refuses to merge a renamed pair into another existing pair', () => {
  const h = loadCode();
  const { weekSheets } = buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });
  const week = weekSheets[WEEK_DATE];

  const result = call(h, 'handleRekeyPoints', { pair_key: 'p1', new_pair_key: 'p2' });
  assert.equal(result.status, 'error');
  assert.match(result.message, /already in use/i);
  assert.deepEqual(column(week, 'pair_key'), ['p1', 'p1', 'p2', 'p2']);
});

// ─── Void (pre-confirm) ──────────────────────────────────────────────────────

test('voidPoints zeroes a pair, marks it voided, and excludes it from the season total', () => {
  const h = loadCode();
  const { club, weekSheets } = buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });
  const week = weekSheets[WEEK_DATE];

  const result = call(h, 'handleVoidPoints', { pair_key: 'p1' });
  assert.equal(result.status, 'ok');
  assert.equal(result.week_state, 'preview');
  assert.equal(result.changed, 2);

  assert.deepEqual(column(week, 'weekly_points'), [0, 0, '', '']);
  assert.deepEqual(column(week, 'weekly_points_status'), ['voided', 'voided', 'pending', 'pending']);
  assert.equal(result.summary.voided, 2);

  const p1 = pairByKey(result, 'p1');
  assert.equal(p1.points, 0);
  assert.equal(p1.status, 'voided');
  assert.equal(p1.voided, true);

  // Confirming keeps the voided rows voided; the season cache never counts them.
  call(h, 'handleConfirmPoints');
  assert.deepEqual(column(week, 'weekly_points_status'), ['voided', 'voided', 'confirmed', 'confirmed']);
  const seasonCol = club.rows[0].indexOf('season_points');
  assert.equal(rowByMember(club, 1)[seasonCol], 0, 'voided member earns no season points');
  assert.equal(rowByMember(club, 2)[seasonCol], 0);
  assert.equal(rowByMember(club, 3)[seasonCol], 1.5);
});

test('voidPoints can be undone back to pending before confirmation', () => {
  const h = loadCode();
  const { weekSheets } = buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });
  const week = weekSheets[WEEK_DATE];

  call(h, 'handleVoidPoints', { pair_key: 'p1' });
  const result = call(h, 'handleVoidPoints', { pair_key: 'p1', voided: false });
  assert.equal(result.status, 'ok');

  assert.deepEqual(column(week, 'weekly_points_status'), ['pending', 'pending', 'pending', 'pending']);
  assert.deepEqual(column(week, 'weekly_points'), ['', '', '', '']);
  assert.equal(pairByKey(result, 'p1').points, 2);
});

test('voidPoints is refused after confirmation without touching the sheet', () => {
  const h = loadCode();
  const { weekSheets } = buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });
  const week = weekSheets[WEEK_DATE];

  call(h, 'handleConfirmPoints');
  const before = column(week, 'weekly_points_status').slice();

  const result = call(h, 'handleVoidPoints', { pair_key: 'p1' });
  assert.equal(result.status, 'error');
  assert.match(result.message, /before confirmation/i);
  assert.deepEqual(column(week, 'weekly_points_status'), before);
});

test('voiding a blank-position row drops its showing-up warning', () => {
  const h = loadCode();
  const week = [
    makeWeekRow(h, { member_number: 1, player_name_snapshot: 'Ann', pair_key: 'p1', team_position: '', team_position_raw: '', weekly_points: '', weekly_points_status: 'pending' })
  ];
  buildDoubles(h, { [WEEK_DATE]: week });

  const before = call(h, 'handleCalculatePoints');
  assert.equal(before.summary.warnings, 1);

  const after = call(h, 'handleVoidPoints', { member_number: 1 });
  assert.equal(after.summary.warnings, 0);
});

// ─── Unlock (finalized only) ─────────────────────────────────────────────────

test('unlockPoints reopens a finalized week to confirmed and allows re-confirmation', () => {
  const h = loadCode();
  const { weekSheets } = buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });
  const week = weekSheets[WEEK_DATE];

  call(h, 'handleConfirmPoints');
  call(h, 'handleFinalizePoints');
  assert.ok(column(week, 'weekly_points_status').every((s) => s === 'finalized'));

  const result = call(h, 'handleUnlockPoints');
  assert.equal(result.status, 'ok');
  assert.equal(result.week_state, 'confirmed');
  assert.equal(result.players_unlocked, 4);
  assert.ok(column(week, 'weekly_points_status').every((s) => s === 'confirmed'));

  const reconfirm = call(h, 'handleConfirmPoints');
  assert.equal(reconfirm.status, 'ok', 'a re-confirm is allowed after unlock');
});

test('unlockPoints is refused when the week is not finalized', () => {
  const h = loadCode();
  buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });

  const preview = call(h, 'handleUnlockPoints');
  assert.equal(preview.status, 'error');
  assert.match(preview.message, /not finalized/i);

  call(h, 'handleConfirmPoints');
  const confirmed = call(h, 'handleUnlockPoints');
  assert.equal(confirmed.status, 'error');
  assert.match(confirmed.message, /not finalized/i);
});

// ─── Gating + tag isolation ──────────────────────────────────────────────────

test('roster mutations refuse the singles format before opening a sheet', () => {
  for (const action of ['handleRekeyPoints', 'handleVoidPoints', 'handleUnlockPoints']) {
    const h = loadCode();
    const result = h.parse(h.fn(action)({
      league_date: WEEK_DATE,
      spreadsheetId: h.bound.SPREADSHEET_ID,
      pair_key: 'p1',
      new_pair_key: 'pair-A'
    }));

    assert.equal(result.status, 'error', action + ' should refuse singles');
    assert.match(result.message, /doubles/i);
    assert.deepEqual(h.openByIdCalls, [], action + ' must not open the singles spreadsheet');
  }
});

test('the roster operations never touch tag state', () => {
  const h = loadCode();
  const week = [
    makeWeekRow(h, { member_number: 1, player_name_snapshot: 'Ann', pair_key: 'p1', team_position: '1', team_position_raw: 1, in_tag: '', out_tag: '', weekly_points: '', weekly_points_status: 'pending' }),
    makeWeekRow(h, { member_number: 2, player_name_snapshot: 'Bob', pair_key: 'p1', team_position: '1', team_position_raw: 1, in_tag: '', out_tag: '', weekly_points: '', weekly_points_status: 'pending' })
  ];
  const { weekSheets } = buildDoubles(h, { [WEEK_DATE]: week });
  const sheet = weekSheets[WEEK_DATE];

  call(h, 'handleRekeyPoints', { pair_key: 'p1', new_pair_key: 'pair-A' });
  call(h, 'handleVoidPoints', { pair_key: 'pair-A' });
  call(h, 'handleCalculatePoints');
  call(h, 'handleConfirmPoints');
  call(h, 'handleFinalizePoints');
  call(h, 'handleUnlockPoints');

  assert.deepEqual(column(sheet, 'in_tag'), ['', '']);
  assert.deepEqual(column(sheet, 'out_tag'), ['', '']);
});
