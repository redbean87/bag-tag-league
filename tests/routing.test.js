'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadCode, REPO_ROOT } = require('./helpers/load-code');

test('no or unknown selector resolves to the singles spreadsheet', () => {
  const h = loadCode();
  const resolve = h.fn('resolveSpreadsheetId');

  assert.equal(resolve(undefined), h.bound.SPREADSHEET_ID);
  assert.equal(resolve(null), h.bound.SPREADSHEET_ID);
  assert.equal(resolve(''), h.bound.SPREADSHEET_ID);
  assert.equal(resolve(h.bound.SPREADSHEET_ID), h.bound.SPREADSHEET_ID);
  assert.equal(resolve('some-other-spreadsheet-id'), h.bound.SPREADSHEET_ID);
});

test('doubles selector resolves to the configured production spreadsheet', () => {
  const h = loadCode();

  assert.equal(
    h.bound.SPREADSHEET_ID_DOUBLES,
    '1UPyr7AKEdFy7ypjrrtphpyjzs55YA2P57XOkESpsc1g'
  );
  assert.equal(
    h.fn('resolveSpreadsheetId')(h.bound.SPREADSHEET_ID_DOUBLES),
    h.bound.SPREADSHEET_ID_DOUBLES
  );
});

test('the test doubles selector resolves to the former proof-of-concept sheet', () => {
  const h = loadCode();

  assert.equal(
    h.bound.SPREADSHEET_ID_DOUBLES_TEST,
    '1c8QGftl2bKcLZeqwE2IyzAh5x4I22WRjSSgc7nGgeG8'
  );
  assert.equal(
    h.fn('resolveSpreadsheetId')(h.bound.SPREADSHEET_ID_DOUBLES_TEST),
    h.bound.SPREADSHEET_ID_DOUBLES_TEST
  );
});

test('each allow-listed league id resolves to its configured spreadsheet', () => {
  const h = loadCode();
  const resolve = h.fn('resolveSpreadsheetId');

  assert.equal(resolve(h.bound.LEAGUE_ID_SINGLES), h.bound.SPREADSHEET_ID);
  assert.equal(resolve(h.bound.LEAGUE_ID_DOUBLES), h.bound.SPREADSHEET_ID_DOUBLES);
});

test('an unapproved league id cannot select an arbitrary spreadsheet', () => {
  const h = loadCode();
  const resolve = h.fn('resolveSpreadsheetId');

  // A near-miss doubles id, an arbitrary sheet id, and a junk league all fall
  // back to singles rather than opening the attacker's spreadsheet.
  assert.equal(resolve('evil-league'), h.bound.SPREADSHEET_ID);
  assert.equal(resolve('some-other-spreadsheet-id'), h.bound.SPREADSHEET_ID);
  assert.equal(
    resolve('1c8QGftl2bKcLZeqwE2IyzAh5x4I22WRjSSgc7nGgeG9'),
    h.bound.SPREADSHEET_ID
  );
});

test('resolveLeagueId normalizes league ids, legacy ids, and unknowns', () => {
  const h = loadCode();
  const resolve = h.fn('resolveLeagueId');

  assert.equal(resolve(h.bound.LEAGUE_ID_DOUBLES), h.bound.LEAGUE_ID_DOUBLES);
  assert.equal(resolve(h.bound.LEAGUE_ID_SINGLES), h.bound.LEAGUE_ID_SINGLES);
  assert.equal(resolve(undefined), h.bound.LEAGUE_ID_SINGLES);
  assert.equal(resolve(null), h.bound.LEAGUE_ID_SINGLES);
  assert.equal(resolve('not-a-league'), h.bound.LEAGUE_ID_SINGLES);
  // Deprecated spreadsheet ids still map to their league during migration.
  assert.equal(resolve(h.bound.SPREADSHEET_ID_DOUBLES), h.bound.LEAGUE_ID_DOUBLES);
  assert.equal(resolve(h.bound.SPREADSHEET_ID_DOUBLES_TEST), h.bound.LEAGUE_ID_DOUBLES_TEST);
  assert.equal(resolve(h.bound.SPREADSHEET_ID), h.bound.LEAGUE_ID_SINGLES);
});

test('resolveSpreadsheet opens exactly the selected spreadsheet', () => {
  const h = loadCode();

  h.fn('resolveSpreadsheet')(h.bound.SPREADSHEET_ID_DOUBLES);
  assert.deepEqual(h.openByIdCalls, [h.bound.SPREADSHEET_ID_DOUBLES]);
});

test('resolveSpreadsheet opens the league-mapped spreadsheet for a league id', () => {
  const h = loadCode();

  h.fn('resolveSpreadsheet')(h.bound.LEAGUE_ID_DOUBLES);
  assert.deepEqual(h.openByIdCalls, [h.bound.SPREADSHEET_ID_DOUBLES]);
});

test('league format derives from the selected spreadsheet or league id', () => {
  const h = loadCode();
  const resolve = h.fn('resolveLeagueFormat');

  assert.equal(resolve(undefined), h.bound.LEAGUE_FORMAT_SINGLES);
  assert.equal(resolve(h.bound.SPREADSHEET_ID), h.bound.LEAGUE_FORMAT_SINGLES);
  assert.equal(resolve(h.bound.SPREADSHEET_ID_DOUBLES), h.bound.LEAGUE_FORMAT_DOUBLES);
  assert.equal(resolve(h.bound.LEAGUE_ID_SINGLES), h.bound.LEAGUE_FORMAT_SINGLES);
  assert.equal(resolve(h.bound.LEAGUE_ID_DOUBLES), h.bound.LEAGUE_FORMAT_DOUBLES);
});

