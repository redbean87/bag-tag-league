'use strict';

// Weekly money: the per-league payout table on the League settings and the
// ace-pot count. Payouts are derived from the committed team placements at
// read time; the ace pot is included in the entry fee, so every checked-in
// player contributes when the league configures a pot. Runs in a Node VM with
// in-memory Sheets fakes; no live sheet is touched.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadCode, REPO_ROOT } = require('./helpers/load-code');

const WEEK_DATE = '2026-10-05';

function makeWeekRow(h, fields) {
  const headers = h.bound.WEEKLY_RECORD_HEADERS_DOUBLES;
  const row = new Array(headers.length).fill('');
  for (const key in fields) {
    const index = headers.indexOf(key);
    if (index !== -1) row[index] = fields[key];
  }
  return row;
}

function place(member, name, pairKey, positionRaw, positionLabel) {
  return {
    member_number: member,
    player_name_snapshot: name,
    pair_key: pairKey,
    team_position: positionLabel,
    team_position_raw: positionRaw,
    checked_in: true
  };
}

/**
 * Builds a doubles spreadsheet with a roster, one week, and optional League
 * settings. The League sheet uses the canonical extended schema.
 */
function buildDoubles(h, options) {
  options = options || {};
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  (options.members || [
    [1, 'Damon Forsythe', 'damon31', '151236', true, '', '', 0],
    [2, 'Brad Stevenson', 'donjoses', '85170', true, '', '', 0],
    [3, 'Brian Corlew', 'buzzbc13', '', true, '', '', 0],
    [4, 'Cortez Ashley', 'redbean', '', true, '', '', 0],
    [5, 'Josh Moen', 'jmoe76', '', true, '', '', 0],
    [6, 'David Opsahl', 'upshot1987', '', true, '', '', 0],
    [7, 'Robert Finch', 'finch411', '', true, '', '', 0]
  ]).forEach((row) => club.appendRow(row));

  const week = doubles.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  (options.weekRows || []).forEach((row) => week.appendRow(row));

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

  return { doubles, club, week, league };
}

/** The real 2026-10-05 placements: a 1st pair, two tied-2nd pairs, a 4th solo. */
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

function call(h, action, extra) {
  const payload = {
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: WEEK_DATE
  };
  if (extra) Object.assign(payload, extra);
  return h.parse(h.fn(action)(payload));
}

// ─── Payout pool helpers (pure) ──────────────────────────────────────────────

test('resolvePayoutRules reads the pool rule and blanks to unconfigured', () => {
  const h = loadCode();
  const resolve = h.fn('resolvePayoutRules');

  assert.deepEqual(
    resolve({ payout_contribution: 3, payout_second_amount: 10, payout_second_min_players: 10 }),
    { configured: true, contribution: 3, secondAmount: 10, secondMinPlayers: 10 }
  );
  assert.deepEqual(
    resolve({ payout_contribution: '' }),
    { configured: false, contribution: 0, secondAmount: 0, secondMinPlayers: 0 }
  );
  assert.deepEqual(
    resolve({ payout_contribution: 0 }),
    { configured: false, contribution: 0, secondAmount: 0, secondMinPlayers: 0 }
  );
  assert.deepEqual(resolve({}), { configured: false, contribution: 0, secondAmount: 0, secondMinPlayers: 0 });
  assert.deepEqual(resolve(null), { configured: false, contribution: 0, secondAmount: 0, secondMinPlayers: 0 });

  // A contribution without a second-place amount pays the winners everything.
  assert.deepEqual(
    resolve({ payout_contribution: 3 }),
    { configured: true, contribution: 3, secondAmount: 0, secondMinPlayers: 0 }
  );
});

// ─── The October 5 case: a small field takes the whole pool ──────────────────

