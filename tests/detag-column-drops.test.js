'use strict';

// Detag column-drop migration — the destructive end of the doubles detag.
// Removes in_tag/out_tag/udisc_ending_tag from every weekly sheet and
// current_tag from ClubMembers, behind a captain approval gate. All behavior
// runs in a Node VM with an in-memory Sheets fake: no Google credentials,
// network access, or live sheet writes.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

const APPROVAL_PROPERTY = 'DETAG_COLUMN_DROPS_APPROVAL';
const APPROVAL_TOKEN = 'bag-detag-drops-c1';
const WEEK_DATE = '2026-10-05';

function valueByName(h, sheet, header, rowIndex) {
  const headers = h.fn('getSheetHeaders')(sheet);
  return sheet.rows[rowIndex][headers.indexOf(header)];
}

/** Builds a pre-detag doubles spreadsheet: 54-col weeks + 9-col roster. */
function taggedDoubles(h) {
  const doubles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID_DOUBLES);

  const club = doubles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS.concat(['season_points']));
  club.appendRow([3, 'Damon', 'damon31', '151236', 7, true, 't', 't', 2]);

  const week = doubles.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED.map((header) => 'v_' + header));

  const template = doubles.insertSheet('Week template');
  template.appendRow(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED);

  return { doubles, club, week, template };
}

/** Builds a tag-scoring singles spreadsheet that must never be touched. */
function taggedSingles(h) {
  const singles = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const club = singles.insertSheet('ClubMembers');
  club.appendRow(h.bound.CLUB_MEMBER_HEADERS);
  club.appendRow([1, 'Alice', 'alice', '', 42, true, 't', 't']);
  const week = singles.insertSheet('Week ' + WEEK_DATE);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS);
  week.appendRow(h.bound.WEEKLY_RECORD_HEADERS.map((header) => 'v_' + header));
  return { singles, club, week };
}

function resultsByName(report) {
  const byName = {};
  report.results.forEach((result) => { byName[result.sheet_name] = result; });
  return byName;
}

// ─── Drop-header selection ───────────────────────────────────────────────────

test('drop-header selection is empty for a tag-scoring league', () => {
  const h = loadCode();

  assert.deepEqual(
    h.fn('detagDropHeadersForWeekly')(h.bound.LEAGUE_FORMAT_DOUBLES, h.bound.SCORING_POINTS),
    ['in_tag', 'out_tag', 'udisc_ending_tag']
  );
  assert.deepEqual(
    h.fn('detagDropHeadersForClubMembers')(h.bound.LEAGUE_FORMAT_DOUBLES, h.bound.SCORING_POINTS),
    ['current_tag']
  );
  assert.deepEqual(
    h.fn('detagDropHeadersForWeekly')(h.bound.LEAGUE_FORMAT_SINGLES, h.bound.SCORING_TAGS),
    []
  );
  assert.deepEqual(
    h.fn('detagDropHeadersForClubMembers')(h.bound.LEAGUE_FORMAT_SINGLES, h.bound.SCORING_TAGS),
    []
  );
});

// ─── Pure planner ────────────────────────────────────────────────────────────

test('planTagColumnDrops plans the present drops and keeps the rest', () => {
  const h = loadCode();
  const headers = h.bound.WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED;
  const plan = h.fn('planTagColumnDrops')(headers, ['in_tag', 'out_tag', 'udisc_ending_tag']);

  assert.equal(plan.status, 'drop');
  assert.deepEqual(plan.drop_headers, ['in_tag', 'out_tag', 'udisc_ending_tag']);
  assert.equal(plan.target_headers.length, headers.length - 3);
  ['in_tag', 'out_tag', 'udisc_ending_tag'].forEach((header) => {
    assert.equal(plan.target_headers.indexOf(header), -1);
  });
  assert.equal(plan.target_headers.indexOf('score') !== -1, true);
});

test('planTagColumnDrops is a no-op when nothing is present', () => {
  const h = loadCode();
  const plan = h.fn('planTagColumnDrops')(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES, ['in_tag']);

  assert.equal(plan.status, 'no-drop');
  assert.deepEqual(plan.drop_headers, []);
});

test('planTagColumnDrops fails on blank and duplicate headers', () => {
  const h = loadCode();
  const headers = h.bound.WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED;

  const blank = headers.slice();
  blank[3] = '';
  assert.match(h.fn('planTagColumnDrops')(blank, ['in_tag']).error, /blank/);

  const duplicate = headers.slice();
  duplicate[5] = duplicate[4];
  assert.match(h.fn('planTagColumnDrops')(duplicate, ['in_tag']).error, /duplicate/);
});

// ─── Dry run and authorization gate ──────────────────────────────────────────

