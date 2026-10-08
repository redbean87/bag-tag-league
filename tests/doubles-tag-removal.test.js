'use strict';

// Doubles tag removal — the doubles league must collect, calculate, persist,
// render, and report no tag data, while the singles tag lifecycle stays
// byte-identical. All behavior runs in a Node VM with an in-memory Sheets
// fake: no Google credentials, network access, or live sheet writes.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { loadCode, REPO_ROOT } = require('./helpers/load-code');

const WEEK_DATE = '2026-10-05';

function idx(headers, name) {
  return headers.indexOf(name);
}

/** Builds a doubles spreadsheet with a roster and one week tab. */
function buildDoubles(h, clubRows) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  (clubRows || []).forEach((row) => club.appendRow(row));

  const week = doubles.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);

  return { doubles, club, week };
}

/** Builds a singles spreadsheet with a roster and one week tab. */
function buildSingles(h, clubRows) {
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);

  const club = singles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  (clubRows || []).forEach((row) => club.appendRow(row));

  const week = singles.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS);

  return { singles, club, week };
}

function value(sheet, header, rowIndex) {
  const headers = sheet.rows[0];
  return sheet.rows[rowIndex][idx(headers, header)];
}

// ─── Doubles: no tag collection ──────────────────────────────────────────────

test('doubles check-in collects no tag and leaves stored tags untouched', () => {
  const h = loadCode();
  // Existing member currently carrying tag 5.
  const { club, week } = buildDoubles(h, [[1, 'Existing', 'ex', '', 5, true, '', '']]);

  const result = h.parse(h.fn('handleSubmitCheckIn')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    member_number: 1,
    name: 'Existing',
    paid: true
  }));

  assert.equal(result.status, 'ok');
  assert.equal('in_tag' in result, false, 'doubles response must not echo a tag');

  // ClubMembers.current_tag is not rewritten.
  assert.equal(value(club, 'current_tag', 1), 5);
  // The weekly record was written without an in_tag.
  assert.equal(value(week, 'in_tag', 1), '');
  assert.equal(value(week, 'checked_in', 1), true);
});

test('doubles check-in ignores a client-supplied tag (hard gating)', () => {
  const h = loadCode();
  const { club, week } = buildDoubles(h, [[1, 'Existing', 'ex', '', 5, true, '', '']]);

  const result = h.parse(h.fn('handleSubmitCheckIn')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    member_number: 1,
    name: 'Existing',
    in_tag: 99
  }));

  assert.equal(result.status, 'ok');
  assert.equal(value(club, 'current_tag', 1), 5, 'a posted tag must not persist to ClubMembers');
  assert.equal(value(week, 'in_tag', 1), '', 'a posted tag must not persist to the weekly row');
});

test('doubles registration of a new member stores no current_tag', () => {
  const h = loadCode();
  const { club, week } = buildDoubles(h, []);

  const result = h.parse(h.fn('handleSubmitCheckIn')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    name: 'Brand New',
    in_tag: 42
  }));

  assert.equal(result.status, 'ok');
  assert.equal('in_tag' in result, false);
  assert.equal(value(club, 'current_tag', 1), '');
  assert.equal(value(week, 'in_tag', 1), '');
});

test('doubles search results carry no current_tag', () => {
  const h = loadCode();
  buildDoubles(h, [[1, 'Alice Smith', 'alice', '', 42, true, '', '']]);

  const result = h.parse(h.fn('handleSearchClubMembers')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    query: 'alice'
  }));

  assert.equal(result.status, 'ok');
  assert.equal(result.results.length, 1);
  assert.equal('current_tag' in result.results[0], false);
  assert.equal(result.results[0].name, 'Alice Smith');
});

// ─── Doubles: no tag math and no tag persistence ─────────────────────────────

test('all three tag lifecycle handlers refuse doubles before opening a sheet', () => {
  const h = loadCode();
  const { club, week } = buildDoubles(h, [[1, 'Existing', 'ex', '', 5, true, '', '']]);

  const actions = ['handleCalculateTags', 'handleConfirmTags', 'handleFinalizeRound'];
  for (const action of actions) {
    const before = JSON.stringify({ club: club.rows, week: week.rows });
    const result = h.parse(h.fn(action)({
      league: h.bound.LEAGUE_ID_DOUBLES,
      league_date: WEEK_DATE
    }));

    assert.equal(result.status, 'error', action + ' must refuse a points-scoring league');
    assert.match(result.message, /scoring method/i, action + ' must name the scoring method');
    assert.equal(
      JSON.stringify({ club: club.rows, week: week.rows }),
      before,
      action + ' must not mutate tag state'
    );
  }

  // The guard short-circuits before any sheet is opened.
  assert.deepEqual(h.openByIdCalls, []);
});

