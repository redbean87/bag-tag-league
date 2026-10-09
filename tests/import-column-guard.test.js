'use strict';

// Loud import guard: a week tab missing a column the UDisc mapping writes must
// fail the commit before any write instead of silently dropping the field.
// Runs in the Node VM Sheets fake; no credentials, network, or live writes.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

const WEEK_DATE = '2026-10-05';
const DOUBLES = '1c8QGftl2bKcLZeqwE2IyzAh5x4I22WRjSSgc7nGgeG8';

const PAIR_ROW = {
  name: 'Damon Forsythe & Brad Stevenson',
  usernames: 'damon31,donjoses',
  position: 1,
  position_raw: 1,
  round_total_score: 41,
  round_relative_score: -14,
  round_rating: 261,
  checked_in: 'Yes',
  paid: 'No'
};

/** Builds a doubles week tab whose header row omits `dropHeader`. */
function buildDoubles(h, dropHeaders) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  club.appendRow([26, 'Damon Forsythe', 'damon31', '', true, '', '', 0]);
  club.appendRow([2, 'Brad Stevenson', 'donjoses', '', true, '', '', 0]);

  const week = doubles.insertSheet('Week ' + WEEK_DATE);
  const headers = h.bound.WEEKLY_RECORD_HEADERS_DOUBLES
    .filter((header) => (dropHeaders || []).indexOf(header) === -1);
  week.appendRow(headers);
  return { doubles, week, headers };
}

function rowFor(headers, fields) {
  const row = new Array(headers.length).fill('');
  for (const key in fields) {
    const index = headers.indexOf(key);
    if (index !== -1) row[index] = fields[key];
  }
  return row;
}

function commitDoubles(h, rows) {
  return h.parse(h.fn('handleCommitUdiscImportDoubles')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: WEEK_DATE,
    rows,
    approved: true
  }));
}

test('doubles commit refuses a tab missing a score column and writes nothing', () => {
  const h = loadCode();
  const { week, headers } = buildDoubles(h, ['round_rating']);
  const before = JSON.stringify(week.rows);
  week.appendRow(rowFor(headers, { member_number: 26, player_name_snapshot: 'Damon Forsythe', udisc_username_snapshot: 'damon31', checked_in: true }));
  week.appendRow(rowFor(headers, { member_number: 2, player_name_snapshot: 'Brad Stevenson', udisc_username_snapshot: 'donjoses', checked_in: true }));
  const beforeWithRows = JSON.stringify(week.rows);

  const result = commitDoubles(h, [PAIR_ROW]);

  assert.equal(result.status, 'error');
  assert.equal(result.writes, false);
  assert.deepEqual(result.missing_columns, ['round_rating']);
  assert.match(result.message, /missing required import columns/i);
  assert.equal(JSON.stringify(week.rows), beforeWithRows, 'no weekly write may happen');
  assert.notEqual(beforeWithRows, before, 'sanity: the seeded rows exist');
});

test('doubles commit names every missing import column, not just the first', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, ['round_rating', 'udisc_name_import', 'hole_7']);

  const result = commitDoubles(h, [PAIR_ROW]);

  assert.equal(result.status, 'error');
  assert.deepEqual(result.missing_columns, ['udisc_name_import', 'round_rating', 'hole_7']);
  assert.equal(week.rows.length, 1, 'the tab is still header-only');
});

test('doubles commit still succeeds on a complete tab', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, []);

  const result = commitDoubles(h, [PAIR_ROW]);

  assert.equal(result.status, 'ok');
  assert.equal(result.summary.committed, 1);
  const scoreIndex = week.rows[0].indexOf('score');
  assert.equal(week.rows[1][scoreIndex], 41);
  const ratingIndex = week.rows[0].indexOf('round_rating');
  assert.equal(week.rows[1][ratingIndex], 261);
});

test('singles commit refuses a tab missing a UDisc-detail column and writes nothing', () => {
  const h = loadCode();
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const club = singles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  club.appendRow([1, 'Existing Member', 'existing', '111', '', true, '', '']);

  const week = singles.insertSheet('Week ' + WEEK_DATE);
  const headers = h.bound.WEEKLY_RECORD_HEADERS.filter((header) => header !== 'udisc_username_import');
  week.appendRow(headers);
  const before = JSON.stringify(week.rows);

  const result = h.parse(h.fn('handleCommitUdiscImport')({
    spreadsheetId: h.bound.SPREADSHEET_ID,
    league_date: WEEK_DATE,
    rows: [{ name: 'Existing Member', username: 'existing', pdga_number: '111', round_total_score: 50 }],
    approved: true
  }));

  assert.equal(result.status, 'error');
  assert.equal(result.writes, false);
  assert.deepEqual(result.missing_columns, ['udisc_username_import']);
  assert.equal(JSON.stringify(week.rows), before, 'no weekly write may happen');
});
