'use strict';

// Slice 3-4 of the terminology model: the League sheet records the scoring
// enum alongside league_format, provisioning/topology report scoring_matches,
// the settings writer rejects off-list enum values, and the weekly/member
// header builders accept a (format, scoring) pair while keeping day-one
// schemas. Runs in a Node VM with in-memory Sheets fakes.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

function leagueValue(sheet, header) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const col = headers.indexOf(header);
  return col === -1 ? null : sheet.getRange(2, col + 1).getValue();
}

function addLeague(h, spreadsheet, headers) {
  const league = spreadsheet.insertSheet('League');
  league.appendRow(headers);
  return league;
}

// ─── ensureLeagueScoringValue ────────────────────────────────────────────────

test('ensureLeagueScoringValue appends the scoring column and is idempotent', () => {
  const h = loadCode();
  const spreadsheet = h.makeSpreadsheet('singles');
  const league = addLeague(h, spreadsheet, h.bound.LEAGUE_SHEET_HEADERS);
  league.appendRow(new Array(h.bound.LEAGUE_SHEET_HEADERS.length).fill(''));

  h.fn('ensureLeagueScoringValue')(league, h.bound.SCORING_TAGS);
  h.fn('ensureLeagueScoringValue')(league, h.bound.SCORING_TAGS);

  const headers = h.fn('getSheetHeaders')(league);
  assert.equal(headers.filter((header) => header === 'scoring').length, 1);
  assert.equal(headers[headers.length - 1], 'scoring');
  assert.equal(leagueValue(league, 'scoring'), h.bound.SCORING_TAGS);
});

test('ensureLeagueScoringValue creates a settings row when the sheet has none', () => {
  const h = loadCode();
  const spreadsheet = h.makeSpreadsheet('empty-settings');
  const league = addLeague(h, spreadsheet, h.bound.LEAGUE_SHEET_HEADERS);

  h.fn('ensureLeagueScoringValue')(league, h.bound.SCORING_POINTS);

  assert.equal(leagueValue(league, 'scoring'), h.bound.SCORING_POINTS);
});

// ─── create + settings ───────────────────────────────────────────────────────

test('handleCreateLeagueSheet records both metadata enums for singles', () => {
  const h = loadCode();
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);

  const result = h.parse(h.fn('handleCreateLeagueSheet')({
    spreadsheetId: h.bound.SPREADSHEET_ID
  }));

  assert.equal(result.status, 'ok');
  assert.equal(result.columns, h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.length);
  const league = singles.getSheetByName('League');
  assert.deepEqual(h.fn('getSheetHeaders')(league), h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
  assert.equal(leagueValue(league, 'league_format'), h.bound.LEAGUE_FORMAT_SINGLES);
  assert.equal(leagueValue(league, 'scoring'), h.bound.SCORING_TAGS);
});

test('handleGetLeagueSettings echoes both metadata enums', () => {
  const h = loadCode();
  h.fn('handleCreateLeagueSheet')({ spreadsheetId: h.bound.SPREADSHEET_ID });

  const loaded = h.parse(h.fn('handleGetLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID
  }));

  assert.equal(loaded.status, 'ok');
  assert.equal(loaded.settings.league_format, h.bound.LEAGUE_FORMAT_SINGLES);
  assert.equal(loaded.settings.scoring, h.bound.SCORING_TAGS);
});

test('handleSaveLeagueSettings rejects off-list enum values', () => {
  const h = loadCode();
  h.fn('handleCreateLeagueSheet')({ spreadsheetId: h.bound.SPREADSHEET_ID });

  const badFormat = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID,
    settings: { league_name: 'Singles', league_format: 'triples' }
  }));
  assert.equal(badFormat.status, 'error');
  assert.match(badFormat.message, /league_format/);
  assert.match(badFormat.message, /singles, doubles/);

  const badScoring = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID,
    settings: { league_name: 'Singles', scoring: 'handicap' }
  }));
  assert.equal(badScoring.status, 'error');
  assert.match(badScoring.message, /scoring/);
  assert.match(badScoring.message, /tags, points/);
});

