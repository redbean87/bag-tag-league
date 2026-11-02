'use strict';

// Attendance ordering — ClubMembers.appearances counts the finalized weeks a
// member was checked in for. It is maintained at finalize (tag finalizeRound,
// doubles import commit) from the FinalizedWeeks ledger, backfilled once for
// older weeks, and read by the member listing/search to order the check-in
// list. No load path reads a Week tab for it.
//
// Runs in a Node VM with an in-memory Sheets fake. No live sheet is touched.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

const W1 = '2026-10-05';
const W2 = '2026-10-12';
const W3 = '2026-10-19';

function weekRow(h, headers, fields) {
  const row = new Array(headers.length).fill('');
  for (const key in fields) {
    const index = headers.indexOf(key);
    if (index !== -1) row[index] = fields[key];
  }
  return row;
}

// Doubles roster provisioned BEFORE the appearances column existed.
function buildDoubles(h, weeks, members) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES.slice(0, -1));
  (members || [
    [1, 'Cid', 'cid', '', true, '', '', 0, 0],
    [2, 'Ann', 'ann', '', true, '', '', 0, 0],
    [3, 'Bob', 'bob', '', true, '', '', 0, 0],
    [4, 'Dee', 'dee', '', true, '', '', 0, 0]
  ]).forEach((r) => club.appendRow(r));
  const headers = h.bound.WEEKLY_RECORD_HEADERS_DOUBLES;
  Object.keys(weeks).forEach((date) => {
    const week = doubles.insertSheet('Week ' + date);
    week.appendRow(headers);
    weeks[date].forEach((f) => week.appendRow(weekRow(h, headers, f)));
  });
  return { doubles, club };
}

function stored(club) {
  const hm = club.rows[0].indexOf('member_number');
  const ha = club.rows[0].indexOf('appearances');
  const out = {};
  club.rows.slice(1).forEach((r) => { out[r[hm]] = r[ha]; });
  return out;
}

const here = (n, extra) => Object.assign({ member_number: n, checked_in: true, weekly_points: 1 }, extra || {});

// ─── Counting at finalize ────────────────────────────────────────────────────

test('finalizing a week counts each checked-in member once and skips the rest', () => {
  const h = loadCode();
  const { doubles, club } = buildDoubles(h, {
    [W1]: [here(1), here(2), { member_number: 3, checked_in: false }]
  });

  const result = h.fn('finalizeWeekAttendance')(doubles, W1);

  assert.equal(result.newly_finalized, true);
  assert.deepEqual(stored(club), { 1: 1, 2: 1, 3: 0, 4: 0 });
});

test('counts accumulate one per finalized week; unfinalized weeks do not count', () => {
  const h = loadCode();
  const { doubles, club } = buildDoubles(h, {
    [W1]: [here(1), here(2)],
    [W2]: [here(1)],
    [W3]: [here(1), here(2), here(3)]
  });

  h.fn('finalizeWeekAttendance')(doubles, W1);
  h.fn('finalizeWeekAttendance')(doubles, W2);

  assert.deepEqual(stored(club), { 1: 2, 2: 1, 3: 0, 4: 0 }, 'W3 is not finalized yet');
});

test('re-finalizing the same week does not double count', () => {
  const h = loadCode();
  const { doubles, club } = buildDoubles(h, { [W1]: [here(1), here(2)] });

  h.fn('finalizeWeekAttendance')(doubles, W1);
  const again = h.fn('finalizeWeekAttendance')(doubles, W1);
  h.fn('finalizeWeekAttendance')(doubles, W1);

  assert.equal(again.newly_finalized, false);
  assert.deepEqual(stored(club), { 1: 1, 2: 1, 3: 0, 4: 0 });
  assert.equal(doubles.getSheetByName('FinalizedWeeks').rows.length, 2, 'header + one ledger row');
});

test('a re-finalize after a corrected week picks up the change without double counting', () => {
  const h = loadCode();
  const { doubles, club } = buildDoubles(h, { [W1]: [here(1)] });
  h.fn('finalizeWeekAttendance')(doubles, W1);

  // Member 2 is checked in on the reopened week, then the week is finalized again.
  const week = doubles.getSheetByName('Week ' + W1);
  week.appendRow(weekRow(h, h.bound.WEEKLY_RECORD_HEADERS_DOUBLES, here(2)));
  h.fn('finalizeWeekAttendance')(doubles, W1);

  assert.deepEqual(stored(club), { 1: 1, 2: 1, 3: 0, 4: 0 });
});

// ─── Real finalize paths ─────────────────────────────────────────────────────

test('the doubles import commit counts the week once, even when replayed', () => {
  const h = loadCode();
  const { doubles, club } = buildDoubles(h, { [W1]: [] }, [
    [1, 'Damon Forsythe', 'damon31', '', true, '', '', 0, 0],
    [2, 'Brad Stevenson', 'donjoses', '', true, '', '', 0, 0],
    [3, 'Brian Corlew', 'buzzbc13', '', true, '', '', 0, 0]
  ]);
  const payload = {
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: W1,
    approved: true,
    rows: [{ name: 'Damon Forsythe & Brad Stevenson', usernames: 'damon31,donjoses', position: 1, position_raw: 1 }]
  };

  const first = h.parse(h.fn('handleCommitUdiscImportDoubles')(payload));
  const replay = h.parse(h.fn('handleCommitUdiscImportDoubles')(payload));

  assert.equal(first.status, 'ok');
  assert.equal(first.attendance_counted, true);
  assert.equal(replay.attendance_counted, false);
  assert.deepEqual(stored(club), { 1: 1, 2: 1, 3: 0 });
});

