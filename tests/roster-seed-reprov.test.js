'use strict';

// Seed-only roster reload (`seedRoster`).
//
// After a `scope: 'full'` test-data reset the doubles workbook stays
// provisioned, so the provision action refuses and the roster can no longer be
// seeded through it. This action is the replacement path: it takes an explicit
// member payload, upserts ClubMembers by member_number with no renumbering and
// no weekly-row writes, and is guarded by the same test-spreadsheet allow-list
// as the reset so live Singles can never be targeted. All behavior runs in a
// Node VM with an in-memory Sheets fake: no Google credentials, network
// access, or live sheet writes.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

// Builds a fully provisioned doubles spreadsheet with a header-only roster
// (the state a `scope: 'full'` reset leaves behind). Defaults to the
// production doubles workbook; callers exercising the test-only reset pass
// the test spreadsheet id.
function buildProvisionedDoubles(h, spreadsheetId) {
  const doubles = h.makeSpreadsheet(spreadsheetId || h.bound.SPREADSHEET_ID_DOUBLES);

  const league = doubles.insertSheet('League');
  league.appendRow(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
  const leagueRow = new Array(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.length).fill('');
  leagueRow[h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.indexOf('league_format')] = h.bound.LEAGUE_FORMAT_DOUBLES;
  leagueRow[h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.indexOf('scoring')] = h.bound.SCORING_POINTS;
  league.appendRow(leagueRow);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);

  const template = doubles.insertSheet(h.bound.WEEK_TEMPLATE_SHEET_NAME);
  template.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);

  const week = doubles.insertSheet('Week 2026-10-05');
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES.map((header) => 'v_' + header));

  return { doubles, league, club, template, week };
}

function member(number, overrides) {
  return Object.assign({
    member_number: number,
    name: 'Member ' + number,
    udisc_username: 'member' + number,
    pdga_number: String(1000 + number),
    is_active: true,
    created_at: 't',
    updated_at: 't'
  }, overrides || {});
}

function rosterNumbers(h, club) {
  const headers = h.fn('getSheetHeaders')(club);
  const memberCol = headers.indexOf('member_number');
  return club.getDataRange().getValues().slice(1).map((row) => row[memberCol]);
}

function valueFor(h, club, rowIndex, header) {
  const headers = h.fn('getSheetHeaders')(club);
  return club.rows[rowIndex][headers.indexOf(header)];
}

// ─── The acceptance path: full reset, then seed ─────────────────────────────

test('a seed-only reload restores exact source member numbers after a full reset', () => {
  const h = loadCode();
  const { doubles, club } = buildProvisionedDoubles(h, h.bound.SPREADSHEET_ID_DOUBLES_TEST);

  // Start with a populated roster, then wipe it with the guarded full reset
  // on the test-flagged surface.
  club.appendRow([3, 'Old', 'old', '1', true, 't', 't', 0]);
  const reset = h.fn('resetTestData')(doubles, {
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES_TEST,
    apply: true,
    scope: 'full'
  });
  assert.equal(reset.applied, true);
  assert.equal(reset.refused, false);
  assert.equal(club.rows.length, 1, 'the full reset leaves a header-only roster');

  const members = [member(1), member(4), member(19)];

  const report = h.parse(h.fn('handleSeedRoster')({
    league: h.bound.LEAGUE_ID_DOUBLES_TEST,
    members: members,
    apply: true
  }));

  assert.equal(report.status, 'ok');
  assert.equal(report.applied, true);
  assert.equal(report.inserted, 3);
  assert.equal(report.updated, 0);
  assert.equal(report.unchanged, 0);
  assert.equal(report.total_members, 3);
  assert.deepEqual(report.inserted_member_numbers, [1, 4, 19]);
  assert.deepEqual(rosterNumbers(h, club), [1, 4, 19], 'member numbers must be exact, never renumbered');
  assert.deepEqual(
    h.openByIdCalls,
    [h.bound.SPREADSHEET_ID_DOUBLES_TEST],
    'the explicit-payload reload opens only the doubles test spreadsheet, never Singles'
  );
});

