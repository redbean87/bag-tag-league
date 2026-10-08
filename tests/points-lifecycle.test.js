'use strict';

// Doubles points lifecycle — scoring rule, format gating, write-free preview,
// re-runnable confirmation, idempotent finalization, season_points cache, and
// end-to-end calculate -> confirm -> finalize.
//
// All tests run in a Node VM with an in-memory Sheets fake. No Google
// credentials, network access, or live sheet writes are involved.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

const WEEK_DATE = '2026-10-05';
const WEEK_TWO = '2026-10-12';

function headersOf(h) {
  return h.bound.WEEKLY_RECORD_HEADERS_DOUBLES;
}

function makeWeekRow(h, fields) {
  const headers = headersOf(h);
  const row = new Array(headers.length).fill('');
  for (const key in fields) {
    const index = headers.indexOf(key);
    if (index !== -1) row[index] = fields[key];
  }
  return row;
}

/**
 * Builds a doubles spreadsheet with a roster and one or more week tabs.
 * `weeks` is { 'YYYY-MM-DD': [raw weekly rows] }.
 */
function buildDoubles(h, weeks, clubRows) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  (clubRows || [
    [1, 'Ann', 'ann', '', '', true, '', ''],
    [2, 'Bob', 'bob', '', '', true, '', ''],
    [3, 'Cid', 'cid', '', '', true, '', ''],
    [4, 'Dee', 'dee', '', '', true, '', ''],
    [5, 'Eve', 'eve', '', '', true, '', ''],
    [6, 'Fay', 'fay', '', '', true, '', ''],
    [7, 'Gus', 'gus', '', '', true, '', ''],
    [8, 'Hal', 'hal', '', '', true, '', ''],
    [9, 'Ivy', 'ivy', '', '', true, '', ''],
    [10, 'Jon', 'jon', '', '', true, '', '']
  ]).forEach((row) => club.appendRow(row));

  const weekSheets = {};
  Object.keys(weeks || {}).forEach((date) => {
    const week = doubles.insertSheet('Week ' + date);
    week.appendRow(headersOf(h));
    (weeks[date] || []).forEach((row) => week.appendRow(row));
    weekSheets[date] = week;
  });

  return { doubles, club, weekSheets };
}

function call(h, action, extra) {
  const payload = {
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: WEEK_DATE
  };
  if (extra) Object.assign(payload, extra);
  return h.parse(h.fn(action)(payload));
}

function column(sheet, header) {
  const index = sheet.rows[0].indexOf(header);
  return sheet.rows.slice(1).map((row) => row[index]);
}

function rowByMember(sheet, memberNumber) {
  const memberIndex = sheet.rows[0].indexOf('member_number');
  return sheet.rows.slice(1).find((row) => row[memberIndex] === memberNumber);
}

// A representative week: a 1st, a 2nd, a tied 2nd, a 4th, a solo 3rd, and a
// blank-position participant. Seven rows model three pairs + two solos.
function sampleWeek(h) {
  return [
    makeWeekRow(h, { member_number: 1, player_name_snapshot: 'Ann', pair_key: 'p1', team_position: '1', team_position_raw: 1, weekly_points: '', weekly_points_status: 'pending' }),
    makeWeekRow(h, { member_number: 2, player_name_snapshot: 'Bob', pair_key: 'p1', team_position: '1', team_position_raw: 1, weekly_points: '', weekly_points_status: 'pending' }),
    makeWeekRow(h, { member_number: 3, player_name_snapshot: 'Cid', pair_key: 'p2', team_position: '2', team_position_raw: 2, weekly_points: '', weekly_points_status: 'pending' }),
    makeWeekRow(h, { member_number: 4, player_name_snapshot: 'Dee', pair_key: 'p2', team_position: '2', team_position_raw: 2, weekly_points: '', weekly_points_status: 'pending' }),
    makeWeekRow(h, { member_number: 5, player_name_snapshot: 'Eve', pair_key: 'p3', team_position: 'T2', team_position_raw: 2, weekly_points: '', weekly_points_status: 'pending' }),
    makeWeekRow(h, { member_number: 6, player_name_snapshot: 'Fay', pair_key: 'p3', team_position: 'T2', team_position_raw: 2, weekly_points: '', weekly_points_status: 'pending' }),
    makeWeekRow(h, { member_number: 7, player_name_snapshot: 'Gus', pair_key: 'p4', team_position: '4', team_position_raw: 4, weekly_points: '', weekly_points_status: 'pending' }),
    makeWeekRow(h, { member_number: 8, player_name_snapshot: 'Hal', pair_key: 'p4', team_position: '4', team_position_raw: 4, weekly_points: '', weekly_points_status: 'pending' }),
    makeWeekRow(h, { member_number: 9, player_name_snapshot: 'Ivy', pair_key: '', team_position: '', team_position_raw: '', weekly_points: '', weekly_points_status: 'pending' }),
    makeWeekRow(h, { member_number: 10, player_name_snapshot: 'Jon', pair_key: '', team_position: '3', team_position_raw: 3, weekly_points: '', weekly_points_status: 'pending' })
  ];
}

