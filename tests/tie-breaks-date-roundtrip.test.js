'use strict';

// The TieBreaks date round trip on a real spreadsheet. Apps Script coerces the
// 'YYYY-MM-DD' value `appendRow` writes into a real Date on an
// Automatic-format column, and `String(date)` never equals '2026-10-12', so a
// raw comparison hid every saved pick from the very execution that wrote it:
// saveTieBreaks answered ok while its own calculatePoints view reported
// picked: [], needs_choice: true, stale_picks: 0, and finalize then refused.
// The in-memory fake keeps strings as strings, so these tests feed Date and
// timestamp values where the fake would previously have supplied a string, and
// prove a saved pick reads back into the immediate calculatePoints /
// buildTieView read and into finalizeDoublesWeek.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');
const { FakeSheet } = require('./helpers/fake-spreadsheet');

// The live week from the bug report: the tie at place 2 (second place paid)
// between Jared Bailey / Steven Lough and another pair.
const WEEK = '2026-10-12';
// $3 x 8 players = $24 pool; the fixed second-place share has no minimum here,
// so the tie at place 2 touches money and needs a winner.
const POOL_SECOND_PAID = { payout_contribution: 3, payout_second_amount: 10, payout_second_min_players: 0 };
// The canonical TieBreaks schema, asserted against what the repair writes.
const TIE_HEADERS = ['league_date', 'tie_place', 'pick_order', 'team_key', 'team', 'status', 'updated_at'];

/**
 * Mirrors the production spreadsheet: appendRow coerces a bare 'YYYY-MM-DD'
 * first cell into a Date (Automatic column format). The shared fake keeps
 * strings, which is exactly why the existing suite could not catch the bug.
 * Patched once per process; node --test runs this file in its own process, so
 * no other suite sees it.
 */
function sheetsCoerceDateStrings() {
  const proto = FakeSheet.prototype;
  if (proto.__coerceDateStrings) return;
  const original = proto.appendRow;
  proto.appendRow = function (row) {
    const copy = row.slice();
    if (typeof copy[0] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(copy[0])) {
      const [y, m, d] = copy[0].split('-').map(Number);
      copy[0] = new Date(y, m - 1, d);
    }
    return original.call(this, copy);
  };
  proto.__coerceDateStrings = true;
}
sheetsCoerceDateStrings();

function weekRow(h, member, name, pairKey, positionRaw, label, points) {
  const headers = h.bound.WEEKLY_RECORD_HEADERS_DOUBLES;
  const row = new Array(headers.length).fill('');
  const fields = {
    member_number: member, player_name_snapshot: name, pair_key: pairKey,
    team_position: label, team_position_raw: positionRaw, weekly_points: points, checked_in: true
  };
  for (const key in fields) row[headers.indexOf(key)] = fields[key];
  return row;
}

// Place 1: one pair. Place 2: two pairs tied - the production shape, a paying
// tie at place 2. Place 4: one pair.
function build(h) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  for (let i = 1; i <= 8; i++) club.appendRow([i, 'Player ' + i, 'p' + i, '', true, '', '', 0, 0]);
  const league = doubles.insertSheet('League');
  league.appendRow(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
  const lrow = new Array(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.length).fill('');
  for (const key in POOL_SECOND_PAID) lrow[h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.indexOf(key)] = POOL_SECOND_PAID[key];
  league.appendRow(lrow);
  const week = doubles.insertSheet('Week ' + WEEK);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  [
    weekRow(h, 1, 'Damon Forsythe', 'dubs:A', 1, '1', 2),
    weekRow(h, 2, 'Josh Moen', 'dubs:A', 1, '1', 2),
    weekRow(h, 3, 'Jared Bailey', 'dubs:B', 2, 'T2', 1.5),
    weekRow(h, 4, 'Steven Lough', 'dubs:B', 2, 'T2', 1.5),
    weekRow(h, 5, 'Player 5', 'dubs:C', 2, 'T2', 1.5),
    weekRow(h, 6, 'Player 6', 'dubs:C', 2, 'T2', 1.5),
    weekRow(h, 7, 'Player 7', 'dubs:D', 4, '4', 1),
    weekRow(h, 8, 'Player 8', 'dubs:D', 4, '4', 1)
  ].forEach((r) => week.appendRow(r));
  return { doubles, club, week };
}

