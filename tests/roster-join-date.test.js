'use strict';

// Member join date (`created_at`) across the seed-only roster reload, check-in,
// the member listing, and the admin Member since column.
//
// The reload accepts a join date under the payload field `joined` and writes it
// to `created_at`. An omitted or blank `joined` preserves the stored date and a
// check-in can neither set nor clear it. Runs in a Node VM with an in-memory
// Sheets fake: no Google credentials, network access, or live sheet writes.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadCode, REPO_ROOT } = require('./helpers/load-code');

const ADMIN_HTML = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');

const JOINED = '2026-03-01T00:00:00.000Z';

// ─── Fixtures ────────────────────────────────────────────────────────────────

// A provisioned doubles workbook with a header-only roster, the state a
// scope: 'full' reset leaves behind.
function buildDoubles(h, spreadsheetId) {
  const doubles = h.makeSpreadsheet(spreadsheetId || h.bound.SPREADSHEET_ID_DOUBLES);

  const league = doubles.insertSheet('League');
  league.appendRow(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES);
  const leagueRow = new Array(h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.length).fill('');
  leagueRow[h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.indexOf('league_format')] = h.bound.LEAGUE_FORMAT_DOUBLES;
  leagueRow[h.bound.LEAGUE_SHEET_HEADERS_DOUBLES.indexOf('scoring')] = h.bound.SCORING_POINTS;
  league.appendRow(leagueRow);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);

  const week = doubles.insertSheet('Week 2026-10-05');
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);

  return { doubles, club, week };
}

function member(number, overrides) {
  return Object.assign({
    member_number: number,
    name: 'Member ' + number,
    udisc_username: 'member' + number,
    pdga_number: String(1000 + number),
    is_active: true
  }, overrides || {});
}

function cell(h, club, memberNumber, header) {
  const headers = h.fn('getSheetHeaders')(club);
  const numberCol = headers.indexOf('member_number');
  const col = headers.indexOf(header);
  const data = club.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][numberCol]) === String(memberNumber)) return data[i][col];
  }
  return undefined;
}

function seed(h, members, apply) {
  return h.parse(h.fn('handleSeedRoster')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    members: members,
    apply: apply !== false
  }));
}

// ─── The reload accepts an explicit join date ────────────────────────────────

test('a reload with a join date stores it as created_at', () => {
  const h = loadCode();
  const { doubles, club } = buildDoubles(h);
  club.appendRow([1, 'Damon Forsythe', 'damon31', '151236', true, '', '', 0]);

  const report = seed(h, [member(1, { name: 'Damon Forsythe', joined: JOINED })]);

  assert.equal(report.status, 'ok');
  assert.equal(report.updated, 1);
  assert.equal(cell(h, club, 1, 'created_at'), JOINED);
});

test('a new member seeded with a join date lands with it as created_at', () => {
  const h = loadCode();
  const { club } = buildDoubles(h);

  const report = seed(h, [member(5, { joined: JOINED })]);

  assert.equal(report.inserted, 1);
  assert.equal(cell(h, club, 5, 'created_at'), JOINED);
});

test('a new member seeded without a join date lands blank, never the load time', () => {
  const h = loadCode();
  const { club } = buildDoubles(h);

  const report = seed(h, [member(6)]);

  assert.equal(report.inserted, 1);
  assert.equal(cell(h, club, 6, 'created_at'), '');
});

// ─── Absent or blank preserves the stored join date ──────────────────────────

test('a reload without a join date preserves the stored created_at', () => {
  const h = loadCode();
  const { club } = buildDoubles(h);
  club.appendRow([1, 'Damon Forsythe', 'damon31', '151236', true, JOINED, 'stored-updated', 0]);

  const report = seed(h, [member(1, { name: 'Damon Forsythe', udisc_username: 'damon31', pdga_number: '151236' })]);

  assert.equal(report.status, 'ok');
  assert.equal(report.updated, 0, 'an omitted join date is not a change');
  assert.equal(cell(h, club, 1, 'created_at'), JOINED);
});

test('a reload with a blank join date preserves the stored created_at', () => {
  const h = loadCode();
  const { club } = buildDoubles(h);
  club.appendRow([1, 'Damon Forsythe', 'damon31', '151236', true, JOINED, 'stored-updated', 0]);

  const report = seed(h, [member(1, { name: 'Damon Forsythe', udisc_username: 'damon31', pdga_number: '151236', joined: '' })]);

  assert.equal(report.status, 'ok');
  assert.equal(report.updated, 0, 'a blank join date is not a change');
  assert.equal(cell(h, club, 1, 'created_at'), JOINED, 'a blank join date must never clear the stored date');
});

test('a join date the payload actually changes is reported as a created_at change', () => {
  const h = loadCode();
  const { club } = buildDoubles(h);
  club.appendRow([1, 'Damon Forsythe', 'damon31', '151236', true, '2026-01-01T00:00:00.000Z', 'stored-updated', 0]);

  const report = seed(h, [member(1, { name: 'Damon Forsythe', udisc_username: 'damon31', pdga_number: '151236', joined: JOINED })]);

  assert.equal(report.updated, 1);
  assert.deepEqual(report.results[0].changed_fields, ['created_at']);
  assert.equal(cell(h, club, 1, 'created_at'), JOINED);
});

// ─── updated_at keeps its meaning ────────────────────────────────────────────

