'use strict';

// Season money — per-member season earnings plus the Season Standings action.
//
// Earnings follow the existing season-points pattern end to end: a live sum
// recomputed from the committed Week tabs (re-applying the league's payout
// pool rule per week, splitting evenly across a pair's members and giving a
// solo the full per-player share), mirrored into a ClubMembers
// `season_earnings` cache column by a recompute-from-scratch batch write at
// the end of every import commit. The ace pot is not part of any of it: the
// points/payout path carries no ace-pot logic and none is added here.
//
// Payout was never persisted per week, so every earnings figure is derived at
// read time from committed placements under the league's current settings —
// the same figure the Week Results table has always shown for those weeks.
//
// All tests run in a Node VM with an in-memory Sheets fake. No Google
// credentials, network access, or live sheet writes are involved.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

const WEEK_ONE = '2026-10-05';
const WEEK_TWO = '2026-10-12';

function makeWeekRow(h, fields) {
  const headers = h.bound.WEEKLY_RECORD_HEADERS_DOUBLES;
  const row = new Array(headers.length).fill('');
  for (const key in fields) {
    const index = headers.indexOf(key);
    if (index !== -1) row[index] = fields[key];
  }
  return row;
}

/** Points the commit persists for a placement (the default 1st/2nd/3rd table). */
const POINTS_BY_PLACE = { 1: 2, 2: 1.5, 3: 1 };

function place(member, name, pairKey, positionRaw, positionLabel) {
  return {
    member_number: member,
    player_name_snapshot: name,
    pair_key: pairKey,
    team_position: positionLabel,
    team_position_raw: positionRaw,
    // A committed week always carries the persisted points alongside its
    // placement; the standings include a member only through those points.
    weekly_points: POINTS_BY_PLACE[positionRaw] !== undefined ? POINTS_BY_PLACE[positionRaw] : 0.5,
    checked_in: true
  };
}

/**
 * Builds a doubles spreadsheet with a roster, optional League payout settings,
 * and one or more committed week tabs. `weeks` is { 'YYYY-MM-DD': [rows] }.
 */
function buildDoubles(h, options) {
  options = options || {};
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(options.clubHeaders || h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  (options.members || [
    [1, 'Damon Forsythe', 'damon31', '151236', true, '', '', 0, 0],
    [2, 'Brad Stevenson', 'donjoses', '85170', true, '', '', 0, 0],
    [3, 'Brian Corlew', 'buzzbc13', '', true, '', '', 0, 0],
    [4, 'Cortez Ashley', 'redbean', '', true, '', '', 0, 0],
    [5, 'Josh Moen', 'jmoe76', '', true, '', '', 0, 0],
    [6, 'David Opsahl', 'upshot1987', '', true, '', '', 0, 0],
    [7, 'Robert Finch', 'finch411', '', true, '', '', 0, 0]
  ]).forEach((row) => club.appendRow(row));

  const weekSheets = {};
  Object.keys(options.weeks || {}).forEach((date) => {
    const week = doubles.insertSheet('Week ' + date);
    week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
    (options.weeks[date] || []).forEach((row) => week.appendRow(row));
    weekSheets[date] = week;
  });

  let league = null;
  if (options.leagueSettings !== undefined) {
    league = doubles.insertSheet('League');
    league.appendRow(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
    const row = new Array(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.length).fill('');
    for (const key in options.leagueSettings) {
      const index = h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.indexOf(key);
      if (index !== -1) row[index] = options.leagueSettings[key];
    }
    league.appendRow(row);
  }

  return { doubles, club, league, weekSheets };
}

function standingsCall(h, extra) {
  const payload = Object.assign({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES }, extra || {});
  return h.parse(h.fn('handleSeasonStandings')(payload));
}

function commit(h, rows, extra) {
  const payload = Object.assign({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: WEEK_ONE,
    rows: rows,
    approved: true
  }, extra || {});
  return h.parse(h.fn('handleCommitUdiscImportDoubles')(payload));
}

function column(sheet, header) {
  const index = sheet.rows[0].indexOf(header);
  return sheet.rows.slice(1).map((row) => row[index]);
}

function storedEarnings(club) {
  const hMember = club.rows[0].indexOf('member_number');
  const hEarnings = club.rows[0].indexOf('season_earnings');
  const stored = {};
  club.rows.slice(1).forEach((row) => { stored[row[hMember]] = row[hEarnings]; });
  return stored;
}

// A seven-player week: a 1st pair, two tied-2nd pairs, a 4th solo. With a
// $3 contribution the pool is $21; below a 10-player second threshold only
// the winners are paid $10.50 each.
function octoberFifthRows(h) {
  return [
    makeWeekRow(h, place(1, 'Damon Forsythe', 'dubs:p1', 1, '1')),
    makeWeekRow(h, place(2, 'Brad Stevenson', 'dubs:p1', 1, '1')),
    makeWeekRow(h, place(3, 'Brian Corlew', 'dubs:p2', 2, 'T2')),
    makeWeekRow(h, place(4, 'Cortez Ashley', 'dubs:p2', 2, 'T2')),
    makeWeekRow(h, place(5, 'Josh Moen', 'dubs:p3', 2, 'T2')),
    makeWeekRow(h, place(6, 'David Opsahl', 'dubs:p3', 2, 'T2')),
    makeWeekRow(h, place(7, 'Robert Finch', '', 4, '4'))
  ];
}

const POOL_SETTINGS = { payout_contribution: 3, payout_second_amount: 10, payout_second_min_players: 10 };

// ─── Live earnings aggregation ──────────────────────────────────────────────

test('a winning pair splits the payout evenly between its members', () => {
  const h = loadCode();
  buildDoubles(h, { leagueSettings: POOL_SETTINGS, weeks: { [WEEK_ONE]: octoberFifthRows(h) } });

  const totals = h.fn('sumSeasonEarningsByMember')(
    h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES),
    h.fn('getLeagueRulesForSpreadsheet')(h.bound.LEAGUE_ID_DOUBLES, h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES))
  );

  // The $21 pool pays the 1st pair $10.50 per member; everyone else $0.
  assert.equal(totals[1], 10.5);
  assert.equal(totals[2], 10.5);
  assert.equal(totals[3], 0);
  assert.equal(totals[7], 0);
});

