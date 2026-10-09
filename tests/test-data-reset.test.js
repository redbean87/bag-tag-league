'use strict';

// Guarded test-data reset — the worker's wipe path for the doubles test
// spreadsheet. The action clears weekly data rows (and, in `full` scope, the
// roster) down to the header-only minimum. It is behind the league allow-list:
// the target is resolved through the registry and then required to be on the
// test-spreadsheet allow-list, so live Singles and any non-test spreadsheet
// are refused before a row is read or written. All behavior runs in a Node VM
// with an in-memory Sheets fake: no Google credentials, network access, or
// live sheet writes.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadCode, REPO_ROOT } = require('./helpers/load-code');

const WEEK_DATE = '2026-10-05';

function valueByName(h, sheet, header, rowIndex) {
  const headers = h.fn('getSheetHeaders')(sheet);
  return sheet.rows[rowIndex][headers.indexOf(header)];
}

/** Builds a provisioned doubles test spreadsheet with two week tabs of data. */
function buildDoubles(h) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const league = doubles.insertSheet('League');
  league.appendRow(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
  const leagueRow = new Array(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.length).fill('');
  leagueRow[h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.indexOf('league_format')] = h.bound.LEAGUE_FORMAT_DOUBLES;
  leagueRow[h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.indexOf('scoring')] = h.bound.SCORING_POINTS;
  league.appendRow(leagueRow);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  club.appendRow([3, 'Damon', 'damon31', '151236', true, 't', 't', 2]);
  club.appendRow([7, 'Robin', 'robin', '222', true, 't', 't', 5]);

  const template = doubles.insertSheet('Week template');
  template.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);

  const week = doubles.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES.map((header) => 'v_' + header));
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES.map((header) => 'w_' + header));

  return { doubles, league, club, template, week };
}

/** Builds the live Singles spreadsheet, which must never be reset. */
function buildSingles(h) {
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const club = singles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  club.appendRow([1, 'Alice', 'alice', '', 42, true, 't', 't']);
  const week = singles.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS.map((header) => 'v_' + header));
  return { singles, club, week };
}

function snapshot(spreadsheet) {
  return JSON.stringify(
    spreadsheet.getSheets().map((sheet) => ({
      name: sheet.getName(),
      rows: JSON.parse(JSON.stringify(sheet.rows))
    }))
  );
}

function resultsByName(report) {
  const byName = {};
  report.results.forEach((result) => { byName[result.sheet_name] = result; });
  return byName;
}

// ─── Test-spreadsheet allow-list ─────────────────────────────────────────────

test('the test allow-list contains the doubles spreadsheet only', () => {
  const h = loadCode();

  assert.deepEqual(h.bound.TEST_SPREADSHEET_IDS, [h.bound.SPREADSHEET_ID_DOUBLES]);
  assert.equal(h.fn('isTestSpreadsheetId')(h.bound.SPREADSHEET_ID_DOUBLES), true);
  assert.equal(h.fn('isTestSpreadsheetId')(h.bound.SPREADSHEET_ID), false);
  assert.equal(h.fn('isTestSpreadsheetId')('some-other-sheet'), false);
});

test('the guard names live singles separately from any other non-test sheet', () => {
  const h = loadCode();

  assert.equal(h.fn('assertTestSpreadsheet')(h.bound.SPREADSHEET_ID_DOUBLES).ok, true);

  const singles = h.fn('assertTestSpreadsheet')(h.bound.SPREADSHEET_ID);
  assert.equal(singles.ok, false);
  assert.equal(singles.reason, 'live_singles');
  assert.match(singles.error, /live Singles/);

  const other = h.fn('assertTestSpreadsheet')('some-other-sheet');
  assert.equal(other.ok, false);
  assert.equal(other.reason, 'non_test');
  assert.match(other.error, /non-test spreadsheet/);
});

// ─── Pure planner ────────────────────────────────────────────────────────────

test('the weekly plan lists weekly data rows and leaves the roster alone', () => {
  const h = loadCode();
  const { doubles } = buildDoubles(h);

  const plan = h.fn('planTestDataReset')(doubles, { scope: 'weekly' });
  const byName = resultsByName(plan);

  assert.equal(plan.scope, 'weekly');
  assert.equal(byName['Week ' + WEEK_DATE].kind, 'weekly');
  assert.equal(byName['Week ' + WEEK_DATE].action, 'clear-rows');
  assert.equal(byName['Week ' + WEEK_DATE].rows_removed, 2);
  assert.equal(byName['Week ' + WEEK_DATE].rows_kept, 1);
  assert.equal(byName['Week template'].action, 'no-op');
  assert.equal(byName['ClubMembers'], undefined, 'the roster is not planned in weekly scope');
  assert.equal(byName['League'], undefined);
});

