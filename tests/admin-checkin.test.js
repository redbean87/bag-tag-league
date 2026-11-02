'use strict';

// Admin check-in: the admin page checks a player in (and undoes it) by writing
// only checked_in, signed_in_at, and the actual in_tag the admin entered. It
// never touches scoring, out_tag, money fields, ClubMembers, or tag
// calculation. Runs in the Node VM Sheets fake; no live sheet is touched.

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

function buildSingles(h, weekRows) {
  const sheet = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const club = sheet.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  club.appendRow([1, 'Ann Archer', 'ann', '', 7, true, '2026-01-01', '2026-01-01']);
  club.appendRow([2, 'Bo Bell', 'bo', '', 12, true, '2026-01-01', '2026-01-01']);
  club.appendRow([3, 'Cy Cole', 'cy', '', 20, false, '2026-01-01', '2026-01-01']);
  const headers = h.bound.WEEKLY_RECORD_HEADERS;
  const week = sheet.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(headers);
  (weekRows || []).forEach((fields) => week.appendRow(weeklyRow(h, headers, fields)));
  return { sheet, week, headers, club };
}

function call(h, name, extra) {
  return h.parse(h.fn(name)(Object.assign({
    spreadsheetId: h.bound.SPREADSHEET_ID,
    league_date: WEEK_DATE
  }, extra || {})));
}

function weekRecords(week) {
  const values = week.getDataRange().getValues();
  return values.slice(1).map((row) => {
    const record = {};
    values[0].forEach((header, i) => { record[header] = row[i]; });
    return record;
  });
}

test('roster lists weekly players and active non-listed members with defaults', () => {
  const h = loadCode();
  buildSingles(h, [
    { member_number: 1, player_name_snapshot: 'Ann Archer', checked_in: true, signed_in_at: '2026-10-05T23:00:00.000Z', in_tag: 9 }
  ]);
  const result = call(h, 'handleGetAdminCheckInRoster');
  assert.strictEqual(result.status, 'ok');
  assert.strictEqual(result.uses_tags, true);
  assert.strictEqual(result.checked_in_count, 1);
  assert.strictEqual(result.player_count, 2); // inactive Cy Cole is not offered
  const ann = result.players.find((p) => p.member_number === 1);
  assert.strictEqual(ann.checked_in, true);
  assert.strictEqual(ann.in_tag, 9);
  const bo = result.players.find((p) => p.member_number === 2);
  assert.strictEqual(bo.on_week_sheet, false);
  assert.strictEqual(bo.checked_in, false);
  assert.strictEqual(bo.current_tag, 12); // stored tag offered as the default
});

test('check-in stores the entered tag, not current_tag, and stamps signed_in_at', () => {
  const h = loadCode();
  const { week, club } = buildSingles(h);
  const before = Date.now();
  const result = call(h, 'handleAdminCheckIn', { member_number: 2, in_tag: 5 });
  assert.strictEqual(result.status, 'ok');
  const [record] = weekRecords(week);
  assert.strictEqual(record.member_number, 2);
  assert.strictEqual(record.player_name_snapshot, 'Bo Bell');
  assert.strictEqual(record.checked_in, true);
  assert.strictEqual(record.in_tag, 5); // entered 5, stored current_tag is 12
  assert.ok(Date.parse(record.signed_in_at) >= before);
  // Not touched: scoring, out_tag, money, and the roster tag.
  assert.strictEqual(record.out_tag, '');
  assert.strictEqual(record.score, '');
  assert.strictEqual(record.paid, false);
  assert.strictEqual(record.ctp, false);
  assert.strictEqual(record.udisc_checked_in, '');
  assert.strictEqual(club.getDataRange().getValues()[2][4], 12);
});

test('check-in on an existing unchecked row updates that row in place', () => {
  const h = loadCode();
  const { week } = buildSingles(h, [
    { member_number: 2, player_name_snapshot: 'Bo Bell', checked_in: false, paid: true, score: 40 }
  ]);
  assert.strictEqual(call(h, 'handleAdminCheckIn', { member_number: 2, in_tag: '14' }).status, 'ok');
  const records = weekRecords(week);
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].checked_in, true);
  assert.strictEqual(records[0].in_tag, 14);
  assert.strictEqual(records[0].paid, true);
  assert.strictEqual(records[0].score, 40);
});