test('the tag finalizeRound counts the week once and a repeat finalize does not recount', () => {
  const h = loadCode();
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const club = singles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  [[1, 'Ann', 'ann', '', 5, true, '', ''], [2, 'Bob', 'bob', '', 6, true, '', '']].forEach((r) => club.appendRow(r));
  const week = singles.insertSheet('Week ' + W1);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS);
  week.appendRow(weekRow(h, h.bound.WEEKLY_RECORD_HEADERS, { member_number: 1, checked_in: true, in_tag: 5, out_tag: 6 }));
  week.appendRow(weekRow(h, h.bound.WEEKLY_RECORD_HEADERS, { member_number: 2, checked_in: false, in_tag: 6, out_tag: 5 }));

  const call = () => h.parse(h.fn('handleFinalizeRound')({ league: h.bound.LEAGUE_ID_SINGLES, league_date: W1 }));
  const first = call();
  const second = call();

  assert.equal(first.status, 'ok');
  assert.equal(first.attendance_counted, true);
  assert.equal(second.attendance_counted, false);
  assert.deepEqual(stored(club), { 1: 1, 2: 0 });
});

// ─── Backfill ────────────────────────────────────────────────────────────────

test('the backfill reproduces the numbers a finalize of each week would, and is idempotent', () => {
  const weeks = () => ({
    [W1]: [here(1), here(2)],
    [W2]: [here(1), here(3)],
    [W3]: [{ member_number: 1, checked_in: true }, { member_number: 2, checked_in: true }] // no results yet: not finalized
  });

  const live = loadCode();
  const fresh = buildDoubles(live, weeks());
  live.fn('finalizeWeekAttendance')(fresh.doubles, W1);
  live.fn('finalizeWeekAttendance')(fresh.doubles, W2);

  const h = loadCode();
  const old = buildDoubles(h, weeks());
  const call = (extra) => h.parse(h.fn('handleBackfillAppearances')(Object.assign({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES }, extra)));

  const dry = call({});
  assert.equal(dry.applied, false);
  assert.deepEqual(dry.weeks_to_mark, [W1, W2]);
  assert.equal(old.club.rows[0].indexOf('appearances'), -1, 'dry run writes nothing');

  call({ apply: true });
  assert.deepEqual(stored(old.club), stored(fresh.club));
  assert.deepEqual(stored(old.club), { 1: 2, 2: 1, 3: 1, 4: 0 });

  const rowsAfterFirst = JSON.stringify(old.doubles.getSheetByName('FinalizedWeeks').rows);
  const rerun = call({ apply: true });
  assert.deepEqual(rerun.weeks_marked, []);
  assert.equal(JSON.stringify(old.doubles.getSheetByName('FinalizedWeeks').rows), rowsAfterFirst);
  assert.deepEqual(stored(old.club), { 1: 2, 2: 1, 3: 1, 4: 0 });
});

// ─── Ordering ────────────────────────────────────────────────────────────────

function withAppearances(h, counts) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  counts.forEach((c, i) => club.appendRow([i + 1, c[0], c[0].toLowerCase(), '', true, '', '', 0, 0, c[1]]));
  return club;
}

test('the roster lists most appearances first, ties broken by name, blank as zero', () => {
  const h = loadCode();
  withAppearances(h, [['Zed', 3], ['bea', 7], ['Ann', 3], ['Cy', ''], ['Abe', 0], ['Max', 12]]);

  const result = h.parse(h.fn('handleListClubMembers')({ league: h.bound.LEAGUE_ID_DOUBLES }));

  assert.deepEqual(result.members.map((m) => m.name), ['Max', 'bea', 'Ann', 'Zed', 'Abe', 'Cy']);
  assert.deepEqual(result.members.map((m) => m.appearances), [12, 7, 3, 3, 0, 0]);
});

test('search ranks matches by appearances before applying the cap of 10', () => {
  const h = loadCode();
  const rows = [];
  for (let i = 1; i <= 12; i++) rows.push(['Team ' + String(i).padStart(2, '0'), i === 12 ? 9 : 0]);
  withAppearances(h, rows);

  const result = h.parse(h.fn('handleSearchClubMembers')({ league: h.bound.LEAGUE_ID_DOUBLES, query: 'team' }));

  assert.equal(result.results.length, 10);
  assert.equal(result.results[0].name, 'Team 12', 'the regular outranks roster order');
  assert.equal(result.results[0].appearances, 9);
});

test('the tag-league listing returns the stored count without opening any Week tab', () => {
  const h = loadCode();
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const club = singles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS.concat(['appearances']));
  club.appendRow([1, 'Ann', 'ann', '', 5, true, '', '', 4]);
  const week = singles.insertSheet('Week ' + W1);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS);
  let weekReads = 0;
  const original = week.getDataRange;
  week.getDataRange = function () { weekReads++; return original.apply(this, arguments); };

  const result = h.parse(h.fn('handleListClubMembers')({ league: h.bound.LEAGUE_ID_SINGLES }));

  assert.equal(result.members[0].appearances, 4);
  assert.equal(weekReads, 0);
});

// ─── Sign-in page wiring ─────────────────────────────────────────────────────

test('the sign-in page shows the count on each row and the local search keeps server order', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const RosterSearch = require('../src/player/sign-in/roster-search');
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'player', 'sign-in', 'index.html'), 'utf8');

  assert.match(html, /'Weeks: ' \+ weeksPlayed/);

  const roster = [
    { member_number: 2, name: 'Abby', is_active: true, appearances: 12 },
    { member_number: 1, name: 'Abe', is_active: true, appearances: 1 }
  ];
  const results = RosterSearch.filterMembers(roster, 'ab');
  assert.deepEqual(results.map((m) => m.appearances), [12, 1]);
});
