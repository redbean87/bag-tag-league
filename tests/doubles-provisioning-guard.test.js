'use strict';

// Guard coverage for doubles provisioning: the authoritative provisioned-state
// check, the server-side refusal of re-provisioning before any write, and a
// regression check that singles is never written by the doubles path.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

function buildSinglesWithRoster(h) {
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const club = singles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  club.appendRow([3, 'Alice', 'alice', '111', 5, true, 't1', 't1']);
  return singles;
}

// Adds a League sheet in the requested shape. `format` is written only when
// supplied, so callers can model a missing or wrong league_format.
function addLeague(h, spreadsheet, format, headers) {
  const resolvedHeaders = headers || (format !== undefined
    ? h.bound.LEAGUE_SHEET_HEADERS_DOUBLES
    : h.bound.LEAGUE_SHEET_HEADERS);
  const league = spreadsheet.insertSheet('League');
  league.appendRow(resolvedHeaders);
  if (format !== undefined) {
    const col = resolvedHeaders.indexOf('league_format');
    const row = new Array(resolvedHeaders.length).fill('');
    if (col !== -1) row[col] = format;
    league.appendRow(row);
  }
  return league;
}

function addWeekTemplate(h, spreadsheet) {
  const template = spreadsheet.insertSheet(h.bound.WEEK_TEMPLATE_SHEET_NAME);
  template.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  return template;
}

// JSON snapshot of a fake spreadsheet so tests can assert zero writes.
function snapshot(spreadsheet) {
  return JSON.stringify(
    spreadsheet.getSheets().map((sheet) => ({
      name: sheet.getName(),
      rows: JSON.parse(JSON.stringify(sheet.rows))
    }))
  );
}

test('getDoublesProvisioningState reports not provisioned when ClubMembers is missing', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  addLeague(h, doubles, h.bound.LEAGUE_FORMAT_DOUBLES);
  addWeekTemplate(h, doubles);

  const state = h.fn('getDoublesProvisioningState')(doubles);
  assert.equal(state.provisioned, false);
  assert.equal(state.club_members_present, false);
  assert.equal(state.league_present, true);
  assert.equal(state.week_template_present, true);
  assert.equal(state.league_format_matches, true);
});

test('getDoublesProvisioningState reports not provisioned when League is missing', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  doubles.insertSheet('ClubMembers').appendRow(h.bound.CLUB_MEMBER_HEADERS);
  addWeekTemplate(h, doubles);

  const state = h.fn('getDoublesProvisioningState')(doubles);
  assert.equal(state.provisioned, false);
  assert.equal(state.league_present, false);
});

test('getDoublesProvisioningState reports not provisioned when league_format is absent', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  addLeague(h, doubles, undefined, h.bound.LEAGUE_SHEET_HEADERS);
  doubles.insertSheet('ClubMembers').appendRow(h.bound.CLUB_MEMBER_HEADERS);
  addWeekTemplate(h, doubles);

  const state = h.fn('getDoublesProvisioningState')(doubles);
  assert.equal(state.provisioned, false);
  assert.equal(state.league_format, null);
  assert.equal(state.league_format_matches, false);
});

test('getDoublesProvisioningState reports not provisioned for a non-doubles league_format', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  addLeague(h, doubles, h.bound.LEAGUE_FORMAT_SINGLES);
  doubles.insertSheet('ClubMembers').appendRow(h.bound.CLUB_MEMBER_HEADERS);
  addWeekTemplate(h, doubles);

  const state = h.fn('getDoublesProvisioningState')(doubles);
  assert.equal(state.provisioned, false);
  assert.equal(state.league_format, h.bound.LEAGUE_FORMAT_SINGLES);
  assert.equal(state.league_format_matches, false);
});

test('getDoublesProvisioningState reports not provisioned when the Week template is missing', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  addLeague(h, doubles, h.bound.LEAGUE_FORMAT_DOUBLES);
  doubles.insertSheet('ClubMembers').appendRow(h.bound.CLUB_MEMBER_HEADERS);

  const state = h.fn('getDoublesProvisioningState')(doubles);
  assert.equal(state.provisioned, false);
  assert.equal(state.week_template_present, false);
});

test('getDoublesProvisioningState reports provisioned when every artifact is present', () => {
  const h = loadCode();
  const singles = buildSinglesWithRoster(h);
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  h.fn('provisionDoublesWorkbook')(doubles, singles);

  const state = h.fn('getDoublesProvisioningState')(doubles);
  assert.equal(state.provisioned, true);
  assert.equal(state.league_present, true);
  assert.equal(state.club_members_present, true);
  assert.equal(state.week_template_present, true);
  assert.equal(state.league_format, h.bound.LEAGUE_FORMAT_DOUBLES);
  assert.equal(state.league_format_matches, true);
});

test('handleProvisionDoubles provisions an unprovisioned doubles spreadsheet', () => {
  const h = loadCode();
  buildSinglesWithRoster(h);
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const result = h.parse(h.fn('handleProvisionDoubles')({}));

  assert.equal(result.status, 'ok');
  assert.equal(result.league.league_format, h.bound.LEAGUE_FORMAT_DOUBLES);
  const names = doubles.getSheets().map((sheet) => sheet.getName());
  assert.ok(names.includes('League'));
  assert.ok(names.includes('ClubMembers'));
  assert.ok(names.includes(h.bound.WEEK_TEMPLATE_SHEET_NAME));
});

test('handleProvisionDoubles refuses an already-provisioned spreadsheet', () => {
  const h = loadCode();
  const singles = buildSinglesWithRoster(h);
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  h.fn('provisionDoublesWorkbook')(doubles, singles);

  const result = h.parse(h.fn('handleProvisionDoubles')({}));

  assert.equal(result.status, 'already_provisioned');
  assert.equal(result.state.provisioned, true);
});

test('an already-provisioned request makes no sheet or template writes', () => {
  const h = loadCode();
  const singles = buildSinglesWithRoster(h);
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  h.fn('provisionDoublesWorkbook')(doubles, singles);

  const before = snapshot(doubles);
  h.fn('handleProvisionDoubles')({});
  const after = snapshot(doubles);

  assert.equal(after, before, 're-provisioning must not touch the doubles spreadsheet');
});

test('handleGetDoublesProvisioningState reads state without writing', () => {
  const h = loadCode();
  const singles = buildSinglesWithRoster(h);
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  h.fn('provisionDoublesWorkbook')(doubles, singles);

  const before = snapshot(doubles);
  const result = h.parse(h.fn('handleGetDoublesProvisioningState')({}));
  const after = snapshot(doubles);

  assert.equal(result.status, 'ok');
  assert.equal(result.state.provisioned, true);
  assert.equal(after, before, 'state read must not write');
});

test('singles provisioning path is never written by the doubles action', () => {
  const h = loadCode();
  const singles = buildSinglesWithRoster(h);
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const singlesBefore = snapshot(singles);
  h.fn('handleProvisionDoubles')({});
  const singlesAfter = snapshot(singles);

  assert.equal(singlesAfter, singlesBefore, 'singles spreadsheet must be untouched');

  // The doubles path must not make the singles spreadsheet look provisioned.
  const singlesState = h.fn('getDoublesProvisioningState')(singles);
  assert.equal(singlesState.provisioned, false);
});