test('the October 5 field of 7 builds a $21 pool and pays the winners everything', () => {
  const h = loadCode();
  buildDoubles(h, {
    leagueSettings: { payout_contribution: 3, payout_second_amount: 10, payout_second_min_players: 10 },
    weekRows: octoberFifthRows(h)
  });

  const result = call(h, 'handleCalculatePoints');
  assert.equal(result.status, 'ok');
  assert.equal(result.payout.configured, true);
  assert.equal(result.payout.contribution, 3);
  assert.equal(result.payout.players, 7);
  assert.equal(result.payout.pool, 21, '7 players x $3');
  assert.equal(result.payout.second_paid, false, 'below the threshold second place is not paid');
  assert.equal(result.payout.second_total, 0);
  assert.equal(result.payout.winners_total, 21, 'the winners take the whole pool');
  assert.equal(result.payout.total, 21);

  const byPair = {};
  result.pairs.forEach((pair) => { byPair[pair.pair_key] = pair; });

  assert.equal(byPair['dubs:p1'].place, '1');
  assert.equal(byPair['dubs:p1'].payout_per_player, 10.5);
  assert.equal(byPair['dubs:p1'].payout_total, 21, 'two winners split the $21 pool');

  // The tied-second pairs and the solo are unpaid below the threshold.
  for (const key of ['dubs:p2', 'dubs:p3', '']) {
    assert.equal(byPair[key].payout_per_player, 0, key);
    assert.equal(byPair[key].payout_total, 0, key);
  }
});

// ─── A full field pays second place out of the pool ──────────────────────────

/** Builds `teamCount` two-player teams in placement order: pair 1 first. */
function fieldRows(h, teamCount) {
  const rows = [];
  let member = 1;
  for (let team = 1; team <= teamCount; team++) {
    const pairKey = 'dubs:p' + team;
    rows.push(makeWeekRow(h, place(member, 'Player ' + member, pairKey, team, String(team))));
    member++;
    rows.push(makeWeekRow(h, place(member, 'Player ' + member, pairKey, team, String(team))));
    member++;
  }
  return rows;
}

test('a 10-player field builds a $30 pool, pays second $10 and winners $20', () => {
  const h = loadCode();
  buildDoubles(h, {
    leagueSettings: { payout_contribution: 3, payout_second_amount: 10, payout_second_min_players: 10 },
    weekRows: fieldRows(h, 5)
  });

  const result = call(h, 'handleCalculatePoints');
  assert.equal(result.payout.players, 10);
  assert.equal(result.payout.pool, 30);
  assert.equal(result.payout.second_paid, true);
  assert.equal(result.payout.second_total, 10);
  assert.equal(result.payout.winners_total, 20);
  assert.equal(result.payout.total, 30);

  const byPair = {};
  result.pairs.forEach((pair) => { byPair[pair.pair_key] = pair; });
  assert.equal(byPair['dubs:p1'].payout_per_player, 10);
  assert.equal(byPair['dubs:p1'].payout_total, 20);
  assert.equal(byPair['dubs:p2'].payout_per_player, 5);
  assert.equal(byPair['dubs:p2'].payout_total, 10);
  assert.equal(byPair['dubs:p3'].payout_total, 0);
});

test('the second-place threshold is inclusive at exactly ten players', () => {
  const below = loadCode();
  buildDoubles(below, {
    leagueSettings: { payout_contribution: 3, payout_second_amount: 10, payout_second_min_players: 10 },
    weekRows: fieldRows(below, 4).concat([
      makeWeekRow(below, place(9, 'Edge Nine', 'dubs:p5', 5, '5'))
    ])
  });
  const nine = call(below, 'handleCalculatePoints');
  assert.equal(nine.payout.players, 9);
  assert.equal(nine.payout.pool, 27);
  assert.equal(nine.payout.second_paid, false, 'nine players is below the threshold');
  assert.equal(nine.payout.winners_total, 27);

  const at = loadCode();
  buildDoubles(at, {
    leagueSettings: { payout_contribution: 3, payout_second_amount: 10, payout_second_min_players: 10 },
    weekRows: fieldRows(at, 5)
  });
  const ten = call(at, 'handleCalculatePoints');
  assert.equal(ten.payout.players, 10);
  assert.equal(ten.payout.second_paid, true, 'ten players meets the threshold');
  assert.equal(ten.payout.second_total, 10);
  assert.equal(ten.payout.winners_total, 20);
});