test('the full plan also returns the roster to its header-only minimum', () => {
  const h = loadCode();
  const { doubles } = buildDoubles(h);

  const plan = h.fn('planTestDataReset')(doubles, { scope: 'full' });
  const byName = resultsByName(plan);

  assert.equal(plan.scope, 'full');
  assert.equal(byName['ClubMembers'].kind, 'club_members');
  assert.equal(byName['ClubMembers'].action, 'clear-rows');
  assert.equal(byName['ClubMembers'].rows_removed, 2);
  assert.equal(byName['Week ' + WEEK_DATE].rows_removed, 2);
});

test('an empty week sheet is planned as a no-op', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const empty = doubles.insertSheet('Week 2026-10-06');
  empty.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);

  const plan = h.fn('planTestDataReset')(doubles, { scope: 'weekly' });
  const byName = resultsByName(plan);
  assert.equal(byName['Week 2026-10-06'].action, 'no-op');
  assert.equal(byName['Week 2026-10-06'].rows_removed, 0);
  assert.equal(byName['Week 2026-10-06'].rows_kept, 1);
});

// ─── Dry run ─────────────────────────────────────────────────────────────────

test('a dry run reports the exact rows and writes nothing', () => {
  const h = loadCode();
  const { doubles, club, week } = buildDoubles(h);
  const before = snapshot(doubles);

  const report = h.fn('resetTestData')(doubles, {
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    apply: false,
    scope: 'weekly'
  });

  assert.equal(report.applied, false);
  assert.equal(report.refused, false);
  assert.equal(report.weekly_rows_removed, 2);
  assert.equal(report.member_rows_removed, 0);
  assert.equal(report.total_rows_removed, 2);
  assert.equal(report.sheets_changed, 1);
  assert.equal(resultsByName(report)['Week ' + WEEK_DATE].rows_removed, 2);
  assert.equal(snapshot(doubles), before, 'a dry run must not write');
  assert.equal(h.fn('getSheetHeaders')(week).length, h.bound.WEEKLY_RECORD_HEADERS_DOUBLES.length);
  assert.equal(club.rows.length, 3);
});

test('a full dry run reports weekly and roster rows together', () => {
  const h = loadCode();
  const { doubles } = buildDoubles(h);

  const report = h.fn('resetTestData')(doubles, {
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    apply: false,
    scope: 'full'
  });

  assert.equal(report.weekly_rows_removed, 2);
  assert.equal(report.member_rows_removed, 2);
  assert.equal(report.total_rows_removed, 4);
  assert.equal(report.sheets_changed, 2);
});

// ─── Apply ───────────────────────────────────────────────────────────────────

