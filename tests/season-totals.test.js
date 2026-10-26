'use strict';

// Shared season aggregation: points and earnings come from one traversal of
// the season's Week tabs. The standings action therefore reads each week once
// instead of twice, while both totals and every externally visible field stay
// identical to the previous pair of independent scans.
//
// Runs in a Node VM with an in-memory Sheets fake. No live sheet is touched.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

const WEEK_ONE = '2026-10-05';
const WEEK_TWO = '2026-10-12';

const POOL_SETTINGS = {
  payout_contribution: 3,
  payout_second_amount: 10,
  payout_second_min_players: 10
};

function makeWeekRow(h, fields) {
  const headers = h.bound.WEEKLY_RECORD_HEADERS_DOUBLES;
  const row = new Array(headers.length).fill('');
  for (const key in fields) {
    const index = headers.indexOf(key);
    if (index !== -1) row[index] = fields[key];
  }
  return row;
}

function place(member, name, pairKey, positionRaw, positionLabel, points) {
  return {
    member_number: member,
    player_name_snapshot: name,
    pair_key: pairKey,
    team_position: positionLabel,
    team_position_raw: positionRaw,
    weekly_points: points,
    checked_in: true
  };
}

function buildDoubles(h, options) {
  options = options || {};
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  (options.members || [
    [1, 'Ann', 'ann', '', true, '', '', 0, 0],
    [2, 'Bob', 'bob', '', true, '', '', 0, 0],
    [3, 'Cid', 'cid', '', true, '', '', 0, 0],
    [4, 'Dee', 'dee', '', false, '', '', 0, 0]
  ]).forEach((row) => club.appendRow(row));

  Object.keys(options.weeks || {}).forEach((date) => {
    const week = doubles.insertSheet('Week ' + date);
    week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
    (options.weeks[date] || []).forEach((row) => week.appendRow(row));
  });

  const league = doubles.insertSheet('League');
  league.appendRow(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
  const settings = options.leagueSettings || POOL_SETTINGS;
  const row = new Array(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.length).fill('');
  for (const key in settings) {
    const index = h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.indexOf(key);
    if (index !== -1) row[index] = settings[key];
  }
  league.appendRow(row);

  return { doubles, club };
}

/** Two committed weeks: week 1 pays a winning pair, week 2 a different pair. */
function twoWeekFixture(h) {
  return buildDoubles(h, {
    weeks: {
      [WEEK_ONE]: [
        makeWeekRow(h, place(1, 'Ann', 'dubs:w1', 1, '1', 2)),
        makeWeekRow(h, place(2, 'Bob', 'dubs:w1', 1, '1', 2)),
        makeWeekRow(h, place(3, 'Cid', 'dubs:l1', 2, '2', 1.5)),
        makeWeekRow(h, place(4, 'Dee', 'dubs:l1', 2, '2', 1.5))
      ],
      [WEEK_TWO]: [
        makeWeekRow(h, place(3, 'Cid', 'dubs:w2', 1, '1', 2)),
        makeWeekRow(h, place(4, 'Dee', 'dubs:w2', 1, '1', 2)),
        makeWeekRow(h, place(1, 'Ann', '', 3, '3', 1)),
        makeWeekRow(h, place(2, 'Bob', '', 4, '4', 0.5))
      ]
    }
  });
}

function rules(h) {
  return h.fn('getLeagueRulesForSpreadsheet')(
    h.bound.LEAGUE_ID_DOUBLES,
    h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES)
  );
}

/** Wraps every Week tab's getDataRange so a test can count the reads. */
function countWeekReads(spreadsheet) {
  const reads = {};
  spreadsheet.getSheets().forEach((sheet) => {
    if (!/^Week \d{4}-\d{2}-\d{2}$/.test(sheet.getName())) return;
    const original = sheet.getDataRange.bind(sheet);
    reads[sheet.getName()] = 0;
    sheet.getDataRange = function() {
      reads[sheet.getName()]++;
      return original();
    };
  });
  return reads;
}

// ─── Shared aggregation equivalence ────────────────────────────────────────

test('one shared pass produces the same points and earnings as the two scans', () => {
  const h = loadCode();
  twoWeekFixture(h);
  const spreadsheet = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const totals = h.fn('sumSeasonTotalsByMember')(spreadsheet, rules(h));
  const legacyPoints = h.fn('sumSeasonPointsByMember')(spreadsheet);
  const legacyEarnings = h.fn('sumSeasonEarningsByMember')(spreadsheet, rules(h));

  assert.deepEqual(totals.points, legacyPoints);
  assert.deepEqual(totals.earnings, legacyEarnings);
  assert.deepEqual(totals.points, { 1: 3, 2: 2.5, 3: 3.5, 4: 3.5 });
  // $12 pool per week (4 players x $3), all to the winners: $6 each pair member.
  assert.deepEqual(totals.earnings, { 1: 6, 2: 6, 3: 6, 4: 6 });
});

