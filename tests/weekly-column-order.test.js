'use strict';

// Weekly column-order migration — human-first reorder for already-placed
// sheets. All behavior runs in a Node VM with the in-memory Sheets fake: no
// Google credentials, network access, or live sheet writes.

const test = require('node:test');
const assert = require('node:assert');
const { loadCode } = require('./helpers/load-code');

const APPROVAL_PROPERTY = 'WEEKLY_COLUMN_ORDER_MIGRATION_APPROVAL';
const APPROVAL_TOKEN = 'bag-column-order-c1';
const WEEK_DATE = '2026-10-05';

/** Adds a sheet with the given header row and optional data rows. */
function addSheet(spreadsheet, name, headers, rows) {
  const sheet = spreadsheet.insertSheet(name);
  sheet.appendRow(headers);
  (rows || []).forEach((row) => sheet.appendRow(row));
  return sheet;
}

/** Reads one cell by header name. */
function valueByName(h, sheet, header, rowIndex) {
  const headers = h.fn('getSheetHeaders')(sheet);
  return sheet.rows[rowIndex][headers.indexOf(header)];
}

/** Builds a legacy singles header row plus a data row keyed by header. */
function legacySinglesFixture(h) {
  const headers = h.bound.WEEKLY_RECORD_HEADERS_LEGACY.slice();
  const row = headers.map((header) => 'v_' + header);
  return { headers, row };
}

/** Builds a legacy doubles header row plus a data row keyed by header. */
function legacyDoublesFixture(h) {
  const headers = h.bound.WEEKLY_RECORD_HEADERS_LEGACY_DOUBLES.slice();
  const row = headers.map((header) => 'v_' + header);
  return { headers, row };
}

function assertRowPreserved(h, sheet, expectedHeaders, expectedRow, rowIndex) {
  const headers = h.fn('getSheetHeaders')(sheet);
  expectedHeaders.forEach((header, i) => {
    assert.equal(
      sheet.rows[rowIndex][headers.indexOf(header)],
      expectedRow[i],
      'value for ' + header + ' must survive the reorder'
    );
  });
}

// ─── Planning ────────────────────────────────────────────────────────────────

test('plan reorders a legacy singles header row human-first', () => {
  const h = loadCode();
  const plan = h.fn('planWeeklyColumnReorder')(
    h.bound.WEEKLY_RECORD_HEADERS_LEGACY,
    h.bound.LEAGUE_FORMAT_SINGLES
  );

  assert.equal(plan.status, 'reorder');
  assert.deepEqual(plan.target_headers, h.bound.WEEKLY_RECORD_HEADERS);
  assert.deepEqual(plan.unknown_headers, []);
  // The permutation is a bijection over the existing columns.
  assert.equal(plan.permutation.length, plan.headers.length);
  assert.equal(new Set(plan.permutation).size, plan.permutation.length);
});