test('a solo takes the full per-player share', () => {
  const h = loadCode();
  // Five players: a 1st solo and a 2nd pair, no second-place threshold.
  buildDoubles(h, {
    leagueSettings: { payout_contribution: 4, payout_second_amount: 0, payout_second_min_players: 0 },
    weeks: {
      [WEEK_ONE]: [
        makeWeekRow(h, place(1, 'Solo Winner', '', 1, '1')),
        makeWeekRow(h, place(2, 'Pair A', 'dubs:p2', 2, '2')),
        makeWeekRow(h, place(3, 'Pair A', 'dubs:p2', 2, '2'))
      ]
    }
  });

  const totals = h.fn('sumSeasonEarningsByMember')(
    h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES),
    h.fn('getLeagueRulesForSpreadsheet')(h.bound.LEAGUE_ID_DOUBLES, h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES))
  );

  // $4 x 3 players = $12 pool; the solo winner takes all $12.
  assert.equal(totals[1], 12);
  assert.equal(totals[2], 0);
});

test('tied second-place pairs share the second-place amount evenly', () => {
  const h = loadCode();
  // A full field with a tie for second: $3 x 10 = $30 pool, second place $10
  // paid across four members, winners take $20.
  const rows = [];
  let member = 1;
  const labels = ['1', 'T2', 'T2', '4', '5'];
  for (let team = 1; team <= 5; team++) {
    const key = 'dubs:p' + team;
    const positionRaw = team === 2 || team === 3 ? 2 : team;
    rows.push(makeWeekRow(h, place(member, 'Player ' + member, key, positionRaw, labels[team - 1])));
    member++;
    rows.push(makeWeekRow(h, place(member, 'Player ' + member, key, positionRaw, labels[team - 1])));
    member++;
  }
  buildDoubles(h, {
    members: Array.from({ length: 10 }, (_, i) => [i + 1, 'Player ' + (i + 1), 'p' + (i + 1), '', true, '', '', 0, 0]),
    leagueSettings: POOL_SETTINGS,
    weeks: { [WEEK_ONE]: rows }
  });

  const totals = h.fn('sumSeasonEarningsByMember')(
    h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES),
    h.fn('getLeagueRulesForSpreadsheet')(h.bound.LEAGUE_ID_DOUBLES, h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES))
  );

  assert.equal(totals[1], 10, 'winner: $20 / 2 players');
  assert.equal(totals[2], 10);
  assert.equal(totals[3], 2.5, 'tied second: $10 / 4 players');
  assert.equal(totals[4], 2.5);
  assert.equal(totals[5], 2.5);
  assert.equal(totals[6], 2.5);
});

