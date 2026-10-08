'use strict';

// Member season totals — the doubles member listing surfaces `season_points`,
// the live sum of every committed week's weekly_points. There is no status
// filter and no cached season total. Singles member data is unchanged.
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

/**
 * Builds a doubles spreadsheet with a roster and week tabs.
 * `weeks` is { 'YYYY-MM-DD': [raw weekly rows] }.
 */
function buildDoubles(h, weeks, clubRows) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  (clubRows || [
    [1, 'Ann', 'ann', '', '', true, '', ''],
    [2, 'Bob', 'bob', '', '', true, '', ''],
    [3, 'Cid', 'cid', '', '', true, '', '']
  ]).forEach((row) => club.appendRow(row));

  Object.keys(weeks || {}).forEach((date) => {
    const week = doubles.insertSheet('Week ' + date);
    week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
    (weeks[date] || []).forEach((row) => week.appendRow(row));
  });

  return { doubles, club };
}

function list(h, league) {
  return h.parse(h.fn('handleListClubMembers')({ league: league }));
}

// ─── Live aggregation from committed weeklies ────────────────────────────────

test('season_points sums a member across multiple committed weeks', () => {
  const h = loadCode();
  buildDoubles(h, {
    [WEEK_ONE]: [
      makeWeekRow(h, { member_number: 1, weekly_points: 2, weekly_points_status: 'finalized' }),
      makeWeekRow(h, { member_number: 2, weekly_points: 0.5, weekly_points_status: 'finalized' })
    ],
    [WEEK_TWO]: [
      makeWeekRow(h, { member_number: 1, weekly_points: 1.5, weekly_points_status: 'finalized' }),
      makeWeekRow(h, { member_number: 2, weekly_points: 1, weekly_points_status: 'finalized' })
    ]
  });

  const result = list(h, h.bound.LEAGUE_ID_DOUBLES);
  const byNumber = {};
  result.members.forEach((m) => { byNumber[m.member_number] = m; });

  assert.equal(result.status, 'ok');
  assert.equal(byNumber[1].season_points, 3.5);
  assert.equal(byNumber[2].season_points, 1.5);
});

test('season_points sums committed points whatever legacy status labels exist', () => {
  const h = loadCode();
  buildDoubles(h, {
    [WEEK_ONE]: [
      makeWeekRow(h, { member_number: 1, weekly_points: 2, weekly_points_status: 'calculated' }),
      makeWeekRow(h, { member_number: 2, weekly_points: 1, weekly_points_status: 'confirmed' })
    ],
    [WEEK_TWO]: [
      makeWeekRow(h, { member_number: 1, weekly_points: 1.5, weekly_points_status: 'confirmed' }),
      makeWeekRow(h, { member_number: 2, weekly_points: 0.5, weekly_points_status: 'finalized' })
    ]
  });

  const result = list(h, h.bound.LEAGUE_ID_DOUBLES);
  const byNumber = {};
  result.members.forEach((m) => { byNumber[m.member_number] = m; });

  assert.equal(result.status, 'ok');
  // Member 1: 2 + 1.5; member 2: 1 + 0.5. Status labels never filter a total.
  assert.equal(byNumber[1].season_points, 3.5);
  assert.equal(byNumber[2].season_points, 1.5);
});

// Regression: the aggregation used to filter on a lifecycle status, so a week
// that had not reached the final state was excluded.
test('a committed week counts whatever legacy status label it carries', () => {
  const h = loadCode();
  buildDoubles(h, {
    [WEEK_ONE]: [
      makeWeekRow(h, { member_number: 1, weekly_points: 2, weekly_points_status: 'finalized' }),
      makeWeekRow(h, { member_number: 2, weekly_points: 9, weekly_points_status: 'confirmed' })
    ]
  });

  const result = list(h, h.bound.LEAGUE_ID_DOUBLES);
  const byNumber = {};
  result.members.forEach((m) => { byNumber[m.member_number] = m; });

  assert.equal(byNumber[1].season_points, 2);
  assert.equal(byNumber[2].season_points, 9, 'committed points count regardless of a legacy status');
});

test('rows without committed weekly_points do not contribute', () => {
  const h = loadCode();
  buildDoubles(h, {
    [WEEK_ONE]: [
      makeWeekRow(h, { member_number: 1, weekly_points: 2 }),
      makeWeekRow(h, { member_number: 2, weekly_points: '', weekly_points_status: 'confirmed' }),
      makeWeekRow(h, { member_number: 3, weekly_points: '', weekly_points_status: 'pending' })
    ]
  });

  const result = list(h, h.bound.LEAGUE_ID_DOUBLES);
  const byNumber = {};
  result.members.forEach((m) => { byNumber[m.member_number] = m; });

  assert.equal(byNumber[1].season_points, 2);
  assert.equal(byNumber[2].season_points, 0, 'a blank weekly_points was never committed');
  assert.equal(byNumber[3].season_points, 0, 'a blank weekly_points was never committed');
});

