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

test('singles commit snapshots the roster identity for an existing member', () => {
  const h = loadCode();
  const { week } = buildSingles(h, []);

  // The roster holds member 1 with name/PDGA 111; the export carries a
  // different name and PDGA. The new row snapshots the roster, while the
  // import columns record what the export actually said.
  const result = commit(h, [{ name: 'UDisc Alias', username: 'existing', pdga_number: '999999' }]);

  assert.equal(result.summary.existing_member_weekly_created, 1);
  const row = dataRows(week)[0];
  assert.equal(value(week, row, 'player_name_snapshot'), 'Existing Member');
  assert.equal(value(week, row, 'udisc_username_snapshot'), 'existing');
  assert.equal(value(week, row, 'pdga_number_snapshot'), '111');
  assert.equal(value(week, row, 'udisc_name_import'), 'UDisc Alias');
  assert.equal(value(week, row, 'udisc_pdga_number_import'), '999999');
});

test('singles commit falls back to the import PDGA when the roster has none', () => {
  const h = loadCode();
  const { week, club } = buildSingles(h, []);
  club.appendRow([3, 'No Pdga', 'nopdga', '', '', true, '', '']);

  const result = commit(h, [{ name: 'No Pdga', username: 'nopdga', pdga_number: '555' }]);

  assert.equal(result.summary.existing_member_weekly_created, 1);
  const row = dataRows(week)[0];
  assert.equal(value(week, row, 'player_name_snapshot'), 'No Pdga');
  assert.equal(value(week, row, 'pdga_number_snapshot'), '555');
});

test('singles re-import leaves an existing row snapshot untouched', () => {
  const h = loadCode();
  const { week } = buildSingles(h, [
    makeWeeklyRow(h, {
      member_number: 1,
      player_name_snapshot: 'Existing Member',
      udisc_username_snapshot: 'existing',
      pdga_number_snapshot: '777777',
      checked_in: true
    })
  ]);

  const result = commit(h, [{ name: 'Existing Member', username: 'existing', pdga_number: '111' }]);

  assert.equal(result.summary.matched_updated, 1);
  assert.equal(dataRows(week).length, 1);
  const row = dataRows(week)[0];
  assert.equal(value(week, row, 'pdga_number_snapshot'), '777777');
  assert.equal(value(week, row, 'udisc_pdga_number_import'), '111');
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

test('the tag-based commit refuses a points-scoring league selector', () => {
  const h = loadCode();
  const result = h.parse(h.fn('handleCommitUdiscImport')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: WEEK_DATE,
    rows: [{ name: 'Someone', username: 'someone' }],
    approved: true
  }));

  assert.equal(result.status, 'error');
  assert.match(result.message, /scoring method/i);
});
