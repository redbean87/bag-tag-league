'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

function buildSinglesWithRoster(h) {
  const singles = h.makeSpreadsheet('singles-fixture');
  const club = singles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  club.appendRow([3, 'Alice', 'alice', '111', 5, true, 't1', 't1']);
  club.appendRow([7, 'Bob', 'bob', '222', 9, true, 't2', 't2']);
  return singles;
}

function leagueFormatValue(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const col = headers.indexOf('league_format');
  return col === -1 ? null : sheet.getRange(2, col + 1).getValue();
}

test('provisionDoublesWorkbook creates the canonical doubles tabs', () => {
  const h = loadCode();
  const singles = buildSinglesWithRoster(h);
  const doubles = h.makeSpreadsheet('doubles-fixture');
  doubles.insertSheet('Sheet1'); // default blank sheet should be removed

  const summary = h.fn('provisionDoublesWorkbook')(doubles, singles);

  const names = doubles.getSheets().map((sheet) => sheet.getName());
  assert.ok(names.includes('League'));
  assert.ok(names.includes('ClubMembers'));
  assert.ok(names.includes('Week template'));
  assert.ok(!names.includes('Sheet1'), 'default blank sheet should be removed');

  const league = doubles.getSheetByName('League');
  assert.deepEqual(
    h.fn('getSheetHeaders')(league),
    h.bound.LEAGUE_SHEET_HEADERS_DOUBLES
  );
  assert.equal(leagueFormatValue(league), h.bound.LEAGUE_FORMAT_DOUBLES);

  assert.deepEqual(
    h.fn('getSheetHeaders')(doubles.getSheetByName('ClubMembers')),
    h.bound.CLUB_MEMBER_HEADERS_DOUBLES
  );
  assert.deepEqual(
    h.fn('getSheetHeaders')(doubles.getSheetByName('Week template')),
    h.bound.WEEKLY_RECORD_HEADERS_DOUBLES
  );

  assert.equal(summary.league.created, true);
  assert.equal(summary.club_members.created, true);
  assert.equal(summary.week_template.created, true);
  assert.equal(summary.roster_seed.seeded, 2);
});

test('provisionDoublesWorkbook is idempotent', () => {
  const h = loadCode();
  const singles = buildSinglesWithRoster(h);
  const doubles = h.makeSpreadsheet('doubles-fixture');

  h.fn('provisionDoublesWorkbook')(doubles, singles);
  const second = h.fn('provisionDoublesWorkbook')(doubles, singles);

  assert.equal(second.league.created, false);
  assert.equal(second.club_members.created, false);
  assert.equal(second.week_template.created, false);
  assert.equal(second.roster_seed.seeded, 0);
  assert.equal(second.roster_seed.skipped_existing, 2);

  const names = doubles.getSheets().map((sheet) => sheet.getName());
  const templateCount = names.filter((name) => name === 'Week template').length;
  assert.equal(templateCount, 1, 'template must not be duplicated');
});

test('inspectSpreadsheetTopology reports matching headers and league_format', () => {
  const h = loadCode();
  const singles = buildSinglesWithRoster(h);
  const doubles = h.makeSpreadsheet('doubles-fixture');

  h.fn('provisionDoublesWorkbook')(doubles, singles);
  const report = h.fn('inspectSpreadsheetTopology')(doubles, h.bound.LEAGUE_FORMAT_DOUBLES);

  assert.equal(report.league.present, true);
  assert.equal(report.league.headers_match, true);
  assert.equal(report.league.league_format, h.bound.LEAGUE_FORMAT_DOUBLES);
  assert.equal(report.club_members.present, true);
  assert.equal(report.club_members.headers_match, true);
  assert.equal(report.week_template.present, true);
  assert.equal(report.week_template.headers_match, true);
});

test('ensureLeagueSheetForFormat adds league_format to an existing 15-column doubles sheet', () => {
  const h = loadCode();
  const spreadsheet = h.makeSpreadsheet('existing-doubles');
  const league = spreadsheet.insertSheet('League');
  league.appendRow(h.bound.LEAGUE_SHEET_HEADERS); // legacy 15-column doubles League
  league.appendRow(new Array(h.bound.LEAGUE_SHEET_HEADERS.length).fill(''));

  h.fn('ensureLeagueSheetForFormat')(spreadsheet, h.bound.LEAGUE_FORMAT_DOUBLES);

  assert.deepEqual(h.fn('getSheetHeaders')(league), h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
  assert.equal(leagueFormatValue(league), h.bound.LEAGUE_FORMAT_DOUBLES);
});

test('handleCreateWeeklyTab writes doubles headers for the doubles spreadsheet', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const result = h.parse(h.fn('handleCreateWeeklyTab')({
    leagueDate: '2026-10-05',
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES
  }));

  assert.equal(result.status, 'ok');
  assert.equal(result.columns, h.bound.WEEKLY_RECORD_HEADERS_DOUBLES.length);
  assert.deepEqual(
    h.fn('getSheetHeaders')(doubles.getSheetByName('Week 2026-10-05')),
    h.bound.WEEKLY_RECORD_HEADERS_DOUBLES
  );
});

