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

/** Builds a doubles spreadsheet with a tag-free roster and one week tab. */
function buildDoubles(h, clubRows) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  (clubRows || []).forEach((row) => club.appendRow(row));

  const week = doubles.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);

  return { doubles, club, week };
}

/** Builds a pre-detag doubles roster that still carries current_tag. */
function buildLegacyDoubles(h, clubRows) {
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

test('doubles check-in leaves a legacy stored tag untouched and writes no tag', () => {
  const h = loadCode();
  // Existing member carrying a legacy tag 5 in a pre-detag roster.
  const { club, week } = buildLegacyDoubles(h, [[1, 'Existing', 'ex', '', 5, true, '', '']]);

  const result = h.parse(h.fn('handleSubmitCheckIn')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    member_number: 1,
    name: 'Existing',
    paid: true
  }));

  assert.equal(result.status, 'ok');
  assert.equal('in_tag' in result, false, 'doubles response must not echo a tag');

  // A legacy current_tag value is never rewritten by a doubles check-in.
  assert.equal(value(club, 'current_tag', 1), 5);
  // The doubles weekly schema carries no tag columns at all.
  ['in_tag', 'out_tag', 'udisc_ending_tag'].forEach((header) => {
    assert.equal(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES.indexOf(header), -1);
  });
  assert.equal(value(week, 'checked_in', 1), true);
});

test('doubles check-in ignores a client-supplied tag (hard gating)', () => {
  const h = loadCode();
  const { club, week } = buildLegacyDoubles(h, [[1, 'Existing', 'ex', '', 5, true, '', '']]);

  const result = h.parse(h.fn('handleSubmitCheckIn')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    member_number: 1,
    name: 'Existing',
    in_tag: 99
  }));

  assert.equal(result.status, 'ok');
  assert.equal(value(club, 'current_tag', 1), 5, 'a posted tag must not persist to ClubMembers');
  assert.equal(value(week, 'checked_in', 1), true);
});

test('doubles registration of a new member stores no current_tag', () => {
  const h = loadCode();
  const { club } = buildDoubles(h, []);

  const result = h.parse(h.fn('handleSubmitCheckIn')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    name: 'Brand New',
    in_tag: 42
  }));

  assert.equal(result.status, 'ok');
  assert.equal('in_tag' in result, false);
  // The tag-free roster has no current_tag column and gains no row value.
  assert.equal(h.bound.CLUB_MEMBER_HEADERS_DOUBLES.indexOf('current_tag'), -1);
  assert.equal(club.getLastRow(), 2, 'the new member was appended');
});

test('doubles search results carry no current_tag', () => {
  const h = loadCode();
  buildDoubles(h, [[1, 'Alice Smith', 'alice', '', true, '', '', 0]]);

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
  const { club, week } = buildDoubles(h, [[1, 'Existing', 'ex', '', true, '', '', 0]]);

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
  buildDoubles(h, [[1, 'Alice Smith', 'alice', '', true, '', '', 0]]);

  const result = h.parse(h.fn('handlePreviewUdiscImport')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    league_date: WEEK_DATE,
    rows: [{ name: 'Alice Smith', username: 'alice' }]
  }));

  assert.equal(result.status, 'error');
  assert.match(result.message, /scoring method/i);
  assert.doesNotMatch(JSON.stringify(result), /(in_tag|out_tag|udisc_ending_tag|current_tag)/);
});

test('doubles import preview exposes no tag fields', () => {
  const h = loadCode();
  buildDoubles(h, [[3, 'Damon Forsythe', 'damon31', '151236', true, '', '', 0]]);

  const result = h.parse(h.fn('handlePreviewUdiscImportDoubles')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    league_date: WEEK_DATE,
    rows: [{ name: 'Damon Forsythe', username: 'damon31' }]
  }));

  assert.equal(result.status, 'ok');
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /(in_tag|out_tag|udisc_ending_tag|current_tag)/);
});

// ─── Doubles: the live tag write is stopped (detag Slice 2) ──────────────────

test('buildDoublesImportFields drops the inherited udisc_ending_tag for a points league', () => {
  const h = loadCode();
  const build = h.fn('buildDoublesImportFields');
  const rules = h.fn('getLeagueRules')(h.bound.LEAGUE_ID_DOUBLES);

  const fields = build(
    { name: 'Damon Forsythe & Brad Stevenson', bag_tag_at_end: 99 },
    { name: 'Damon Forsythe', username: 'damon31', pdga_number: '151236' },
    rules
  );

  assert.equal('udisc_ending_tag' in fields, false);
  assert.equal(fields.udisc_name_import, 'Damon Forsythe');
  assert.equal(fields.score, '');
});

test('buildDoublesImportFields keeps udisc_ending_tag for a tag-scoring league', () => {
  const h = loadCode();
  const build = h.fn('buildDoublesImportFields');
  const rules = h.fn('rulesForEnums')(h.bound.LEAGUE_FORMAT_DOUBLES, h.bound.SCORING_TAGS);

  const fields = build(
    { bag_tag_at_end: 99 },
    { name: 'A', username: 'a', pdga_number: '' },
    rules
  );

  assert.equal(fields.udisc_ending_tag, 99);
});