function call(h, name, extra) {
  return h.parse(h.fn(name)(Object.assign({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES, league_date: WEEK }, extra || {})));
}
const results = (h) => call(h, 'handleCalculatePoints');
const pick = (h, order, place) => call(h, 'handleSaveTieBreaks', { tie_place: place || 2, order });
const finalize = (h) => call(h, 'handleFinalizeDoublesWeek');
const payoutOf = (data, key) => data.pairs.find((p) => p.pair_key === key).payout_total;

// Seeds a TieBreaks tab the way the production sheet already holds it: row 1
// canonical headers, one pick row whose league_date is the stored value under
// test.
function seedTieBreaks(doubles, storedValue, extraRow) {
  const tie = doubles.insertSheet('TieBreaks');
  tie.appendRow(TIE_HEADERS);
  tie.appendRow([storedValue, 2, 1, 'dubs:B', 'Jared Bailey / Steven Lough', 'selected', '2026-10-12T12:00:00.000Z'].concat(extraRow || []));
  return tie;
}

// ─── Same-execution round trip ──────────────────────────────────────────────

test('a pick saved on a sheet that coerces date strings reads back in the same call', () => {
  const h = loadCode();
  const { doubles } = build(h);
  const saved = pick(h, ['dubs:B']);
  assert.equal(saved.status, 'ok');
  // The exact fields the captain saw wrong on the live sheet.
  assert.equal(saved.ties.unresolved_count, 0);
  assert.equal(saved.ties.stale_picks, 0);
  assert.equal(saved.ties.groups[0].needs_choice, false);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.ties.groups[0].picked.map((p) => p.team_key))), ['dubs:B']);
  // The stored cell is a Date - the form the real sheet holds it in.
  const tie = doubles.getSheetByName('TieBreaks');
  assert.ok(tie.rows[1][0] instanceof Date);
  // The money in the view returned by the save itself follows the pick:
  // $24 pool, $10 fixed second place to the winner, $14 to place 1.
  assert.equal(payoutOf(saved, 'dubs:B'), 10);
  assert.equal(payoutOf(saved, 'dubs:C'), 0);
  assert.equal(payoutOf(saved, 'dubs:A'), 14);
});

test('a pick stored as a real Date is visible to buildTieView and finalizeDoublesWeek applies it to the money', () => {
  const h = loadCode();
  const { doubles } = build(h);
  seedTieBreaks(doubles, new Date(2026, 9, 12));
  const view = results(h);
  assert.equal(view.status, 'ok');
  assert.equal(view.ties.unresolved_count, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(view.ties.groups[0].picked.map((p) => p.team_key))), ['dubs:B']);

  const done = finalize(h);
  assert.equal(done.status, 'ok');
  assert.equal(done.ties.state, 'finalized');
  assert.equal(payoutOf(done, 'dubs:B'), 10);
  assert.equal(payoutOf(done, 'dubs:C'), 0);
  assert.equal(payoutOf(done, 'dubs:A'), 14);

  // Finalize replaced the seeded Date row: header, the pick, the week marker.
  // A delete loop that skipped the Date row would leave four rows behind.
  const tieRows = doubles.getSheetByName('TieBreaks').rows;
  assert.equal(tieRows.length, 3);
  assert.equal(tieRows[1][3], 'dubs:B');
  assert.equal(tieRows[1][5], 'finalized');
  assert.ok(tieRows[1][0] instanceof Date);
});

test('saving a new winner deletes the previously stored Date row instead of leaving a duplicate', () => {
  const h = loadCode();
  const { doubles } = build(h);
  seedTieBreaks(doubles, new Date(2026, 9, 12));
  const saved = pick(h, ['dubs:C']);
  assert.equal(saved.status, 'ok');
  assert.deepEqual(JSON.parse(JSON.stringify(saved.ties.groups[0].picked.map((p) => p.team_key))), ['dubs:C']);
  assert.equal(saved.ties.stale_picks, 0);
  const tieRows = doubles.getSheetByName('TieBreaks').rows;
  assert.equal(tieRows.length, 2); // header + the new pick; the old Date row is gone
  assert.equal(tieRows[1][3], 'dubs:C');
});

// ─── Every stored form of the league date ───────────────────────────────────

test('readTieBreaks matches a stored Date, ISO timestamp, epoch timestamp, locale string, or bare string', () => {
  const forms = [
    ['local-midnight Date', new Date(2026, 9, 12)],
    ['UTC-midnight Date', new Date(Date.UTC(2026, 9, 12))],
    ['ISO timestamp string', '2026-10-12T00:00:00.000Z'],
    ['epoch timestamp', Date.UTC(2026, 9, 12)],
    ['bare string', '2026-10-12'],
    ['locale string', String(new Date(2026, 9, 12))]
  ];
  for (const [label, stored] of forms) {
    const h = loadCode();
    const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
    seedTieBreaks(doubles, stored);
    const read = h.fn('readTieBreaks')(doubles, WEEK);
    assert.deepEqual(JSON.parse(JSON.stringify(read.picks)), { 2: ['dubs:B'] }, label);
    assert.equal(read.rows.length, 1, label);
  }
});

