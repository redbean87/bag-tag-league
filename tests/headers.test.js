'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

// The human-first canonical order is asserted here so a future edit that
// reshuffles a promoted group is caught immediately.
const SINGLES_HUMAN_FIRST = [
  'member_number',
  'player_name_snapshot',
  'udisc_username_snapshot',
  'pdga_number_snapshot',
  'score',
  'in_tag',
  'out_tag'
];

const DOUBLES_HUMAN_FIRST = [
  'member_number',
  'player_name_snapshot',
  'udisc_username_snapshot',
  'pdga_number_snapshot',
  'pair_key',
  'partner_member_number',
  'score',
  'weekly_points',
  'weekly_points_status'
];

test('singles weekly headers lead with names, score, then tags', () => {
  const h = loadCode();
  const headers = h.bound.WEEKLY_RECORD_HEADERS;

  assert.equal(headers.length, 48);
  assert.deepEqual(headers.slice(0, SINGLES_HUMAN_FIRST.length), SINGLES_HUMAN_FIRST);
  assert.deepEqual(
    headers.slice(SINGLES_HUMAN_FIRST.length),
    [
      'checked_in',
      'signed_in_at',
      'paid',
      'ctp',
      'ace_pot',
      'udisc_name_import',
      'udisc_username_import',
      'udisc_pdga_number_import',
      'round_relative_score',
      'round_rating',
      'event_relative_score',
      'event_total_score',
      'udisc_checked_in',
      'udisc_paid',
      'starting_hole',
      'start_time',
      'division',
      'udisc_position',
      'udisc_position_raw',
      'hole_1', 'hole_2', 'hole_3', 'hole_4', 'hole_5', 'hole_6',
      'hole_7', 'hole_8', 'hole_9', 'hole_10', 'hole_11', 'hole_12',
      'hole_13', 'hole_14', 'hole_15', 'hole_16', 'hole_17', 'hole_18',
      'udisc_ending_tag',
      'notes',
      'created_at',
      'updated_at'
    ],
    'the remaining singles columns keep their historical relative order'
  );
  assert.ok(!headers.includes('pair_key'));
  // Every legacy column is preserved exactly once.
  assert.equal(new Set(headers).size, headers.length);
  assert.deepEqual(headers.slice().sort(), h.bound.WEEKLY_RECORD_HEADERS_LEGACY.slice().sort());
});

test('doubles weekly headers lead with names, pair, score, then points', () => {
  const h = loadCode();
  const headers = h.bound.WEEKLY_RECORD_HEADERS_DOUBLES;

  assert.equal(headers.length, 54);
  assert.deepEqual(headers.slice(0, DOUBLES_HUMAN_FIRST.length), DOUBLES_HUMAN_FIRST);
  assert.deepEqual(
    headers.slice(DOUBLES_HUMAN_FIRST.length),
    [
      'in_tag',
      'out_tag',
      'checked_in',
      'signed_in_at',
      'paid',
      'ctp',
      'ace_pot',
      'udisc_name_import',
      'udisc_username_import',
      'udisc_pdga_number_import',
      'round_relative_score',
      'round_rating',
      'event_relative_score',
      'event_total_score',
      'udisc_checked_in',
      'udisc_paid',
      'starting_hole',
      'start_time',
      'division',
      'udisc_position',
      'udisc_position_raw',
      'hole_1', 'hole_2', 'hole_3', 'hole_4', 'hole_5', 'hole_6',
      'hole_7', 'hole_8', 'hole_9', 'hole_10', 'hole_11', 'hole_12',
      'hole_13', 'hole_14', 'hole_15', 'hole_16', 'hole_17', 'hole_18',
      'udisc_ending_tag',
      'notes',
      'created_at',
      'updated_at',
      'team_position',
      'team_position_raw'
    ],
    'the remaining doubles columns keep their historical relative order'
  );
  assert.equal(new Set(headers).size, headers.length);
  assert.deepEqual(
    headers.slice().sort(),
    h.bound.WEEKLY_RECORD_HEADERS_LEGACY_DOUBLES.slice().sort()
  );
});

test('the singles League base columns stay 15 and carry no metadata', () => {
  const h = loadCode();

  assert.equal(h.bound.LEAGUE_SHEET_HEADERS.length, 15);
  assert.ok(!h.bound.LEAGUE_SHEET_HEADERS.includes('league_format'));
  assert.ok(!h.bound.LEAGUE_SHEET_HEADERS.includes('scoring'));
});