test('a league with no weekly payout configured stays silent', () => {
  const h = loadCode();
  buildDoubles(h, {
    leagueSettings: { payout_contribution: '', payout_second_amount: '', payout_second_min_players: '' },
    weekRows: octoberFifthRows(h)
  });

  const result = call(h, 'handleCalculatePoints');
  assert.equal(result.status, 'ok');
  assert.equal(result.payout.configured, false);
  assert.equal(result.payout.pool, 0);
  assert.equal(result.payout.total, 0);
  assert.equal(result.payout.second_paid, false);
  for (const pair of result.pairs) {
    assert.equal(pair.payout_per_player, 0);
    assert.equal(pair.payout_total, 0);
  }
});

test('the pool rule is per-league and overridable', () => {
  const h = loadCode();
  buildDoubles(h, {
    leagueSettings: { payout_contribution: 5, payout_second_amount: 20, payout_second_min_players: 4 },
    weekRows: fieldRows(h, 3)
  });

  const result = call(h, 'handleCalculatePoints');
  assert.equal(result.payout.players, 6);
  assert.equal(result.payout.pool, 30);
  assert.equal(result.payout.second_paid, true);
  assert.equal(result.payout.second_total, 20);
  assert.equal(result.payout.winners_total, 10);
});

// ─── Settings validation and persistence ─────────────────────────────────────

test('handleSaveLeagueSettings stores the pool rule and reads it back', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  h.fn('handleCreateLeagueSheet')({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES });
  const league = doubles.getSheetByName('League');

  const saved = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    settings: { payout_contribution: 3, payout_second_amount: 10, payout_second_min_players: 10 }
  }));
  assert.equal(saved.status, 'ok');
  assert.equal(saved.settings.payout_contribution, 3);
  assert.equal(saved.settings.payout_second_amount, 10);
  assert.equal(saved.settings.payout_second_min_players, 10);

  const loaded = h.parse(h.fn('handleGetLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES
  }));
  assert.equal(loaded.settings.payout_contribution, 3);
  assert.equal(loaded.settings.payout_second_amount, 10);
  assert.equal(loaded.settings.payout_second_min_players, 10);
  // The canonical schema still carries the pool columns after the save.
  assert.deepEqual(h.fn('getSheetHeaders')(league), h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
});

test('handleSaveLeagueSettings rejects a negative pool amount and accepts blank', () => {
  const h = loadCode();
  h.fn('handleCreateLeagueSheet')({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES });

  const negative = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    settings: { payout_contribution: -1 }
  }));
  assert.equal(negative.status, 'error');
  assert.match(negative.message, /payout_contribution/);

  const negativeSecond = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    settings: { payout_second_amount: -5 }
  }));
  assert.equal(negativeSecond.status, 'error');
  assert.match(negativeSecond.message, /payout_second_amount/);

  // A blank contribution is allowed and means "no weekly money".
  const blank = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    settings: { payout_contribution: '' }
  }));
  assert.equal(blank.status, 'ok');
  assert.equal(blank.settings.payout_contribution, '');

  // A rejected save must not have written the bad value.
  const loaded = h.parse(h.fn('handleGetLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES
  }));
  assert.notEqual(loaded.settings.payout_contribution, -1);
});

test('handleSaveLeagueSettings appends the pool columns to a pre-payout sheet', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const league = doubles.insertSheet('League');
  // The 19-column schema from before any payout setting existed.
  const prePayout = h.bound.LEAGUE_SHEET_HEADERS
    .concat(h.bound.LEAGUE_SHEET_METADATA_HEADERS)
    .concat(h.bound.LEAGUE_POINTS_HEADERS);
  league.appendRow(prePayout);
  const row = new Array(prePayout.length).fill('');
  row[prePayout.indexOf('league_format')] = h.bound.LEAGUE_FORMAT_DOUBLES;
  row[prePayout.indexOf('scoring')] = h.bound.SCORING_POINTS;
  league.appendRow(row);

  const saved = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    settings: { payout_contribution: 3, payout_second_amount: 10, payout_second_min_players: 10 }
  }));
  assert.equal(saved.status, 'ok');
  assert.deepEqual(h.fn('getSheetHeaders')(league), h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
  assert.equal(
    league.getRange(2, h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.indexOf('payout_contribution') + 1).getValue(),
    3
  );
});

// ─── Legacy flat payout table migration ──────────────────────────────────────

/** Builds a doubles spreadsheet whose League row still carries the retired
 * flat payout_by_place column and the October 5 field. */