test('the seed reload is the supported path on an already-provisioned workbook', () => {
  const h = loadCode();
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const singlesClub = singles.insertSheet('ClubMembers');
  singlesClub.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  singlesClub.appendRow([1, 'Existing', 'existing', '', 1, true, 't', 't']);

  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  h.fn('provisionDoublesWorkbook')(doubles, singles);

  // The old seed path — re-provisioning — refuses once the workbook exists.
  const provision = h.parse(h.fn('handleProvisionDoubles')({}));
  assert.equal(provision.status, 'already_provisioned');

  // The seed-only reload replaces it and still runs on that same workbook.
  const report = h.parse(h.fn('handleSeedRoster')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    members: [member(2)],
    apply: true
  }));

  assert.equal(report.status, 'ok');
  assert.equal(report.inserted, 1);
  assert.equal(report.updated, 0);

  const club = doubles.getSheetByName('ClubMembers');
  assert.deepEqual(rosterNumbers(h, club).sort((a, b) => a - b), [1, 2]);
});

test('the roster seed is permitted on the production doubles spreadsheet', () => {
  const h = loadCode();
  const { doubles, club } = buildProvisionedDoubles(h);

  const report = h.parse(h.fn('handleSeedRoster')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    members: [member(1), member(2)],
    apply: true
  }));

  assert.equal(report.status, 'ok');
  assert.equal(report.refused, false);
  assert.equal(report.applied, true);
  assert.equal(report.inserted, 2);
  assert.deepEqual(rosterNumbers(h, club), [1, 2]);
  assert.deepEqual(
    h.openByIdCalls,
    [h.bound.SPREADSHEET_ID_DOUBLES],
    'the production roster-fill path opens the production doubles spreadsheet only'
  );
});

// ─── Dry run ─────────────────────────────────────────────────────────────────

test('a dry run reports precisely what would change and writes nothing', () => {
  const h = loadCode();
  const { doubles, club } = buildProvisionedDoubles(h);
  club.appendRow([4, 'Old', 'old', '1', true, 't', 't', 7]);
  club.appendRow([9, 'Keep', 'keep', '2', true, 't', 't', 2]);

  const before = JSON.stringify(club.rows);
  const members = [
    member(4, { name: 'Damon', udisc_username: 'damon31', pdga_number: '151236' }),
    member(9, { name: 'Keep', udisc_username: 'keep', pdga_number: '2' }),
    member(12)
  ];

  const report = h.parse(h.fn('handleSeedRoster')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    members: members
  }));

  assert.equal(report.status, 'ok');
  assert.equal(report.applied, false);
  assert.equal(report.inserted, 1);
  assert.equal(report.updated, 1);
  assert.equal(report.unchanged, 1);
  assert.deepEqual(report.inserted_member_numbers, [12]);
  assert.deepEqual(report.updated_member_numbers, [4]);
  assert.deepEqual(report.unchanged_member_numbers, [9]);
  assert.equal(report.sheets_changed, 1);
  assert.equal(JSON.stringify(club.rows), before, 'a dry run must not write');
});

// ─── Apply / upsert semantics ────────────────────────────────────────────────

test('an apply upserts by member_number and preserves the season_points cache', () => {
  const h = loadCode();
  const { doubles, club } = buildProvisionedDoubles(h);
  club.appendRow([4, 'Old', 'old', '1', true, 't', 't', 7]);

  const members = [
    member(4, { name: 'Damon', udisc_username: 'damon31', pdga_number: '151236' }),
    member(5, { name: 'Robin', udisc_username: 'robin', pdga_number: '222' })
  ];

  const first = h.parse(h.fn('handleSeedRoster')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    members: members,
    apply: true
  }));

  assert.equal(first.inserted, 1);
  assert.equal(first.updated, 1);
  assert.equal(club.rows.length, 3, 'an update must not duplicate the row');
  assert.deepEqual(rosterNumbers(h, club).sort((a, b) => a - b), [4, 5]);
  assert.equal(valueFor(h, club, 1, 'name'), 'Damon');
  assert.equal(valueFor(h, club, 1, 'season_points'), 7, 'the derived cache is preserved on update');

  // Seeding the identical payload again is a true no-op.
  const before = JSON.stringify(club.rows);
  const second = h.parse(h.fn('handleSeedRoster')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    members: members,
    apply: true
  }));

  assert.equal(second.inserted, 0);
  assert.equal(second.updated, 0);
  assert.equal(second.unchanged, 2);
  assert.equal(second.sheets_changed, 0);
  assert.equal(JSON.stringify(club.rows), before, 'a repeat seed must not write');
});

