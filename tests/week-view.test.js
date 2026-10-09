'use strict';

// Read-only week view: the admin action that dumps one week tab's header row
// and every stored row with all cells. Runs in the Node VM Sheets fake; no
// credentials, network, or live sheet writes.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

const WEEK_DATE = '2026-10-05';

function buildDoublesWeek(h, rows) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  club.appendRow([26, 'Damon Forsythe', 'damon31', '', true, '', '', 0]);

  const week = doubles.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  (rows || []).forEach((row) => week.appendRow(row));
  return { doubles, week };
}

function rowFor(h, fields) {
  const headers = h.bound.WEEKLY_RECORD_HEADERS_DOUBLES;
  const row = new Array(headers.length).fill('');
  for (const key in fields) {
    const index = headers.indexOf(key);
    if (index !== -1) row[index] = fields[key];
  }
  return row;
}

function getWeekView(h, extra) {
  return h.parse(h.fn('handleGetWeekView')(Object.assign({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: WEEK_DATE
  }, extra || {})));
}

test('week view returns the header row and every stored cell, read-only', () => {
  const h = loadCode();
  const { week } = buildDoublesWeek(h, [
    rowFor(h, {
      member_number: 26,
      player_name_snapshot: 'Damon Forsythe',
      udisc_name_import: 'Damon Forsythe',
      udisc_username_import: 'damon31',
      score: 41,
      round_relative_score: -14,
      round_rating: 261,
      team_position: '1',
      pair_key: 'dubs:2026-10-05:u:damon31+u:donjoses',
      weekly_points: 2
    })
  ]);

  const result = getWeekView(h);

  assert.equal(result.status, 'ok');
  assert.equal(result.writes, false);
  assert.equal(result.sheet_name, 'Week ' + WEEK_DATE);
  assert.deepEqual(result.headers, h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  assert.equal(result.column_count, h.bound.WEEKLY_RECORD_HEADERS_DOUBLES.length);
  assert.equal(result.row_count, 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0][result.headers.indexOf('score')], 41);
  assert.equal(result.rows[0][result.headers.indexOf('round_rating')], 261);
  assert.equal(result.rows[0][result.headers.indexOf('udisc_username_import')], 'damon31');

  // The record view keys the same cells by header name.
  assert.equal(result.records[0].score, 41);
  assert.equal(result.records[0].weekly_points, 2);
  assert.equal(result.records[0].pair_key, 'dubs:2026-10-05:u:damon31+u:donjoses');
});

test('week view reports no missing import columns for a complete tab', () => {
  const h = loadCode();
  buildDoublesWeek(h, []);

  const result = getWeekView(h);

  assert.deepEqual(result.missing_import_columns, []);
  assert.deepEqual(result.expected_import_columns, h.fn('expectedWeeklyImportColumns')('doubles', 'points'));
  assert.ok(result.expected_import_columns.includes('score'));
  assert.ok(result.expected_import_columns.includes('round_rating'));
  assert.ok(result.expected_import_columns.includes('udisc_name_import'));
  assert.ok(result.expected_import_columns.includes('weekly_points'));
  assert.ok(result.expected_import_columns.includes('pair_key'));
});

test('week view names an import column the tab is missing', () => {
  const h = loadCode();
  const { week } = buildDoublesWeek(h, []);

  // Simulate a tab provisioned without the round_rating column.
  const headers = week.rows[0];
  const ratingIndex = headers.indexOf('round_rating');
  headers.splice(ratingIndex, 1);
  week.rows[1] = new Array(headers.length).fill('');

  const result = getWeekView(h);

  assert.equal(result.status, 'ok');
  assert.ok(result.missing_import_columns.includes('round_rating'));
  assert.ok(result.missing_import_columns.includes('round_relative_score') === false,
    'columns that are still present are not reported missing');
});

test('week view refuses a missing or malformed date and a missing tab', () => {
  const h = loadCode();
  buildDoublesWeek(h, []);

  const noDate = h.parse(h.fn('handleGetWeekView')({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES }));
  assert.equal(noDate.status, 'error');

  const badDate = getWeekView(h, { league_date: 'October 5' });
  assert.equal(badDate.status, 'error');

  const missingTab = getWeekView(h, { league_date: '2026-09-28' });
  assert.equal(missingTab.status, 'error');
  assert.match(missingTab.message, /not found/i);
});

test('expectedWeeklyImportColumns follows the capability rules', () => {
  const h = loadCode();
  const singles = h.fn('expectedWeeklyImportColumns')('singles', 'tags');
  const doubles = h.fn('expectedWeeklyImportColumns')('doubles', 'points');

  // Singles keeps the ending-tag column and has no pair/points columns.
  assert.ok(singles.includes('udisc_ending_tag'));
  assert.ok(!singles.includes('pair_key'));
  assert.ok(!singles.includes('weekly_points'));

  // Doubles drops the ending tag and requires pair/team/points columns.
  assert.ok(!doubles.includes('udisc_ending_tag'));
  assert.ok(doubles.includes('pair_key'));
  assert.ok(doubles.includes('team_position'));
  assert.ok(doubles.includes('weekly_points'));

  // Both require every score and UDisc-detail column.
  for (const name of ['udisc_name_import', 'udisc_username_import', 'udisc_pdga_number_import',
    'score', 'round_relative_score', 'round_rating', 'event_relative_score', 'event_total_score']) {
    assert.ok(doubles.includes(name), name + ' must be required for doubles');
    assert.ok(singles.includes(name), name + ' must be required for singles');
  }
  for (let hole = 1; hole <= 18; hole++) {
    assert.ok(doubles.includes('hole_' + hole));
  }
});