test('plan reorders a legacy doubles header row human-first', () => {
  const h = loadCode();
  const plan = h.fn('planWeeklyColumnReorder')(
    h.bound.WEEKLY_RECORD_HEADERS_LEGACY_DOUBLES,
    h.bound.LEAGUE_FORMAT_DOUBLES
  );

  assert.equal(plan.status, 'reorder');
  assert.deepEqual(plan.target_headers, h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  // Doubles and singles promote different sets.
  assert.deepEqual(plan.target_headers.slice(4, 9), [
    'pair_key',
    'partner_member_number',
    'score',
    'weekly_points',
    'weekly_points_status'
  ]);
});

test('plan treats an already-canonical row as a no-op', () => {
  const h = loadCode();
  const singles = h.fn('planWeeklyColumnReorder')(
    h.bound.WEEKLY_RECORD_HEADERS,
    h.bound.LEAGUE_FORMAT_SINGLES
  );
  const doubles = h.fn('planWeeklyColumnReorder')(
    h.bound.WEEKLY_RECORD_HEADERS_DOUBLES,
    h.bound.LEAGUE_FORMAT_DOUBLES
  );

  assert.equal(singles.status, 'already-canonical');
  assert.equal(doubles.status, 'already-canonical');
});

test('plan fails safely on duplicate, missing, and unrecognized headers', () => {
  const h = loadCode();
  const legacy = h.bound.WEEKLY_RECORD_HEADERS_LEGACY;

  const duplicate = legacy.slice();
  duplicate[5] = duplicate[4];
  const duplicatePlan = h.fn('planWeeklyColumnReorder')(duplicate, h.bound.LEAGUE_FORMAT_SINGLES);
  assert.equal(duplicatePlan.status, 'error');
  assert.match(duplicatePlan.error, /duplicate/);

  const missing = legacy.filter((header) => header !== 'score');
  const missingPlan = h.fn('planWeeklyColumnReorder')(missing, h.bound.LEAGUE_FORMAT_SINGLES);
  assert.equal(missingPlan.status, 'error');
  assert.match(missingPlan.error, /missing required/);

  const unknown = legacy.concat(['mystery_column']);
  const unknownPlan = h.fn('planWeeklyColumnReorder')(unknown, h.bound.LEAGUE_FORMAT_SINGLES);
  assert.equal(unknownPlan.status, 'error');
  assert.match(unknownPlan.error, /unrecognized/);

  const blank = legacy.slice();
  blank[3] = '';
  const blankPlan = h.fn('planWeeklyColumnReorder')(blank, h.bound.LEAGUE_FORMAT_SINGLES);
  assert.equal(blankPlan.status, 'error');
  assert.match(blankPlan.error, /blank/);
});

// ─── Dry run and authorization gate ──────────────────────────────────────────

test('dry run reports the planned order and writes nothing', () => {
  const h = loadCode();
  const spreadsheet = h.makeSpreadsheet('dry-run');
  const fixture = legacySinglesFixture(h);
  const sheet = addSheet(spreadsheet, 'Week ' + WEEK_DATE, fixture.headers, [fixture.row]);

  const report = h.fn('migrateWeeklyColumnOrder')(
    spreadsheet,
    h.bound.LEAGUE_FORMAT_SINGLES,
    { apply: false }
  );

  assert.equal(report.applied, false);
  assert.equal(report.authorized, true);
  assert.equal(report.results.length, 1);
  assert.equal(report.results[0].status, 'would-reorder');
  assert.deepEqual(report.results[0].to, h.bound.WEEKLY_RECORD_HEADERS);
  // Untouched: the sheet still carries the legacy header row.
  assert.deepEqual(h.fn('getSheetHeaders')(sheet), fixture.headers);
  assert.deepEqual(sheet.rows[1], fixture.row);
});

test('apply is refused and writes nothing without captain authorization', () => {
  const h = loadCode();
  const spreadsheet = h.makeSpreadsheet('unauthorized');
  const fixture = legacySinglesFixture(h);
  const sheet = addSheet(spreadsheet, 'Week ' + WEEK_DATE, fixture.headers, [fixture.row]);

  const report = h.fn('migrateWeeklyColumnOrder')(
    spreadsheet,
    h.bound.LEAGUE_FORMAT_SINGLES,
    { apply: true }
  );

  assert.equal(report.applied, false);
  assert.equal(report.authorized, false);
  assert.match(report.error, /not authorized/);
  assert.deepEqual(h.fn('getSheetHeaders')(sheet), fixture.headers);
  assert.deepEqual(sheet.rows[1], fixture.row);
});

test('authorized apply reorders the sheet and preserves every value', () => {
  const h = loadCode();
  h.setScriptProperty(APPROVAL_PROPERTY, APPROVAL_TOKEN);
  const spreadsheet = h.makeSpreadsheet('authorized');
  const fixture = legacySinglesFixture(h);
  const sheet = addSheet(spreadsheet, 'Week ' + WEEK_DATE, fixture.headers, [fixture.row]);

  const report = h.fn('migrateWeeklyColumnOrder')(
    spreadsheet,
    h.bound.LEAGUE_FORMAT_SINGLES,
    { apply: true }
  );

  assert.equal(report.applied, true);
  assert.equal(report.results[0].status, 'reordered');
  assert.deepEqual(h.fn('getSheetHeaders')(sheet), h.bound.WEEKLY_RECORD_HEADERS);
  assertRowPreserved(h, sheet, fixture.headers, fixture.row, 1);
});

test('authorized apply is idempotent on an already-migrated sheet', () => {
  const h = loadCode();
  h.setScriptProperty(APPROVAL_PROPERTY, APPROVAL_TOKEN);
  const spreadsheet = h.makeSpreadsheet('idempotent');
  const sheet = addSheet(
    spreadsheet,
    'Week ' + WEEK_DATE,
    h.bound.WEEKLY_RECORD_HEADERS,
    [h.bound.WEEKLY_RECORD_HEADERS.map((header) => 'v_' + header)]
  );
  const before = sheet.rows.map((row) => row.slice());

  const report = h.fn('migrateWeeklyColumnOrder')(
    spreadsheet,
    h.bound.LEAGUE_FORMAT_SINGLES,
    { apply: true }
  );

  assert.equal(report.results[0].status, 'already-canonical');
  assert.deepEqual(sheet.rows, before);
});

// ─── Data and format preservation ────────────────────────────────────────────

test('migration preserves a formula cell through the column move', () => {
  const h = loadCode();
  h.setScriptProperty(APPROVAL_PROPERTY, APPROVAL_TOKEN);
  const spreadsheet = h.makeSpreadsheet('formulas');
  const headers = h.bound.WEEKLY_RECORD_HEADERS_LEGACY.slice();
  const row = headers.map((header) => 'v_' + header);
  row[headers.indexOf('hole_1')] = '=SUM(B2:C2)';
  const sheet = addSheet(spreadsheet, 'Week ' + WEEK_DATE, headers, [row]);

  h.fn('migrateWeeklyColumnOrder')(spreadsheet, h.bound.LEAGUE_FORMAT_SINGLES, { apply: true });

  assert.equal(valueByName(h, sheet, 'hole_1', 1), '=SUM(B2:C2)');
});

test('doubles migration promotes pair and points and preserves the rest', () => {
  const h = loadCode();
  h.setScriptProperty(APPROVAL_PROPERTY, APPROVAL_TOKEN);
  const spreadsheet = h.makeSpreadsheet('doubles');
  const fixture = legacyDoublesFixture(h);
  const sheet = addSheet(spreadsheet, 'Week ' + WEEK_DATE, fixture.headers, [fixture.row]);

  h.fn('migrateWeeklyColumnOrder')(spreadsheet, h.bound.LEAGUE_FORMAT_DOUBLES, { apply: true });

  assert.deepEqual(h.fn('getSheetHeaders')(sheet), h.bound.WEEKLY_RECORD_HEADERS_DOUBLES);
  assertRowPreserved(h, sheet, fixture.headers, fixture.row, 1);
  // Singles tag columns survive in the doubles tail (they are unused but kept).
  assert.equal(valueByName(h, sheet, 'in_tag', 1), 'v_in_tag');
  assert.equal(valueByName(h, sheet, 'team_position', 1), 'v_team_position');
});

test('migration discovers weekly sheets by header, including the template', () => {
  const h = loadCode();
  const spreadsheet = h.makeSpreadsheet('discovery');
  const fixture = legacySinglesFixture(h);
  addSheet(spreadsheet, 'Week template', fixture.headers, []);
  addSheet(spreadsheet, 'Week ' + WEEK_DATE, fixture.headers, [fixture.row]);
  addSheet(spreadsheet, 'ClubMembers', h.bound.CLUB_MEMBER_HEADERS, []);
  addSheet(spreadsheet, 'League', h.bound.LEAGUE_SHEET_HEADERS, []);

  const report = h.fn('migrateWeeklyColumnOrder')(
    spreadsheet,
    h.bound.LEAGUE_FORMAT_SINGLES,
    { apply: false }
  );

  const names = report.results.map((result) => result.sheet_name).sort();
  assert.deepEqual(names, ['Week 2026-10-05', 'Week template']);
  assert.ok(report.results.every((result) => result.status === 'would-reorder'));
});

// ─── Fail-before-write safety ────────────────────────────────────────────────

test('an ambiguous sheet aborts the run before any sheet is written', () => {
  const h = loadCode();
  h.setScriptProperty(APPROVAL_PROPERTY, APPROVAL_TOKEN);
  const spreadsheet = h.makeSpreadsheet('ambiguous');
  const good = legacySinglesFixture(h);
  const goodSheet = addSheet(spreadsheet, 'Week 2026-10-05', good.headers, [good.row]);
  const duplicate = good.headers.slice();
  duplicate[5] = duplicate[4];
  const badSheet = addSheet(spreadsheet, 'Week 2026-10-06', duplicate, [duplicate.map(() => 'x')]);

  const report = h.fn('migrateWeeklyColumnOrder')(
    spreadsheet,
    h.bound.LEAGUE_FORMAT_SINGLES,
    { apply: true }
  );

  assert.equal(report.applied, false);
  assert.match(report.error, /duplicate/);
  assert.equal(report.failed_sheet, 'Week 2026-10-06');
  assert.deepEqual(h.fn('getSheetHeaders')(goodSheet), good.headers);
  assert.deepEqual(h.fn('getSheetHeaders')(badSheet), duplicate);
});

// ─── Handler ─────────────────────────────────────────────────────────────────

test('the admin handler defaults to a dry run and never writes', () => {
  const h = loadCode();
  const spreadsheet = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const fixture = legacySinglesFixture(h);
  const sheet = addSheet(spreadsheet, 'Week ' + WEEK_DATE, fixture.headers, [fixture.row]);

  const result = h.parse(h.fn('handleMigrateWeeklyColumnOrder')({
    league: h.bound.LEAGUE_ID_SINGLES
  }));

  assert.equal(result.status, 'ok');
  assert.equal(result.applied, false);
  assert.equal(result.sheets_changed, 1);
  assert.deepEqual(h.fn('getSheetHeaders')(sheet), fixture.headers);
});

test('the admin handler refuses apply without authorization', () => {
  const h = loadCode();
  const spreadsheet = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);
  const fixture = legacySinglesFixture(h);
  const sheet = addSheet(spreadsheet, 'Week ' + WEEK_DATE, fixture.headers, [fixture.row]);

  const result = h.parse(h.fn('handleMigrateWeeklyColumnOrder')({
    league: h.bound.LEAGUE_ID_SINGLES,
    apply: true
  }));

  assert.equal(result.status, 'error');
  assert.match(result.message, /not authorized/);
  assert.deepEqual(h.fn('getSheetHeaders')(sheet), fixture.headers);
});

test('creating a week tab writes the human-first headers and runs no migration', () => {
  const h = loadCode();
  const spreadsheet = h.makeSpreadsheet(h.bound.SPREADSHEET_ID);

  const result = h.parse(h.fn('handleCreateWeeklyTab')({
    leagueDate: WEEK_DATE,
    spreadsheetId: h.bound.SPREADSHEET_ID
  }));

  assert.equal(result.status, 'ok');
  assert.deepEqual(
    h.fn('getSheetHeaders')(spreadsheet.getSheetByName('Week ' + WEEK_DATE)),
    h.bound.WEEKLY_RECORD_HEADERS
  );
});