// ─── Scoring matrix (pure) ───────────────────────────────────────────────────

test('doublesPointsForPosition implements 1st/2nd/3rd/participation', () => {
  const h = loadCode();
  const points = h.fn('doublesPointsForPosition');

  assert.equal(points(1), 2);
  assert.equal(points(2), 1.5);
  assert.equal(points(3), 1);
  assert.equal(points(4), 0.5);
  assert.equal(points(10), 0.5);
  assert.equal(points(''), 0.5, 'blank placement is showing-up credit');
  assert.equal(points(null), 0.5);
  assert.equal(points(undefined), 0.5);
  assert.equal(points('T2'), 0.5, 'a non-numeric placement falls back to participation');
});

// ─── Preview (write-free) ────────────────────────────────────────────────────

test('calculatePoints scores each row, pairs identically, and flags blanks', () => {
  const h = loadCode();
  const { weekSheets } = buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });

  const result = call(h, 'handleCalculatePoints');
  assert.equal(result.status, 'ok');
  assert.equal(result.writes, false);

  const byMember = {};
  result.players.forEach((p) => { byMember[p.member_number] = p; });

  assert.equal(byMember[1].points, 2);
  assert.equal(byMember[2].points, 2, 'both 1st-place partners receive 2');
  assert.equal(byMember[3].points, 1.5);
  assert.equal(byMember[4].points, 1.5, 'both 2nd-place partners receive 1.5');
  assert.equal(byMember[5].points, 1.5, 'a tied 2nd keeps the 2nd-place value');
  assert.equal(byMember[6].points, 1.5);
  assert.equal(byMember[7].points, 0.5, '4th is showing-up credit');
  assert.equal(byMember[10].points, 1, 'a solo earns the full 3rd-place value');
  assert.equal(byMember[9].points, 0.5, 'a blank placement earns 0.5');
  assert.equal(byMember[9].has_position, false);
  assert.equal(byMember[9].warning !== null, true, 'a blank placement is flagged');

  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].member_number, 9);
  assert.equal(result.warnings[0].code, 'blank_position');

  assert.equal(result.summary.total_rows, 10);
  assert.equal(result.summary.warnings, 1);
});

test('calculatePoints never writes points or status', () => {
  const h = loadCode();
  const { weekSheets } = buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });
  const week = weekSheets[WEEK_DATE];

  call(h, 'handleCalculatePoints');

  assert.deepEqual(column(week, 'weekly_points'), new Array(10).fill(''));
  assert.deepEqual(column(week, 'weekly_points_status'), new Array(10).fill('pending'));
});

// ─── Format gating ───────────────────────────────────────────────────────────

test('points handlers refuse the singles format before opening a sheet', () => {
  for (const action of ['handleCalculatePoints', 'handleConfirmPoints', 'handleFinalizePoints']) {
    const h = loadCode();
    const result = h.parse(h.fn(action)({
      league_date: WEEK_DATE,
      spreadsheetId: h.bound.SPREADSHEET_ID
    }));

    assert.equal(result.status, 'error', action + ' should refuse singles');
    assert.match(result.message, /doubles/i, action + ' should name the doubles league');
    assert.deepEqual(h.openByIdCalls, [], action + ' must not open the singles spreadsheet');
  }
});

test('tag handlers still refuse doubles while points handlers accept it', () => {
  const h = loadCode();
  buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });

  const tag = h.parse(h.fn('handleCalculateTags')({
    league_date: WEEK_DATE,
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES
  }));
  assert.equal(tag.status, 'error');

  const points = call(h, 'handleCalculatePoints');
  assert.equal(points.status, 'ok');
});

// ─── Confirmation ────────────────────────────────────────────────────────────

test('confirmPoints writes weekly points and marks rows confirmed', () => {
  const h = loadCode();
  const { weekSheets } = buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });
  const week = weekSheets[WEEK_DATE];

  const result = call(h, 'handleConfirmPoints');
  assert.equal(result.status, 'ok');
  assert.equal(result.players_updated, 10);

  assert.deepEqual(column(week, 'weekly_points'), [2, 2, 1.5, 1.5, 1.5, 1.5, 0.5, 0.5, 0.5, 1]);
  assert.deepEqual(column(week, 'weekly_points_status'), new Array(10).fill('confirmed'));
});