test('handlers route through the resolver instead of the singles ID', () => {
  const h = loadCode();

  h.fn('handleGetWeeklyTabs')({ spreadsheetId: h.bound.SPREADSHEET_ID_DOUBLES });
  assert.deepEqual(h.openByIdCalls, [h.bound.SPREADSHEET_ID_DOUBLES]);

  const defaulted = loadCode();
  defaulted.fn('handleGetWeeklyTabs')({});
  assert.deepEqual(defaulted.openByIdCalls, [defaulted.bound.SPREADSHEET_ID]);
});

test('player handlers accept the opaque league id and default to singles', () => {
  const doubles = loadCode();
  doubles.fn('handleSearchClubMembers')({ league: doubles.bound.LEAGUE_ID_DOUBLES, query: 'ab' });
  assert.deepEqual(doubles.openByIdCalls, [doubles.bound.SPREADSHEET_ID_DOUBLES]);

  const submit = loadCode();
  submit.fn('handleSubmitCheckIn')({
    league: submit.bound.LEAGUE_ID_DOUBLES,
    name: 'Test Player',
    in_tag: 1
  });
  assert.deepEqual(submit.openByIdCalls, [submit.bound.SPREADSHEET_ID_DOUBLES]);

  const defaulted = loadCode();
  defaulted.fn('handleSearchClubMembers')({ query: 'ab' });
  assert.deepEqual(defaulted.openByIdCalls, [defaulted.bound.SPREADSHEET_ID]);

  const unknown = loadCode();
  unknown.fn('handleSearchClubMembers')({ league: 'evil-league', query: 'ab' });
  assert.deepEqual(unknown.openByIdCalls, [unknown.bound.SPREADSHEET_ID]);
});

test('player responses echo the resolved league id', () => {
  const h = loadCode();

  const search = h.parse(h.fn('handleSearchClubMembers')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    query: 'ab'
  }));
  assert.equal(search.league, h.bound.LEAGUE_ID_DOUBLES);

  const defaulted = h.parse(h.fn('handleSearchClubMembers')({ query: 'ab' }));
  assert.equal(defaulted.league, h.bound.LEAGUE_ID_SINGLES);

  const unknown = h.parse(h.fn('handleSearchClubMembers')({ league: 'evil-league', query: 'ab' }));
  assert.equal(unknown.league, h.bound.LEAGUE_ID_SINGLES);
});

test('most-recent week tab resolution is unchanged after league routing', () => {
  const h = loadCode();
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);

  const club = singles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  club.appendRow([1, 'Existing', '', '', 5, true, '', '']);

  const older = singles.insertSheet('Week 2026-09-01');
  older.appendRow(h.bound.WEEKLY_RECORD_HEADERS);
  const newer = singles.insertSheet('Week 2026-10-06');
  newer.appendRow(h.bound.WEEKLY_RECORD_HEADERS);
  // A non-conforming name must stay ignored.
  singles.insertSheet('Week template');

  const result = h.parse(h.fn('handleSubmitCheckIn')({
    league: h.bound.LEAGUE_ID_SINGLES,
    member_number: 1,
    name: 'Existing',
    in_tag: 5
  }));

  assert.equal(result.status, 'ok');
  assert.equal(result.weekly_tab, 'Week 2026-10-06');
  assert.equal(older.getLastRow(), 1, 'older week tab must not receive the check-in');
  assert.equal(newer.getLastRow(), 2, 'most-recent week tab receives the check-in');
});

test('the sign-in page parses, validates, defaults, and propagates the league id', () => {
  const html = fs.readFileSync(
    path.join(REPO_ROOT, 'src', 'player', 'sign-in', 'index.html'),
    'utf8'
  );

  assert.match(html, /src="\.\.\/\.\.\/shared\/league-format\.js"/);
  assert.match(html, /new URLSearchParams\(window\.location\.search\)\.get\('league'\)/);
  assert.match(html, /function resolveLeagueFromUrl\(\)/);
  assert.match(html, /registry\.leagueById\(requested\)/);
  assert.match(html, /registry\.DEFAULT_LEAGUE_ID/);
  // Both POST paths carry the resolved league id.
  assert.match(html, /action: 'searchClubMembers',\s*league: resolvedLeague\.id/);
  assert.match(html, /action: 'submitCheckIn',\s*league: resolvedLeague\.id/);
});

test('the admin QR encodes only the opaque league id', () => {
  const html = fs.readFileSync(path.join(REPO_ROOT, 'src', 'admin', 'index.html'), 'utf8');

  assert.match(
    html,
    /var url = window\.location\.origin \+ PLAYER_SIGN_IN_PATH \+ '\?league=' \+ encodeURIComponent\(getLeagueId\(\)\);/
  );

  const qrBlock = html.slice(html.indexOf('function showSignInQR()'), html.indexOf('function closeQRModal'));
  assert.doesNotMatch(qrBlock, /spreadsheetId|getSpreadsheetId|SPREADSHEET_ID/);
});

test('Code.gs has a single openById call, inside resolveSpreadsheet', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'scripts', 'Code.gs'), 'utf8');

  const directSinglesOpens = source.match(/SpreadsheetApp\.openById\(SPREADSHEET_ID\)/g) || [];
  assert.equal(directSinglesOpens.length, 0, 'handlers must not hard-code the singles ID');

  const allOpens = source.match(/SpreadsheetApp\.openById\(/g) || [];
  assert.equal(allOpens.length, 1, 'expected exactly one openById (the resolver)');
  assert.match(source, /function resolveSpreadsheet\(selector\)/);
});