test('weekly apply deletes weekly rows and keeps the header and the roster', () => {
  const h = loadCode();
  const { doubles, club, week, template } = buildDoubles(h);

  const report = h.fn('resetTestData')(doubles, {
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    apply: true,
    scope: 'weekly'
  });

  assert.equal(report.applied, true);
  assert.equal(report.total_rows_removed, 2);
  assert.deepEqual(h.fn('getSheetHeaders')(week), h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  assert.equal(week.rows.length, 1, 'only the header row remains');
  assert.equal(valueByName(h, week, 'score', 0), 'score');
  assert.equal(club.rows.length, 3, 'the roster is untouched in weekly scope');
  assert.equal(template.rows.length, 1);
});

test('full apply also clears the roster down to its header', () => {
  const h = loadCode();
  const { doubles, club, week } = buildDoubles(h);

  const report = h.fn('resetTestData')(doubles, {
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    apply: true,
    scope: 'full'
  });

  assert.equal(report.applied, true);
  assert.equal(report.total_rows_removed, 4);
  assert.equal(club.rows.length, 1);
  assert.deepEqual(h.fn('getSheetHeaders')(club), h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  assert.equal(week.rows.length, 1);
});

test('apply is idempotent on an already-cleared test spreadsheet', () => {
  const h = loadCode();
  const { doubles, week } = buildDoubles(h);

  h.fn('resetTestData')(doubles, {
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    apply: true,
    scope: 'full'
  });
  const before = snapshot(doubles);

  const second = h.fn('resetTestData')(doubles, {
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    apply: true,
    scope: 'full'
  });

  assert.equal(second.total_rows_removed, 0);
  assert.equal(second.sheets_changed, 0);
  assert.equal(snapshot(doubles), before);
});

// ─── Refusal paths ───────────────────────────────────────────────────────────

test('resetTestData refuses live singles and writes nothing', () => {
  const h = loadCode();
  const { singles, club, week } = buildSingles(h);
  const before = snapshot(singles);

  const report = h.fn('resetTestData')(singles, {
    spreadsheetId: h.bound.SPREADSHEET_ID,
    apply: true,
    scope: 'full'
  });

  assert.equal(report.applied, false);
  assert.equal(report.refused, true);
  assert.equal(report.reason, 'live_singles');
  assert.match(report.error, /live Singles/);
  assert.equal(snapshot(singles), before, 'live singles must never be written');
  assert.equal(club.rows.length, 2);
  assert.equal(week.rows.length, 2);
});

test('resetTestData refuses any non-test spreadsheet and writes nothing', () => {
  const h = loadCode();
  const other = h.makeSpreadsheet('some-other-sheet');
  other.insertSheet('ClubMembers').appendRow(h.bound.CLUB_MEMBER_HEADERS);
  other.insertSheet('Week ' + WEEK_DATE).appendRow(h.bound.WEEKLY_RECORD_HEADERS);
  const before = snapshot(other);

  const report = h.fn('resetTestData')(other, {
    spreadsheetId: 'some-other-sheet',
    apply: true,
    scope: 'full'
  });

  assert.equal(report.refused, true);
  assert.equal(report.reason, 'non_test');
  assert.equal(snapshot(other), before);
});

// ─── Web-app handler ─────────────────────────────────────────────────────────

test('the handler defaults to a dry run and never writes', () => {
  const h = loadCode();
  const { doubles, week } = buildDoubles(h);
  const before = snapshot(doubles);

  const result = h.parse(h.fn('handleResetTestData')({
    league: h.bound.LEAGUE_ID_DOUBLES
  }));

  assert.equal(result.status, 'ok');
  assert.equal(result.applied, false);
  assert.equal(result.total_rows_removed, 2);
  assert.equal(result.sheets_changed, 1);
  assert.equal(snapshot(doubles), before);
  assert.equal(week.rows.length, 3);
});

test('the handler applies a full reset to the doubles test spreadsheet', () => {
  const h = loadCode();
  const { doubles, club, week } = buildDoubles(h);

  const result = h.parse(h.fn('handleResetTestData')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    apply: true,
    scope: 'full'
  }));

  assert.equal(result.status, 'ok');
  assert.equal(result.applied, true);
  assert.equal(result.scope, 'full');
  assert.equal(result.total_rows_removed, 4);
  assert.equal(club.rows.length, 1);
  assert.equal(week.rows.length, 1);
});

test('the handler refuses the live singles league and writes nothing', () => {
  const h = loadCode();
  buildSingles(h);
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const before = snapshot(singles);

  const result = h.parse(h.fn('handleResetTestData')({
    league: h.bound.LEAGUE_ID_SINGLES,
    apply: true,
    scope: 'full'
  }));

  assert.equal(result.status, 'error');
  assert.equal(result.refused, true);
  assert.equal(result.reason, 'live_singles');
  assert.equal(snapshot(singles), before);
});

test('the handler resolves an unknown selector to singles and refuses', () => {
  const h = loadCode();
  buildSingles(h);
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const before = snapshot(singles);

  const result = h.parse(h.fn('handleResetTestData')({
    spreadsheetId: 'not-a-real-sheet',
    apply: true
  }));

  assert.equal(result.status, 'error');
  assert.equal(result.refused, true);
  assert.equal(snapshot(singles), before);
});

test('a doubles reset never writes the live singles spreadsheet', () => {
  const h = loadCode();
  const { doubles } = buildDoubles(h);
  const { singles } = buildSingles(h);
  const singlesBefore = snapshot(singles);

  const result = h.parse(h.fn('handleResetTestData')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    apply: true,
    scope: 'full'
  }));

  assert.equal(result.status, 'ok');
  assert.equal(snapshot(singles), singlesBefore);
  assert.equal(doubles.getSheetByName('Week ' + WEEK_DATE).rows.length, 1);
});

// ─── Admin UI wiring (structural) ────────────────────────────────────────────

test('the admin page exposes the reset only for a test league', () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');

  assert.match(html, /id="testResetCard"/);
  assert.match(html, /onclick="previewTestDataReset\(\)"/);
  assert.match(html, /onclick="applyTestDataReset\(\)"/);
  assert.match(html, /action: 'resetTestData'/);
  assert.match(html, /testResetCard\.style\.display = league && league\.test === true/);
});
