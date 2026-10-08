'use strict';

// Doubles points — compute-at-commit plus live summation.
//
// The import commit is the only points boundary: it derives each participant's
// weekly_points from their committed team placement. Standings/member totals
// aggregate those committed values live at read time, with no confirm/finalize
// step and no cached season total. All tests run in a Node VM with an in-memory
// Sheets fake. No Google credentials, network access, or live sheet writes are
// involved.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

const WEEK_DATE = '2026-10-05';
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

/**
 * Builds a doubles spreadsheet with a roster and one or more week tabs.
 * `weeks` is { 'YYYY-MM-DD': [raw weekly rows] }.
 */
function buildDoubles(h, weeks, clubRows) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  (clubRows || [
    [1, 'Ann', 'ann', '', '', true, '', ''],
    [2, 'Bob', 'bob', '', '', true, '', ''],
    [3, 'Damon Forsythe', 'damon31', '151236', '', true, '', ''],
    [7, 'Brad Stevenson', 'donjoses', '85170', '', true, '', ''],
    [10, 'Jon', 'jon', '', '', true, '', ''],
    [21, 'Alice Smith', 'alice', '', '', true, '', '']
  ]).forEach((row) => club.appendRow(row));

  const weekSheets = {};
  Object.keys(weeks || {}).forEach((date) => {
    const week = doubles.insertSheet('Week ' + date);
    week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
    (weeks[date] || []).forEach((row) => week.appendRow(row));
    weekSheets[date] = week;
  });

  return { doubles, club, weekSheets };
}

function call(h, action, extra) {
  const payload = {
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: WEEK_DATE
  };
  if (extra) Object.assign(payload, extra);
  return h.parse(h.fn(action)(payload));
}

function commit(h, rows, extra) {
  return call(h, 'handleCommitUdiscImportDoubles', { rows, approved: true, ...extra });
}

function column(sheet, header) {
  const index = sheet.rows[0].indexOf(header);
  return sheet.rows.slice(1).map((row) => row[index]);
}

const PAIR_ROW = {
  name: 'Damon Forsythe & Brad Stevenson',
  usernames: 'damon31,donjoses',
  position: 1,
  position_raw: 1,
  round_total_score: 41
};

// A representative committed week: a 1st pair, a 3rd pair, and a 4th solo.
function sampleWeek(h) {
  return [
    makeWeekRow(h, { member_number: 1, player_name_snapshot: 'Ann', pair_key: 'p1', team_position: '1', team_position_raw: 1, weekly_points: 2 }),
    makeWeekRow(h, { member_number: 2, player_name_snapshot: 'Bob', pair_key: 'p1', team_position: '1', team_position_raw: 1, weekly_points: 2 }),
    makeWeekRow(h, { member_number: 3, player_name_snapshot: 'Cid', pair_key: 'p2', team_position: '3', team_position_raw: 3, weekly_points: 1 }),
    makeWeekRow(h, { member_number: 7, player_name_snapshot: 'Dee', pair_key: 'p2', team_position: '3', team_position_raw: 3, weekly_points: 1 }),
    makeWeekRow(h, { member_number: 10, player_name_snapshot: 'Jon', pair_key: '', team_position: '4', team_position_raw: 4, weekly_points: 0.5 })
  ];
}

// ─── Scoring matrix (pure) ───────────────────────────────────────────────────

test('doublesPointsForPosition implements 1st/2nd/3rd/participation', () => {
  const h = loadCode();
  const points = h.fn('doublesPointsForPosition');

  assert.equal(points(1), 2);
  assert.equal(points(2), 1.5);
  assert.equal(points(3), 1);
  assert.equal(points(4), 0.5);
  assert.equal(points(10), 0.5);
  assert.equal(points(''), 0.5, 'blank placement is showing-up credit');
  assert.equal(points(null), 0.5);
  assert.equal(points(undefined), 0.5);
  assert.equal(points('T2'), 0.5, 'a non-numeric placement falls back to participation');
});

// ─── Import commit is the single points boundary ─────────────────────────────

test('the import commit writes points from the committed placement', () => {
  const h = loadCode();
  const week = buildDoubles(h, { [WEEK_DATE]: [] }).weekSheets[WEEK_DATE];

  const result = commit(h, [PAIR_ROW]);
  assert.equal(result.status, 'ok');
  assert.equal(result.summary.committed, 1);

  // Both partners of a 1st-place team receive the full placement value.
  assert.deepEqual(column(week, 'weekly_points'), [2, 2]);
  // The retired status column is cleared, not used as a lifecycle gate.
  assert.deepEqual(column(week, 'weekly_points_status'), ['', '']);
});