test('a doubles import commit stores no tag value and the schema has no tag columns', () => {
  const h = loadCode();
  const { week } = buildDoubles(h, [
    [3, 'Damon Forsythe', 'damon31', '151236', true, '', '', 0],
    [7, 'Brad Stevenson', 'donjoses', '85170', true, '', '', 0]
  ]);

  const result = h.parse(h.fn('handleCommitUdiscImportDoubles')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    league_date: WEEK_DATE,
    approved: true,
    rows: [{
      name: 'Damon Forsythe & Brad Stevenson',
      usernames: 'damon31,donjoses',
      position: 1,
      position_raw: 1,
      round_total_score: 41,
      bag_tag_at_end: 99
    }]
  }));

  assert.equal(result.status, 'ok');
  assert.equal(result.results[0].status, 'committed');

  const headers = week.rows[0];
  ['in_tag', 'out_tag', 'udisc_ending_tag'].forEach((header) => {
    assert.equal(headers.indexOf(header), -1, 'the doubles schema must not carry ' + header);
  });
  assert.ok(week.rows.slice(1).length >= 2, 'both partners get a weekly row');
});

test('a re-import leaves a legacy stored udisc_ending_tag value untouched', () => {
  const h = loadCode();
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);
  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  club.appendRow([3, 'Damon Forsythe', 'damon31', '151236', true, '', '', 0]);
  club.appendRow([7, 'Brad Stevenson', 'donjoses', '85170', true, '', '', 0]);

  // A pre-detag week tab still carries the tag columns. The commit reads the
  // sheet's own headers, so a stored value there is preserved, never rewritten.
  const headers = h.bound.WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED;
  const week = doubles.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(headers);

  const pairKey = 'dubs:' + WEEK_DATE + ':u:damon31+u:donjoses';
  const existing = new Array(headers.length).fill('');
  existing[headers.indexOf('member_number')] = 3;
  existing[headers.indexOf('player_name_snapshot')] = 'Damon Forsythe';
  existing[headers.indexOf('udisc_username_snapshot')] = 'damon31';
  existing[headers.indexOf('pair_key')] = pairKey;
  existing[headers.indexOf('udisc_ending_tag')] = 'stale';
  week.appendRow(existing);

  const result = h.parse(h.fn('handleCommitUdiscImportDoubles')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    league_date: WEEK_DATE,
    approved: true,
    rows: [{
      name: 'Damon Forsythe & Brad Stevenson',
      usernames: 'damon31,donjoses',
      position: 1,
      position_raw: 1,
      round_total_score: 41,
      bag_tag_at_end: 99
    }]
  }));

  assert.equal(result.status, 'ok');
  const updated = week.rows.slice(1).find((row) => row[headers.indexOf('member_number')] === 3);
  assert.equal(updated[headers.indexOf('udisc_ending_tag')], 'stale', 'stored value must be preserved, never rewritten');
});

// ─── Singles: tag lifecycle byte-identical regression ────────────────────────

test('singles check-in still requires and echoes the tag but never persists it to the roster', () => {
  const h = loadCode();
  const { club, week } = buildSingles(h, [[1, 'Existing', 'ex', '', 5, true, '', '']]);

  const missing = h.parse(h.fn('handleSubmitCheckIn')({
    member_number: 1,
    name: 'Existing'
  }));
  assert.equal(missing.status, 'error');
  assert.match(missing.message, /in_tag is required/);

  const before = value(club, 'current_tag', 1);

  const ok = h.parse(h.fn('handleSubmitCheckIn')({
    member_number: 1,
    name: 'Existing',
    in_tag: 7
  }));
  assert.equal(ok.status, 'ok');
  assert.equal(ok.in_tag, 7);
  // The roster tag is never written at check-in; it changes only at finalization.
  assert.strictEqual(value(club, 'current_tag', 1), before);
  assert.equal(value(club, 'current_tag', 1), 5);
  assert.equal(value(week, 'in_tag', 1), 7);
});

test('a dedupe check-in leaves the roster tag value byte-identical', () => {
  const h = loadCode();
  const { club, week } = buildSingles(h, [[1, 'Dedupe Player', 'dedupe', '', 11, true, '', '']]);

  const before = value(club, 'current_tag', 1);

  const result = h.parse(h.fn('handleSubmitCheckIn')({
    name: 'Dedupe Player',
    in_tag: 98
  }));
  assert.equal(result.status, 'ok');
  assert.strictEqual(value(club, 'current_tag', 1), before);
  assert.equal(value(club, 'current_tag', 1), 11);
  assert.equal(value(week, 'in_tag', 1), 98);
  assert.equal(club.getLastRow(), 2, 'the dedupe must reuse the existing roster row');
});

test('a new-member check-in leaves the roster tag blank', () => {
  const h = loadCode();
  const { club, week } = buildSingles(h, []);

  const result = h.parse(h.fn('handleSubmitCheckIn')({
    name: 'Brand New',
    in_tag: 42
  }));
  assert.equal(result.status, 'ok');
  assert.equal(club.getLastRow(), 2, 'the new member was appended');
  assert.strictEqual(value(club, 'current_tag', 1), '');
  assert.equal(value(week, 'in_tag', 1), 42);
});

test('end-of-night finalization still writes the roster tag', () => {
  const h = loadCode();
  const { club, week } = buildSingles(h, [[1, 'Alice Smith', 'alice', '', 3, true, '', '']]);
  const headers = h.bound.WEEKLY_RECORD_HEADERS;
  const row = new Array(headers.length).fill('');
  row[idx(headers, 'member_number')] = 1;
  row[idx(headers, 'player_name_snapshot')] = 'Alice Smith';
  row[idx(headers, 'in_tag')] = 3;
  row[idx(headers, 'out_tag')] = 3;
  week.appendRow(row);

  const result = h.parse(h.fn('handleFinalizeRound')({ league_date: WEEK_DATE }));

  assert.equal(result.status, 'ok');
  assert.equal(result.summary.updated_count, 1);
  assert.equal(value(club, 'current_tag', 1), 3, 'finalization is the only writer of the roster tag');
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
