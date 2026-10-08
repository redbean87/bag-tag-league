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
});

test('configured spreadsheet IDs honor Script Properties overrides', () => {
  const h = loadOperator();

  h.setScriptProperty('SINGLES_SPREADSHEET_ID', 'custom-singles');
  h.setScriptProperty('DOUBLES_SPREADSHEET_ID', 'custom-doubles');

  assert.equal(h.fn('getConfiguredSinglesSpreadsheetId')(), 'custom-singles');
  assert.equal(h.fn('getConfiguredDoublesSpreadsheetId')(), 'custom-doubles');
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
