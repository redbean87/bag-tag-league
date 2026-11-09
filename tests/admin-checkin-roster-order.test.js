'use strict';

// Admin Check-In roster order (diagnosis option G): the list the admin picks
// from comes back most appearances first — from the stored ClubMembers
// `appearances` column, never recomputed at read time — with ties broken by
// surname, then member number, and every row carries its count so the UI can
// show "Weeks: N". The tie-break pairs below are chosen to fail under either
// wrong key: full-name order would put "Avery Zabel" before "Becca Apple",
// and member-number order would put "Dan Fox" before "Dee Fox". Runs in a
// Node VM Sheets fake; no live sheet is touched.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

const WEEK_DATE = '2026-10-05';

function weeklyRow(h, headers, fields) {
  const row = new Array(headers.length).fill('');
  for (const key in fields) {
    const index = headers.indexOf(key);
    if (index !== -1) row[index] = fields[key];
  }
  return row;
}

// Singles roster provisioned with the appearances column (as PR #57 ships it).
function buildRoster(h, members, weekRows) {
  const sheet = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const club = sheet.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS.concat(['appearances']));
  members.forEach((row) => club.appendRow(row));
  const headers = h.bound.WEEKLY_RECORD_HEADERS;
  const week = sheet.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(headers);
  (weekRows || []).forEach((fields) => week.appendRow(weeklyRow(h, headers, fields)));
  return { sheet, week, headers, club };
}

function member(num, name, appearances) {
  return [num, name, '', '', 7, true, '2026-01-01', '2026-01-01', appearances];
}

const ROSTER = [
  member(10, 'Max Moore', 12),
  member(7, 'Bea Bell', 7),
  member(3, 'Avery Zabel', 3),
  member(4, 'Becca Apple', 3),
  member(5, 'Dee Fox', 2),
  member(8, 'Dan Fox', 2),
  member(1, 'Ann Archer', 0),
  member(2, 'Bo Bell', '') // blank cell reads as 0
];

function call(h, name, extra) {
  return h.parse(h.fn(name)(Object.assign({
    spreadsheetId: h.bound.SPREADSHEET_ID,
    league_date: WEEK_DATE
  }, extra || {})));
}

test('the admin roster comes back most appearances first, ties by surname then member number', () => {
  const h = loadCode();
  buildRoster(h, ROSTER, [
    { member_number: 10, player_name_snapshot: 'Max Moore', checked_in: true }
  ]);

  const result = call(h, 'handleGetAdminCheckInRoster');

  assert.strictEqual(result.status, 'ok');
  assert.deepEqual(result.players.map((p) => p.name), [
    'Max Moore', // 12
    'Bea Bell', // 7
    'Becca Apple', // 3 — surname "apple" before "zabel" (full name would flip these)
    'Avery Zabel', // 3
    'Dee Fox', // 2 — member number 5 before 8 (full name would flip these)
    'Dan Fox', // 2
    'Ann Archer', // 0 — surname "archer" before "bell"
    'Bo Bell' // 0 (blank cell)
  ]);
  assert.deepEqual(result.players.map((p) => p.appearances),
    [12, 7, 3, 3, 2, 2, 0, 0]);
});

test('every roster row carries its stored count; checking in tonight does not move it', () => {
  const h = loadCode();
  buildRoster(h, ROSTER, [
    { member_number: 10, player_name_snapshot: 'Max Moore', checked_in: true },
    { member_number: 2, player_name_snapshot: 'Bo Bell', checked_in: true }
  ]);

  const result = call(h, 'handleGetAdminCheckInRoster');

  // Checked in tonight with 0 stored appearances, Bo still ranks below a
  // member with 1 stored appearance: the count only moves at finalize.
  const byName = {};
  result.players.forEach((p) => { byName[p.name] = p; });
  assert.strictEqual(byName['Bo Bell'].appearances, 0);
  assert.strictEqual(byName['Ann Archer'].appearances, 0);
  assert.ok(result.players.indexOf(byName['Bo Bell']) > result.players.indexOf(byName['Bea Bell']));
  // On-sheet and off-sheet rows alike expose the count as a number.
  result.players.forEach((p) => assert.strictEqual(typeof p.appearances, 'number'));
  assert.strictEqual(byName['Max Moore'].checked_in, true);
  assert.strictEqual(byName['Max Moore'].on_week_sheet, true);
});

test('the ordered roster with appearances is served end to end through doPost', () => {
  const h = loadCode();
  buildRoster(h, ROSTER);

  const post = (body) => h.parse(h.fn('doPost')({ postData: { contents: JSON.stringify(Object.assign({
    spreadsheetId: h.bound.SPREADSHEET_ID,
    league_date: WEEK_DATE
  }, body)) } }));

  const roster = post({ action: 'getAdminCheckInRoster' });

  assert.strictEqual(roster.status, 'ok');
  assert.strictEqual(roster.players[0].name, 'Max Moore');
  assert.strictEqual(roster.players[0].appearances, 12);
  assert.strictEqual(roster.players[roster.players.length - 1].name, 'Bo Bell');
  assert.strictEqual(roster.players[roster.players.length - 1].appearances, 0);
});