test('a reload writes current_tag blank and never touches weekly sheets', () => {
  const h = loadCode();
  const { doubles, club, week, template } = buildProvisionedDoubles(h);

  // A legacy roster that still carries current_tag.
  club.clear();
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS.concat(['season_points']));
  club.appendRow([4, 'Old', 'old', '1', 'tag-9', true, 't', 't', 7]);

  const weekBefore = JSON.stringify(week.rows);
  const templateBefore = JSON.stringify(template.rows);

  const report = h.parse(h.fn('handleSeedRoster')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    members: [member(4, { current_tag: 'SHOULD-NOT-WRITE' })],
    apply: true
  }));

  assert.equal(report.status, 'ok');
  assert.equal(valueFor(h, club, 1, 'current_tag'), '', 'current_tag must stay blank');
  assert.equal(valueFor(h, club, 1, 'season_points'), 7);
  assert.equal(JSON.stringify(week.rows), weekBefore, 'weekly rows must never be written');
  assert.equal(JSON.stringify(template.rows), templateBefore, 'the week template must never be written');
});

test('an insert lands blank season_points and blank current_tag', () => {
  const h = loadCode();
  const { doubles, club } = buildProvisionedDoubles(h);

  const report = h.parse(h.fn('handleSeedRoster')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    members: [member(3, { season_points: 99, current_tag: 'nope' })],
    apply: true
  }));

  assert.equal(report.inserted, 1);
  assert.equal(valueFor(h, club, 1, 'season_points'), '', 'a new row starts with a blank points cache');
  assert.equal(valueFor(h, club, 1, 'member_number'), 3);
});

// ─── Guard / refusal paths ───────────────────────────────────────────────────

test('the reload refuses the singles POC and a non-doubles target and writes nothing', () => {
  const h = loadCode();
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const club = singles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  club.appendRow([3, 'Live', 'live', '', true, 't', 't', 5]);
  const before = JSON.stringify(club.rows);

  const members = [member(3)];

  const live = h.parse(h.fn('handleSeedRoster')({
    league: h.bound.LEAGUE_ID_SINGLES,
    members: members,
    apply: true
  }));
  assert.equal(live.status, 'error');
  assert.equal(live.refused, true);
  assert.equal(live.reason, 'non_doubles');
  assert.equal(JSON.stringify(club.rows), before, 'the singles POC must never be seeded');

  const unknown = h.parse(h.fn('handleSeedRoster')({
    spreadsheetId: 'not-a-real-sheet',
    members: members,
    apply: true
  }));
  assert.equal(unknown.status, 'error');
  assert.equal(unknown.refused, true);
  assert.equal(JSON.stringify(club.rows), before);
});

test('the reload rejects a missing or malformed payload before writing', () => {
  const h = loadCode();
  const { doubles, club } = buildProvisionedDoubles(h);
  const before = JSON.stringify(club.rows);

  const cases = [
    { league: h.bound.LEAGUE_ID_DOUBLES, apply: true },
    { league: h.bound.LEAGUE_ID_DOUBLES, members: [], apply: true },
    { league: h.bound.LEAGUE_ID_DOUBLES, members: 'nope', apply: true },
    { league: h.bound.LEAGUE_ID_DOUBLES, members: [{ name: 'No number' }], apply: true },
    { league: h.bound.LEAGUE_ID_DOUBLES, members: [{ member_number: 1 }, { member_number: 1 }], apply: true }
  ];

  cases.forEach((payload) => {
    const result = h.parse(h.fn('handleSeedRoster')(payload));
    assert.equal(result.status, 'error', 'expected error for ' + JSON.stringify(payload));
    assert.equal(result.refused, false);
    assert.match(result.message, /seedRoster/);
  });

  assert.equal(JSON.stringify(club.rows), before, 'a rejected payload must not write');
});

test('the reload reports a clear error when ClubMembers is missing', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const result = h.parse(h.fn('handleSeedRoster')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    members: [member(1)],
    apply: true
  }));

  assert.equal(result.status, 'error');
  assert.match(result.message, /ClubMembers tab not found/);
});

// ─── Routing ─────────────────────────────────────────────────────────────────

test('doPost routes the seedRoster action', () => {
  const h = loadCode();
  buildProvisionedDoubles(h);

  const result = h.parse(h.fn('doPost')({
    postData: {
      contents: JSON.stringify({
        action: 'seedRoster',
        league: h.bound.LEAGUE_ID_DOUBLES,
        members: [member(6)]
      })
    }
  }));

  assert.equal(result.status, 'ok');
  assert.equal(result.inserted, 1);
  assert.equal(result.applied, false);
});
