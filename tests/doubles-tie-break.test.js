'use strict';

// Doubles tie-break selection. UDisc reports level teams at the same place and
// the payout rule pays everyone at place 1 (and 2 when second place is paid),
// so the admin names the winner of a paying tie before the week is finalized.
// The choice is a draft on a TieBreaks tab until finalize, finalize refuses
// while a paying tie has no winner, and the chosen order is what the unchanged
// payout rule and the standings use. The pick decides MONEY ONLY: tied teams keep
// the same place and points. No tag column is touched.
//
// All tests run in a Node VM with an in-memory Sheets fake.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

const WEEK = '2026-10-05';
// $3 x 7 players = $21 pool; second place needs 10 players, so only 1st is paid.
const POOL_ONE_PAID = { payout_contribution: 3, payout_second_amount: 10, payout_second_min_players: 0 };
const POOL_FIRST_ONLY = { payout_contribution: 3, payout_second_amount: 10, payout_second_min_players: 10 };

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

function build(h, settings, rows) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  for (let i = 1; i <= 7; i++) club.appendRow([i, 'Player ' + i, 'p' + i, '', true, '', '', 0, 0]);
  const league = doubles.insertSheet('League');
  league.appendRow(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
  const lrow = new Array(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.length).fill('');
  for (const key in settings) lrow[h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.indexOf(key)] = settings[key];
  league.appendRow(lrow);
  const week = doubles.insertSheet('Week ' + WEEK);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  rows.forEach((r) => week.appendRow(r));
  return { doubles, club, week };
}

// Two teams tied for 1st (p1, p2), a pair at 3rd, a solo at 4th.
function tiedForFirst(h) {
  return [
    weekRow(h, 1, 'Player 1', 'dubs:p1', 1, 'T1', 2),
    weekRow(h, 2, 'Player 2', 'dubs:p1', 1, 'T1', 2),
    weekRow(h, 3, 'Player 3', 'dubs:p2', 1, 'T1', 2),
    weekRow(h, 4, 'Player 4', 'dubs:p2', 1, 'T1', 2),
    weekRow(h, 5, 'Player 5', 'dubs:p3', 3, '3', 1),
    weekRow(h, 6, 'Player 6', 'dubs:p3', 3, '3', 1),
    weekRow(h, 7, 'Player 7', '', 4, '4', 0.5)
  ];
}

function call(h, name, extra) {
  return h.parse(h.fn(name)(Object.assign({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES, league_date: WEEK }, extra || {})));
}
const results = (h) => call(h, 'handleCalculatePoints');
const pick = (h, order, place) => call(h, 'handleSaveTieBreaks', { tie_place: place || 1, order });
const finalize = (h) => call(h, 'handleFinalizeDoublesWeek');

function col(sheet, header) {
  const i = sheet.rows[0].indexOf(header);
  return sheet.rows.slice(1).map((r) => r[i]);
}
const payoutOf = (data, key) => data.pairs.find((p) => p.pair_key === key).payout_total;

// ─── Pure detection ─────────────────────────────────────────────────────────

function pairs(spec) {
  return spec.map(([key, raw]) => ({ pair_key: key, label: key, place_raw: raw, has_position: true, members: [{ member_number: key }] }));
}

test('a tie on a paying place needs a choice; a tie below the paid places does not', () => {
  const h = loadCode();
  const view = h.fn('resolveDoublesTies')(pairs([['a', 1], ['b', 1], ['c', 3], ['d', 3]]), {}, 1);
  assert.equal(view.groups.length, 1);
  assert.equal(view.groups[0].tie_place, 1);
  assert.equal(view.groups[0].needs_choice, true);
  assert.deepEqual(JSON.parse(JSON.stringify(view.groups[0].candidates.map((c) => c.team_key))), ['a', 'b']);
});

test('no money paid means no tie needs a choice', () => {
  const h = loadCode();
  const view = h.fn('resolveDoublesTies')(pairs([['a', 1], ['b', 1]]), {}, 0);
  assert.equal(view.groups.length, 0);
});

