'use strict';

// Doubles UDisc import preview — parsing, independent partner matching,
// pair-level verdicts, format routing, and read-only safety.
//
// All tests run in a Node VM with an in-memory Sheets fake. No Google
// credentials, network access, or live sheet writes are involved.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

const WEEK_DATE = '2026-10-05';

function weeklyRow(h, member, name, username, pdga) {
  const row = new Array(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES.length).fill('');
  row[h.bound.WEEKLY_RECORD_HEADERS_DOUBLES.indexOf('member_number')] = member;
  row[h.bound.WEEKLY_RECORD_HEADERS_DOUBLES.indexOf('player_name_snapshot')] = name;
  row[h.bound.WEEKLY_RECORD_HEADERS_DOUBLES.indexOf('udisc_username_snapshot')] = username;
  row[h.bound.WEEKLY_RECORD_HEADERS_DOUBLES.indexOf('pdga_number_snapshot')] = pdga;
  return row;
}

/**
 * Builds a doubles spreadsheet with an active roster and one week tab.
 * `weeklyRows` are raw weekly records added after the header.
 */
function buildDoubles(h, weeklyRows) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  club.appendRow([3, 'Damon Forsythe', 'damon31', '151236', '', true, '', '']);
  club.appendRow([7, 'Brad Stevenson', 'donjoses', '85170', '', true, '', '']);
  club.appendRow([21, 'Alice Smith', 'alice', '', '', true, '', '']);
  club.appendRow([30, 'Sam Jones', 'samj', '', '', true, '', '']);
  club.appendRow([31, 'Sam Jones', 'samj2', '', '', true, '', '']);
  club.appendRow([40, 'Retired Player', 'retired', '', '', false, '', '']);

  const week = doubles.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  (weeklyRows || []).forEach((row) => week.appendRow(row));

  return { doubles, club, week };
}