test('handleSaveLeagueSettings never overwrites the recorded metadata values', () => {
  const h = loadCode();
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  h.fn('handleCreateLeagueSheet')({ spreadsheetId: h.bound.SPREADSHEET_ID });
  const league = singles.getSheetByName('League');

  const saved = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID,
    settings: {
      league_name: 'Renamed',
      // A valid but different pair must not be persisted: metadata is
      // provision-time / gated-migration only.
      league_format: h.bound.LEAGUE_FORMAT_DOUBLES,
      scoring: h.bound.SCORING_POINTS
    }
  }));

  assert.equal(saved.status, 'ok');
  assert.equal(leagueValue(league, 'league_format'), h.bound.LEAGUE_FORMAT_SINGLES);
  assert.equal(leagueValue(league, 'scoring'), h.bound.SCORING_TAGS);
  assert.equal(leagueValue(league, 'league_name'), 'Renamed');
});

test('blank metadata values are allowed and leave the recorded values alone', () => {
  const h = loadCode();
  h.fn('handleCreateLeagueSheet')({ spreadsheetId: h.bound.SPREADSHEET_ID });

  const saved = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID,
    settings: { league_name: 'Singles', league_format: '', scoring: '' }
  }));

  assert.equal(saved.status, 'ok');
});

// ─── topology ────────────────────────────────────────────────────────────────

test('inspectSpreadsheetTopology reports scoring, format, and both match flags', () => {
  const h = loadCode();
  const singles = h.makeSpreadsheet('topology');
  h.fn('provisionDoublesWorkbook')(singles, h.makeSpreadsheet('source'));

  const report = h.fn('inspectSpreadsheetTopology')(singles, h.bound.LEAGUE_FORMAT_DOUBLES, h.bound.SCORING_POINTS);

  assert.equal(report.league.scoring, h.bound.SCORING_POINTS);
  assert.equal(report.league.scoring_matches, true);
  assert.equal(report.league.league_format, h.bound.LEAGUE_FORMAT_DOUBLES);
  assert.equal(report.league.league_format_matches, true);
});

