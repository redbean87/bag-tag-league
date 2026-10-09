'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

const FILES = ['scripts/Code.gs', 'scripts/ProvisionDoubles.gs'];

function loadOperator() {
  return loadCode(FILES);
}

function buildSingles(h) {
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const club = singles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  club.appendRow([3, 'Alice', 'alice', '111', 5, true, 't1', 't1']);
  club.appendRow([7, 'Bob', 'bob', '222', 9, true, 't2', 't2']);
  return singles;
}

function buildDoubles(h, id) {
  return h.makeSpreadsheet(id || h.bound.SPREADSHEET_ID_DOUBLES);
}

test('configured spreadsheet IDs default to constants', () => {
  const h = loadOperator();

  assert.equal(h.fn('getConfiguredSinglesSpreadsheetId')(), h.bound.SPREADSHEET_ID);
  assert.equal(h.fn('getConfiguredDoublesSpreadsheetId')(), h.bound.SPREADSHEET_ID_DOUBLES);
  assert.equal(
    h.fn('getConfiguredDoublesTestSpreadsheetId')(),
    h.bound.SPREADSHEET_ID_DOUBLES_TEST,
    'the reset operator path must default to the test surface, never production'
  );
});

test('configured spreadsheet IDs honor Script Properties overrides', () => {
  const h = loadOperator();

  h.setScriptProperty('SINGLES_SPREADSHEET_ID', 'custom-singles');
  h.setScriptProperty('DOUBLES_SPREADSHEET_ID', 'custom-doubles');
  h.setScriptProperty('DOUBLES_TEST_SPREADSHEET_ID', 'custom-test-doubles');

  assert.equal(h.fn('getConfiguredSinglesSpreadsheetId')(), 'custom-singles');
  assert.equal(h.fn('getConfiguredDoublesSpreadsheetId')(), 'custom-doubles');
  assert.equal(h.fn('getConfiguredDoublesTestSpreadsheetId')(), 'custom-test-doubles');
});

test('provisionDoublesSpreadsheet provisions tabs and seeds the roster', () => {
  const h = loadOperator();
  buildSingles(h);
  const doubles = buildDoubles(h);

  const summary = h.fn('provisionDoublesSpreadsheet')();

  assert.equal(summary.roster_seed.seeded, 2);
  assert.deepEqual(summary.roster_seed.seeded_member_numbers, [3, 7]);
  assert.ok(doubles.getSheetByName('League'));
  assert.ok(doubles.getSheetByName('ClubMembers'));
  assert.ok(doubles.getSheetByName('Week template'));
});

test('createDoublesWeekTab creates a doubles week sheet', () => {
  const h = loadOperator();
  buildSingles(h);
  const doubles = buildDoubles(h);

  const name = h.fn('createDoublesWeekTab')('2026-10-05');

  assert.equal(name, 'Week 2026-10-05');
  assert.deepEqual(
    h.fn('getSheetHeaders')(doubles.getSheetByName(name)),
    h.bound.WEEKLY_RECORD_HEADERS_DOUBLES
  );
});

test('verifySpreadsheetTopology reports both spreadsheets', () => {
  const h = loadOperator();
  buildSingles(h);
  const doubles = buildDoubles(h);
  h.fn('provisionDoublesSpreadsheet')();
  h.fn('createDoublesWeekTab')('2026-10-05');

  const report = h.fn('verifySpreadsheetTopology')();

  assert.equal(report.doubles.league.headers_match, true);
  assert.equal(report.doubles.league.league_format, h.bound.LEAGUE_FORMAT_DOUBLES);
  assert.equal(report.doubles.week_template.headers_match, true);
});

test('reportRosterCounts reports singles and doubles roster sizes', () => {
  const h = loadOperator();
  buildSingles(h);
  const doubles = buildDoubles(h);
  h.fn('provisionDoublesSpreadsheet')();

  const report = h.fn('reportRosterCounts')();

  assert.equal(report.singles.count, 2);
  assert.equal(report.doubles.count, 2);
});