test('the tag-based import preview refuses a points-scoring league instead of exposing tags', () => {
  const h = loadCode();
  buildDoubles(h, [[1, 'Alice Smith', 'alice', '', 5, true, '', '']]);

  const result = h.parse(h.fn('handlePreviewUdiscImport')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    league_date: WEEK_DATE,
    rows: [{ name: 'Alice Smith', username: 'alice' }]
  }));

  assert.equal(result.status, 'error');
  assert.match(result.message, /scoring method/i);
  assert.doesNotMatch(JSON.stringify(result), /in_tag|out_tag|current_tag/);
});

test('doubles import preview exposes no tag fields', () => {
  const h = loadCode();
  buildDoubles(h, [[3, 'Damon Forsythe', 'damon31', '151236', 7, true, '', '']]);

  const result = h.parse(h.fn('handlePreviewUdiscImportDoubles')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    league_date: WEEK_DATE,
    rows: [{ name: 'Damon Forsythe', username: 'damon31' }]
  }));

  assert.equal(result.status, 'ok');
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /in_tag|out_tag|current_tag/);
});

// ─── Singles: tag lifecycle byte-identical regression ────────────────────────

test('singles check-in still requires, persists, and echoes the tag', () => {
  const h = loadCode();
  const { club, week } = buildSingles(h, [[1, 'Existing', 'ex', '', '', true, '', '']]);

  const missing = h.parse(h.fn('handleSubmitCheckIn')({
    member_number: 1,
    name: 'Existing'
  }));
  assert.equal(missing.status, 'error');
  assert.match(missing.message, /in_tag is required/);

  const ok = h.parse(h.fn('handleSubmitCheckIn')({
    member_number: 1,
    name: 'Existing',
    in_tag: 7
  }));
  assert.equal(ok.status, 'ok');
  assert.equal(ok.in_tag, 7);
  assert.equal(value(club, 'current_tag', 1), 7);
  assert.equal(value(week, 'in_tag', 1), 7);
});

test('singles search results still include current_tag', () => {
  const h = loadCode();
  buildSingles(h, [[1, 'Alice Smith', 'alice', '', 42, true, '', '']]);

  const result = h.parse(h.fn('handleSearchClubMembers')({ query: 'alice' }));

  assert.equal(result.status, 'ok');
  assert.equal(result.results[0].current_tag, 42);
});

test('singles tag calculation still runs against the singles spreadsheet', () => {
  const h = loadCode();
  const { week } = buildSingles(h, [[1, 'Alice Smith', 'alice', '', 3, true, '', '']]);
  const headers = h.bound.WEEKLY_RECORD_HEADERS;
  const row = new Array(headers.length).fill('');
  row[idx(headers, 'member_number')] = 1;
  row[idx(headers, 'player_name_snapshot')] = 'Alice Smith';
  row[idx(headers, 'in_tag')] = 3;
  row[idx(headers, 'score')] = 41;
  week.appendRow(row);

  const result = h.parse(h.fn('handleCalculateTags')({
    league_date: WEEK_DATE
  }));

  assert.equal(result.status, 'ok');
  assert.equal(result.tag_pool_count, 1);
  assert.equal(result.players[0].proposed_out_tag, 3);
});

// ─── UI: tag surfaces hidden in doubles, kept in singles ─────────────────────

function readHtml(relative) {
  return fs.readFileSync(path.join(REPO_ROOT, relative), 'utf8');
}

function functionBody(html, name) {
  const start = html.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'expected function ' + name);
  const next = html.indexOf('\n    function ', start + 1);
  return html.slice(start, next === -1 ? undefined : next);
}

test('the sign-in page gates tag fields on the scoring method', () => {
  const html = readHtml('src/player/sign-in/index.html');

  assert.match(html, /id="checkInTagGroup"/);
  assert.match(html, /id="registerTagGroup"/);
  assert.match(html, /window\.LeagueFormat\.rulesForLeague\(resolvedLeague\.id\)/);

  const apply = functionBody(html, 'applyTagVisibility');
  assert.match(apply, /checkInTagGroup/);
  assert.match(apply, /registerTagGroup/);
  assert.match(apply, /input\.required = rules\.usesTags/);
  assert.match(apply, /rules\.usesTags \? '' : 'none'/);
  // The gate runs on page init.
  assert.match(html, /applyTagVisibility\(\);/);

  // The tag value is required and submitted only for a tag-scoring league.
  assert.match(html, /if \(rules\.usesTags && \(!inTag \|\| parseInt\(inTag, 10\) < 1\)\)/);
  assert.match(html, /if \(rules\.usesTags\) payload\.in_tag = parseInt\(inTag, 10\)/);
  // Tag chips in search results are tag-scoring-only.
  assert.match(html, /if \(rules\.usesTags && member\.current_tag\) detailParts\.push\('Tag: ' \+ member\.current_tag\)/);
});

test('the admin page hides tag tooling for a points-scoring league and keeps it for tags', () => {
  const html = readHtml('src/admin/index.html');
  const apply = functionBody(html, 'applyLeague');

  assert.match(apply, /tagCard\.style\.display = rules\.usesTags \? '' : 'none'/);
  assert.match(apply, /finalizeCard\.style\.display = rules\.usesTags \? '' : 'none'/);
});