test('earnings accumulate across committed weeks', () => {
  const h = loadCode();
  // Week 1: members 1+2 win. Week 2: member 1 solo 2nd, members 3+4 win.
  buildDoubles(h, {
    leagueSettings: { payout_contribution: 2, payout_second_amount: 0, payout_second_min_players: 0 },
    weeks: {
      [WEEK_ONE]: [
        makeWeekRow(h, place(1, 'Ann', 'dubs:w1', 1, '1')),
        makeWeekRow(h, place(2, 'Bob', 'dubs:w1', 1, '1')),
        makeWeekRow(h, place(3, 'Cid', 'dubs:l1', 2, '2')),
        makeWeekRow(h, place(4, 'Dee', 'dubs:l1', 2, '2'))
      ],
      [WEEK_TWO]: [
        makeWeekRow(h, place(1, 'Ann', '', 2, '2')),
        makeWeekRow(h, place(3, 'Cid', 'dubs:w2', 1, '1')),
        makeWeekRow(h, place(4, 'Dee', 'dubs:w2', 1, '1'))
      ]
    }
  });

  const totals = h.fn('sumSeasonEarningsByMember')(
    h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES),
    h.fn('getLeagueRulesForSpreadsheet')(h.bound.LEAGUE_ID_DOUBLES, h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES))
  );

  // Week 1 pool $8: winners 1+2 take $4 each. Week 2 pool $6: winners 3+4
  // take $3 each, the solo gets the whole $6 as the only paying player.
  assert.equal(totals[1], 4);
  assert.equal(totals[2], 4);
  assert.equal(totals[3], 3);
  assert.equal(totals[4], 3);
  assert.equal(totals[7], undefined, 'a member with no committed rows is absent from the live sum');
});

test('a league with no weekly payout configured earns nothing', () => {
  const h = loadCode();
  buildDoubles(h, {
    leagueSettings: { payout_contribution: '', payout_second_amount: '', payout_second_min_players: '' },
    weeks: { [WEEK_ONE]: octoberFifthRows(h) }
  });

  const totals = h.fn('sumSeasonEarningsByMember')(
    h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES),
    h.fn('getLeagueRulesForSpreadsheet')(h.bound.LEAGUE_ID_DOUBLES, h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES))
  );

  Object.keys(totals).forEach((member) => assert.equal(totals[member], 0, member));
});

// ─── Season Standings action ────────────────────────────────────────────────

test('standings list every member with points, best first, with earnings', () => {
  const h = loadCode();
  buildDoubles(h, { leagueSettings: POOL_SETTINGS, weeks: { [WEEK_ONE]: octoberFifthRows(h) } });

  const result = standingsCall(h);
  assert.equal(result.status, 'ok');
  assert.equal(result.writes, false);

  // Members 1-7 all have points (1st=2, T2=1.5, 4th=0.5); only 1 and 2 earn.
  assert.deepEqual(result.standings.map((row) => row.member_number), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(result.standings[0].name, 'Damon Forsythe');
  assert.equal(result.standings[0].season_points, 2);
  assert.equal(result.standings[0].season_earnings, 10.5);
  assert.equal(result.standings[2].season_points, 1.5);
  assert.equal(result.standings[2].season_earnings, 0, 'points but no payout still lists with 0');
  assert.equal(result.standings[6].season_points, 0.5);
});

test('standings sort by points then member number and omit members without points', () => {
  const h = loadCode();
  const members = [
    [1, 'Ann', 'ann', '', true, '', '', 0, 0],
    [2, 'Bob', 'bob', '', true, '', '', 0, 0],
    [3, 'Cid', 'cid', '', true, '', '', 0, 0],
    [4, 'Dee', 'dee', '', false, '', '', 0, 0]
  ];
  buildDoubles(h, {
    members: members,
    leagueSettings: POOL_SETTINGS,
    weeks: {
      [WEEK_ONE]: [
        // Members 1 and 2 tie on 2 points; member 3 has 1, member 4 has none.
        makeWeekRow(h, place(2, 'Bob', 'dubs:p1', 1, '1')),
        makeWeekRow(h, place(1, 'Ann', 'dubs:p2', 1, 'T1')),
        makeWeekRow(h, place(3, 'Cid', 'dubs:p3', 3, '3'))
      ]
    }
  });

  const result = standingsCall(h);
  assert.deepEqual(
    result.standings.map((row) => row.member_number),
    [1, 2, 3],
    'member_number ascending breaks the points tie; a member with no points is absent'
  );
  const cid = result.standings[2];
  assert.equal(cid.season_points, 1);
  assert.equal(cid.season_earnings, 0, 'a qualifying member with zero earnings is included');
});

test('standings include inactive members that have points', () => {
  const h = loadCode();
  const members = [
    [1, 'Ann', 'ann', '', false, '', '', 0, 0],
    [2, 'Bob', 'bob', '', true, '', '', 0, 0]
  ];
  buildDoubles(h, {
    members: members,
    leagueSettings: POOL_SETTINGS,
    weeks: { [WEEK_ONE]: octoberFifthRows(h).slice(0, 2).map((row, i) => {
      // Reuse the two winning rows but for members 1 and 2.
      const copy = row.slice();
      copy[h.bound.WEEKLY_RECORD_HEADERS_DOUBLES.indexOf('member_number')] = i + 1;
      return copy;
    }) }
  });

  const result = standingsCall(h);
  assert.deepEqual(result.standings.map((row) => row.member_number), [1, 2]);
});

test('standings report an empty list when nobody has points', () => {
  const h = loadCode();
  buildDoubles(h, { leagueSettings: POOL_SETTINGS, weeks: {} });

  const result = standingsCall(h);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.standings, []);
});