test('a pick sets the money place and the rest follow; a three-way tie needs a second pick when place 2 is paid', () => {
  const h = loadCode();
  const field = pairs([['a', 1], ['b', 1], ['c', 1]]);
  const one = h.fn('resolveDoublesTies')(field, { 1: ['b'] }, 2);
  assert.equal(one.placements.b.money_place, 1);
  assert.equal(one.placements.a.money_place, 2);
  assert.equal(one.placements.a.tied, true);
  assert.equal(one.groups[0].needs_choice, true);
  const two = h.fn('resolveDoublesTies')(field, { 1: ['b', 'c'] }, 2);
  assert.equal(two.groups[0].needs_choice, false);
  assert.equal(two.placements.c.money_place, 2);
  assert.equal(two.placements.a.money_place, 3);
});

test('a pick for a team that left the tie is ignored and counted stale', () => {
  const h = loadCode();
  const view = h.fn('resolveDoublesTies')(pairs([['a', 1], ['b', 1]]), { 1: ['ghost'] }, 1);
  assert.equal(view.stale, 1);
  assert.equal(view.groups[0].needs_choice, true);
});

// ─── Results view and draft ─────────────────────────────────────────────────

test('the results view detects the tie and pays the tied teams alike until a winner is chosen', () => {
  const h = loadCode();
  build(h, POOL_FIRST_ONLY, tiedForFirst(h));
  const data = results(h);
  assert.equal(data.ties.state, 'open');
  assert.equal(data.ties.unresolved_count, 1);
  assert.equal(data.ties.groups[0].candidates.length, 2);
  // $21 over the four players at place 1.
  assert.equal(payoutOf(data, 'dubs:p1'), 10.5);
  assert.equal(payoutOf(data, 'dubs:p2'), 10.5);
});

test('a saved pick is a draft: the money follows it, places and points do not move, and the week tab is untouched', () => {
  const h = loadCode();
  const { week } = build(h, POOL_FIRST_ONLY, tiedForFirst(h));
  const before = JSON.stringify(week.rows);
  const data = pick(h, ['dubs:p2']);
  assert.equal(data.status, 'ok');
  assert.equal(data.ties.unresolved_count, 0);
  assert.equal(payoutOf(data, 'dubs:p2'), 21);
  assert.equal(payoutOf(data, 'dubs:p1'), 0);
  // Regression: the first cut moved the loser down to place 2 (and 1.5 points).
  for (const key of ['dubs:p1', 'dubs:p2']) {
    const team = data.pairs.find((p) => p.pair_key === key);
    assert.equal(team.place_raw, 1);
    assert.equal(team.place, 'T1');
    assert.equal(team.points, 2);
  }
  assert.equal(JSON.stringify(week.rows), before);
});

test('the winner can be changed until the week is finalized', () => {
  const h = loadCode();
  const { doubles } = build(h, POOL_FIRST_ONLY, tiedForFirst(h));
  pick(h, ['dubs:p2']);
  const data = pick(h, ['dubs:p1']);
  assert.equal(payoutOf(data, 'dubs:p1'), 21);
  assert.equal(payoutOf(data, 'dubs:p2'), 0);
  assert.equal(doubles.getSheetByName('TieBreaks').rows.length, 2);
  assert.equal(pick(h, [], 1).ties.unresolved_count, 1);
});

test('saving rejects teams outside the tie, repeats, and a place with no paying tie', () => {
  const h = loadCode();
  build(h, POOL_FIRST_ONLY, tiedForFirst(h));
  assert.equal(pick(h, ['dubs:p3']).status, 'error');
  assert.equal(pick(h, ['dubs:p1', 'dubs:p2']).status, 'error');
  assert.equal(pick(h, ['dubs:p1'], 3).status, 'error');
});

// ─── Finalize ───────────────────────────────────────────────────────────────

