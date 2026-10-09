/**
 * Doubles spreadsheet operator helpers.
 *
 * These functions are intended to be run by an operator from the Apps Script
 * editor (Run menu) or a bound menu — not from the public web app. They share
 * the routing helpers in Code.gs.
 *
 * Credentials / configuration are pluggable through Script Properties:
 *
 *   SINGLES_SPREADSHEET_ID  (falls back to SPREADSHEET_ID)
 *   DOUBLES_SPREADSHEET_ID  (falls back to SPREADSHEET_ID_DOUBLES)
 *
 * Set a property when the operator wants to point at a different spreadsheet
 * without editing code:
 *
 *   PropertiesService.getScriptProperties()
 *     .setProperty('DOUBLES_SPREADSHEET_ID', '<id>');
 *
 * No secrets, tokens, or credentials are stored in this file. Running these
 * functions requires the operator's existing Apps Script authorization.
 */

var SINGLES_SPREADSHEET_ID_PROPERTY = 'SINGLES_SPREADSHEET_ID';
var DOUBLES_SPREADSHEET_ID_PROPERTY = 'DOUBLES_SPREADSHEET_ID';

/**
 * Reads a spreadsheet ID from Script Properties, falling back to the supplied
 * constant when the property is unset or PropertiesService is unavailable.
 */
function getSpreadsheetIdFromProperties(propertyName, fallback) {
  try {
    var value = PropertiesService.getScriptProperties().getProperty(propertyName);
    if (value) return value;
  } catch (e) {
    // PropertiesService is unavailable in some sandboxes; use the fallback.
  }
  return fallback;
}

function getConfiguredSinglesSpreadsheetId() {
  return getSpreadsheetIdFromProperties(SINGLES_SPREADSHEET_ID_PROPERTY, SPREADSHEET_ID);
}

function getConfiguredDoublesSpreadsheetId() {
  return getSpreadsheetIdFromProperties(DOUBLES_SPREADSHEET_ID_PROPERTY, SPREADSHEET_ID_DOUBLES);
}

/**
 * Provisions the doubles spreadsheet end to end:
 *   - League sheet with league_format='doubles'
 *   - ClubMembers sheet
 *   - Week template sheet with the doubles weekly headers
 *   - Roster seeded from the singles ClubMembers (member_number preserved)
 *
 * Safe to run repeatedly. Returns the provisioning summary.
 *
 * Usage (Apps Script editor): run `provisionDoublesSpreadsheet`.
 */
function provisionDoublesSpreadsheet() {
  var doublesSpreadsheet = SpreadsheetApp.openById(getConfiguredDoublesSpreadsheetId());
  var singlesSpreadsheet = SpreadsheetApp.openById(getConfiguredSinglesSpreadsheetId());

  var summary = provisionDoublesWorkbook(doublesSpreadsheet, singlesSpreadsheet);
  Logger.log('Doubles provisioning complete:\n' + JSON.stringify(summary, null, 2));
  return summary;
}

/**
 * Creates (or returns) a dated doubles Week YYYY-MM-DD tab with the doubles
 * weekly headers.
 *
 * Usage: `createDoublesWeekTab('2026-10-05')`.
 */
function createDoublesWeekTab(leagueDate) {
  if (!leagueDate || !/^\d{4}-\d{2}-\d{2}$/.test(leagueDate)) {
    throw new Error('createDoublesWeekTab requires a leagueDate in YYYY-MM-DD format.');
  }

  var doublesSpreadsheet = SpreadsheetApp.openById(getConfiguredDoublesSpreadsheetId());
  var result = ensureWeekSheet(doublesSpreadsheet, leagueDate, LEAGUE_FORMAT_DOUBLES);

  Logger.log((result.created ? 'Created' : 'Already exists') + ': ' + result.sheet.getName());
  return result.sheet.getName();
}

/**
 * Operator entry point: dry-run the human-first weekly column-order migration
 * for both leagues. Writes nothing, so it is safe to run at any time.
 *
 * Usage (Apps Script editor): run `previewWeeklyColumnOrderMigration`.
 */
function previewWeeklyColumnOrderMigration() {
  var report = {
    singles: migrateWeeklyColumnOrder(
      SpreadsheetApp.openById(getConfiguredSinglesSpreadsheetId()),
      LEAGUE_FORMAT_SINGLES,
      { apply: false }
    ),
    doubles: migrateWeeklyColumnOrder(
      SpreadsheetApp.openById(getConfiguredDoublesSpreadsheetId()),
      LEAGUE_FORMAT_DOUBLES,
      { apply: false }
    )
  };

  Logger.log('Weekly column-order migration preview:\n' + JSON.stringify(report, null, 2));
  return report;
}

/**
 * Operator entry point: apply the human-first weekly column-order migration to
 * both leagues. Refuses unless the captain has set the
 * WEEKLY_COLUMN_ORDER_MIGRATION_APPROVAL Script Property. Run the preview
 * first to inspect the exact column order for every placed sheet.
 *
 * Usage (Apps Script editor): run `applyWeeklyColumnOrderMigration`.
 */