test('confirmPoints is re-runnable before finalization without double counting', () => {
  const h = loadCode();
  const { weekSheets } = buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });
  const week = weekSheets[WEEK_DATE];

  call(h, 'handleConfirmPoints');
  const first = column(week, 'weekly_points').slice();

  // A stale write that a naive increment would build on.
  const pointsIndex = week.rows[0].indexOf('weekly_points');
  week.rows[1][pointsIndex] = 99;

  const second = call(h, 'handleConfirmPoints');
  assert.equal(second.status, 'ok');
  assert.deepEqual(column(week, 'weekly_points'), first, 're-confirm reconciles, never accumulates');
  assert.deepEqual(column(week, 'weekly_points_status'), new Array(10).fill('confirmed'));
});

test('confirmPoints refuses a finalized week before any write', () => {
  const h = loadCode();
  const { weekSheets } = buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });
  const week = weekSheets[WEEK_DATE];

  call(h, 'handleConfirmPoints');
  call(h, 'handleFinalizePoints');

  const before = column(week, 'weekly_points').slice();
  const result = call(h, 'handleConfirmPoints');
  assert.equal(result.status, 'error');
  assert.match(result.message, /finalized/i);
  assert.deepEqual(column(week, 'weekly_points'), before, 'a finalized week is not rewritten');
});

// ─── Finalization + season cache ─────────────────────────────────────────────

test('finalizePoints requires confirmation first', () => {
  const h = loadCode();
  buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });

  const result = call(h, 'handleFinalizePoints');
  assert.equal(result.status, 'error');
  assert.match(result.message, /confirm/i);
});

test('finalizePoints marks the week finalized and fills the season cache', () => {
  const h = loadCode();
  const { club, weekSheets } = buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });
  const week = weekSheets[WEEK_DATE];

  call(h, 'handleConfirmPoints');
  const result = call(h, 'handleFinalizePoints');
  assert.equal(result.status, 'ok');

  assert.deepEqual(column(week, 'weekly_points_status'), new Array(10).fill('finalized'));
  assert.equal(result.season_points_updated, 10);

  assert.equal(rowByMember(club, 1)[club.rows[0].indexOf('season_points')], 2);
  assert.equal(rowByMember(club, 3)[club.rows[0].indexOf('season_points')], 1.5);
  assert.equal(rowByMember(club, 7)[club.rows[0].indexOf('season_points')], 0.5);
  assert.equal(rowByMember(club, 9)[club.rows[0].indexOf('season_points')], 0.5);
  assert.equal(rowByMember(club, 10)[club.rows[0].indexOf('season_points')], 1);

  // The doubles topology report accepts the roster with or without the
  // optional season_points cache column.
  assert.equal(
    h.fn('clubMemberHeadersMatch')(h.bound.CLUB_MEMBER_HEADERS, 'doubles'),
    true
  );
  assert.equal(
    h.fn('clubMemberHeadersMatch')(h.bound.CLUB_MEMBER_HEADERS_DOUBLES, 'doubles'),
    true
  );
  assert.equal(
    h.fn('clubMemberHeadersMatch')(h.bound.CLUB_MEMBER_HEADERS_DOUBLES, 'singles'),
    false,
    'singles never grows a season_points column'
  );
});

test('re-finalizing is idempotent and does not corrupt cached totals', () => {
  const h = loadCode();
  const { club, weekSheets } = buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });
  const week = weekSheets[WEEK_DATE];

  call(h, 'handleConfirmPoints');
  call(h, 'handleFinalizePoints');
  const firstTotals = column(club, 'season_points').slice();

  const second = call(h, 'handleFinalizePoints');
  assert.equal(second.status, 'ok');
  assert.deepEqual(column(club, 'season_points'), firstTotals, 'season cache stays stable');
  assert.deepEqual(column(week, 'weekly_points_status'), new Array(10).fill('finalized'));
});

