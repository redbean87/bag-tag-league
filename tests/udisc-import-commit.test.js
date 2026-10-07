'use strict';

// Singles UDisc import commit — regression coverage for the three write paths
// after the shared-helper extraction. Runs in a Node VM with an in-memory
// Sheets fake; no credentials, network, or live sheet writes.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

const WEEK_DATE = '2026-10-05';

function makeWeeklyRow(h, fields) {
  const headers = h.bound.WEEKLY_RECORD_HEADERS;
  const row = new Array(headers.length).fill('');
  for (const key in fields) {
    const index = headers.indexOf(key);
    if (index !== -1) row[index] = fields[key];
  }
  return row;
}

function buildSingles(h, weeklyRows) {
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const club = singles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  club.appendRow([1, 'Existing Member', 'existing', '111', '', true, '', '']);
  club.appendRow([2, 'Second Member', 'second', '222', '', true, '', '']);

  const week = singles.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS);
  (weeklyRows || []).forEach((row) => week.appendRow(row));
  return { singles, club, week };
}

function commit(h, rows) {
  return h.parse(h.fn('handleCommitUdiscImport')({
    spreadsheetId: h.bound.SPREADSHEET_ID,
    league_date: WEEK_DATE,
    rows,
    approved: true
  }));
}

function dataRows(sheet) {
  return sheet.rows.slice(1);
}

function value(sheet, row, header) {
  return row[sheet.rows[0].indexOf(header)];
}

test('singles commit updates a matched weekly row in place and preserves protected fields', () => {
  const h = loadCode();
  const { week } = buildSingles(h, [
    makeWeeklyRow(h, {
      member_number: 1,
      player_name_snapshot: 'Existing Member',
      udisc_username_snapshot: 'existing',
      in_tag: 12,
      checked_in: true,
      notes: 'keep'
    })
  ]);

  const result = commit(h, [{
    name: 'Existing Member',
    username: 'existing',
    pdga_number: '111',
    round_total_score: 50
  }]);

  assert.equal(result.summary.matched_updated, 1);
  assert.equal(dataRows(week).length, 1);
  const row = dataRows(week)[0];
  assert.equal(value(week, row, 'score'), 50);
  assert.equal(value(week, row, 'in_tag'), 12);
  assert.equal(value(week, row, 'notes'), 'keep');
  assert.notEqual(value(week, row, 'updated_at'), '');
});

test('singles commit appends a new weekly row for an existing club member', () => {
  const h = loadCode();
  const { week } = buildSingles(h, []);

  const result = commit(h, [{ name: 'Existing Member', username: 'existing' }]);

  assert.equal(result.summary.existing_member_weekly_created, 1);
  assert.equal(dataRows(week).length, 1);
  assert.equal(value(week, dataRows(week)[0], 'member_number'), 1);
  assert.equal(value(week, dataRows(week)[0], 'checked_in'), true);
});

test('singles commit creates a ClubMembers row and weekly row for a new identity', () => {
  const h = loadCode();
  const { week, club } = buildSingles(h, []);

  const result = commit(h, [{ name: 'Brand New', username: 'brandnew', pdga_number: '999' }]);

  assert.equal(result.summary.new_members_created, 1);
  assert.equal(result.created_member_numbers.length, 1);
  assert.equal(dataRows(week).length, 1);
  assert.equal(dataRows(club).length, 3);
  assert.equal(value(week, dataRows(week)[0], 'player_name_snapshot'), 'Brand New');
});

test('singles commit skips a name-only identity it cannot create', () => {
  const h = loadCode();
  const { week, club } = buildSingles(h, []);

  const result = commit(h, [{ name: 'No Identity' }]);

  assert.equal(result.summary.total_affected, 0);
  assert.equal(dataRows(week).length, 0);
  assert.equal(dataRows(club).length, 2);
});

test('singles commit dedups a repeated new identity within one batch', () => {
  const h = loadCode();
  const { week, club } = buildSingles(h, []);

  const result = commit(h, [
    { name: 'Brand New', username: 'brandnew' },
    { name: 'Brand New', username: 'brandnew' }
  ]);

  assert.equal(result.summary.new_members_created, 1);
  assert.equal(dataRows(club).length, 3);
  assert.equal(dataRows(week).length, 1);
});

test('singles commit refuses a doubles spreadsheet selector', () => {
  const h = loadCode();
  const result = h.parse(h.fn('handleCommitUdiscImport')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: WEEK_DATE,
    rows: [{ name: 'Someone', username: 'someone' }],
    approved: true
  }));

  assert.equal(result.status, 'error');
  assert.match(result.message, /doubles/i);
});