test('a solo receives the full placement value at commit', () => {
  const h = loadCode();
  const week = buildDoubles(h, { [WEEK_DATE]: [] }).weekSheets[WEEK_DATE];

  commit(h, [{ name: 'Alice Smith', username: 'alice', position: 3, position_raw: 3 }]);
  assert.deepEqual(column(week, 'weekly_points'), [1]);
  assert.equal(column(week, 'pair_key')[0], '');
});

test('a blank placement at commit earns the 0.5 showing-up credit', () => {
  const h = loadCode();
  const week = buildDoubles(h, { [WEEK_DATE]: [] }).weekSheets[WEEK_DATE];

  commit(h, [{ name: 'Alice Smith', username: 'alice', position: '', position_raw: '' }]);
  assert.deepEqual(column(week, 'weekly_points'), [0.5]);
});

test('re-committing the same import is idempotent and never accumulates points', () => {
  const h = loadCode();
  const week = buildDoubles(h, { [WEEK_DATE]: [] }).weekSheets[WEEK_DATE];

  const first = commit(h, [PAIR_ROW]);
  assert.equal(first.summary.committed, 1);
  const firstPoints = column(week, 'weekly_points').slice();

  // The existing import identity mechanism reconciles the same pair in place:
  // the second commit succeeds without appending a duplicate row.
  const second = commit(h, [PAIR_ROW]);
  assert.equal(second.status, 'ok');
  assert.deepEqual(column(week, 'weekly_points'), firstPoints);
  assert.equal(column(week, 'weekly_points').length, 2, 'no duplicate rows');

  // The same row twice in one payload reports the replay explicitly.
  const batch = commit(h, [PAIR_ROW, PAIR_ROW]);
  assert.equal(batch.summary.already_committed, 1);
  assert.equal(batch.results[1].status, 'already_committed');
  assert.equal(column(week, 'weekly_points').length, 2, 'still no duplicate rows');
});

// ─── Read-only results view ──────────────────────────────────────────────────

test('calculatePoints is write-free and derives points from placement', () => {
  const h = loadCode();
  const { weekSheets } = buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });
  const week = weekSheets[WEEK_DATE];
  const before = week.rows.map((row) => row.slice());

  const result = call(h, 'handleCalculatePoints');
  assert.equal(result.status, 'ok');
  assert.equal(result.writes, false);
  assert.equal(result.summary.total_rows, 5);

  const byMember = {};
  result.players.forEach((p) => { byMember[p.member_number] = p; });
  assert.equal(byMember[1].points, 2);
  assert.equal(byMember[2].points, 2, 'both 1st-place partners receive 2');
  assert.equal(byMember[3].points, 1);
  assert.equal(byMember[10].points, 0.5, 'a solo earns the full 4th-place value');

  assert.deepEqual(week.rows, before, 'the results view never writes to the sheet');
});

test('calculatePoints flags a blank placement with a warning', () => {
  const h = loadCode();
  buildDoubles(h, { [WEEK_DATE]: [
    makeWeekRow(h, { member_number: 1, player_name_snapshot: 'Ann', pair_key: 'p1', team_position: '', team_position_raw: '', weekly_points: 0.5 })
  ] });

  const result = call(h, 'handleCalculatePoints');
  assert.equal(result.warnings.length, 1);
  assert.equal(result.warnings[0].code, 'blank_position');
  assert.equal(result.players[0].points, 0.5);
  assert.equal(result.players[0].has_position, false);
});

test('the results view exposes no lifecycle state or status', () => {
  const h = loadCode();
  buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });

  const result = call(h, 'handleCalculatePoints');
  assert.equal('week_state' in result, false);
  for (const player of result.players) {
    assert.equal('stored_status' in player, false);
    assert.equal('voided' in player, false);
  }
  assert.equal('finalized' in result.summary, false);
  assert.equal('confirmed' in result.summary, false);
  assert.equal('pending' in result.summary, false);
});

test('calculatePoints groups the results by pair_key with pair/place/points', () => {
  const h = loadCode();
  buildDoubles(h, { [WEEK_DATE]: sampleWeek(h) });

  const result = call(h, 'handleCalculatePoints');
  assert.equal(result.pairs.length, 3, 'one group per pair plus one solo');

  const p1 = result.pairs.find((pair) => pair.pair_key === 'p1');
  assert.equal(p1.label, 'Ann / Bob');
  assert.equal(p1.place, '1');
  assert.equal(p1.points, 2);
  assert.equal(p1.members.length, 2);

  const solo = result.pairs.find((pair) => pair.pair_key === '');
  assert.equal(solo.label, 'Jon');
  assert.equal(solo.members.length, 1);
  assert.equal(solo.points, 0.5);
});

// ─── Format gating + tag isolation ───────────────────────────────────────────