function buildLegacyPayout(h, legacyValue) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  const week = doubles.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  octoberFifthRows(h).forEach((row) => week.appendRow(row));

  const league = doubles.insertSheet('League');
  const headers = h.bound.LEAGUE_SHEET_HEADERS
    .concat(h.bound.LEAGUE_SHEET_METADATA_HEADERS)
    .concat(h.bound.LEAGUE_POINTS_HEADERS)
    .concat(h.bound.LEGACY_PAYOUT_HEADERS)
    .concat(h.bound.LEAGUE_EXPLANATION_HEADERS)
    .concat(h.bound.LEAGUE_BREAKDOWN_HEADERS);
  league.appendRow(headers);
  const row = new Array(headers.length).fill('');
  row[headers.indexOf('league_format')] = h.bound.LEAGUE_FORMAT_DOUBLES;
  row[headers.indexOf('scoring')] = h.bound.SCORING_POINTS;
  row[headers.indexOf('payout_by_place')] = legacyValue;
  league.appendRow(row);
  return { doubles, league };
}

test('a legacy flat payout table is read as a pool rule', () => {
  const h = loadCode();
  buildLegacyPayout(h, '1:2,2:5');

  const result = call(h, 'handleCalculatePoints');
  assert.equal(result.status, 'ok');
  // place-1 2 becomes the per-player contribution, place-2 5 x 2 becomes the
  // second-place share, and the legacy model had no threshold.
  assert.equal(result.payout.configured, true);
  assert.equal(result.payout.contribution, 2);
  assert.equal(result.payout.second_amount, 10);
  assert.equal(result.payout.second_min_players, 0);
  assert.equal(result.payout.pool, 14, '7 players x $2');
  assert.equal(result.payout.second_paid, true);
  assert.equal(result.payout.second_total, 10);
  assert.equal(result.payout.winners_total, 4);
});

test('saving settings retires the legacy column and stores the pool rule', () => {
  const h = loadCode();
  const { league } = buildLegacyPayout(h, '1:2,2:5');

  const saved = h.parse(h.fn('handleSaveLeagueSettings')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    settings: { payout_contribution: 3, payout_second_amount: 10, payout_second_min_players: 10 }
  }));
  assert.equal(saved.status, 'ok');
  const headers = h.fn('getSheetHeaders')(league);
  assert.equal(headers.indexOf('payout_by_place'), -1, 'the legacy column is retired');
  assert.deepEqual(headers, h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
  assert.equal(league.getRange(2, headers.indexOf('payout_contribution') + 1).getValue(), 3);
});

// ─── Ace pot included in the entry fee ───────────────────────────────────────

test('every checked-in player contributes to the pot', () => {
  const h = loadCode();
  buildDoubles(h, {
    leagueSettings: { ace_pot_contribution: 1, ace_pot_current_total: 0 }
  });

  const checkIn = h.parse(h.fn('handleSubmitCheckIn')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    member_number: 1,
    name: 'Damon Forsythe',
    paid: true
  }));
  assert.equal(checkIn.status, 'ok');

  const review = call(h, 'handleGetPreRoundReview');
  assert.equal(review.status, 'ok');
  assert.equal(review.participating_count, 1);
  assert.equal(review.ace_pot_participant_count, 1);
  assert.equal(review.ace_pot_contribution, 1);
  assert.equal(review.ace_pot_calculated_total, 1, 'contribution times participants');
});

test('a legacy unticked row still counts toward the pot', () => {
  const h = loadCode();
  buildDoubles(h, {
    leagueSettings: { ace_pot_contribution: 1, ace_pot_current_total: 5 },
    weekRows: [
      makeWeekRow(h, {
        member_number: 1,
        player_name_snapshot: 'Damon Forsythe',
        checked_in: true,
        paid: true,
        ace_pot: false
      })
    ]
  });

  const review = call(h, 'handleGetPreRoundReview');
  assert.equal(review.participating_count, 1);
  assert.equal(review.ace_pot_participant_count, 1);
  // Carry-in 5 plus the one included participant at 1 each.
  assert.equal(review.ace_pot_calculated_total, 6);
});

