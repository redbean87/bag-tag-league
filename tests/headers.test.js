'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

test('singles weekly headers are unchanged (48 columns)', () => {
  const h = loadCode();

  assert.equal(h.bound.WEEKLY_RECORD_HEADERS.length, 48);
  assert.equal(h.bound.WEEKLY_RECORD_HEADERS[0], 'member_number');
  assert.equal(h.bound.WEEKLY_RECORD_HEADERS[47], 'updated_at');
  assert.ok(!h.bound.WEEKLY_RECORD_HEADERS.includes('pair_key'));
});

test('doubles weekly headers append the six doubles columns', () => {
  const h = loadCode();
  const doubles = h.bound.WEEKLY_RECORD_HEADERS_DOUBLES;

  assert.equal(doubles.length, 54);
  assert.deepEqual(
    doubles.slice(0, 48),
    h.bound.WEEKLY_RECORD_HEADERS,
    'the first 48 singles columns must keep their order'
  );
  assert.deepEqual(doubles.slice(48), [
    'pair_key',
    'partner_member_number',
    'team_position',
    'team_position_raw',
    'weekly_points',
    'weekly_points_status'
  ]);
});

test('singles league headers are unchanged (15 columns, no league_format)', () => {
  const h = loadCode();

  assert.equal(h.bound.LEAGUE_SHEET_HEADERS.length, 15);
  assert.ok(!h.bound.LEAGUE_SHEET_HEADERS.includes('league_format'));
});

test('doubles league headers append league_format', () => {
  const h = loadCode();
  const doubles = h.bound.LEAGUE_SHEET_HEADERS_DOUBLES;

  assert.equal(doubles.length, h.bound.LEAGUE_SHEET_HEADERS.length + 1);
  assert.deepEqual(doubles.slice(0, h.bound.LEAGUE_SHEET_HEADERS.length), h.bound.LEAGUE_SHEET_HEADERS);
  assert.equal(doubles[doubles.length - 1], 'league_format');
});

test('format-specific header accessors gate singles versus doubles', () => {
  const h = loadCode();
  const weekHeaders = h.fn('getWeeklyRecordHeaders');
  const leagueHeaders = h.fn('getLeagueSheetHeaders');

  assert.deepEqual(weekHeaders(h.bound.LEAGUE_FORMAT_SINGLES), h.bound.WEEKLY_RECORD_HEADERS);
  assert.deepEqual(weekHeaders(h.bound.LEAGUE_FORMAT_DOUBLES), h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  assert.deepEqual(leagueHeaders(h.bound.LEAGUE_FORMAT_SINGLES), h.bound.LEAGUE_SHEET_HEADERS);
  assert.deepEqual(leagueHeaders(h.bound.LEAGUE_FORMAT_DOUBLES), h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
});