test('points handlers refuse the singles format before opening a sheet', () => {
  const h = loadCode();
  const result = h.parse(h.fn('handleCalculatePoints')({
    league_date: WEEK_DATE,
    spreadsheetId: h.bound.SPREADSHEET_ID
  }));

  assert.equal(result.status, 'error');
  assert.match(result.message, /scoring method/i);
  assert.deepEqual(h.openByIdCalls, [], 'must not open the singles spreadsheet');
});

test('the points path never touches tag state', () => {
  const h = loadCode();
  const clubRows = [
    [1, 'Ann', 'ann', '', 5, true, '', ''],
    [2, 'Bob', 'bob', '', 9, true, '', '']
  ];
  const week = [
    makeWeekRow(h, { member_number: 1, player_name_snapshot: 'Ann', pair_key: 'p1', team_position: '1', team_position_raw: 1, in_tag: '', out_tag: '', weekly_points: 2 }),
    makeWeekRow(h, { member_number: 2, player_name_snapshot: 'Bob', pair_key: 'p1', team_position: '1', team_position_raw: 1, in_tag: '', out_tag: '', weekly_points: 2 })
  ];
  const { club, weekSheets } = buildDoubles(h, { [WEEK_DATE]: week }, clubRows);
  const sheet = weekSheets[WEEK_DATE];

  call(h, 'handleCalculatePoints');
  commit(h, [PAIR_ROW]);

  assert.ok(column(sheet, 'in_tag').every((value) => value === ''));
  assert.ok(column(sheet, 'out_tag').every((value) => value === ''));
  assert.equal(club.rows.find((r) => r[0] === 1)[4], 5);
  assert.equal(club.rows.find((r) => r[0] === 2)[4], 9);
});

// ─── Live summation (standings + member totals) ──────────────────────────────

test('sumSeasonPointsByMember sums committed weekly points across every week', () => {
  const h = loadCode();
  buildDoubles(h, {
    [WEEK_DATE]: [
      makeWeekRow(h, { member_number: 1, weekly_points: 2 }),
      makeWeekRow(h, { member_number: 2, weekly_points: 1.5 })
    ],
    [WEEK_TWO]: [
      makeWeekRow(h, { member_number: 1, weekly_points: 1.5 }),
      makeWeekRow(h, { member_number: 2, weekly_points: 1 })
    ]
  });

  const totals = h.fn('sumSeasonPointsByMember')(h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES));
  assert.equal(totals[1], 3.5);
  assert.equal(totals[2], 2.5);
});

test('uncommitted rows with no weekly_points are excluded from every total', () => {
  const h = loadCode();
  buildDoubles(h, {
    [WEEK_DATE]: [
      // Committed: points persisted at import commit.
      makeWeekRow(h, { member_number: 1, team_position_raw: 1, weekly_points: 2 }),
      // Uncommitted: a placement exists but the commit never persisted points.
      makeWeekRow(h, { member_number: 2, team_position_raw: 1, weekly_points: '' })
    ]
  });

  const totals = h.fn('sumSeasonPointsByMember')(h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES));
  assert.equal(totals[1], 2);
  assert.equal(totals[2], undefined, 'a row without committed points contributes nothing');

  const listing = call(h, 'handleListClubMembers', { league: h.bound.LEAGUE_ID_DOUBLES });
  const byNumber = {};
  listing.members.forEach((m) => { byNumber[m.member_number] = m; });
  assert.equal(byNumber[1].season_points, 2);
  assert.equal(byNumber[2].season_points, 0);
});

test('member totals are the live sum of committed rows and ignore status labels', () => {
  const h = loadCode();
  buildDoubles(h, {
    [WEEK_DATE]: [
      makeWeekRow(h, { member_number: 1, weekly_points: 2, weekly_points_status: 'pending' }),
      makeWeekRow(h, { member_number: 2, weekly_points: 1.5, weekly_points_status: 'finalized' }),
      makeWeekRow(h, { member_number: 3, weekly_points: 1, weekly_points_status: 'confirmed' })
    ]
  });

  const listing = call(h, 'handleListClubMembers', { league: h.bound.LEAGUE_ID_DOUBLES });
  const byNumber = {};
  listing.members.forEach((m) => { byNumber[m.member_number] = m; });
  // The status label is display-only history; the committed value is summed.
  assert.equal(byNumber[1].season_points, 2);
  assert.equal(byNumber[2].season_points, 1.5);
  assert.equal(byNumber[3].season_points, 1);
});

test('listings compute season totals live and never create the cache column themselves', () => {
  const h = loadCode();
  const { club } = buildDoubles(h, {
    [WEEK_DATE]: [
      makeWeekRow(h, { member_number: 1, weekly_points: 2 }),
      makeWeekRow(h, { member_number: 2, weekly_points: 0.5 })
    ]
  });

  // The roster has no season_points column at all.
  assert.equal(club.rows[0].indexOf('season_points'), -1);

  const listing = call(h, 'handleListClubMembers', { league: h.bound.LEAGUE_ID_DOUBLES });
  const byNumber = {};
  listing.members.forEach((m) => { byNumber[m.member_number] = m; });
  assert.equal(byNumber[1].season_points, 2);
  assert.equal(byNumber[2].season_points, 0.5);

  // The live listing is the check and never creates a cache column.
  assert.equal(club.rows[0].indexOf('season_points'), -1);
});