// ─── Detag column-drop operator entry points ─────────────────────────────────

function buildTaggedDoubles(h) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const week = doubles.insertSheet('Week 2026-10-05');
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED);
  doubles.insertSheet('ClubMembers').appendRow(
    h.bound.CLUB_MEMBER_HEADERS.concat(['season_points'])
  );
  return { doubles, week };
}

test('previewDetagColumnDrops lists the doubles tag columns and writes nothing', () => {
  const h = loadOperator();
  const { week } = buildTaggedDoubles(h);

  const report = h.fn('previewDetagColumnDrops')();

  assert.equal(report.applied, false);
  assert.equal(report.results.filter((result) => result.status === 'would-drop').length, 2);
  assert.deepEqual(h.fn('getSheetHeaders')(week), h.bound.WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED);
});

test('applyDetagColumnDrops drops the tag columns without any approval property', () => {
  const h = loadOperator();
  const { doubles, week } = buildTaggedDoubles(h);

  const report = h.fn('applyDetagColumnDrops')();

  assert.equal(report.applied, true);
  assert.deepEqual(h.fn('getSheetHeaders')(week), h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  assert.deepEqual(
    h.fn('getSheetHeaders')(doubles.getSheetByName('ClubMembers')),
    h.bound.CLUB_MEMBER_HEADERS_DOUBLES
  );
});

// ─── Guarded test-data reset operator entry points ──────────────────────────

function buildTestDoubles(h) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES_TEST);
  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  club.appendRow([3, 'Damon', 'damon31', '151236', true, 't', 't', 2]);
  const week = doubles.insertSheet('Week 2026-10-05');
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES.map((header) => 'v_' + header));
  return { doubles, club, week };
}

test('previewTestDataReset reports the rows and writes nothing', () => {
  const h = loadOperator();
  const { week } = buildTestDoubles(h);
  const before = JSON.stringify(week.rows);

  const report = h.fn('previewTestDataReset')();

  assert.equal(report.applied, false);
  assert.equal(report.refused, false);
  assert.equal(report.total_rows_removed, 2);
  assert.equal(JSON.stringify(week.rows), before);
});

test('applyTestDataReset clears the doubles test spreadsheet to its minimum', () => {
  const h = loadOperator();
  const { club, week } = buildTestDoubles(h);

  const report = h.fn('applyTestDataReset')();

  assert.equal(report.applied, true);
  assert.equal(report.total_rows_removed, 2);
  assert.equal(week.rows.length, 1);
  assert.equal(club.rows.length, 1);
});

test('the operator reset refuses a non-test spreadsheet override', () => {
  const h = loadOperator();
  h.setScriptProperty('DOUBLES_TEST_SPREADSHEET_ID', 'not-the-test-sheet');
  const other = h.makeSpreadsheet('not-the-test-sheet');
  const club = other.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  club.appendRow([3, 'Damon', 'damon31', '151236', true, 't', 't', 2]);
  const before = JSON.stringify(club.rows);

  const report = h.fn('applyTestDataReset')();

  assert.equal(report.refused, true);
  assert.equal(report.reason, 'non_test');
  assert.equal(JSON.stringify(club.rows), before);
});

test('the operator reset refuses the production doubles spreadsheet', () => {
  const h = loadOperator();
  h.setScriptProperty('DOUBLES_TEST_SPREADSHEET_ID', h.bound.SPREADSHEET_ID_DOUBLES);
  const production = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const club = production.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  club.appendRow([3, 'Damon', 'damon31', '151236', true, 't', 't', 2]);
  const before = JSON.stringify(club.rows);

  const report = h.fn('applyTestDataReset')();

  assert.equal(report.applied, false);
  assert.equal(report.refused, true);
  assert.equal(report.reason, 'non_test');
  assert.equal(JSON.stringify(club.rows), before, 'production doubles must never be reset');
});