test('dry run reports every planned drop and writes nothing', () => {
  const h = loadCode();
  const { doubles, club, week, template } = taggedDoubles(h);

  const report = h.fn('migrateDetagColumnDrops')(doubles, h.bound.LEAGUE_FORMAT_DOUBLES, { apply: false });

  assert.equal(report.applied, false);
  assert.equal(report.authorized, true);
  const byName = resultsByName(report);
  assert.equal(byName['Week ' + WEEK_DATE].status, 'would-drop');
  assert.deepEqual(byName['Week ' + WEEK_DATE].drop_headers, ['in_tag', 'out_tag', 'udisc_ending_tag']);
  assert.equal(byName['Week template'].status, 'would-drop');
  assert.equal(byName['ClubMembers'].status, 'would-drop');
  assert.deepEqual(byName['ClubMembers'].drop_headers, ['current_tag']);

  // Untouched: every sheet still carries the pre-detag tag columns.
  assert.deepEqual(h.fn('getSheetHeaders')(week), h.bound.WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED);
  assert.deepEqual(h.fn('getSheetHeaders')(template), h.bound.WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED);
  assert.deepEqual(h.fn('getSheetHeaders')(club), h.bound.CLUB_MEMBER_HEADERS.concat(['season_points']));
});

test('apply is refused and writes nothing without captain authorization', () => {
  const h = loadCode();
  const { doubles, club, week } = taggedDoubles(h);

  const report = h.fn('migrateDetagColumnDrops')(doubles, h.bound.LEAGUE_FORMAT_DOUBLES, { apply: true });

  assert.equal(report.applied, false);
  assert.equal(report.authorized, false);
  assert.match(report.error, /not authorized/);
  assert.deepEqual(h.fn('getSheetHeaders')(week), h.bound.WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED);
  assert.equal(h.fn('getSheetHeaders')(club).indexOf('current_tag') !== -1, true);
});

// ─── Authorized apply ────────────────────────────────────────────────────────