// ─── Stored season_points cache mirrors the live sum after every write ──────

function storedSeasonPoints(club) {
  const hMember = club.rows[0].indexOf('member_number');
  const hSeason = club.rows[0].indexOf('season_points');
  const stored = {};
  club.rows.slice(1).forEach((row) => { stored[row[hMember]] = row[hSeason]; });
  return stored;
}

test('the import commit mirrors the live season sum into ClubMembers.season_points', () => {
  const h = loadCode();
  const { club } = buildDoubles(h, { [WEEK_DATE]: [] });

  // A bare roster has no cache column until the first points write.
  assert.equal(club.rows[0].indexOf('season_points'), -1);

  const result = commit(h, [
    PAIR_ROW,
    { name: 'Alice Smith', username: 'alice', position: '', position_raw: '' }
  ]);
  assert.equal(result.status, 'ok');
  assert.equal(result.season_points_synced, 6, 'every roster row is refreshed');

  // The column is created in place and holds the live value for every member.
  assert.notEqual(club.rows[0].indexOf('season_points'), -1);
  const stored = storedSeasonPoints(club);
  assert.equal(stored[3], 2, '1st-place partner');
  assert.equal(stored[7], 2, '1st-place partner');
  assert.equal(stored[21], 0.5, 'solo showing-up credit');
  assert.equal(stored[1], 0, 'a member with no committed rows is cached as 0');

  const live = h.fn('sumSeasonPointsByMember')(h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES));
  Object.keys(live).forEach((memberNumber) => {
    assert.equal(stored[memberNumber], live[memberNumber], 'member ' + memberNumber);
  });
});

test('a later commit refreshes the stored total rather than initializing it once', () => {
  const h = loadCode();
  const { club } = buildDoubles(h, { [WEEK_DATE]: [], [WEEK_TWO]: [] });

  commit(h, [PAIR_ROW]);
  assert.equal(storedSeasonPoints(club)[3], 2);

  // A second week changes member 3's total, so the cache must move with it.
  commit(h, [
    { name: 'Damon Forsythe & Brad Stevenson', usernames: 'damon31,donjoses', position: 2, position_raw: 2 },
    { name: 'Alice Smith', username: 'alice', position: 3, position_raw: 3 }
  ], { league_date: WEEK_TWO });

  const stored = storedSeasonPoints(club);
  assert.equal(stored[3], 3.5, '2 (week 1) + 1.5 (week 2)');
  assert.equal(stored[7], 3.5);
  assert.equal(stored[21], 1, '3rd place in week 2');

  const live = h.fn('sumSeasonPointsByMember')(h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES));
  assert.equal(stored[3], live[3]);
  assert.equal(stored[7], live[7]);
});

test('a re-import keeps the stored total equal to the live sum without accumulating', () => {
  const h = loadCode();
  const { club } = buildDoubles(h, { [WEEK_DATE]: [] });

  commit(h, [PAIR_ROW]);
  const afterFirst = storedSeasonPoints(club);

  commit(h, [PAIR_ROW]);
  assert.deepEqual(storedSeasonPoints(club), afterFirst);
});

test('the stored cache and the live member listing agree after a commit', () => {
  const h = loadCode();
  const { club } = buildDoubles(h, { [WEEK_DATE]: [] });

  commit(h, [
    PAIR_ROW,
    { name: 'Alice Smith', username: 'alice', position: 3, position_raw: 3 }
  ]);

  const listing = call(h, 'handleListClubMembers', { league: h.bound.LEAGUE_ID_DOUBLES });
  const stored = storedSeasonPoints(club);
  listing.members.forEach((member) => {
    assert.equal(stored[member.member_number], member.season_points, 'member ' + member.member_number);
  });
});


test('a roster that already carries the season_points cache column is accepted', () => {
  const h = loadCode();
  const { club } = buildDoubles(h, { [WEEK_DATE]: [] });
  club.rows[0].push('season_points');

  assert.equal(h.fn('clubMemberHeadersMatch')(h.bound.CLUB_MEMBER_HEADERS_DOUBLES, 'doubles'), true);
  assert.equal(h.fn('clubMemberHeadersMatch')(h.bound.CLUB_MEMBER_HEADERS, 'doubles'), true);
  assert.equal(h.fn('clubMemberHeadersMatch')(h.bound.CLUB_MEMBER_HEADERS_DOUBLES, 'singles'), false);
});