test('a reload that sets a join date leaves the stored updated_at untouched', () => {
  const h = loadCode();
  const { club } = buildDoubles(h);
  club.appendRow([1, 'Damon Forsythe', 'damon31', '151236', true, '', 'stored-updated', 0]);

  seed(h, [member(1, { name: 'Damon Forsythe', joined: JOINED })]);

  assert.equal(cell(h, club, 1, 'created_at'), JOINED);
  assert.equal(cell(h, club, 1, 'updated_at'), 'stored-updated', 'updated_at is never repurposed as a join date');
});

// ─── The member listing exposes the stored join date ─────────────────────────

test('listClubMembers carries created_at as a read-only field', () => {
  const h = loadCode();
  const { club } = buildDoubles(h);
  club.appendRow([1, 'Ann', 'ann', '', true, JOINED, '', 0]);
  club.appendRow([2, 'Bob', 'bob', '', true, '', '', 0]);

  const result = h.parse(h.fn('handleListClubMembers')({ league: h.bound.LEAGUE_ID_DOUBLES }));
  const byNumber = {};
  result.members.forEach((m) => { byNumber[m.member_number] = m; });

  assert.equal(byNumber[1].created_at, JOINED);
  assert.equal(byNumber[2].created_at, '', 'a member with no stored date reports blank, never undefined');
});

// ─── Check-in never touches the join date ────────────────────────────────────

function checkIn(h, payload) {
  return h.parse(h.fn('handleSubmitCheckIn')(Object.assign({
    league: h.bound.LEAGUE_ID_DOUBLES,
    member_number: 1,
    name: 'Damon Forsythe',
    paid: true
  }, payload || {})));
}

test('a returning check-in cannot set or clear the stored join date', () => {
  const h = loadCode();
  const { club } = buildDoubles(h);
  club.appendRow([1, 'Damon Forsythe', 'damon31', '151236', true, JOINED, 'stored-updated', 0]);

  // A payload that tries to inject join-date keys is ignored entirely.
  const result = checkIn(h, { joined: '1999-01-01T00:00:00.000Z', created_at: '1999-01-01T00:00:00.000Z' });

  assert.equal(result.status, 'ok');
  assert.equal(cell(h, club, 1, 'created_at'), JOINED, 'the check-in must never change the join date');
});

test('a new member created at check-in gets the current time as its join date', () => {
  const h = loadCode();
  const { club } = buildDoubles(h);

  const before = new Date().toISOString();
  const result = h.parse(h.fn('handleSubmitCheckIn')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    name: 'New Player',
    paid: true
  }));
  const after = new Date().toISOString();

  assert.equal(result.status, 'ok');
  const created = cell(h, club, 1, 'created_at');
  assert.ok(created >= before && created <= after, 'the new member join date is the check-in time');
  assert.equal(cell(h, club, 1, 'updated_at'), created, 'created_at and updated_at are the same instant');
});

// ─── The admin Member since column ───────────────────────────────────────────

function adminFunctionBody(name) {
  const start = ADMIN_HTML.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'expected function ' + name);
  const next = ADMIN_HTML.indexOf('\n    function ', start + 1);
  return ADMIN_HTML.slice(start, next === -1 ? undefined : next);
}

test('the members table renders a date-only Member since column', () => {
  assert.match(ADMIN_HTML, />Member since</);
  assert.match(adminFunctionBody('renderMembers'), /formatMemberSince\(member\.created_at\)/);
});

test('formatMemberSince renders a date-only label and is blank-safe', () => {
  const source = adminFunctionBody('formatMemberSince') + '\nreturn formatMemberSince;';
  const formatMemberSince = new Function(source)();

  assert.equal(formatMemberSince('2026-03-01T12:34:56.000Z'), '2026-03-01');
  assert.equal(formatMemberSince('2026-03-01'), '2026-03-01');
  assert.equal(formatMemberSince(''), '');
  assert.equal(formatMemberSince('   '), '');
  assert.equal(formatMemberSince(undefined), '');
  assert.equal(formatMemberSince(null), '');
  assert.equal(formatMemberSince('not-a-date'), '', 'an unparseable value must not become an epoch date');
});

function fakeDocument() {
  const elements = {};
  return {
    elements,
    getElementById(id) {
      if (!elements[id]) elements[id] = { id, style: {}, innerHTML: '' };
      return elements[id];
    }
  };
}

test('renderMembers shows the readable date and leaves a dateless member blank', () => {
  const names = ['escHtml', 'formatMemberSince', 'renderMembers'];
  const source = names.map(adminFunctionBody).join('\n') +
    '\nreturn { renderMembers: renderMembers };';
  const document = fakeDocument();
  const admin = new Function('document', source)(document);

  admin.renderMembers([
    { member_number: 1, name: 'Ann', udisc_username: 'ann', pdga_number: '', season_points: 2, is_active: true, created_at: '2026-03-01T12:00:00.000Z' },
    { member_number: 2, name: 'Bob', udisc_username: 'bob', pdga_number: '', season_points: 0, is_active: true, created_at: '' }
  ]);

  const html = document.getElementById('membersTable').innerHTML;
  assert.match(html, /Member since/);
  assert.match(html, /2026-03-01/);
  assert.doesNotMatch(html, /2026-03-01T/, 'the timestamp detail must not show');
  assert.doesNotMatch(html, /1970-01-01/, 'a missing date must never render as an epoch');
  assert.doesNotMatch(html, /Invalid Date/);
});