function preview(h, rows) {
  const result = h.parse(h.fn('handlePreviewUdiscImportDoubles')({
    spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
    league_date: WEEK_DATE,
    rows
  }));
  return result;
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

test('parses a singular username solo row', () => {
  const h = loadCode();
  const parsed = h.fn('parseDoublesRow')({ name: 'Robert Finch', username: 'finch411' });

  assert.equal(parsed.is_solo, true);
  assert.equal(parsed.partners.length, 1);
  assert.equal(parsed.partners[0].name, 'Robert Finch');
  assert.equal(parsed.partners[0].username, 'finch411');
  assert.deepEqual(parsed.errors, []);
});

test('parses plural usernames and splits them on commas', () => {
  const h = loadCode();
  const parsed = h.fn('parseDoublesRow')({
    name: 'Damon Forsythe & Brad Stevenson',
    usernames: 'damon31, donjoses'
  });

  assert.equal(parsed.is_solo, false);
  assert.equal(parsed.partners.length, 2);
  assert.equal(parsed.partners[0].username, 'damon31');
  assert.equal(parsed.partners[1].username, 'donjoses');
  assert.equal(parsed.partners[1].name, 'Brad Stevenson');
  assert.deepEqual(parsed.errors, []);
});

test('splits pair names on the last ampersand and keeps earlier ones intact', () => {
  const h = loadCode();
  const parsed = h.fn('parseDoublesRow')({
    name: 'Ann & Bo & Cal',
    usernames: 'ann,cal'
  });

  assert.equal(parsed.partners.length, 2);
  assert.equal(parsed.partners[0].name, 'Ann & Bo');
  assert.equal(parsed.partners[1].name, 'Cal');
});

test('a row with no delimiter is a solo participant', () => {
  const h = loadCode();
  const parsed = h.fn('parseDoublesRow')({ name: 'Robert Finch', usernames: 'finch411' });

  assert.equal(parsed.is_solo, true);
  assert.equal(parsed.partners.length, 1);
});

test('a fully blank row is blocked as malformed', () => {
  const h = loadCode();
  const parsed = h.fn('parseDoublesRow')({});

  assert.ok(parsed.errors.includes('missing_name'));
  assert.ok(parsed.errors.includes('blank_partner'));
  const verdict = h.fn('computeDoublesPairVerdict')(parsed, parsed.partners);
  assert.equal(verdict.verdict, 'blocked');
});

test('a blank handle in the pair cell is flagged', () => {
  const h = loadCode();
  const parsed = h.fn('parseDoublesHandles')('damon31,');

  assert.deepEqual(parsed.handles, ['damon31']);
  assert.ok(parsed.warnings.includes('blank_handle'));
});

test('three or more handles are flagged for review', () => {
  const h = loadCode();
  const parsed = h.fn('parseDoublesHandles')('a,b,c');

  assert.equal(parsed.handles.length, 3);
  assert.ok(parsed.warnings.includes('too_many_handles'));
});

test('a duplicate handle collapses to a solo participant and is flagged', () => {
  const h = loadCode();
  const parsed = h.fn('parseDoublesRow')({ name: 'Robert Finch', usernames: 'redbean,redbean' });

  assert.equal(parsed.is_solo, true);
  assert.deepEqual(parsed.partners.map((p) => p.username), ['redbean']);
  assert.ok(parsed.warnings.includes('duplicate_handle'));
});

test('malformed ampersand placement is an error', () => {
  const h = loadCode();
  const parsed = h.fn('parseDoublesPairName')('Damon Forsythe &');

  assert.ok(parsed.errors.includes('malformed_ampersand'));
});

test('an ampersand inside a name is flagged as ambiguous', () => {
  const h = loadCode();
  const parsed = h.fn('parseDoublesPairName')('AT&T');

  assert.ok(parsed.warnings.includes('ambiguous_ampersand'));
  assert.deepEqual(parsed.errors, []);
});

// ─── Independent partner matching ────────────────────────────────────────────

test('matches each partner independently through the weekly username path', () => {
  const h = loadCode();
  const { doubles } = buildDoubles(h, [weeklyRow(h, 3, 'Damon Forsythe', 'damon31', '151236')]);

  const result = preview(h, [{ name: 'Damon Forsythe & Newbie Person', usernames: 'damon31,newbie' }]);
  assert.equal(result.status, 'ok');
  const pair = result.pairs[0];

  assert.equal(pair.partners.length, 2);
  assert.equal(pair.partners[0].match.status, 'matched');
  assert.equal(pair.partners[0].match.source, 'weekly_username');
  assert.equal(pair.partners[0].match.member_number, 3);
  // Partner B is independent: it must not inherit partner A's match.
  assert.equal(pair.partners[1].match.status, 'new');
  assert.notEqual(pair.partners[1].match.member_number, 3);
  assert.equal(pair.verdict, 'ready');
  assert.ok(doubles);
});

test('matches a solo partner by PDGA number against the weekly sheet', () => {
  const h = loadCode();
  buildDoubles(h, [weeklyRow(h, 3, 'Damon Forsythe', 'damon31', '151236')]);

  const indexes = {
    wMemberCol: 0,
    wNameCol: 1,
    wUdiscCol: 2,
    weeklyByUsername: {},
    weeklyByPdga: { 151236: { row: weeklyRow(h, 3, 'Damon Forsythe', 'damon31', '151236'), index: 1 } },
    weeklyByName: {},
    clubByUsername: {},
    clubByPdga: {},
    clubByName: {},
    clubByMember: {}
  };
  const match = h.fn('matchDoublesPartner')({ name: '', username: '', pdga_number: '151236' }, indexes);

  assert.equal(match.status, 'matched');
  assert.equal(match.source, 'weekly_pdga');
  assert.equal(match.member_number, 3);
});

test('matches a partner through ClubMembers when there is no weekly record', () => {
  const h = loadCode();
  buildDoubles(h, []);

  const result = preview(h, [{ name: 'New & Alice', usernames: 'newbie,alice' }]);
  const pair = result.pairs[0];

  assert.equal(pair.partners[1].match.status, 'matched');
  assert.equal(pair.partners[1].match.source, 'club_username');
  assert.equal(pair.partners[1].match.member_number, 21);
  assert.equal(pair.partners[1].match.club_member, true);
});

test('matches a partner by unique weekly name when the username is missing', () => {
  const h = loadCode();
  buildDoubles(h, [weeklyRow(h, 3, 'Damon Forsythe', 'damon31', '')]);

  const result = preview(h, [{ name: 'Damon Forsythe & Brad Stevenson', usernames: ',donjoses' }]);
  const pair = result.pairs[0];

  assert.equal(pair.partners[0].match.source, 'weekly_name');
  assert.equal(pair.partners[0].match.member_number, 3);
});

test('one partner matched and the other unmatched leaves the pair in review', () => {
  const h = loadCode();
  buildDoubles(h, [weeklyRow(h, 3, 'Damon Forsythe', 'damon31', '')]);

  const result = preview(h, [{ name: 'Damon Forsythe & Ghost Person', usernames: 'damon31,' }]);
  const pair = result.pairs[0];

  assert.equal(pair.partners[0].match.status, 'matched');
  assert.equal(pair.partners[1].match.status, 'unmatched');
  assert.equal(pair.verdict, 'review');
  assert.equal(pair.verdict_reason, 'unmatched_partner');
});

test('an ambiguous name match is flagged and never auto-created', () => {
  const h = loadCode();
  buildDoubles(h, [
    weeklyRow(h, 30, 'Sam Jones', 'samj', ''),
    weeklyRow(h, 31, 'Sam Jones', 'samj2', '')
  ]);

  const result = preview(h, [{ name: 'Sam Jones & Alice Smith', usernames: ',alice' }]);
  const pair = result.pairs[0];

  assert.equal(pair.partners[0].match.status, 'ambiguous');
  assert.equal(pair.partners[0].match.source, 'weekly_name');
  assert.equal(pair.partners[0].match.candidates.length, 2);
  assert.equal(pair.verdict, 'review');
  assert.equal(pair.verdict_reason, 'ambiguous_match');
  // A resolved partner must not hide the ambiguous one.
  assert.equal(pair.partners[1].match.status, 'matched');
});

test('a duplicate handle pair is held for review', () => {
  const h = loadCode();
  buildDoubles(h, []);

  const result = preview(h, [{ name: 'Robert Finch', usernames: 'redbean,redbean' }]);
  const pair = result.pairs[0];

  assert.equal(pair.is_solo, true);
  assert.equal(pair.verdict, 'review');
  assert.ok(pair.validation.warnings.includes('duplicate_handle'));
});

test('a malformed row is blocked', () => {
  const h = loadCode();
  buildDoubles(h, []);

  const result = preview(h, [{ name: 'Damon Forsythe &' }]);
  const pair = result.pairs[0];

  assert.equal(pair.verdict, 'blocked');
  assert.ok(pair.validation.errors.includes('malformed_ampersand'));
});

// ─── Format routing and read-only safety ─────────────────────────────────────

test('the pair-based preview refuses a singles-format league', () => {
  const h = loadCode();
  h.makeSpreadsheet(h.bound.SPREADSHEET_ID);

  const result = h.parse(h.fn('handlePreviewUdiscImportDoubles')({
    spreadsheetId: h.bound.SPREADSHEET_ID,
    league_date: WEEK_DATE,
    rows: [{ name: 'A & B', usernames: 'a,b' }]
  }));

  assert.equal(result.status, 'error');
  assert.match(result.message, /pair-based/i);
});

test('the preview is routed from doPost for the doubles action', () => {
  const h = loadCode();
  buildDoubles(h, []);

  const response = h.fn('doPost')({
    postData: {
      contents: JSON.stringify({
        action: 'previewUdiscImportDoubles',
        spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES,
        league_date: WEEK_DATE,
        rows: [{ name: 'A & B', usernames: 'a,b' }]
      })
    }
  });
  const result = JSON.parse(response.getContent());
  assert.equal(result.status, 'ok');
  assert.equal(result.preview_only, true);
});

test('the doubles preview performs no live sheet writes', () => {
  const h = loadCode();
  const { doubles, week, club } = buildDoubles(h, [
    weeklyRow(h, 3, 'Damon Forsythe', 'damon31', '')
  ]);

  const before = JSON.stringify({
    week: week.rows,
    club: club.rows,
    sheets: doubles.getSheets().map((s) => s.getName())
  });

  const result = preview(h, [
    { name: 'Damon Forsythe & Brand New', usernames: 'damon31,brandnew' },
    { name: 'Ghost Person', username: 'ghost' },
    { name: 'Broken &', usernames: 'broken,' }
  ]);
  assert.equal(result.status, 'ok');
  assert.equal(result.live_sheet_writes, 0);

  const after = JSON.stringify({
    week: week.rows,
    club: club.rows,
    sheets: doubles.getSheets().map((s) => s.getName())
  });
  assert.equal(after, before, 'preview must not mutate any sheet');
});

test('the preview returns the active roster for overrides only', () => {
  const h = loadCode();
  buildDoubles(h, []);

  const result = preview(h, [{ name: 'A & B', usernames: 'a,b' }]);
  const memberNumbers = result.roster.map((m) => m.member_number);

  assert.ok(memberNumbers.includes(3));
  assert.ok(memberNumbers.includes(21));
  assert.ok(!memberNumbers.includes(40), 'inactive members must be excluded');
  assert.equal(result.summary.total_udisc_rows, 1);
});