test('a points-only aggregation skips the payout math but keeps every point', () => {
  const h = loadCode();
  twoWeekFixture(h);
  const spreadsheet = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const pointsOnly = h.fn('sumSeasonTotalsByMember')(spreadsheet, null);
  assert.deepEqual(pointsOnly.earnings, {});
  assert.deepEqual(pointsOnly.points, { 1: 3, 2: 2.5, 3: 3.5, 4: 3.5 });
});

// ─── Standings traverse each week tab once ────────────────────────────────

test('standings read each Week tab once for both totals', () => {
  const h = loadCode();
  const { doubles } = twoWeekFixture(h);
  const reads = countWeekReads(doubles);

  const result = h.parse(h.fn('handleSeasonStandings')({
    league: h.bound.LEAGUE_ID_DOUBLES
  }));

  assert.equal(result.status, 'ok');
  assert.deepEqual(reads, { ['Week ' + WEEK_ONE]: 1, ['Week ' + WEEK_TWO]: 1 });
});

test('standings keep their fields, ordering, and totals', () => {
  const h = loadCode();
  twoWeekFixture(h);

  const result = h.parse(h.fn('handleSeasonStandings')({
    league: h.bound.LEAGUE_ID_DOUBLES
  }));

  assert.equal(result.status, 'ok');
  assert.equal(result.writes, false);
  // Points: 3.5 (Cid/Dee) then 3 (Ann) then 2.5 (Bob); ties break by member id.
  assert.deepEqual(result.standings.map((row) => row.member_number), [3, 4, 1, 2]);
  assert.deepEqual(
    result.standings.map((row) => row.season_points),
    [3.5, 3.5, 3, 2.5]
  );
  assert.deepEqual(
    result.standings.map((row) => row.season_earnings),
    [6, 6, 6, 6]
  );
});

// ─── Members listing shares the same aggregation ───────────────────────────

test('listClubMembers reads each Week tab once and reports the live points', () => {
  const h = loadCode();
  const { doubles } = twoWeekFixture(h);
  const reads = countWeekReads(doubles);

  const result = h.parse(h.fn('handleListClubMembers')({
    league: h.bound.LEAGUE_ID_DOUBLES
  }));

  assert.equal(result.status, 'ok');
  assert.deepEqual(reads, { ['Week ' + WEEK_ONE]: 1, ['Week ' + WEEK_TWO]: 1 });
  const byMember = {};
  result.members.forEach((member) => { byMember[member.member_number] = member; });
  assert.equal(byMember[1].season_points, 3);
  assert.equal(byMember[3].season_points, 3.5);
  assert.equal(byMember[4].is_active, false);
  assert.equal(byMember[4].season_points, 3.5);
});

// ─── Edge cases stay faithful to the previous scans ────────────────────────

test('a week tab missing the points columns contributes to neither total', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  club.appendRow([1, 'Ann', 'ann', '', true, '', '', 0, 0]);

  // A malformed week tab: only a member_number column, no weekly_points.
  const odd = doubles.insertSheet('Week ' + WEEK_ONE);
  odd.appendRow(['member_number', 'player_name_snapshot']);
  odd.appendRow([1, 'Ann']);

  const league = doubles.insertSheet('League');
  league.appendRow(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
  league.appendRow(new Array(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.length).fill(''));

  const totals = h.fn('sumSeasonTotalsByMember')(
    h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES),
    rules(h)
  );
  assert.deepEqual(totals.points, {});
  assert.deepEqual(totals.earnings, {});
});

test('an uncommitted row with blank weekly_points contributes nothing', () => {
  const h = loadCode();
  buildDoubles(h, {
    weeks: {
      [WEEK_ONE]: [
        makeWeekRow(h, place(1, 'Ann', 'dubs:w1', 1, '1', 2)),
        makeWeekRow(h, place(2, 'Bob', 'dubs:w1', 1, '1', ''))
      ]
    }
  });

  const totals = h.fn('sumSeasonTotalsByMember')(
    h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES),
    rules(h)
  );
  assert.equal(totals.points[1], 2);
  assert.equal(totals.points[2], undefined);
});