test('a committed week sums from the live weekly_points, ignoring the status label', () => {
  const h = loadCode();
  buildDoubles(h, {
    [WEEK_ONE]: [
      makeWeekRow(h, { member_number: 1, weekly_points: 2, weekly_points_status: 'calculated' }),
      makeWeekRow(h, { member_number: 2, weekly_points: 1, weekly_points_status: 'confirmed' }),
      makeWeekRow(h, { member_number: 3, weekly_points: 0.5, weekly_points_status: 'finalized' })
    ]
  });

  const result = list(h, h.bound.LEAGUE_ID_DOUBLES);
  const byNumber = {};
  result.members.forEach((m) => { byNumber[m.member_number] = m; });
  assert.equal(byNumber[1].season_points, 2);
  assert.equal(byNumber[2].season_points, 1);
  assert.equal(byNumber[3].season_points, 0.5);
});

test('a member with no played weeks reports 0 and is never omitted', () => {
  const h = loadCode();
  const { club } = buildDoubles(h, {
    [WEEK_ONE]: [
      makeWeekRow(h, { member_number: 1, weekly_points: 2, weekly_points_status: 'finalized' })
    ]
  });
  // An extra roster member with no weekly rows at all.
  club.appendRow([3, 'Cid', 'cid', '', '', true, '', '']);

  const result = list(h, h.bound.LEAGUE_ID_DOUBLES);
  const cid = result.members.find((m) => m.member_number === 3);

  assert.ok(cid, 'a member with no played weeks is still listed');
  assert.equal(cid.season_points, 0);
});

test('non-points week tabs and blank members are ignored safely', () => {
  const h = loadCode();
  const { doubles } = buildDoubles(h, {
    [WEEK_ONE]: [
      makeWeekRow(h, { member_number: 1, weekly_points: 2, weekly_points_status: 'finalized' }),
      makeWeekRow(h, { member_number: '', weekly_points: 5, weekly_points_status: 'finalized' })
    ]
  });
  // A tab that is not a doubles points tab at all.
  const nonPoints = doubles.insertSheet('Week 2026-09-01');
  nonPoints.appendRow(['member_number', 'weekly_points']);

  const result = list(h, h.bound.LEAGUE_ID_DOUBLES);
  assert.equal(result.members.length, 3);
  assert.equal(result.members[0].season_points, 2);
});

test('the doubles member payload carries the expected fields', () => {
  const h = loadCode();
  buildDoubles(h, {
    [WEEK_ONE]: [
      makeWeekRow(h, { member_number: 1, weekly_points: 2, weekly_points_status: 'finalized' })
    ]
  });

  const result = list(h, h.bound.LEAGUE_ID_DOUBLES);
  const ann = result.members[0];

  assert.deepEqual(
    Object.keys(ann).sort(),
    ['is_active', 'member_number', 'name', 'pdga_number', 'season_points', 'udisc_username']
  );
  assert.equal(ann.season_points, 2);
  assert.equal(ann.name, 'Ann');
});

// ─── Search listing surface ──────────────────────────────────────────────────

test('doubles search results include season_points and exclude the tag field', () => {
  const h = loadCode();
  buildDoubles(h, {
    [WEEK_ONE]: [
      makeWeekRow(h, { member_number: 1, weekly_points: 1.5, weekly_points_status: 'finalized' })
    ]
  });

  const result = h.parse(h.fn('handleSearchClubMembers')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    query: 'ann'
  }));

  assert.equal(result.results[0].season_points, 1.5);
  assert.equal('current_tag' in result.results[0], false);
});

// ─── Singles regression ──────────────────────────────────────────────────────

test('singles member data is unchanged: no season_points, tag field preserved', () => {
  const h = loadCode();
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const club = singles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  club.appendRow([1, 'Alice Smith', 'alice', '', 42, true, '', '']);

  const result = list(h, h.bound.LEAGUE_ID_SINGLES);
  const alice = result.members[0];

  assert.equal('season_points' in alice, false);
  assert.equal(alice.current_tag, 42);

  const search = h.parse(h.fn('handleSearchClubMembers')({
    league: h.bound.LEAGUE_ID_SINGLES,
    query: 'alice'
  }));
  assert.equal('season_points' in search.results[0], false);
  assert.equal(search.results[0].current_tag, 42);
});