test('standings refuse the singles format before opening a spreadsheet', () => {
  const h = loadCode();
  const result = h.parse(h.fn('handleSeasonStandings')({
    spreadsheetId: h.bound.SPREADSHEET_ID
  }));

  assert.equal(result.status, 'error');
  assert.match(result.message, /scoring method/i);
  assert.deepEqual(h.openByIdCalls, [], 'must not open the singles spreadsheet');
});

test('the standings action writes nothing', () => {
  const h = loadCode();
  const { doubles } = buildDoubles(h, { leagueSettings: POOL_SETTINGS, weeks: { [WEEK_ONE]: octoberFifthRows(h) } });
  const before = JSON.stringify(doubles.getSheets().map((sheet) => sheet.rows));

  standingsCall(h);

  const after = JSON.stringify(doubles.getSheets().map((sheet) => sheet.rows));
  assert.equal(after, before);
});

// ─── The import commit mirrors earnings into the cache ──────────────────────

test('the import commit mirrors the live earnings sum into ClubMembers.season_earnings', () => {
  const h = loadCode();
  // A roster provisioned before season money existed: no earnings column.
  const { club, weekSheets } = buildDoubles(h, {
    clubHeaders: h.bound.CLUB_MEMBER_HEADERS_DETAG,
    members: [
      [1, 'Damon Forsythe', 'damon31', '151236', true, '', '', 0],
      [2, 'Brad Stevenson', 'donjoses', '85170', true, '', '', 0],
      [3, 'Brian Corlew', 'buzzbc13', '', true, '', '', 0],
      [4, 'Cortez Ashley', 'redbean', '', true, '', '', 0],
      [5, 'Josh Moen', 'jmoe76', '', true, '', '', 0],
      [6, 'David Opsahl', 'upshot1987', '', true, '', '', 0],
      [7, 'Robert Finch', 'finch411', '', true, '', '', 0]
    ],
    leagueSettings: POOL_SETTINGS,
    weeks: { [WEEK_ONE]: [] }
  });

  // A pre-earnings roster has no cache column until the first commit.
  assert.equal(club.rows[0].indexOf('season_earnings'), -1);

  const result = commit(h, [
    { name: 'Damon Forsythe & Brad Stevenson', usernames: 'damon31,donjoses', position: 1, position_raw: 1 },
    { name: 'Robert Finch', username: 'finch411', position: 4, position_raw: 4 }
  ]);

  assert.equal(result.status, 'ok');
  assert.equal(result.season_earnings_synced, 7, 'every roster row is refreshed');

  // The column is created in place and holds the live value for every member.
  // Three players this week: a $9 pool, no second place below the threshold,
  // so the winning pair splits it $4.50 each.
  assert.notEqual(club.rows[0].indexOf('season_earnings'), -1);
  const stored = storedEarnings(club);
  assert.equal(stored[1], 4.5, '1st-place partner: half the $9 pool');
  assert.equal(stored[2], 4.5);
  assert.equal(stored[7], 0, 'the solo below the paying cut is cached as 0');
  assert.equal(stored[3], 0, 'a member with no committed rows is cached as 0');

  const live = h.fn('sumSeasonEarningsByMember')(
    h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES),
    h.fn('getLeagueRulesForSpreadsheet')(h.bound.LEAGUE_ID_DOUBLES, h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES))
  );
  Object.keys(live).forEach((memberNumber) => {
    assert.equal(stored[memberNumber], live[memberNumber], 'member ' + memberNumber);
  });
  assert.equal(weekSheets[WEEK_ONE].rows[0].indexOf('weekly_payout'), -1, 'no weekly payout column is added');
});