test('finalize refuses an unresolved paying tie, names it, and writes nothing', () => {
  const h = loadCode();
  const { doubles, week } = build(h, POOL_FIRST_ONLY, tiedForFirst(h));
  const before = JSON.stringify(week.rows);
  const data = finalize(h);
  assert.equal(data.status, 'error');
  assert.match(data.message, /Choose a winner/);
  assert.match(data.message, /place 1/);
  assert.match(data.message, /Player 1 \/ Player 2 vs Player 3 \/ Player 4/);
  assert.equal(JSON.stringify(week.rows), before);
  assert.equal(doubles.getSheetByName('TieBreaks'), null);
});

test('finalize keeps both tied teams at the same place and points; only the money follows the pick', () => {
  const h = loadCode();
  const { doubles, week, club } = build(h, POOL_FIRST_ONLY, tiedForFirst(h));
  const before = JSON.stringify(week.rows);
  pick(h, ['dubs:p2']);
  const done = finalize(h);
  assert.equal(done.status, 'ok');
  assert.equal(done.ties.state, 'finalized');
  assert.equal(done.ties.finalized_choices[0].team_key, 'dubs:p2');

  // The week tab is not rewritten: both tied teams keep place 1 and 2 points.
  assert.equal(JSON.stringify(week.rows), before);
  for (const key of ['dubs:p1', 'dubs:p2']) {
    const team = done.pairs.find((p) => p.pair_key === key);
    assert.equal(team.place_raw, 1);
    assert.equal(team.place, 'T1');
    assert.equal(team.points, 2);
  }
  // Only the money differs, following the pick.
  assert.equal(payoutOf(done, 'dubs:p2'), 21);
  assert.equal(payoutOf(done, 'dubs:p1'), 0);

  const tieRows = doubles.getSheetByName('TieBreaks').rows;
  assert.equal(tieRows.length, 3); // header, the pick, the week marker
  assert.equal(tieRows[1][3], 'dubs:p2');
  assert.equal(tieRows[1][5], 'finalized');

  // Standings: Players 3 and 4 earned the pool; all four keep the same points.
  const standings = h.parse(h.fn('handleSeasonStandings')({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES }));
  const earned = {};
  const season = {};
  standings.standings.forEach((s) => { earned[s.member_number] = s.season_earnings; season[s.member_number] = s.season_points; });
  assert.equal(earned[3], 10.5);
  assert.equal(earned[1], 0);
  assert.equal(season[1], season[3]);
  assert.equal(season[1], 2);
  const earnCol = club.rows[0].indexOf('season_earnings');
  assert.equal(club.rows[3][earnCol], 10.5);
  assert.equal(club.rows[1][earnCol], 0);
});

test('a finalized week refuses further picks and a second finalize', () => {
  const h = loadCode();
  build(h, POOL_FIRST_ONLY, tiedForFirst(h));
  pick(h, ['dubs:p2']);
  finalize(h);
  assert.equal(pick(h, ['dubs:p1']).status, 'error');
  assert.equal(finalize(h).status, 'error');
});

test('a week with no tie finalizes without any choice', () => {
  const h = loadCode();
  const rows = tiedForFirst(h);
  rows[2][h.bound.WEEKLY_RECORD_HEADERS_DOUBLES.indexOf('team_position_raw')] = 3;
  rows[3][h.bound.WEEKLY_RECORD_HEADERS_DOUBLES.indexOf('team_position_raw')] = 3;
  build(h, POOL_FIRST_ONLY, rows);
  const done = finalize(h);
  assert.equal(done.status, 'ok');
  assert.equal(done.ties.state, 'finalized');
});

