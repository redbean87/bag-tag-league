'use strict';

// Slice 1 of the data-driven league content: the points-by-place matrix and
// the participation credit move from a code constant onto the per-league
// League settings (points_by_place + points_participation). The defaults keep
// day-one doubles output byte-identical; a league that stores its own table
// changes what the import commit writes and what the results view shows.
// Runs in a Node VM with in-memory Sheets fakes; no live sheet is touched.

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

/** Builds the doubles spreadsheet with a roster, one week, and optional League settings. */
function buildDoubles(h, leagueSettings) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  club.appendRow([1, 'Ann', 'ann', '', true, '', '', 0]);

  const week = doubles.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);

  let league = null;
  if (leagueSettings !== undefined) {
    league = doubles.insertSheet('League');
    league.appendRow(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
    const row = new Array(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.length).fill('');
    for (const key in leagueSettings) {
      const index = h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.indexOf(key);
      if (index !== -1) row[index] = leagueSettings[key];
    }
    league.appendRow(row);
  }

  return { doubles, club, week, league };
}

function leagueValue(sheet, h, header) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const col = headers.indexOf(header);
  return col === -1 ? null : sheet.getRange(2, col + 1).getValue();
}

function column(sheet, header) {
  const index = sheet.rows[0].indexOf(header);
  return sheet.rows.slice(1).map((row) => row[index]);
}

const PAIR_ROW = {
  name: 'Ann',
  usernames: 'ann',
  position: 1,
  position_raw: 1
};

// ─── Pure table helpers ──────────────────────────────────────────────────────

test('parsePointsByPlace accepts the compact form and rejects malformed input', () => {
  const h = loadCode();
  const parse = h.fn('parsePointsByPlace');

  assert.deepEqual(parse('1:2,2:1.5,3:1'), { ok: true, byPlace: { 1: 2, 2: 1.5, 3: 1 } });
  assert.deepEqual(parse('1:0'), { ok: true, byPlace: { 1: 0 } });
  assert.deepEqual(parse(''), { ok: true, byPlace: {} });
  assert.deepEqual(parse(null), { ok: true, byPlace: {} });

  assert.equal(parse('1').ok, false);
  assert.equal(parse('x:1').ok, false);
  assert.equal(parse('1:-1').ok, false);
  assert.equal(parse('1:2,1:3').ok, false, 'a duplicate place must be rejected');
});

test('formatPointsByPlace round-trips a table in place order', () => {
  const h = loadCode();
  const formatted = h.fn('formatPointsByPlace')({ 3: 1, 1: 2, 2: 1.5 });
  assert.equal(formatted, '1:2,2:1.5,3:1');
  assert.deepEqual(h.fn('parsePointsByPlace')(formatted).byPlace, { 1: 2, 2: 1.5, 3: 1 });
});

test('resolvePointsRules falls back to the day-one defaults and overrides cleanly', () => {
  const h = loadCode();
  const resolve = h.fn('resolvePointsRules');

  assert.deepEqual(resolve({}), { byPlace: { 1: 2, 2: 1.5, 3: 1 }, participation: 0.5 });
  assert.deepEqual(
    resolve({ points_by_place: '1:3,2:2,3:1', points_participation: 0.25 }),
    { byPlace: { 1: 3, 2: 2, 3: 1 }, participation: 0.25 }
  );
  // A table without a participation value keeps the default credit.
  assert.equal(resolve({ points_by_place: '1:4' }).participation, 0.5);
});

test('doublesPointsForPosition reads a supplied rules object', () => {
  const h = loadCode();
  const points = h.fn('doublesPointsForPosition');
  const rules = { points: { byPlace: { 1: 3, 2: 2 }, participation: 0.25 } };

  assert.equal(points(1, rules), 3);
  assert.equal(points(2, rules), 2);
  assert.equal(points(3, rules), 0.25);
  assert.equal(points('', rules), 0.25);

  // Omitted rules keep the default matrix.
  assert.equal(points(1), 2);
  assert.equal(points(4), 0.5);
});

// ─── getLeagueRules threading ────────────────────────────────────────────────

test('getLeagueRules carries the defaults without settings and the override with them', () => {
  const h = loadCode();
  const rules = h.fn('getLeagueRules');

  assert.deepEqual(
    rules(h.bound.LEAGUE_ID_DOUBLES).points,
    { byPlace: { 1: 2, 2: 1.5, 3: 1 }, participation: 0.5 }
  );
  assert.deepEqual(
    rules(h.bound.LEAGUE_ID_DOUBLES, { points_by_place: '1:5', points_participation: 1 }).points,
    { byPlace: { 1: 5 }, participation: 1 }
  );
});

test('getLeagueRulesForSpreadsheet merges the League settings row', () => {
  const h = loadCode();
  const { doubles } = buildDoubles(h, { points_by_place: '1:7', points_participation: 2 });

  const rules = h.fn('getLeagueRulesForSpreadsheet')(h.bound.LEAGUE_ID_DOUBLES, doubles);

  assert.deepEqual(rules.points, { byPlace: { 1: 7 }, participation: 2 });
});

// ─── Save-time validation and persistence ────────────────────────────────────