test('a later commit refreshes the earnings cache rather than initializing it once', () => {
  const h = loadCode();
  const { club } = buildDoubles(h, {
    leagueSettings: { payout_contribution: 2, payout_second_amount: 0, payout_second_min_players: 0 },
    weeks: { [WEEK_ONE]: [], [WEEK_TWO]: [] }
  });

  commit(h, [{ name: 'Damon Forsythe & Brad Stevenson', usernames: 'damon31,donjoses', position: 1, position_raw: 1 }]);
  assert.equal(storedEarnings(club)[1], 2, '$4 pool (2 players x $2) split across the pair');

  // Week 2 pays the same pair again, so the cache must move with it.
  commit(h, [
    { name: 'Damon Forsythe & Brad Stevenson', usernames: 'damon31,donjoses', position: 1, position_raw: 1 }
  ], { league_date: WEEK_TWO });

  assert.equal(storedEarnings(club)[1], 4, '2 (week 1) + 2 (week 2)');
});

test('a replayed commit never double-counts earnings', () => {
  const h = loadCode();
  const { club } = buildDoubles(h, { leagueSettings: POOL_SETTINGS, weeks: { [WEEK_ONE]: [] } });

  const row = { name: 'Damon Forsythe & Brad Stevenson', usernames: 'damon31,donjoses', position: 1, position_raw: 1 };
  commit(h, [row]);
  const afterFirst = storedEarnings(club);

  // The same import again reconciles in place; the recompute-from-scratch
  // cache write re-derives the same totals instead of adding to them.
  const second = commit(h, [row]);
  assert.equal(second.status, 'ok');
  assert.deepEqual(storedEarnings(club), afterFirst);
});

test('correcting a committed placement re-derives season earnings', () => {
  const h = loadCode();
  const { club, weekSheets } = buildDoubles(h, { leagueSettings: POOL_SETTINGS, weeks: { [WEEK_ONE]: [] } });

  commit(h, [
    { name: 'Damon Forsythe & Brad Stevenson', usernames: 'damon31,donjoses', position: 1, position_raw: 1 }
  ]);
  // Two players, $6 pool, all to the winners: $3 each.
  assert.equal(storedEarnings(club)[1], 3);

  // The same pair re-imported in 3rd place: the pool no longer pays them.
  const corrected = commit(h, [
    { name: 'Damon Forsythe & Brad Stevenson', usernames: 'damon31,donjoses', position: 3, position_raw: 3 }
  ]);
  assert.equal(corrected.status, 'ok');

  assert.equal(storedEarnings(club)[1], 0, 'no residue from the old placement');
  assert.equal(column(weekSheets[WEEK_ONE], 'weekly_points')[0], 1, 'points re-derived too');
});

// ─── Cache backfill (maintenance action) ────────────────────────────────────