test('handleCreateClubMembersTab gives doubles the season_points column and singles the 8-column schema', () => {
  const h = loadCode();

  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const doublesResult = h.parse(h.fn('handleCreateClubMembersTab')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES
  }));
  assert.equal(doublesResult.status, 'ok');
  assert.equal(doublesResult.columns, h.bound.CLUB_MEMBER_HEADERS_DOUBLES.length);
  assert.deepEqual(
    h.fn('getSheetHeaders')(doubles.getSheetByName('ClubMembers')),
    h.bound.CLUB_MEMBER_HEADERS_DOUBLES
  );

  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const singlesResult = h.parse(h.fn('handleCreateClubMembersTab')({
    spreadsheetId: h.bound.SPREADSHEET_ID
  }));
  assert.equal(singlesResult.status, 'ok');
  assert.equal(singlesResult.columns, h.bound.CLUB_MEMBER_HEADERS.length);
  assert.deepEqual(
    h.fn('getSheetHeaders')(singles.getSheetByName('ClubMembers')),
    h.bound.CLUB_MEMBER_HEADERS
  );
});

test('handleCreateWeeklyTab keeps singles headers for the singles spreadsheet', () => {
  const h = loadCode();
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);

  const result = h.parse(h.fn('handleCreateWeeklyTab')({
    leagueDate: '2026-10-05',
    spreadsheetId: h.bound.SPREADSHEET_ID
  }));

  assert.equal(result.status, 'ok');
  assert.equal(result.columns, h.bound.WEEKLY_RECORD_HEADERS.length);
  assert.deepEqual(
    h.fn('getSheetHeaders')(singles.getSheetByName('Week 2026-10-05')),
    h.bound.WEEKLY_RECORD_HEADERS
  );
});

test('handleCreateLeagueSheet provisions league_format on the doubles spreadsheet', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const result = h.parse(h.fn('handleCreateLeagueSheet')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES
  }));

  assert.equal(result.status, 'ok');
  assert.equal(result.columns, h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.length);

  const league = doubles.getSheetByName('League');
  assert.deepEqual(h.fn('getSheetHeaders')(league), h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
  assert.equal(leagueFormatValue(league), h.bound.LEAGUE_FORMAT_DOUBLES);
});

test('saving doubles league settings preserves league_format', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  h.fn('handleCreateLeagueSheet')({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES });
  const saved = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    settings: { league_name: 'Doubles League', entry_fee: 5 }
  }));

  assert.equal(saved.status, 'ok');

  const league = doubles.getSheetByName('League');
  assert.equal(leagueFormatValue(league), h.bound.LEAGUE_FORMAT_DOUBLES);

  const loaded = h.parse(h.fn('handleGetLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES
  }));
  assert.equal(loaded.settings.league_name, 'Doubles League');
  assert.equal(loaded.settings.league_format, h.bound.LEAGUE_FORMAT_DOUBLES);
});

test('singles legacy 12-column League migration still works and adds no league_format', () => {
  const OLD_LEAGUE_HEADERS = [
    'league_name', 'description', 'location', 'schedule', 'contact_information',
    'entry_fee', 'ace_pot_contribution', 'ace_pot_total',
    'ctp_contribution', 'ctp_prize',
    'created_at', 'updated_at'
  ];

  const h = loadCode();
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const league = singles.insertSheet('League');
  league.appendRow(OLD_LEAGUE_HEADERS);
  const oldRow = new Array(OLD_LEAGUE_HEADERS.length).fill('');
  oldRow[OLD_LEAGUE_HEADERS.indexOf('league_name')] = 'Legacy Singles';
  oldRow[OLD_LEAGUE_HEADERS.indexOf('ace_pot_total')] = 42;
  league.appendRow(oldRow);

  const result = h.parse(h.fn('handleCreateLeagueSheet')({
    spreadsheetId: h.bound.SPREADSHEET_ID
  }));

  assert.equal(result.status, 'ok');
  assert.equal(result.migrated, true);
  assert.deepEqual(h.fn('getSheetHeaders')(league), h.bound.LEAGUE_SHEET_HEADERS);
  assert.equal(leagueFormatValue(league), null, 'singles must not gain league_format');
  assert.equal(league.getRange(2, h.bound.LEAGUE_SHEET_HEADERS.indexOf('league_name') + 1).getValue(), 'Legacy Singles');
  assert.equal(league.getRange(2, h.bound.LEAGUE_SHEET_HEADERS.indexOf('ace_pot_current_total') + 1).getValue(), 42);
});