test('season cache sums finalized weeks across the season', () => {
  const h = loadCode();
  const weekOne = [
    makeWeekRow(h, { member_number: 1, player_name_snapshot: 'Ann', pair_key: 'p1', team_position: '1', team_position_raw: 1, weekly_points: '', weekly_points_status: 'pending' }),
    makeWeekRow(h, { member_number: 2, player_name_snapshot: 'Bob', pair_key: 'p1', team_position: '1', team_position_raw: 1, weekly_points: '', weekly_points_status: 'pending' })
  ];
  const weekTwo = [
    makeWeekRow(h, { member_number: 1, player_name_snapshot: 'Ann', pair_key: 'p2', team_position: '2', team_position_raw: 2, weekly_points: '', weekly_points_status: 'pending' }),
    makeWeekRow(h, { member_number: 2, player_name_snapshot: 'Bob', pair_key: 'p2', team_position: '3', team_position_raw: 3, weekly_points: '', weekly_points_status: 'pending' })
  ];
  const { club } = buildDoubles(h, { [WEEK_DATE]: weekOne, [WEEK_TWO]: weekTwo });

  call(h, 'handleConfirmPoints');
  call(h, 'handleFinalizePoints');
  assert.equal(rowByMember(club, 1)[club.rows[0].indexOf('season_points')], 2);
  assert.equal(rowByMember(club, 2)[club.rows[0].indexOf('season_points')], 2);

  call(h, 'handleConfirmPoints', { league_date: WEEK_TWO });
  call(h, 'handleFinalizePoints', { league_date: WEEK_TWO });

  assert.equal(rowByMember(club, 1)[club.rows[0].indexOf('season_points')], 2 + 1.5);
  assert.equal(rowByMember(club, 2)[club.rows[0].indexOf('season_points')], 2 + 1);
});

// ─── Tag isolation ───────────────────────────────────────────────────────────

test('the points chain never touches tag state', () => {
  const h = loadCode();
  const clubRows = [
    [1, 'Ann', 'ann', '', 5, true, '', ''],
    [2, 'Bob', 'bob', '', 9, true, '', '']
  ];
  const week = [
    makeWeekRow(h, { member_number: 1, player_name_snapshot: 'Ann', pair_key: 'p1', team_position: '1', team_position_raw: 1, in_tag: '', out_tag: '', weekly_points: '', weekly_points_status: 'pending' }),
    makeWeekRow(h, { member_number: 2, player_name_snapshot: 'Bob', pair_key: 'p1', team_position: '1', team_position_raw: 1, in_tag: '', out_tag: '', weekly_points: '', weekly_points_status: 'pending' })
  ];
  const { club, weekSheets } = buildDoubles(h, { [WEEK_DATE]: week }, clubRows);
  const sheet = weekSheets[WEEK_DATE];

  call(h, 'handleCalculatePoints');
  call(h, 'handleConfirmPoints');
  call(h, 'handleFinalizePoints');

  assert.deepEqual(column(sheet, 'in_tag'), ['', '']);
  assert.deepEqual(column(sheet, 'out_tag'), ['', '']);
  assert.equal(rowByMember(club, 1)[club.rows[0].indexOf('current_tag')], 5);
  assert.equal(rowByMember(club, 2)[club.rows[0].indexOf('current_tag')], 9);
});

// ─── End-to-end lifecycle ────────────────────────────────────────────────────

test('full lifecycle: preview -> confirm -> re-confirm -> finalize -> re-finalize', () => {
  const h = loadCode();
  const { club, weekSheets } = buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });
  const week = weekSheets[WEEK_DATE];
  const pointsCol = week.rows[0].indexOf('weekly_points');
  const statusCol = week.rows[0].indexOf('weekly_points_status');

  // 1. Preview: no writes, points plus warnings.
  const preview = call(h, 'handleCalculatePoints');
  assert.equal(preview.status, 'ok');
  assert.equal(preview.players.length, 10);
  assert.equal(preview.warnings.length, 1);
  assert.ok(week.rows.slice(1).every((row) => row[pointsCol] === '' && row[statusCol] === 'pending'));

  // 2. Confirm: weekly points + confirmed state.
  const confirmOne = call(h, 'handleConfirmPoints');
  assert.equal(confirmOne.players_updated, 10);
  assert.ok(week.rows.slice(1).every((row) => row[statusCol] === 'confirmed'));

  // 3. Re-confirm: no duplication.
  const snapshot = week.rows.slice(1).map((row) => row[pointsCol]);
  const confirmTwo = call(h, 'handleConfirmPoints');
  assert.equal(confirmTwo.status, 'ok');
  assert.deepEqual(week.rows.slice(1).map((row) => row[pointsCol]), snapshot);

  // 4. Finalize: finalized state + season cache.
  const finalizeOne = call(h, 'handleFinalizePoints');
  assert.equal(finalizeOne.status, 'ok');
  assert.ok(week.rows.slice(1).every((row) => row[statusCol] === 'finalized'));
  const season = column(club, 'season_points').slice();

  // 5. Re-finalize: stable cache.
  const finalizeTwo = call(h, 'handleFinalizePoints');
  assert.equal(finalizeTwo.status, 'ok');
  assert.deepEqual(column(club, 'season_points'), season);

  // 6. Tags untouched.
  assert.deepEqual(column(week, 'in_tag'), new Array(10).fill(''));
  assert.deepEqual(column(week, 'out_tag'), new Array(10).fill(''));
});