test('check-in refuses a missing or invalid tag, a duplicate, and an inactive member', () => {
  const h = loadCode();
  const { week } = buildSingles(h);
  assert.strictEqual(call(h, 'handleAdminCheckIn', { member_number: 2 }).status, 'error');
  assert.strictEqual(call(h, 'handleAdminCheckIn', { member_number: 2, in_tag: 0 }).status, 'error');
  assert.strictEqual(call(h, 'handleAdminCheckIn', { member_number: 2, in_tag: '4x' }).status, 'error');
  assert.strictEqual(call(h, 'handleAdminCheckIn', { member_number: 3, in_tag: 4 }).status, 'error');
  assert.strictEqual(weekRecords(week).length, 0);
  assert.strictEqual(call(h, 'handleAdminCheckIn', { member_number: 2, in_tag: 4 }).status, 'ok');
  assert.strictEqual(call(h, 'handleAdminCheckIn', { member_number: 2, in_tag: 4 }).status, 'error');
  assert.strictEqual(weekRecords(week).length, 1);
});

test('undo clears checked_in, signed_in_at, and the captured in_tag only', () => {
  const h = loadCode();
  const { week } = buildSingles(h, [
    { member_number: 2, player_name_snapshot: 'Bo Bell', paid: true, score: 40 }
  ]);
  call(h, 'handleAdminCheckIn', { member_number: 2, in_tag: 5 });
  assert.strictEqual(call(h, 'handleAdminUndoCheckIn', { member_number: 2 }).status, 'ok');
  const [record] = weekRecords(week);
  assert.strictEqual(record.checked_in, false);
  assert.strictEqual(record.signed_in_at, '');
  assert.strictEqual(record.in_tag, '');
  assert.strictEqual(record.paid, true);
  assert.strictEqual(record.score, 40);
  assert.strictEqual(call(h, 'handleAdminUndoCheckIn', { member_number: 2 }).status, 'error');
  assert.strictEqual(call(h, 'handleAdminUndoCheckIn', { member_number: 99 }).status, 'error');
  const roster = call(h, 'handleGetAdminCheckInRoster');
  assert.strictEqual(roster.checked_in_count, 0);
});

test('points leagues check in without a tag and never write one', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  club.appendRow([1, 'Damon Forsythe', 'damon31', '', true, '', '', 0]);
  const week = doubles.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  const args = { spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES, league_date: WEEK_DATE, member_number: 1 };
  const roster = h.parse(h.fn('handleGetAdminCheckInRoster')(args));
  assert.strictEqual(roster.uses_tags, false);
  assert.strictEqual(h.parse(h.fn('handleAdminCheckIn')(args)).status, 'ok');
  const [record] = weekRecords(week);
  assert.strictEqual(record.checked_in, true);
  assert.ok(record.signed_in_at);
  assert.strictEqual(h.parse(h.fn('handleAdminUndoCheckIn')(args)).status, 'ok');
  assert.strictEqual(weekRecords(week)[0].checked_in, false);
});

test('tag calculation ignores checked_in and signed_in_at entirely', () => {
  function calc(checkedIn, signedAt) {
    const h = loadCode();
    buildSingles(h, [
      { member_number: 1, player_name_snapshot: 'Ann Archer', in_tag: 3, score: 40, checked_in: checkedIn, signed_in_at: signedAt },
      { member_number: 2, player_name_snapshot: 'Bo Bell', in_tag: 8, score: 35, checked_in: checkedIn, signed_in_at: signedAt }
    ]);
    const result = call(h, 'handleCalculateTags');
    delete result.message;
    delete result.timestamp;
    return result;
  }
  const checked = calc(true, '2026-10-05T23:00:00.000Z');
  const unchecked = calc(false, '');
  assert.strictEqual(checked.status, 'ok');
  const strip = (r) => JSON.stringify(r, (k, v) => (k === 'checked_in' ? undefined : v));
  assert.strictEqual(strip(checked), strip(unchecked));
});

test('doPost routes the three actions end to end', () => {
  const h = loadCode();
  const { week } = buildSingles(h);
  const post = (body) => h.parse(h.fn('doPost')({ postData: { contents: JSON.stringify(Object.assign({ spreadsheetId: h.bound.SPREADSHEET_ID, league_date: WEEK_DATE }, body)) } }));
  assert.strictEqual(post({ action: 'adminCheckIn', member_number: 1, in_tag: 2 }).status, 'ok');
  assert.strictEqual(post({ action: 'getAdminCheckInRoster' }).checked_in_count, 1);
  assert.strictEqual(post({ action: 'adminUndoCheckIn', member_number: 1 }).status, 'ok');
  assert.strictEqual(weekRecords(week)[0].checked_in, false);
});