test('inspectSpreadsheetTopology flags a scoring mismatch without failing the format', () => {
  const h = loadCode();
  const spreadsheet = h.makeSpreadsheet('mismatch');
  const league = addLeague(h, spreadsheet, h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
  const row = new Array(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.length).fill('');
  row[h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.indexOf('league_format')] = h.bound.LEAGUE_FORMAT_DOUBLES;
  row[h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.indexOf('scoring')] = h.bound.SCORING_TAGS;
  league.appendRow(row);

  const report = h.fn('inspectSpreadsheetTopology')(spreadsheet, h.bound.LEAGUE_FORMAT_DOUBLES, h.bound.SCORING_POINTS);

  assert.equal(report.league.league_format_matches, true);
  assert.equal(report.league.scoring_matches, false);
});

// ─── header builders on (format, scoring) ────────────────────────────────────

test('rulesForEnums resolves capabilities and defaults scoring from the format', () => {
  const h = loadCode();
  const rules = h.fn('rulesForEnums');

  assert.deepEqual(rules(h.bound.LEAGUE_FORMAT_SINGLES), {
    format: h.bound.LEAGUE_FORMAT_SINGLES,
    scoring: h.bound.SCORING_TAGS,
    usesTags: true,
    usesPoints: false,
    hasPairs: false
  });
  assert.deepEqual(rules(h.bound.LEAGUE_FORMAT_DOUBLES), {
    format: h.bound.LEAGUE_FORMAT_DOUBLES,
    scoring: h.bound.SCORING_POINTS,
    usesTags: false,
    usesPoints: true,
    hasPairs: true
  });
  // Cross pairs stay independent.
  const singlesPoints = rules(h.bound.LEAGUE_FORMAT_SINGLES, h.bound.SCORING_POINTS);
  assert.equal(singlesPoints.usesTags, false);
  assert.equal(singlesPoints.usesPoints, true);
  assert.equal(singlesPoints.hasPairs, false);
});

test('weekly header pool and human-first groups follow the capabilities', () => {
  const h = loadCode();
  const pool = h.fn('weeklyRecordColumnPool');
  const groups = h.fn('weeklyHumanFirstGroups');

  const singles = pool(h.bound.LEAGUE_FORMAT_SINGLES, h.bound.SCORING_TAGS);
  assert.equal(singles.length, 48);
  assert.deepEqual(groups(h.bound.LEAGUE_FORMAT_SINGLES, h.bound.SCORING_TAGS).map((g) => g[0]), [
    'member_number',
    'score',
    'in_tag'
  ]);

  const doubles = pool(h.bound.LEAGUE_FORMAT_DOUBLES, h.bound.SCORING_POINTS);
  assert.equal(doubles.length, 51);
  assert.deepEqual(groups(h.bound.LEAGUE_FORMAT_DOUBLES, h.bound.SCORING_POINTS).map((g) => g[0]), [
    'member_number',
    'pair_key',
    'score',
    'weekly_points'
  ]);
  // weeklyColumnsKnownForFormat keeps the droppable tag columns known during
  // the transition, so the reorder dry run can still read a pre-detag sheet.
  const known = h.fn('weeklyColumnsKnownForFormat')(h.bound.LEAGUE_FORMAT_DOUBLES, h.bound.SCORING_POINTS);
  assert.equal(known.length, doubles.length + h.bound.WEEKLY_RECORD_DETAG_HEADERS.length);
  h.bound.WEEKLY_RECORD_DETAG_HEADERS.forEach((header) => assert.ok(known.includes(header)));
});

test('planWeeklyColumnReorder accepts an explicit (format, scoring) pair', () => {
  const h = loadCode();
  const plan = h.fn('planWeeklyColumnReorder')(
    h.bound.WEEKLY_RECORD_HEADERS_LEGACY_DOUBLES,
    h.bound.LEAGUE_FORMAT_DOUBLES,
    h.bound.SCORING_POINTS
  );

  assert.equal(plan.status, 'reorder');
  assert.deepEqual(plan.target_headers, h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
});

test('the League header builder carries both metadata columns for any pair', () => {
  const h = loadCode();
  const leagueHeaders = h.fn('getLeagueSheetHeaders');

  for (const pair of [
    [h.bound.LEAGUE_FORMAT_SINGLES, h.bound.SCORING_TAGS],
    [h.bound.LEAGUE_FORMAT_DOUBLES, h.bound.SCORING_POINTS],
    [h.bound.LEAGUE_FORMAT_SINGLES, h.bound.SCORING_POINTS]
  ]) {
    const headers = leagueHeaders(pair[0], pair[1]);
    assert.equal(headers.length, 22);
    assert.ok(headers.includes('league_format'));
    assert.ok(headers.includes('scoring'));
    assert.ok(headers.includes('points_by_place'));
    assert.ok(headers.includes('points_participation'));
    assert.ok(headers.includes('payout_by_place'));
    assert.ok(headers.includes('entry_fee_explanation'));
    assert.ok(headers.includes('entry_fee_breakdown'));
  }
});

test('inspectSpreadsheetTopology accepts a pre-migration bare singles League', () => {
  const h = loadCode();
  const spreadsheet = h.makeSpreadsheet('legacy-singles');
  const league = addLeague(h, spreadsheet, h.bound.LEAGUE_SHEET_HEADERS);
  league.appendRow(new Array(h.bound.LEAGUE_SHEET_HEADERS.length).fill(''));

  const report = h.fn('inspectSpreadsheetTopology')(
    spreadsheet,
    h.bound.LEAGUE_FORMAT_SINGLES,
    h.bound.SCORING_TAGS
  );

  // Headers are the known-but-un-migrated layout; the metadata is simply absent.
  assert.equal(report.league.headers_match, true);
  assert.equal(report.league.league_format, null);
  assert.equal(report.league.league_format_matches, false);
  assert.equal(report.league.scoring, null);
  assert.equal(report.league.scoring_matches, false);
});

test('inspectSpreadsheetTopology accepts a pre-scoring 16-column doubles League', () => {
  const h = loadCode();
  const legacyDoubles = h.bound.LEAGUE_SHEET_HEADERS.concat(['league_format']);
  const spreadsheet = h.makeSpreadsheet('legacy-doubles');
  const league = addLeague(h, spreadsheet, legacyDoubles);
  const row = new Array(legacyDoubles.length).fill('');
  row[legacyDoubles.indexOf('league_format')] = h.bound.LEAGUE_FORMAT_DOUBLES;
  league.appendRow(row);

  const report = h.fn('inspectSpreadsheetTopology')(
    spreadsheet,
    h.bound.LEAGUE_FORMAT_DOUBLES,
    h.bound.SCORING_POINTS
  );

  assert.equal(report.league.headers_match, true);
  assert.equal(report.league.league_format_matches, true);
  assert.equal(report.league.scoring, null);
  assert.equal(report.league.scoring_matches, false);
});