function applyWeeklyColumnOrderMigration() {
  var report = {
    singles: migrateWeeklyColumnOrder(
      SpreadsheetApp.openById(getConfiguredSinglesSpreadsheetId()),
      LEAGUE_FORMAT_SINGLES,
      { apply: true }
    ),
    doubles: migrateWeeklyColumnOrder(
      SpreadsheetApp.openById(getConfiguredDoublesSpreadsheetId()),
      LEAGUE_FORMAT_DOUBLES,
      { apply: true }
    )
  };

  Logger.log('Weekly column-order migration applied:\n' + JSON.stringify(report, null, 2));
  return report;
}

/**
 * Operator entry point: dry-run the destructive detag column-drop migration for
 * the doubles spreadsheet. Lists the tag columns that would be removed from
 * every week tab (including the template) and from ClubMembers, and writes
 * nothing, so it is safe to run at any time. The singles spreadsheet is never
 * touched.
 *
 * Usage (Apps Script editor): run `previewDetagColumnDrops`.
 */
function previewDetagColumnDrops() {
  var report = migrateDetagColumnDrops(
    SpreadsheetApp.openById(getConfiguredDoublesSpreadsheetId()),
    LEAGUE_FORMAT_DOUBLES,
    { apply: false, scoring: SCORING_POINTS }
  );

  Logger.log('Detag column-drop migration preview:\n' + JSON.stringify(report, null, 2));
  return report;
}

/**
 * Operator entry point: apply the destructive detag column-drop migration to
 * the doubles spreadsheet, deleting in_tag/out_tag/udisc_ending_tag from every
 * week tab and current_tag from ClubMembers. There is no script-property
 * interlock: run the preview first to inspect the exact columns for every sheet
 * before applying.
 *
 * Usage (Apps Script editor): run `applyDetagColumnDrops`.
 */
function applyDetagColumnDrops() {
  var report = migrateDetagColumnDrops(
    SpreadsheetApp.openById(getConfiguredDoublesSpreadsheetId()),
    LEAGUE_FORMAT_DOUBLES,
    { apply: true, scoring: SCORING_POINTS }
  );

  Logger.log('Detag column-drop migration applied:\n' + JSON.stringify(report, null, 2));
  return report;
}

/**
 * Operator entry point: dry-run the guarded test-data reset for the doubles
 * test spreadsheet. Writes nothing and reports exactly which rows would be
 * removed. The configured id must be on the test allow-list or the reset
 * refuses, so the live Singles spreadsheet can never be targeted.
 *
 * Usage (Apps Script editor): run `previewTestDataReset`.
 */
function previewTestDataReset() {
  var spreadsheetId = getConfiguredDoublesSpreadsheetId();
  var report = resetTestData(SpreadsheetApp.openById(spreadsheetId), {
    spreadsheetId: spreadsheetId,
    apply: false,
    scope: 'full'
  });

  Logger.log('Test-data reset preview:\n' + JSON.stringify(report, null, 2));
  return report;
}

/**
 * Operator entry point: apply the guarded test-data reset to the doubles test
 * spreadsheet, clearing every weekly data row and the roster down to the
 * header-only minimum. Refuses live Singles and any non-test spreadsheet before
 * any write. Run `previewTestDataReset` first to inspect the exact rows.
 *
 * Usage (Apps Script editor): run `applyTestDataReset`.
 */
function applyTestDataReset() {
  var spreadsheetId = getConfiguredDoublesSpreadsheetId();
  var report = resetTestData(SpreadsheetApp.openById(spreadsheetId), {
    spreadsheetId: spreadsheetId,
    apply: true,
    scope: 'full'
  });

  Logger.log('Test-data reset applied:\n' + JSON.stringify(report, null, 2));
  return report;
}

/**
 * Verifies the topology and headers of both spreadsheets against the schema
 * expected for their format. Returns a report and logs it.
 *
 * Usage: run `verifySpreadsheetTopology`.
 */
function verifySpreadsheetTopology() {
  var report = {
    singles: inspectSpreadsheetTopology(
      SpreadsheetApp.openById(getConfiguredSinglesSpreadsheetId()),
      LEAGUE_FORMAT_SINGLES
    ),
    doubles: inspectSpreadsheetTopology(
      SpreadsheetApp.openById(getConfiguredDoublesSpreadsheetId()),
      LEAGUE_FORMAT_DOUBLES
    )
  };

  Logger.log('Spreadsheet topology:\n' + JSON.stringify(report, null, 2));
  return report;
}

/**
 * Reports roster counts for both spreadsheets.
 *
 * Usage: run `reportRosterCounts`.
 */
function reportRosterCounts() {
  var report = {
    singles: countRoster(SpreadsheetApp.openById(getConfiguredSinglesSpreadsheetId())),
    doubles: countRoster(SpreadsheetApp.openById(getConfiguredDoublesSpreadsheetId()))
  };

  Logger.log('Roster counts:\n' + JSON.stringify(report, null, 2));
  return report;
}