test('a league with no ace pot counts no pot participants', () => {
  const h = loadCode();
  buildDoubles(h, {
    leagueSettings: { ace_pot_contribution: 0, ace_pot_current_total: 0 }
  });

  const checkIn = h.parse(h.fn('handleSubmitCheckIn')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    member_number: 1,
    name: 'Damon Forsythe',
    paid: true
  }));
  assert.equal(checkIn.status, 'ok');

  const review = call(h, 'handleGetPreRoundReview');
  assert.equal(review.participating_count, 1);
  assert.equal(review.ace_pot_participant_count, 0);
  assert.equal(review.ace_pot_calculated_total, 0);
});

test('the sign-in page hides the Ace Pot checkbox and never submits one', () => {
  const html = fs.readFileSync(
    path.join(REPO_ROOT, 'src', 'player', 'sign-in', 'index.html'),
    'utf8'
  );

  // The ace pot is part of the entry fee, so the box ships hidden and no
  // ace_pot field is added to the check-in payload.
  assert.match(html, /id="checkInAcePotLabel" style="display:none;"/);
  assert.match(html, /id="registerAcePotLabel" style="display:none;"/);
  assert.doesNotMatch(html, /payload\.ace_pot/);
  assert.doesNotMatch(html, /moneyOptions\.ace_pot/);
});

test('every checked-in player counts toward the pot across a full field', () => {
  const h = loadCode();
  buildDoubles(h, {
    leagueSettings: { ace_pot_contribution: 1, ace_pot_current_total: 5 }
  });

  const members = [
    [1, 'Damon Forsythe'],
    [2, 'Brad Stevenson'],
    [3, 'Brian Corlew'],
    [4, 'Cortez Ashley'],
    [5, 'Josh Moen']
  ];
  members.forEach((entry) => {
    const result = h.parse(h.fn('handleSubmitCheckIn')({
      spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
      member_number: entry[0],
      name: entry[1],
      paid: true
    }));
    assert.equal(result.status, 'ok');
  });

  const review = call(h, 'handleGetPreRoundReview');
  assert.equal(review.participating_count, 5);
  assert.equal(review.ace_pot_participant_count, 5);
  // Carry-in 5 plus 5 participants at 1 each.
  assert.equal(review.ace_pot_calculated_total, 10);
});

test('CTP stays an explicit choice and only ticked rows count', () => {
  const h = loadCode();
  buildDoubles(h, {
    leagueSettings: { ace_pot_contribution: 1, ctp_contribution: 2, ace_pot_current_total: 0 }
  });

  const members = [
    [1, 'Damon Forsythe', true],
    [2, 'Brad Stevenson', false],
    [3, 'Brian Corlew', true]
  ];
  members.forEach((entry) => {
    const result = h.parse(h.fn('handleSubmitCheckIn')({
      spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
      member_number: entry[0],
      name: entry[1],
      paid: true,
      ctp: entry[2]
    }));
    assert.equal(result.status, 'ok');
  });

  const review = call(h, 'handleGetPreRoundReview');
  assert.equal(review.ctp_participant_count, 2);
  assert.equal(review.ctp_calculated_total, 4);
  // The ace pot counts all three checked-in players.
  assert.equal(review.ace_pot_participant_count, 3);
  assert.equal(review.ace_pot_calculated_total, 3);
});

test('saving the pre-round review recalculates the pot from all participants', () => {
  const h = loadCode();
  buildDoubles(h, {
    leagueSettings: { ace_pot_contribution: 1, ctp_contribution: 2, ace_pot_current_total: 0 }
  });

  const members = [
    [1, 'Damon Forsythe', true],
    [2, 'Brad Stevenson', false]
  ];
  members.forEach((entry) => {
    const result = h.parse(h.fn('handleSubmitCheckIn')({
      spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
      member_number: entry[0],
      name: entry[1],
      paid: true,
      ctp: entry[2]
    }));
    assert.equal(result.status, 'ok');
  });

  const saved = call(h, 'handleSavePreRoundReview', {
    ace_pot_total: 2,
    ctp_total: 2
  });
  assert.equal(saved.status, 'ok');
  assert.equal(saved.ace_pot_calculated_total, 2, 'two participants at 1 each');
  assert.equal(saved.ctp_calculated_total, 2, 'one CTP and one non-CTP');
});