test('a tie below the paid places does not block finalize', () => {
  const h = loadCode();
  // 1st alone, 2nd tied, but second place is not paid at seven players.
  const rows = [
    weekRow(h, 1, 'Player 1', 'dubs:p1', 1, '1', 2),
    weekRow(h, 2, 'Player 2', 'dubs:p1', 1, '1', 2),
    weekRow(h, 3, 'Player 3', 'dubs:p2', 2, 'T2', 1.5),
    weekRow(h, 4, 'Player 4', 'dubs:p2', 2, 'T2', 1.5),
    weekRow(h, 5, 'Player 5', 'dubs:p3', 2, 'T2', 1.5),
    weekRow(h, 6, 'Player 6', 'dubs:p3', 2, 'T2', 1.5),
    weekRow(h, 7, 'Player 7', '', 5, '5', 0.5)
  ];
  build(h, POOL_FIRST_ONLY, rows);
  assert.equal(results(h).ties.groups.length, 0);
  assert.equal(finalize(h).status, 'ok');
});

test('when second place is paid, a tie for second needs a winner too', () => {
  const h = loadCode();
  const rows = [
    weekRow(h, 1, 'Player 1', 'dubs:p1', 1, '1', 2),
    weekRow(h, 2, 'Player 2', 'dubs:p1', 1, '1', 2),
    weekRow(h, 3, 'Player 3', 'dubs:p2', 2, 'T2', 1.5),
    weekRow(h, 4, 'Player 4', 'dubs:p2', 2, 'T2', 1.5),
    weekRow(h, 5, 'Player 5', 'dubs:p3', 2, 'T2', 1.5),
    weekRow(h, 6, 'Player 6', 'dubs:p3', 2, 'T2', 1.5),
    weekRow(h, 7, 'Player 7', '', 4, '4', 0.5)
  ];
  build(h, POOL_ONE_PAID, rows);
  assert.equal(finalize(h).status, 'error');
  const data = pick(h, ['dubs:p3'], 2);
  assert.equal(data.ties.unresolved_count, 0);
  // $21 pool: $10 second place to the chosen team, $11 to the winners.
  assert.equal(payoutOf(data, 'dubs:p3'), 10);
  assert.equal(payoutOf(data, 'dubs:p2'), 0);
  assert.equal(finalize(h).status, 'ok');
});

test('a re-import that changes the tied teams after finalize reopens the tie', () => {
  const h = loadCode();
  const { week } = build(h, POOL_FIRST_ONLY, tiedForFirst(h));
  pick(h, ['dubs:p2']);
  assert.equal(finalize(h).ties.state, 'finalized');
  const idx = week.rows[0].indexOf('pair_key');
  week.rows[3][idx] = 'dubs:p9'; week.rows[4][idx] = 'dubs:p9';
  const data = results(h);
  assert.equal(data.ties.state, 'open');
  assert.equal(data.ties.stale_picks, 1);
  assert.equal(data.ties.unresolved_count, 1);
});

// ─── Doubles only, no tags ──────────────────────────────────────────────────

test('the tie actions never read or write a tag column and refuse a tags league', () => {
  const h = loadCode();
  const { week } = build(h, POOL_FIRST_ONLY, tiedForFirst(h));
  assert.equal(week.rows[0].indexOf('in_tag'), -1);
  assert.equal(week.rows[0].indexOf('out_tag'), -1);
  const singles = call(h, 'handleSaveTieBreaks', { spreadsheetId: h.bound.SPREADSHEET_ID, tie_place: 1, order: [] });
  assert.equal(singles.status, 'error');
  assert.equal(call(h, 'handleFinalizeDoublesWeek', { spreadsheetId: h.bound.SPREADSHEET_ID }).status, 'error');
});

test('both actions are routed by doPost', () => {
  const h = loadCode();
  build(h, POOL_FIRST_ONLY, tiedForFirst(h));
  const post = (action, extra) => h.parse(h.fn('doPost')({
    postData: { contents: JSON.stringify(Object.assign({ action, spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES, league_date: WEEK }, extra)) }
  }));
  assert.equal(post('saveTieBreaks', { tie_place: 1, order: ['dubs:p1'] }).status, 'ok');
  assert.equal(post('finalizeDoublesWeek', {}).status, 'ok');
});