test('both League schemas extend the base with league_format and scoring', () => {
  const h = loadCode();
  const extended = h.bound.LEAGUE_SHEET_HEADERS_DOUBLES;
  const base = h.bound.LEAGUE_SHEET_HEADERS;

  // Decided 2026-10-08: singles sheets extend to 17 columns, so both formats
  // carry the same two metadata columns. 15 base + 2 metadata = 17.
  assert.equal(extended.length, base.length + 2);
  assert.deepEqual(extended.slice(0, base.length), base);
  assert.deepEqual(extended.slice(base.length), ['league_format', 'scoring']);
  assert.equal(h.bound.LEAGUE_SHEET_HEADERS_EXTENDED.length, 17);
});

test('format-specific header accessors gate singles versus doubles', () => {
  const h = loadCode();
  const weekHeaders = h.fn('getWeeklyRecordHeaders');
  const leagueHeaders = h.fn('getLeagueSheetHeaders');

  assert.deepEqual(weekHeaders(h.bound.LEAGUE_FORMAT_SINGLES), h.bound.WEEKLY_RECORD_HEADERS);
  assert.deepEqual(weekHeaders(h.bound.LEAGUE_FORMAT_DOUBLES), h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  // Both leagues now carry both metadata columns.
  assert.deepEqual(leagueHeaders(h.bound.LEAGUE_FORMAT_SINGLES), h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
  assert.deepEqual(leagueHeaders(h.bound.LEAGUE_FORMAT_DOUBLES), h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
});

test('the header builders accept (format, scoring) and keep day-one schemas', () => {
  const h = loadCode();
  const weekHeaders = h.fn('getWeeklyRecordHeaders');
  const clubHeaders = h.fn('getClubMemberHeaders');

  // Explicit capability pairs resolve to exactly today's schemas.
  assert.deepEqual(
    weekHeaders(h.bound.LEAGUE_FORMAT_SINGLES, h.bound.SCORING_TAGS),
    h.bound.WEEKLY_RECORD_HEADERS
  );
  assert.deepEqual(
    weekHeaders(h.bound.LEAGUE_FORMAT_DOUBLES, h.bound.SCORING_POINTS),
    h.bound.WEEKLY_RECORD_HEADERS_DOUBLES
  );
  assert.deepEqual(
    clubHeaders(h.bound.LEAGUE_FORMAT_SINGLES, h.bound.SCORING_TAGS),
    h.bound.CLUB_MEMBER_HEADERS
  );
  assert.deepEqual(
    clubHeaders(h.bound.LEAGUE_FORMAT_DOUBLES, h.bound.SCORING_POINTS),
    h.bound.CLUB_MEMBER_HEADERS_DOUBLES
  );

  // An omitted scoring falls back to the format's default.
  assert.deepEqual(weekHeaders(h.bound.LEAGUE_FORMAT_DOUBLES), h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  assert.deepEqual(clubHeaders(h.bound.LEAGUE_FORMAT_DOUBLES), h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
});

test('readers resolve weekly fields by header name after the reorder', () => {
  const h = loadCode();
  const singles = h.bound.WEEKLY_RECORD_HEADERS;
  const doubles = h.bound.WEEKLY_RECORD_HEADERS_DOUBLES;

  // Position independence: the score/points/tag columns are not where they
  // used to be, but name lookup still finds them.
  assert.ok(singles.indexOf('score') < singles.indexOf('hole_1'));
  assert.ok(singles.indexOf('in_tag') < singles.indexOf('hole_1'));
  assert.ok(doubles.indexOf('pair_key') < doubles.indexOf('hole_1'));
  assert.ok(doubles.indexOf('weekly_points') < doubles.indexOf('hole_1'));

  // A new weekly row lands each value in the named column, never at a fixed
  // index.
  const build = h.fn('buildNewWeeklyRecord');
  const record = build(
    singles,
    { member_number: 7, name: 'Ada', username: 'ada', pdga: '12345' },
    { score: 54, in_tag: 3 },
    null,
    '2026-10-05T00:00:00.000Z'
  );
  assert.equal(record[singles.indexOf('member_number')], 7);
  assert.equal(record[singles.indexOf('score')], 54);
  assert.equal(record[singles.indexOf('in_tag')], 3);
  assert.equal(record[singles.indexOf('created_at')], '2026-10-05T00:00:00.000Z');
});