test('syncSeasonCaches backfills historical weeks and is repeatable', () => {
  const h = loadCode();
  // Historical weeks committed before season money existed: the roster has
  // the pre-earnings layout (no season_earnings column at all).
  const { club } = buildDoubles(h, {
    clubHeaders: h.bound.CLUB_MEMBER_HEADERS_DETAG,
    members: [
      [1, 'Ann', 'ann', '', true, '', '', 0],
      [2, 'Bob', 'bob', '', true, '', '', 0],
      [3, 'Cid', 'cid', '', true, '', '', 0]
    ],
    leagueSettings: POOL_SETTINGS,
    weeks: {
      [WEEK_ONE]: [
        makeWeekRow(h, place(1, 'Ann', 'dubs:p1', 1, '1')),
        makeWeekRow(h, place(2, 'Bob', 'dubs:p1', 1, '1')),
        makeWeekRow(h, place(3, 'Cid', 'dubs:p2', 3, '3'))
      ]
    }
  });
  assert.equal(club.rows[0].indexOf('season_earnings'), -1);

  const first = h.parse(h.fn('handleSyncSeasonCaches')({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES }));
  assert.equal(first.status, 'ok');
  assert.equal(first.season_earnings_synced, 3);

  // Both cache columns are created in place and hold the live totals. Three
  // players: a $9 pool all to the winners, $4.50 each.
  const stored = storedEarnings(club);
  assert.equal(stored[1], 4.5);
  assert.equal(stored[2], 4.5);
  assert.equal(stored[3], 0);
  const pointsIndex = club.rows[0].indexOf('season_points');
  assert.equal(club.rows[1][pointsIndex], 2);

  // Running it again recomputes from scratch and never accumulates.
  const before = JSON.stringify(club.rows);
  const second = h.parse(h.fn('handleSyncSeasonCaches')({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES }));
  assert.equal(second.status, 'ok');
  assert.equal(JSON.stringify(club.rows), before, 'a repeat sync must not change the caches');
});

test('a blank spacer row keeps its cache value through the sync', () => {
  const h = loadCode();
  const { club } = buildDoubles(h, {
    leagueSettings: POOL_SETTINGS,
    weeks: { [WEEK_ONE]: octoberFifthRows(h) }
  });
  // A spacer row between members, carrying an existing (garbage) cache value.
  club.appendRow(['', '', '', '', '', '', '', '', 42]);

  const result = h.parse(h.fn('handleSyncSeasonCaches')({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES }));
  assert.equal(result.status, 'ok');

  const spacer = club.rows[club.rows.length - 1];
  assert.equal(spacer[club.rows[0].indexOf('season_earnings')], 42, 'a non-member row is preserved, not zeroed');
});

test('syncSeasonCaches refuses the singles format before opening a spreadsheet', () => {
  const h = loadCode();
  const result = h.parse(h.fn('handleSyncSeasonCaches')({ spreadsheetId: h.bound.SPREADSHEET_ID }));

  assert.equal(result.status, 'error');
  assert.match(result.message, /scoring method/i);
  assert.deepEqual(h.openByIdCalls, []);
});

// ─── Action routing ─────────────────────────────────────────────────────────

test('doPost routes seasonStandings and syncSeasonCaches', () => {
  const h = loadCode();
  buildDoubles(h, { leagueSettings: POOL_SETTINGS, weeks: { [WEEK_ONE]: octoberFifthRows(h) } });

  for (const action of ['seasonStandings', 'syncSeasonCaches']) {
    const out = h.fn('doPost')({ postData: { contents: JSON.stringify({ action, spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES }) } });
    const result = JSON.parse(out.getContent());
    assert.equal(result.status, 'ok', action);
  }
});

// ─── Roster seed preserves the earnings cache ───────────────────────────────

test('a roster re-seed preserves the season_earnings cache', () => {
  const h = loadCode();
  const { club } = buildDoubles(h, { leagueSettings: POOL_SETTINGS, weeks: { [WEEK_ONE]: octoberFifthRows(h) } });
  h.parse(h.fn('handleSyncSeasonCaches')({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES }));

  const before = storedEarnings(club);
  assert.equal(before[1], 10.5);

  // A re-seed with an unchanged payload must never touch a derived cache.
  const report = h.parse(h.fn('handleSeedRoster')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    members: [
      { member_number: 1, name: 'Damon Forsythe', udisc_username: 'damon31', pdga_number: '151236', is_active: true, joined: '2026-03-01T12:00:00.000Z' }
    ],
    apply: true
  }));

  assert.equal(report.status, 'ok');
  assert.equal(storedEarnings(club)[1], 10.5, 'the earnings cache survives the re-seed');
});

test('the doubles roster schema carries season_points and season_earnings', () => {
  const h = loadCode();

  const headers = h.bound.CLUB_MEMBER_HEADERS_DOUBLES;
  assert.deepEqual(headers.slice(-2), ['season_points', 'season_earnings']);
  assert.equal(headers.indexOf('current_tag'), -1);

  // The pre-earnings tag-free roster stays accepted as known-but-un-migrated.
  assert.equal(
    h.fn('clubMemberHeadersMatch')(h.bound.CLUB_MEMBER_HEADERS_DETAG.concat(['season_points']), 'doubles'),
    true
  );
  assert.equal(h.fn('clubMemberHeadersMatch')(headers, 'doubles'), true);
});