test('handleSaveLeagueSettings writes the points settings and preserves the metadata', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  h.fn('handleCreateLeagueSheet')({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES });
  const league = doubles.getSheetByName('League');

  const saved = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    settings: {
      league_name: 'Dubs',
      points_by_place: '1:3,2:2,3:1',
      points_participation: 0.25
    }
  }));

  assert.equal(saved.status, 'ok');
  assert.equal(saved.settings.points_by_place, '1:3,2:2,3:1');
  assert.equal(saved.settings.points_participation, 0.25);
  // The metadata enums are never written by this form.
  assert.equal(leagueValue(league, h, 'league_format'), h.bound.LEAGUE_FORMAT_DOUBLES);
  assert.equal(leagueValue(league, h, 'scoring'), h.bound.SCORING_POINTS);

  const loaded = h.parse(h.fn('handleGetLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES
  }));
  assert.equal(loaded.settings.points_by_place, '1:3,2:2,3:1');
  assert.equal(loaded.settings.points_participation, 0.25);
});

test('handleSaveLeagueSettings rejects a malformed points table or credit', () => {
  const h = loadCode();
  h.fn('handleCreateLeagueSheet')({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES });

  const badTable = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    settings: { points_by_place: '1:two' }
  }));
  assert.equal(badTable.status, 'error');
  assert.match(badTable.message, /points_by_place/);

  const badCredit = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    settings: { points_participation: -1 }
  }));
  assert.equal(badCredit.status, 'error');
  assert.match(badCredit.message, /points_participation/);

  // A rejected save must not have written the malformed value.
  const loaded = h.parse(h.fn('handleGetLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES
  }));
  assert.notEqual(loaded.settings.points_by_place, '1:two');
});

test('handleSaveLeagueSettings appends the points columns to a pre-settings sheet', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const league = doubles.insertSheet('League');
  // A 17-column sheet from before the points settings existed.
  const prePoints = h.bound.LEAGUE_SHEET_HEADERS.concat(['league_format', 'scoring']);
  league.appendRow(prePoints);
  const row = new Array(prePoints.length).fill('');
  row[prePoints.indexOf('league_format')] = h.bound.LEAGUE_FORMAT_DOUBLES;
  row[prePoints.indexOf('scoring')] = h.bound.SCORING_POINTS;
  league.appendRow(row);

  const saved = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    settings: { points_by_place: '1:9', points_participation: 0.5 }
  }));

  assert.equal(saved.status, 'ok');
  assert.deepEqual(h.fn('getSheetHeaders')(league), h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
  assert.equal(leagueValue(league, h, 'league_format'), h.bound.LEAGUE_FORMAT_DOUBLES);
  assert.equal(leagueValue(league, h, 'scoring'), h.bound.SCORING_POINTS);
  assert.equal(leagueValue(league, h, 'points_by_place'), '1:9');
});

test('handleGetLeagueSettings reports the capability-derived weekly column count', () => {
  const h = loadCode();
  h.fn('handleCreateLeagueSheet')({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES });

  const loaded = h.parse(h.fn('handleGetLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES
  }));
  assert.equal(loaded.weekly_columns, h.bound.WEEKLY_RECORD_HEADERS_DOUBLES.length);
});

// ─── The per-league table drives commit and results ──────────────────────────

test('the import commit writes the league sheet points table, byte-identical on defaults', () => {
  const defaults = loadCode();
  const defaultBuild = buildDoubles(defaults);
  const defaultResult = defaults.parse(defaults.fn('handleCommitUdiscImportDoubles')({
    spreadsheetId: defaults.bound.SPREADSHEET_ID_DOUBLES,
    league_date: WEEK_DATE,
    rows: [PAIR_ROW],
    approved: true
  }));
  assert.equal(defaultResult.status, 'ok');
  assert.deepEqual(column(defaultBuild.week, 'weekly_points'), [2]);

  const custom = loadCode();
  const customBuild = buildDoubles(custom, { points_by_place: '1:3', points_participation: 0.25 });
  const customResult = custom.parse(custom.fn('handleCommitUdiscImportDoubles')({
    spreadsheetId: custom.bound.SPREADSHEET_ID_DOUBLES,
    league_date: WEEK_DATE,
    rows: [PAIR_ROW],
    approved: true
  }));
  assert.equal(customResult.status, 'ok');
  assert.deepEqual(column(customBuild.week, 'weekly_points'), [3], 'the league table must win');
});

test('the results view derives points from the league sheet table', () => {
  const h = loadCode();
  buildDoubles(h, { points_by_place: '1:4,2:1', points_participation: 0.5 });

  const result = h.parse(h.fn('handleCalculatePoints')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: WEEK_DATE
  }));
  // No committed rows yet, so seed one through the commit path first.
  assert.equal(result.status, 'ok');

  const commit = h.parse(h.fn('handleCommitUdiscImportDoubles')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: WEEK_DATE,
    rows: [PAIR_ROW],
    approved: true
  }));
  assert.equal(commit.status, 'ok');

  const view = h.parse(h.fn('handleCalculatePoints')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: WEEK_DATE
  }));
  assert.equal(view.players[0].points, 4);
});

test('an un-migrated League sheet (no points columns) keeps the day-one matrix', () => {
  const h = loadCode();
  const { doubles } = buildDoubles(h, { league_format: h.bound.LEAGUE_FORMAT_DOUBLES, scoring: h.bound.SCORING_POINTS });

  const rules = h.fn('getLeagueRulesForSpreadsheet')(h.bound.LEAGUE_ID_DOUBLES, doubles);
  assert.deepEqual(rules.points, { byPlace: { 1: 2, 2: 1.5, 3: 1 }, participation: 0.5 });
});