test('a row for a neighbouring day is not mistaken for this week', () => {
  for (const stored of [new Date(2026, 9, 11), Date.UTC(2026, 9, 11), '2026-10-11']) {
    const h = loadCode();
    const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
    seedTieBreaks(doubles, stored);
    const read = h.fn('readTieBreaks')(doubles, WEEK);
    assert.deepEqual(JSON.parse(JSON.stringify(read.picks)), {}, String(stored));
    assert.equal(read.rows.length, 0, String(stored));
  }
});

// ─── Header self-repair ─────────────────────────────────────────────────────

test('rewriteTieBreakRows repairs a header row missing the required names', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const tie = doubles.insertSheet('TieBreaks');
  tie.appendRow(['date', 'place', 'order', 'key', 'team', 'status', 'at']);
  h.fn('rewriteTieBreakRows')(doubles, WEEK, 2, [[WEEK, 2, 1, 'dubs:B', 'Jared Bailey / Steven Lough', 'selected', '2026-10-12T12:00:00.000Z']]);
  assert.deepEqual(tie.rows[0], TIE_HEADERS);
  assert.equal(tie.rows.length, 2);
  assert.ok(tie.rows[1][0] instanceof Date);
  const read = h.fn('readTieBreaks')(doubles, WEEK);
  assert.deepEqual(JSON.parse(JSON.stringify(read.picks)), { 2: ['dubs:B'] });
});

test('rewriteTieBreakRows writes through a complete header row in a different order', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const tie = doubles.insertSheet('TieBreaks');
  tie.appendRow(['status', 'league_date', 'team', 'team_key', 'pick_order', 'tie_place', 'updated_at']);
  h.fn('rewriteTieBreakRows')(doubles, WEEK, 2, [[WEEK, 2, 1, 'dubs:B', 'Jared Bailey / Steven Lough', 'selected', '2026-10-12T12:00:00.000Z']]);
  assert.equal(tie.rows.length, 2);
  assert.equal(tie.rows[1][1] instanceof Date, true); // league_date under its own header
  assert.equal(tie.rows[1][3], 'dubs:B');
  const read = h.fn('readTieBreaks')(doubles, WEEK);
  assert.deepEqual(JSON.parse(JSON.stringify(read.picks)), { 2: ['dubs:B'] });
});

test('rewriteTieBreakRows on an empty sheet writes the headers and loses no rows', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const tie = doubles.insertSheet('TieBreaks'); // exists, zero rows
  h.fn('rewriteTieBreakRows')(doubles, WEEK, 2, [[WEEK, 2, 1, 'dubs:B', 'Jared Bailey / Steven Lough', 'selected', '2026-10-12T12:00:00.000Z']]);
  assert.deepEqual(tie.rows[0], TIE_HEADERS);
  assert.equal(tie.rows.length, 2); // header + the one appended pick, nothing dropped
  assert.equal(tie.rows[1][3], 'dubs:B');
  const read = h.fn('readTieBreaks')(doubles, WEEK);
  assert.deepEqual(JSON.parse(JSON.stringify(read.picks)), { 2: ['dubs:B'] });
});

// ─── End-to-end through the deployed entry point ────────────────────────────

test('doPost saveTieBreaks then finalizeDoublesWeek round-trips the pick on a coercing sheet', () => {
  const h = loadCode();
  build(h);
  const post = (action, extra) => h.parse(h.fn('doPost')({
    postData: { contents: JSON.stringify(Object.assign({ action, spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES, league_date: WEEK }, extra || {})) }
  }));
  const saved = post('saveTieBreaks', { tie_place: 2, order: ['dubs:B'] });
  assert.equal(saved.status, 'ok');
  assert.equal(saved.ties.unresolved_count, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(saved.ties.groups[0].picked.map((p) => p.team_key))), ['dubs:B']);

  const done = post('finalizeDoublesWeek', {});
  assert.equal(done.status, 'ok');
  assert.equal(done.ties.state, 'finalized');
  assert.equal(payoutOf(done, 'dubs:B'), 10);
  assert.equal(payoutOf(done, 'dubs:C'), 0);
  assert.equal(payoutOf(done, 'dubs:A'), 14);
});