test('authorized apply drops the tag columns and preserves every other value', () => {
  const h = loadCode();
  h.setScriptProperty(APPROVAL_PROPERTY, APPROVAL_TOKEN);
  const { doubles, club, week, template } = taggedDoubles(h);

  const report = h.fn('migrateDetagColumnDrops')(doubles, h.bound.LEAGUE_FORMAT_DOUBLES, { apply: true });

  assert.equal(report.applied, true);
  assert.deepEqual(h.fn('getSheetHeaders')(week), h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  assert.deepEqual(h.fn('getSheetHeaders')(template), h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  assert.deepEqual(h.fn('getSheetHeaders')(club), h.bound.CLUB_MEMBER_HEADERS_DOUBLES);
  assert.equal(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES.length, 51);
  assert.equal(h.bound.CLUB_MEMBER_HEADERS_DOUBLES.length, 8);

  // Values that were not dropped move with their column.
  assert.equal(valueByName(h, week, 'score', 1), 'v_score');
  assert.equal(valueByName(h, week, 'team_position', 1), 'v_team_position');
  assert.equal(valueByName(h, week, 'hole_18', 1), 'v_hole_18');
  assert.equal(valueByName(h, club, 'is_active', 1), true);
  assert.equal(valueByName(h, club, 'season_points', 1), 2);
});

test('authorized apply is idempotent on an already-detagged sheet', () => {
  const h = loadCode();
  h.setScriptProperty(APPROVAL_PROPERTY, APPROVAL_TOKEN);
  const { doubles, week } = taggedDoubles(h);

  h.fn('migrateDetagColumnDrops')(doubles, h.bound.LEAGUE_FORMAT_DOUBLES, { apply: true });
  const before = week.rows.map((row) => row.slice());

  const second = h.fn('migrateDetagColumnDrops')(doubles, h.bound.LEAGUE_FORMAT_DOUBLES, { apply: true });
  const byName = resultsByName(second);
  assert.equal(byName['Week ' + WEEK_DATE].status, 'no-drop');
  assert.equal(byName['ClubMembers'].status, 'no-drop');
  assert.deepEqual(week.rows, before);
});

test('a tag-scoring league never drops a tag column', () => {
  const h = loadCode();
  h.setScriptProperty(APPROVAL_PROPERTY, APPROVAL_TOKEN);
  const { singles, club, week } = taggedSingles(h);

  const report = h.fn('migrateDetagColumnDrops')(singles, h.bound.LEAGUE_FORMAT_SINGLES, {
    apply: true,
    scoring: h.bound.SCORING_TAGS
  });

  assert.equal(report.applied, true);
  assert.equal(report.results.every((result) => result.status === 'no-drop'), true);
  assert.deepEqual(h.fn('getSheetHeaders')(week), h.bound.WEEKLY_RECORD_HEADERS);
  assert.deepEqual(h.fn('getSheetHeaders')(club), h.bound.CLUB_MEMBER_HEADERS);
  assert.equal(valueByName(h, club, 'current_tag', 1), 42);
  assert.equal(valueByName(h, week, 'in_tag', 1), 'v_in_tag');
});

// ─── Fail-before-write safety ────────────────────────────────────────────────

test('an ambiguous sheet aborts the run before any sheet is written', () => {
  const h = loadCode();
  h.setScriptProperty(APPROVAL_PROPERTY, APPROVAL_TOKEN);
  const { doubles, club, week } = taggedDoubles(h);

  const duplicate = h.bound.WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED.slice();
  duplicate[5] = duplicate[4];
  const bad = doubles.insertSheet('Week 2026-10-06');
  bad.appendRow(duplicate);

  const report = h.fn('migrateDetagColumnDrops')(doubles, h.bound.LEAGUE_FORMAT_DOUBLES, { apply: true });

  assert.equal(report.applied, false);
  assert.match(report.error, /duplicate/);
  assert.equal(report.failed_sheet, 'Week 2026-10-06');
  assert.deepEqual(h.fn('getSheetHeaders')(week), h.bound.WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED);
  assert.equal(h.fn('getSheetHeaders')(club).indexOf('current_tag') !== -1, true);
});

// ─── Ordering hazard during the transition ───────────────────────────────────

test('the column-order planner accepts a pre-detag doubles sheet', () => {
  const h = loadCode();
  const plan = h.fn('planWeeklyColumnReorder')(
    h.bound.WEEKLY_RECORD_HEADERS_LEGACY_DOUBLES_TAGGED,
    h.bound.LEAGUE_FORMAT_DOUBLES,
    h.bound.SCORING_POINTS
  );

  // The droppable tag columns are known-but-being-dropped, not unrecognized.
  assert.equal(plan.status, 'reorder');
  assert.equal(plan.unknown_headers.length, 0);
});

test('weeklyColumnsKnownForFormat keeps the droppable tag columns known', () => {
  const h = loadCode();
  const known = h.fn('weeklyColumnsKnownForFormat')(h.bound.LEAGUE_FORMAT_DOUBLES, h.bound.SCORING_POINTS);

  ['in_tag', 'out_tag', 'udisc_ending_tag'].forEach((header) => {
    assert.equal(known.indexOf(header) !== -1, true);
  });
});

test('weeklyHeadersMatch accepts both the detagged and the pre-detag layouts', () => {
  const h = loadCode();
  const match = h.fn('weeklyHeadersMatch');

  assert.equal(match(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES, h.bound.LEAGUE_FORMAT_DOUBLES, h.bound.SCORING_POINTS), true);
  assert.equal(match(h.bound.WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED, h.bound.LEAGUE_FORMAT_DOUBLES, h.bound.SCORING_POINTS), true);
  assert.equal(match(h.bound.WEEKLY_RECORD_HEADERS, h.bound.LEAGUE_FORMAT_DOUBLES, h.bound.SCORING_POINTS), false);
});

// ─── Handler ─────────────────────────────────────────────────────────────────

test('the admin handler defaults to a dry run and never writes', () => {
  const h = loadCode();
  const { doubles, week } = taggedDoubles(h);

  const result = h.parse(h.fn('handleMigrateDetagColumnDrops')({
    league: h.bound.LEAGUE_ID_DOUBLES
  }));

  assert.equal(result.status, 'ok');
  assert.equal(result.applied, false);
  assert.equal(result.sheets_changed, 3);
  assert.deepEqual(h.fn('getSheetHeaders')(week), h.bound.WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED);
});

test('the admin handler refuses apply without authorization', () => {
  const h = loadCode();
  const { doubles, week } = taggedDoubles(h);

  const result = h.parse(h.fn('handleMigrateDetagColumnDrops')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    apply: true
  }));

  assert.equal(result.status, 'error');
  assert.match(result.message, /not authorized/);
  assert.deepEqual(h.fn('getSheetHeaders')(week), h.bound.WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED);
});

test('the admin handler applies under authorization and then reports no drop', () => {
  const h = loadCode();
  h.setScriptProperty(APPROVAL_PROPERTY, APPROVAL_TOKEN);
  const { doubles, club, week } = taggedDoubles(h);

  const applied = h.parse(h.fn('handleMigrateDetagColumnDrops')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    apply: true
  }));

  assert.equal(applied.status, 'ok');
  assert.equal(applied.applied, true);
  assert.equal(applied.sheets_changed, 3);
  assert.deepEqual(h.fn('getSheetHeaders')(week), h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  assert.deepEqual(h.fn('getSheetHeaders')(club), h.bound.CLUB_MEMBER_HEADERS_DOUBLES);

  const second = h.parse(h.fn('handleMigrateDetagColumnDrops')({
    league: h.bound.LEAGUE_ID_DOUBLES,
    apply: true
  }));
  assert.equal(second.sheets_changed, 0);
});
