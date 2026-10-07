/**
 * Google Apps Script Web App - Bag Tag League
 *
 * Server-side layer for the player check-in vertical slice.
 * All Google Sheets access goes through this script.
 *
 * Deploy as: Web App -> Execute as: Me -> Who has access: Anyone
 */

// Replace with your actual spreadsheet ID
const SPREADSHEET_ID = '1kgTRXIiyyXAzWdLf0q_dY-1U3tpKvPVTwYDl8Ok7lik';

// Doubles league spreadsheet (second spreadsheet). The singles spreadsheet
// above stays the default for every caller that does not select doubles.
const SPREADSHEET_ID_DOUBLES = '1c8QGftl2bKcLZeqwE2IyzAh5x4I22WRjSSgc7nGgeG8';

// Supported league formats. `league_format` gates format-specific behavior so
// tag and points code paths do not duplicate a singles/doubles implementation.
const LEAGUE_FORMAT_SINGLES = 'singles';
const LEAGUE_FORMAT_DOUBLES = 'doubles';
const LEAGUE_FORMATS = [LEAGUE_FORMAT_SINGLES, LEAGUE_FORMAT_DOUBLES];

// Name of the doubles weekly template tab (not a dated Week sheet, so it is
// ignored by the Week YYYY-MM-DD discovery logic).
const WEEK_TEMPLATE_SHEET_NAME = 'Week template';

// ClubMembers tab column headers
const CLUB_MEMBER_HEADERS = [
  'member_number',
  'name',
  'udisc_username',
  'pdga_number',
  'current_tag',
  'is_active',
  'created_at',
  'updated_at'
];

// WeeklyPlayerRecords column headers (48 columns from the data model spec)
const WEEKLY_RECORD_HEADERS = [
  'member_number',
  'player_name_snapshot',
  'udisc_username_snapshot',
  'pdga_number_snapshot',
  'in_tag',
  'out_tag',
  'checked_in',
  'signed_in_at',
  'paid',
  'ctp',
  'ace_pot',
  'udisc_name_import',
  'udisc_username_import',
  'udisc_pdga_number_import',
  'score',
  'round_relative_score',
  'round_rating',
  'event_relative_score',
  'event_total_score',
  'udisc_checked_in',
  'udisc_paid',
  'starting_hole',
  'start_time',
  'division',
  'udisc_position',
  'udisc_position_raw',
  'hole_1',
  'hole_2',
  'hole_3',
  'hole_4',
  'hole_5',
  'hole_6',
  'hole_7',
  'hole_8',
  'hole_9',
  'hole_10',
  'hole_11',
  'hole_12',
  'hole_13',
  'hole_14',
  'hole_15',
  'hole_16',
  'hole_17',
  'hole_18',
  'udisc_ending_tag',
  'notes',
  'created_at',
  'updated_at'
];

// Doubles WeeklyPlayerRecords headers: the 48 singles columns plus the six
// doubles-only columns from the design report. The singles constant is
// untouched and the six columns are append-only so the 48 stay in order.
const WEEKLY_RECORD_HEADERS_DOUBLES = WEEKLY_RECORD_HEADERS.concat([
  'pair_key',
  'partner_member_number',
  'team_position',
  'team_position_raw',
  'weekly_points',
  'weekly_points_status'
]);

// League sheet column headers (15 columns)
const LEAGUE_SHEET_HEADERS = [
  'league_name',
  'description',
  'location',
  'schedule',
  'contact_information',
  'entry_fee',
  'ace_pot_contribution',
  'ace_pot_current_total',
  'ace_pot_calculated_total',
  'ace_pot_total',
  'ctp_contribution',
  'ctp_calculated_total',
  'ctp_total',
  'created_at',
  'updated_at'
];

// Doubles League sheet headers: the 15 singles columns plus the league_format
// column. The singles League schema is unchanged (no league_format column).
const LEAGUE_SHEET_HEADERS_DOUBLES = LEAGUE_SHEET_HEADERS.concat([
  'league_format'
]);

// ─── Spreadsheet routing ─────────────────────────────────────────────────────

// Opaque public league ids carried in QR URLs and request payloads. These are
// the only league selectors the client is expected to send; the server maps
// each one to an allow-listed spreadsheet below. They mirror the ids in
// src/shared/league-format.js.
const LEAGUE_ID_SINGLES = 'b-rads-league';
const LEAGUE_ID_DOUBLES = 'nightfliers-random-dubs';
const DEFAULT_LEAGUE_ID = LEAGUE_ID_SINGLES;

// Server-side allow-list: opaque league id -> authorized spreadsheet id. A
// client can only ever select one of these two spreadsheets; a raw Google
// spreadsheet id is never accepted as storage authority.
const LEAGUE_SPREADSHEETS = [
  { id: LEAGUE_ID_SINGLES, spreadsheetId: SPREADSHEET_ID },
  { id: LEAGUE_ID_DOUBLES, spreadsheetId: SPREADSHEET_ID_DOUBLES }
];

/**
 * Looks up the allow-listed league record for a canonical league id.
 * Returns null for anything not in the registry.
 */
function leagueRecordById(leagueId) {
  for (var i = 0; i < LEAGUE_SPREADSHEETS.length; i++) {
    if (LEAGUE_SPREADSHEETS[i].id === leagueId) return LEAGUE_SPREADSHEETS[i];
  }
  return null;
}

/**
 * Normalizes a requested routing selector to a canonical league id.
 *
 * Accepts an opaque league id, or (deprecated, during migration) one of the
 * allow-listed spreadsheet ids. Anything absent, blank, or unknown resolves to
 * the singles default, so a mistyped QR never selects a non-default league.
 */
function resolveLeagueId(selector) {
  if (leagueRecordById(selector)) return selector;
  if (selector === SPREADSHEET_ID_DOUBLES) return LEAGUE_ID_DOUBLES;
  return DEFAULT_LEAGUE_ID;
}

/**
 * Picks the routing selector from a request body: the opaque `league` id when
 * present, otherwise the deprecated `spreadsheetId` fallback. The value is
 * normalized by resolveLeagueId inside the resolvers below.
 */
function leagueSelectorFrom(data) {
  if (!data) return undefined;
  return data.league ? data.league : data.spreadsheetId;
}

/**
 * Maps a requested selector to a canonical spreadsheet ID through the
 * server-side league allow-list. This is the single enforcement point: an
 * unknown selector always resolves to the singles spreadsheet.
 */
function resolveSpreadsheetId(selector) {
  return leagueRecordById(resolveLeagueId(selector)).spreadsheetId;
}

/**
 * Opens the spreadsheet selected by the caller. This is the only place in the
 * codebase that calls SpreadsheetApp.openById; every handler routes through it.
 */
function resolveSpreadsheet(selector) {
  return SpreadsheetApp.openById(resolveSpreadsheetId(selector));
}

/**
 * Resolves the league format for a requested selector.
 * The doubles league is the only doubles format; everything else is singles.
 */
function resolveLeagueFormat(selector) {
  return resolveLeagueId(selector) === LEAGUE_ID_DOUBLES
    ? LEAGUE_FORMAT_DOUBLES
    : LEAGUE_FORMAT_SINGLES;
}

/**
 * Weekly record headers for a league format. Singles keeps the 48-column
 * schema; doubles appends the six doubles-only columns.
 */
function getWeeklyRecordHeaders(format) {
  return format === LEAGUE_FORMAT_DOUBLES
    ? WEEKLY_RECORD_HEADERS_DOUBLES
    : WEEKLY_RECORD_HEADERS;
}

/**
 * League sheet headers for a league format. Singles keeps the 15-column
 * schema; doubles appends the league_format column.
 */
function getLeagueSheetHeaders(format) {
  return format === LEAGUE_FORMAT_DOUBLES
    ? LEAGUE_SHEET_HEADERS_DOUBLES
    : LEAGUE_SHEET_HEADERS;
}

// ─── End spreadsheet routing ─────────────────────────────────────────────────

// ─── Sheet-position helpers ─────────────────────────────────────────────────

/**
 * Ensures a named sheet exists in the spreadsheet.
 * If it does not exist, creates it with the given headers, bolds row 1, and freezes row 1.
 * Returns { sheet, alreadyExisted }.
 */
function ensureCanonicalSheet(spreadsheet, name, headers) {
  const existing = spreadsheet.getSheetByName(name);
  if (existing) {
    return { sheet: existing, alreadyExisted: true };
  }

  const sheet = spreadsheet.insertSheet(name);
  if (headers && headers.length > 0) {
    sheet.appendRow(headers);
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return { sheet: sheet, alreadyExisted: false };
}

/**
 * Moves a sheet to a specific 0-based index position in the spreadsheet.
 * Uses setActiveSheet + moveActiveSheet (1-based position).
 */
function moveSheetToPosition(spreadsheet, sheetName, targetIndex) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) return;

  spreadsheet.setActiveSheet(sheet);
  spreadsheet.moveActiveSheet(targetIndex + 1);
}

/**
 * Returns all sheets whose names match the pattern "Week YYYY-MM-DD",
 * sorted chronologically (earliest date first).
 */
function getWeekSheets(spreadsheet) {
  return spreadsheet.getSheets()
    .filter(function(s) {
      return /^Week \d{4}-\d{2}-\d{2}$/.test(s.getName());
    })
    .sort(function(a, b) {
      return a.getName().localeCompare(b.getName());
    });
}

/**
 * Organizes all Week YYYY-MM-DD sheets in chronological order after
 * League (position 0) and ClubMembers (position 1).
 *
 * Explicitly enforces canonical positions for League and ClubMembers,
 * then sorts Week sheets in reverse order (last-to-first) so that
 * earlier moves do not disturb already-placed later sheets.
 * Leaves unrelated sheets untouched at the end.
 */
function organizeWeekSheetsChronologically(spreadsheet) {
  // Step 1: Ensure League is at position 0
  var league = spreadsheet.getSheetByName('League');
  if (league && league.getIndex() !== 1) {
    moveSheetToPosition(spreadsheet, 'League', 0);
  }

  // Step 2: Ensure ClubMembers is at position 1
  var clubMembers = spreadsheet.getSheetByName('ClubMembers');
  if (clubMembers && clubMembers.getIndex() !== 2) {
    moveSheetToPosition(spreadsheet, 'ClubMembers', 1);
  }

  // Step 3: Sort Week sheets chronologically, iterating in reverse
  // so earlier weeks don't shift when later weeks are moved
  var weekSheets = getWeekSheets(spreadsheet);
  for (var i = weekSheets.length - 1; i >= 0; i--) {
    var targetIndex = i + 2; // League=0, ClubMembers=1, Weeks start at 2
    var currentSheet = spreadsheet.getSheetByName(weekSheets[i].getName());
    if (currentSheet.getIndex() !== targetIndex + 1) {
      moveSheetToPosition(spreadsheet, weekSheets[i].getName(), targetIndex);
    }
  }
}

/**
 * Removes the default blank sheet from a new spreadsheet if it is safe to do so.
 * Only removes a sheet that has no data (headers or content) and is not the only sheet.
 * Does not assume the default sheet is named "Sheet1".
 */
function removeDefaultBlankSheet(spreadsheet) {
  var sheets = spreadsheet.getSheets();
  if (sheets.length <= 1) return;

  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    if (sheet.getLastRow() === 0 && sheet.getLastColumn() === 0) {
      spreadsheet.deleteSheet(sheet);
      return;
    }
  }
}

// ─── End sheet-position helpers ─────────────────────────────────────────────

// ─── Doubles provisioning ────────────────────────────────────────────────────

/**
 * Ensures the League sheet exists for the given format and, for doubles,
 * records league_format. Idempotent.
 *
 * This helper only ensures existence and format metadata; it does not migrate
 * the legacy 12-column singles schema, so the existing singles handlers keep
 * their exact behavior. Migration is handled by handleCreateLeagueSheet.
 *
 * Returns { sheet, created }.
 */
function ensureLeagueSheetForFormat(spreadsheet, format) {
  var headers = getLeagueSheetHeaders(format);
  var existing = spreadsheet.getSheetByName('League');

  if (!existing) {
    var sheet = spreadsheet.insertSheet('League');
    sheet.appendRow(headers);

    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);

    if (format === LEAGUE_FORMAT_DOUBLES) {
      ensureLeagueFormatValue(sheet, format);
    }

    moveSheetToPosition(spreadsheet, 'League', 0);
    return { sheet: sheet, created: true };
  }

  if (format === LEAGUE_FORMAT_DOUBLES) {
    ensureLeagueFormatValue(existing, format);
  }

  if (existing.getIndex() !== 1) {
    moveSheetToPosition(spreadsheet, 'League', 0);
  }

  return { sheet: existing, created: false };
}

/**
 * Migrates the legacy 12-column singles League sheet to the current 15-column
 * schema. Returns true when a migration happened. Only handleCreateLeagueSheet
 * calls this, matching the original singles behavior.
 */
function migrateOldLeagueSheet(spreadsheet) {
  var existing = spreadsheet.getSheetByName('League');
  if (!existing) return false;

  var OLD_LEAGUE_HEADERS = [
    'league_name', 'description', 'location', 'schedule', 'contact_information',
    'entry_fee', 'ace_pot_contribution', 'ace_pot_total',
    'ctp_contribution', 'ctp_prize',
    'created_at', 'updated_at'
  ];

  var currentHeaders = existing.getRange(1, 1, 1, existing.getLastColumn()).getValues()[0];
  var isOldSchema = currentHeaders.length === OLD_LEAGUE_HEADERS.length &&
    currentHeaders.every(function(h, i) { return h === OLD_LEAGUE_HEADERS[i]; });
  if (!isOldSchema) return false;

  var allData = existing.getDataRange().getValues();
  var oldRow = allData.length >= 2 ? allData[1] : [];

  var newRow = [];
  for (var i = 0; i < LEAGUE_SHEET_HEADERS.length; i++) {
    var header = LEAGUE_SHEET_HEADERS[i];
    if (header === 'ace_pot_current_total') {
      var oldIdx = OLD_LEAGUE_HEADERS.indexOf('ace_pot_total');
      newRow.push(oldIdx !== -1 && oldRow[oldIdx] ? oldRow[oldIdx] : '');
    } else if (header === 'ace_pot_calculated_total' || header === 'ace_pot_total' ||
               header === 'ctp_calculated_total' || header === 'ctp_total') {
      newRow.push('');
    } else if (header === 'ctp_prize') {
      continue;
    } else {
      var oldIdx2 = OLD_LEAGUE_HEADERS.indexOf(header);
      newRow.push(oldIdx2 !== -1 && oldRow[oldIdx2] ? oldRow[oldIdx2] : '');
    }
  }

  existing.clear();
  existing.appendRow(LEAGUE_SHEET_HEADERS);
  if (newRow.some(function(v) { return v !== ''; })) {
    existing.appendRow(newRow);
  }

  var migratedHeaderRange = existing.getRange(1, 1, 1, LEAGUE_SHEET_HEADERS.length);
  migratedHeaderRange.setFontWeight('bold');
  existing.setFrozenRows(1);
  return true;
}

/**
 * Ensures the League sheet's settings row records league_format. Adds the
 * league_format column when a pre-existing sheet lacks it. Idempotent.
 * Returns the 0-based column index of league_format.
 */
function ensureLeagueFormatValue(sheet, format) {
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var formatCol = headers.indexOf('league_format');

  if (formatCol === -1) {
    formatCol = headers.length;
    sheet.getRange(1, formatCol + 1).setValue('league_format');
    sheet.getRange(1, formatCol + 1).setFontWeight('bold');
  }

  if (sheet.getLastRow() < 2) {
    var blankRow = new Array(formatCol + 1).fill('');
    blankRow[formatCol] = format;
    sheet.appendRow(blankRow);
  } else {
    sheet.getRange(2, formatCol + 1).setValue(format);
  }

  return formatCol;
}

/**
 * Ensures the doubles weekly template tab exists with the format's weekly
 * headers. The template is a non-dated sheet so it never appears as a league
 * week. Idempotent. Returns { sheet, created }.
 */
function ensureWeekTemplateSheet(spreadsheet, format) {
  var headers = getWeeklyRecordHeaders(format);
  var result = ensureCanonicalSheet(spreadsheet, WEEK_TEMPLATE_SHEET_NAME, headers);
  return { sheet: result.sheet, created: !result.alreadyExisted };
}

/**
 * Creates (or returns) a dated weekly tab for the doubles spreadsheet using
 * the doubles headers. Returns { sheet, created }.
 */
function ensureWeekSheet(spreadsheet, leagueDate, format) {
  if (!leagueDate || !/^\d{4}-\d{2}-\d{2}$/.test(leagueDate)) {
    throw new Error('leagueDate must be YYYY-MM-DD.');
  }

  var tabName = 'Week ' + leagueDate;
  var existing = spreadsheet.getSheetByName(tabName);
  if (existing) {
    return { sheet: existing, created: false };
  }

  var headers = getWeeklyRecordHeaders(format);
  var sheet = spreadsheet.insertSheet(tabName);
  sheet.appendRow(headers);

  var headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setFontWeight('bold');
  sheet.setFrozenRows(1);

  organizeWeekSheetsChronologically(spreadsheet);
  removeDefaultBlankSheet(spreadsheet);
  return { sheet: sheet, created: true };
}

/**
 * Seeds the doubles ClubMembers roster from the singles roster exactly once.
 * Every copied row preserves its existing member_number; nothing is
 * renumbered. Members already present in the doubles roster are skipped, so
 * the seed is safe to run repeatedly.
 *
 * Returns { seeded, seeded_member_numbers, skipped_existing, error? }.
 */
function seedRosterFromSingles(singlesSpreadsheet, doublesSpreadsheet) {
  var doublesSheet = doublesSpreadsheet.getSheetByName('ClubMembers');
  if (!doublesSheet) {
    return { seeded: 0, seeded_member_numbers: [], skipped_existing: 0, error: 'ClubMembers tab not found in doubles spreadsheet.' };
  }

  var singlesSheet = singlesSpreadsheet.getSheetByName('ClubMembers');
  if (!singlesSheet) {
    return { seeded: 0, seeded_member_numbers: [], skipped_existing: 0, error: 'ClubMembers tab not found in singles spreadsheet.' };
  }

  var memberCol = CLUB_MEMBER_HEADERS.indexOf('member_number');
  var singlesData = singlesSheet.getDataRange().getValues();
  var doublesData = doublesSheet.getDataRange().getValues();

  var existing = {};
  for (var i = 1; i < doublesData.length; i++) {
    var existingId = doublesData[i][memberCol];
    if (existingId !== '' && existingId !== null && existingId !== undefined) {
      existing[existingId] = true;
    }
  }

  var seededMemberNumbers = [];
  var skippedExisting = 0;

  for (var r = 1; r < singlesData.length; r++) {
    var sourceRow = singlesData[r];
    var memberNumber = sourceRow[memberCol];

    if (memberNumber === '' || memberNumber === null || memberNumber === undefined) {
      continue;
    }
    if (existing[memberNumber]) {
      skippedExisting++;
      continue;
    }

    var newRow = new Array(CLUB_MEMBER_HEADERS.length).fill('');
    for (var c = 0; c < CLUB_MEMBER_HEADERS.length && c < sourceRow.length; c++) {
      newRow[c] = sourceRow[c];
    }

    doublesSheet.appendRow(newRow);
    existing[memberNumber] = true;
    seededMemberNumbers.push(memberNumber);
  }

  return {
    seeded: seededMemberNumbers.length,
    seeded_member_numbers: seededMemberNumbers,
    skipped_existing: skippedExisting
  };
}

/**
 * Provisions the doubles workbook schema: League (league_format=doubles),
 * ClubMembers, the Week template, and the singles roster seed.
 * Idempotent and deterministic.
 *
 * Takes spreadsheet objects (not IDs) so it is unit-testable without Google
 * credentials. Returns a summary.
 */
function provisionDoublesWorkbook(doublesSpreadsheet, singlesSpreadsheet) {
  var league = ensureLeagueSheetForFormat(doublesSpreadsheet, LEAGUE_FORMAT_DOUBLES);

  var club = ensureCanonicalSheet(doublesSpreadsheet, 'ClubMembers', CLUB_MEMBER_HEADERS);
  if (club.sheet.getIndex() !== 2) {
    moveSheetToPosition(doublesSpreadsheet, 'ClubMembers', 1);
  }

  var template = ensureWeekTemplateSheet(doublesSpreadsheet, LEAGUE_FORMAT_DOUBLES);

  organizeWeekSheetsChronologically(doublesSpreadsheet);
  removeDefaultBlankSheet(doublesSpreadsheet);

  var seed = singlesSpreadsheet
    ? seedRosterFromSingles(singlesSpreadsheet, doublesSpreadsheet)
    : { seeded: 0, seeded_member_numbers: [], skipped_existing: 0, error: 'No singles spreadsheet supplied.' };

  return {
    league: { created: league.created, league_format: LEAGUE_FORMAT_DOUBLES },
    club_members: { created: !club.alreadyExisted },
    week_template: { created: template.created },
    roster_seed: seed
  };
}

/**
 * Authoritative doubles provisioning-state check. Doubles are considered
 * provisioned only when every required artifact is present and the League
 * sheet records the doubles league_format:
 *   - ClubMembers sheet is present.
 *   - League sheet is present.
 *   - League sheet records league_format=doubles.
 *   - Week template sheet is present.
 *
 * The admin UI read path and the provisioning mutation both call this single
 * helper, so they can never disagree about what "provisioned" means. Returns
 * structured state so the UI can distinguish provisioned from not provisioned.
 */
function getDoublesProvisioningState(spreadsheet) {
  var league = spreadsheet.getSheetByName('League');
  var clubMembers = spreadsheet.getSheetByName('ClubMembers');
  var weekTemplate = spreadsheet.getSheetByName(WEEK_TEMPLATE_SHEET_NAME);
  var leagueFormat = readLeagueFormat(league);
  var leagueFormatMatches = leagueFormat === LEAGUE_FORMAT_DOUBLES;

  return {
    provisioned: !!(league && clubMembers && weekTemplate && leagueFormatMatches),
    league_present: !!league,
    club_members_present: !!clubMembers,
    week_template_present: !!weekTemplate,
    league_format: leagueFormat,
    league_format_matches: leagueFormatMatches
  };
}

/**
 * Admin action: reports the authoritative doubles provisioning state without
 * writing anything. The UI uses this instead of inferring state locally.
 */
function handleGetDoublesProvisioningState(data) {
  var doublesSpreadsheet = resolveSpreadsheet(SPREADSHEET_ID_DOUBLES);
  var state = getDoublesProvisioningState(doublesSpreadsheet);
  return respond(
    'ok',
    state.provisioned
      ? 'Doubles spreadsheet is already provisioned.'
      : 'Doubles spreadsheet is not provisioned.',
    { state: state }
  );
}

/**
 * Admin action: provisions the configured doubles spreadsheet (League with
 * league_format=doubles, ClubMembers, Week template) and seeds its roster from
 * the singles spreadsheet. Always targets the doubles spreadsheet ID, not the
 * caller's currently selected spreadsheet.
 *
 * Re-provisioning is refused before any write or template creation: when the
 * authoritative provisioning check already reports provisioned, the request
 * returns an already_provisioned response and performs no side effects. This
 * closes the race where another admin provisions between the UI's state read
 * and the click.
 */
function handleProvisionDoubles(data) {
  var doublesSpreadsheet = resolveSpreadsheet(SPREADSHEET_ID_DOUBLES);
  var state = getDoublesProvisioningState(doublesSpreadsheet);

  if (state.provisioned) {
    return respond(
      'already_provisioned',
      'Doubles spreadsheet is already provisioned. No changes were made.',
      { state: state }
    );
  }

  var singlesSpreadsheet = resolveSpreadsheet(SPREADSHEET_ID);
  var summary = provisionDoublesWorkbook(doublesSpreadsheet, singlesSpreadsheet);
  return respond('ok', 'Doubles spreadsheet provisioned.', summary);
}

/**
 * Reads the header row of a sheet. Returns [] for a missing or empty sheet.
 */
function getSheetHeaders(sheet) {
  if (!sheet || sheet.getLastRow() < 1 || sheet.getLastColumn() < 1) return [];
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

/**
 * Returns true when two arrays have the same length and identical values.
 */
function arraysEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Reads the league_format stored on the League sheet, or null when absent.
 */
function readLeagueFormat(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return null;
  var headers = getSheetHeaders(sheet);
  var formatCol = headers.indexOf('league_format');
  if (formatCol === -1) return null;
  var value = sheet.getRange(2, formatCol + 1).getValue();
  return value === '' || value === null || value === undefined ? null : value;
}

/**
 * Inspects a spreadsheet against the expected topology/headers for a format.
 * Returns a plain report object suitable for logging or tests.
 */
function inspectSpreadsheetTopology(spreadsheet, format) {
  var league = spreadsheet.getSheetByName('League');
  var club = spreadsheet.getSheetByName('ClubMembers');
  var template = spreadsheet.getSheetByName(WEEK_TEMPLATE_SHEET_NAME);

  return {
    sheet_names: spreadsheet.getSheets().map(function(s) { return s.getName(); }),
    league: {
      present: !!league,
      headers_match: arraysEqual(getSheetHeaders(league), getLeagueSheetHeaders(format)),
      league_format: readLeagueFormat(league)
    },
    club_members: {
      present: !!club,
      headers_match: arraysEqual(getSheetHeaders(club), CLUB_MEMBER_HEADERS)
    },
    week_template: {
      present: !!template,
      headers_match: arraysEqual(getSheetHeaders(template), getWeeklyRecordHeaders(format))
    }
  };
}

/**
 * Counts the roster rows on a spreadsheet's ClubMembers tab. Returns
 * { present, count, active_count, member_numbers }.
 */
function countRoster(spreadsheet) {
  var sheet = spreadsheet.getSheetByName('ClubMembers');
  if (!sheet) return { present: false, count: 0, active_count: 0, member_numbers: [] };

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return { present: true, count: 0, active_count: 0, member_numbers: [] };

  var headers = data[0];
  var memberCol = headers.indexOf('member_number');
  var activeCol = headers.indexOf('is_active');

  var memberNumbers = [];
  var activeCount = 0;

  for (var i = 1; i < data.length; i++) {
    var id = data[i][memberCol];
    if (id === '' || id === null || id === undefined) continue;
    memberNumbers.push(id);
    var isActive = activeCol === -1
      ? true
      : (data[i][activeCol] === true || data[i][activeCol] === 'TRUE');
    if (isActive) activeCount++;
  }

  return { present: true, count: memberNumbers.length, active_count: activeCount, member_numbers: memberNumbers };
}

// ─── End doubles provisioning ────────────────────────────────────────────────

/**
 * Handles GET requests. Returns a test response.
 */
function doGet(e) {
  const response = {
    status: 'ok',
    message: 'Apps Script web app is running',
    timestamp: new Date().toISOString(),
    method: 'GET'
  };

  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handles POST requests. Routes to the appropriate handler based on action.
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (data.action === 'getClubMembersStatus') {
      return handleGetClubMembersStatus(data);
    }
    if (data.action === 'createClubMembersTab') {
      return handleCreateClubMembersTab(data);
    }
    if (data.action === 'searchClubMembers') {
      return handleSearchClubMembers(data);
    }
    if (data.action === 'submitCheckIn') {
      return handleSubmitCheckIn(data);
    }
    if (data.action === 'createWeeklyTab') {
      return handleCreateWeeklyTab(data);
    }
    if (data.action === 'createLeagueSheet') {
      return handleCreateLeagueSheet(data);
    }
    if (data.action === 'getLeagueSettings') {
      return handleGetLeagueSettings(data);
    }
    if (data.action === 'saveLeagueSettings') {
      return handleSaveLeagueSettings(data);
    }
    if (data.action === 'getWeeklyTabs') {
      return handleGetWeeklyTabs(data);
    }
    if (data.action === 'getPreRoundReview') {
      return handleGetPreRoundReview(data);
    }
    if (data.action === 'savePreRoundReview') {
      return handleSavePreRoundReview(data);
    }
    if (data.action === 'previewUdiscImport') {
      return handlePreviewUdiscImport(data);
    }
    if (data.action === 'previewUdiscImportDoubles') {
      return handlePreviewUdiscImportDoubles(data);
    }
    if (data.action === 'commitUdiscImport') {
      return handleCommitUdiscImport(data);
    }
    if (data.action === 'calculateTags') {
      return handleCalculateTags(data);
    }
    if (data.action === 'confirmTags') {
      return handleConfirmTags(data);
    }
    if (data.action === 'finalizeRound') {
      return handleFinalizeRound(data);
    }
    if (data.action === 'provisionDoubles') {
      return handleProvisionDoubles(data);
    }
    if (data.action === 'getDoublesProvisioningState') {
      return handleGetDoublesProvisioningState(data);
    }

    return respond('error', 'Unknown action: ' + data.action);

  } catch (error) {
    return respond('error', error.message);
  }
}

/**
 * Returns whether the ClubMembers sheet exists.
 * Used by the admin page to show the correct setup state.
 */
function handleGetClubMembersStatus(data) {
  const spreadsheet = resolveSpreadsheet(leagueSelectorFrom(data));
  const sheet = spreadsheet.getSheetByName('ClubMembers');

  if (!sheet) {
    return respond('ok', 'ClubMembers sheet not found.', { state: 'missing' });
  }

  return respond('ok', 'ClubMembers sheet found.', { state: 'ok' });
}

/**
 * Creates the ClubMembers tab if it does not already exist.
 * One-time admin setup action.
 * Ensures League exists first (prerequisite for canonical order).
 * Ensures ClubMembers is positioned immediately after League.
 * Cleans up default blank sheets after creation.
 */
function handleCreateClubMembersTab(data) {
  const spreadsheet = resolveSpreadsheet(leagueSelectorFrom(data));
  const format = resolveLeagueFormat(leagueSelectorFrom(data));

  // Ensure League exists first — prerequisite for canonical order
  ensureLeagueSheetForFormat(spreadsheet, format);

  const existing = spreadsheet.getSheetByName('ClubMembers');

  if (existing) {
    // Ensure position immediately after League
    if (existing.getIndex() !== 2) {
      moveSheetToPosition(spreadsheet, 'ClubMembers', 1);
    }

    // Re-sort Week sheets in case ClubMembers was displaced
    organizeWeekSheetsChronologically(spreadsheet);

    return respond('ok', 'ClubMembers tab already exists.', {
      alreadyExisted: true
    });
  }

  const sheet = spreadsheet.insertSheet('ClubMembers');
  sheet.appendRow(CLUB_MEMBER_HEADERS);

  const headerRange = sheet.getRange(1, 1, 1, CLUB_MEMBER_HEADERS.length);
  headerRange.setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Position immediately after League
  moveSheetToPosition(spreadsheet, 'ClubMembers', 1);

  // Re-sort Week sheets that may already exist
  organizeWeekSheetsChronologically(spreadsheet);

  // Clean up default blank sheet if present
  removeDefaultBlankSheet(spreadsheet);

  return respond('ok', 'ClubMembers tab created successfully.', {
    alreadyExisted: false,
    columns: CLUB_MEMBER_HEADERS.length
  });
}

/**
 * Creates a new weekly tab in the spreadsheet for the given league date.
 * Uses the documented WeeklyPlayerRecords schema (48 columns) as the template.
 * Prevents duplicate tabs for the same date.
 * Ensures League (position 1) and ClubMembers (position 2) exist first.
 * Inserts the new Week sheet into the correct chronological position.
 * Cleans up default blank sheets after creation.
 */
function handleCreateWeeklyTab(data) {
  const leagueDate = data.leagueDate;

  if (!leagueDate) {
    return respond('error', 'League date is required.');
  }

  // Validate date format (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(leagueDate)) {
    return respond('error', 'Invalid date format. Expected YYYY-MM-DD.');
  }

  // Generate tab name from date
  const tabName = 'Week ' + leagueDate;

  const spreadsheet = resolveSpreadsheet(leagueSelectorFrom(data));
  const format = resolveLeagueFormat(leagueSelectorFrom(data));
  const weekHeaders = getWeeklyRecordHeaders(format);

  // Ensure canonical prerequisite sheets exist in correct order
  ensureLeagueSheetForFormat(spreadsheet, format);

  ensureCanonicalSheet(spreadsheet, 'ClubMembers', CLUB_MEMBER_HEADERS);
  if (spreadsheet.getSheetByName('ClubMembers').getIndex() !== 2) {
    moveSheetToPosition(spreadsheet, 'ClubMembers', 1);
  }

  // Check for duplicate tab
  const existing = spreadsheet.getSheetByName(tabName);
  if (existing) {
    return respond('error', 'A tab named "' + tabName + '" already exists. Cannot create duplicate.');
  }

  // Create the new tab
  const sheet = spreadsheet.insertSheet(tabName);

  // Write headers (row 1)
  sheet.appendRow(weekHeaders);

  // Format headers: bold, freeze row 1
  const headerRange = sheet.getRange(1, 1, 1, weekHeaders.length);
  headerRange.setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Organize all Week sheets chronologically after canonical sheets
  organizeWeekSheetsChronologically(spreadsheet);

  // Clean up default blank sheet if present
  removeDefaultBlankSheet(spreadsheet);

  return respond('ok', 'Tab "' + tabName + '" created successfully.', {
    tabName: tabName,
    columns: weekHeaders.length
  });
}

/**
 * Searches active club members by name, udisc_username, or pdga_number.
 * Returns up to 10 matching records with only player-facing fields.
 *
 * Inputs: query (string, min 2 chars)
 */
function handleSearchClubMembers(data) {
  const query = (data.query || '').trim();
  const leagueId = resolveLeagueId(leagueSelectorFrom(data));

  if (query.length < 2) {
    return respond('ok', 'Query too short.', { results: [], league: leagueId });
  }

  const spreadsheet = resolveSpreadsheet(leagueId);
  const playersSheet = spreadsheet.getSheetByName('ClubMembers');

  if (!playersSheet) {
    return respond('ok', 'No members found.', { results: [], league: leagueId });
  }

  const playersData = playersSheet.getDataRange().getValues();
  const playersHeaders = playersData[0];

  const memberNumberCol = playersHeaders.indexOf('member_number');
  const nameCol = playersHeaders.indexOf('name');
  const udiscCol = playersHeaders.indexOf('udisc_username');
  const pdgaCol = playersHeaders.indexOf('pdga_number');
  const currentTagCol = playersHeaders.indexOf('current_tag');
  const isActiveCol = playersHeaders.indexOf('is_active');

  const lowerQuery = query.toLowerCase();
  const results = [];

  for (let i = 1; i < playersData.length && results.length < 10; i++) {
    const row = playersData[i];

    // Filter out inactive members
    const isActive = row[isActiveCol];
    if (isActive !== true && isActive !== 'TRUE') continue;

    const name = (row[nameCol] || '').toString();
    const udisc = (row[udiscCol] || '').toString();
    const pdga = (row[pdgaCol] || '').toString();

    const nameMatch = name.toLowerCase().indexOf(lowerQuery) !== -1;
    const udiscMatch = udisc.toLowerCase().indexOf(lowerQuery) !== -1;
    const pdgaMatch = pdga.toLowerCase().indexOf(lowerQuery) !== -1;

    if (nameMatch || udiscMatch || pdgaMatch) {
      results.push({
        member_number: row[memberNumberCol],
        name: name,
        udisc_username: udisc,
        pdga_number: pdga,
        current_tag: row[currentTagCol]
      });
    }
  }

  return respond('ok', 'Search complete.', { results: results, league: leagueId });
}

/**
 * Submits a player check-in. Handles registration/check-in in a single flow:
 * 1. Finds or creates the club member record
 * 2. Finds the most recent weekly tab
 * 3. Checks for duplicate check-in
 * 4. Writes the weekly check-in record with identity snapshots
 *
 * Inputs: name (required), udisc_username (optional), pdga_number (optional),
 *         in_tag (required, positive integer), paid (boolean), ctp (boolean), ace_pot (boolean)
 *         member_number (optional) - existing member's internal ID for returning players
 */
function handleSubmitCheckIn(data) {
  const { name, udisc_username, pdga_number, in_tag, paid, ctp, ace_pot, member_number } = data;

  // Validate required fields
  if (!name || name.trim() === '') {
    return respond('error', 'Player name is required.');
  }

  const trimmedName = name.trim();
  const trimmedUdisc = (udisc_username || '').trim();
  const trimmedPdga = (pdga_number || '').trim();

  if (in_tag === undefined || in_tag === null || in_tag === '') {
    return respond('error', 'in_tag is required.');
  }

  const inTagNum = parseInt(in_tag, 10);
  if (isNaN(inTagNum) || inTagNum < 1) {
    return respond('error', 'Please enter a valid tag number (1 or higher).');
  }

  const leagueId = resolveLeagueId(leagueSelectorFrom(data));
  const spreadsheet = resolveSpreadsheet(leagueId);

  // --- Step 1: Find or create club member ---
  const playersSheet = spreadsheet.getSheetByName('ClubMembers');
  if (!playersSheet) {
    return respond('error', 'ClubMembers tab not found. Admin must create it first.');
  }

  const playersData = playersSheet.getDataRange().getValues();
  const playersHeaders = playersData[0];

  const memberNumberCol = playersHeaders.indexOf('member_number');
  const playerNameCol = playersHeaders.indexOf('name');
  const playerUdiscCol = playersHeaders.indexOf('udisc_username');
  const playerPdgaCol = playersHeaders.indexOf('pdga_number');
  const playerCurrentTagCol = playersHeaders.indexOf('current_tag');
  const playerIsActiveCol = playersHeaders.indexOf('is_active');

  let memberId = null;
  let memberRow = null;
  let memberRowIndex = null;
  let isNewMember = false;

  if (member_number !== undefined && member_number !== null && member_number !== '') {
    // Validate the supplied member_number against an active ClubMembers record
    const suppliedMemberId = member_number;
    for (let i = 1; i < playersData.length; i++) {
      const row = playersData[i];
      const rowId = row[memberNumberCol];
      const isActive = row[playerIsActiveCol];

      if (rowId === suppliedMemberId && (isActive === true || isActive === 'TRUE')) {
        memberId = rowId;
        memberRow = row;
        memberRowIndex = i;
        break;
      }
    }

    if (!memberId) {
      return respond('error', 'Selected member not found or is inactive. Please try again.');
    }

    // Update editable profile fields on the existing member record
    const now = new Date().toISOString();
    if (playerNameCol !== -1) playersSheet.getRange(memberRowIndex + 1, playerNameCol + 1).setValue(trimmedName);
    if (playerUdiscCol !== -1) playersSheet.getRange(memberRowIndex + 1, playerUdiscCol + 1).setValue(trimmedUdisc);
    if (playerPdgaCol !== -1) playersSheet.getRange(memberRowIndex + 1, playerPdgaCol + 1).setValue(trimmedPdga);
    if (playerCurrentTagCol !== -1) playersSheet.getRange(memberRowIndex + 1, playerCurrentTagCol + 1).setValue(inTagNum);
    // Always update updated_at
    const updatedAtCol = playersHeaders.indexOf('updated_at');
    if (updatedAtCol !== -1) playersSheet.getRange(memberRowIndex + 1, updatedAtCol + 1).setValue(now);

    // Refresh memberRow to reflect updates
    memberRow = playersSheet.getRange(memberRowIndex + 1, 1, 1, playersHeaders.length).getValues()[0];
  } else {
    // Search for existing player: match name + (udisc_username OR pdga_number)
    for (let i = 1; i < playersData.length; i++) {
      const row = playersData[i];
      const existingName = (row[playerNameCol] || '').toString().trim().toLowerCase();
      const existingUdisc = (row[playerUdiscCol] || '').toString().trim().toLowerCase();
      const existingPdga = (row[playerPdgaCol] || '').toString().trim();

      if (existingName !== trimmedName.toLowerCase()) continue;

      // Name matches. Check if udisc or pdga also match (if provided).
      const udiscMatch = trimmedUdisc && existingUdisc && existingUdisc === trimmedUdisc.toLowerCase();
      const pdgaMatch = trimmedPdga && existingPdga && existingPdga === trimmedPdga;
      const neitherProvided = !trimmedUdisc && !trimmedPdga;

      if (udiscMatch || pdgaMatch || neitherProvided) {
        memberId = row[memberNumberCol];
        memberRow = row;
        memberRowIndex = i;
        break;
      }
    }

    // If no match, create new club member
    if (!memberId) {
      // Lock to prevent concurrent registrations from receiving the same member_number
      var lock = LockService.getScriptLock();
      try {
        lock.waitLock(10000);

        // Re-read inside the lock to get the latest state
        var freshData = playersSheet.getDataRange().getValues();
        var maxMemberNumber = 0;
        for (var r = 1; r < freshData.length; r++) {
          var val = freshData[r][memberNumberCol];
          var num = parseInt(val, 10);
          if (!isNaN(num) && num > maxMemberNumber) {
            maxMemberNumber = num;
          }
        }

        var newMemberNumber = maxMemberNumber + 1;
        var now = new Date().toISOString();

        var newPlayer = new Array(CLUB_MEMBER_HEADERS.length).fill('');
        newPlayer[CLUB_MEMBER_HEADERS.indexOf('member_number')] = newMemberNumber;
        newPlayer[CLUB_MEMBER_HEADERS.indexOf('name')] = trimmedName;
        newPlayer[CLUB_MEMBER_HEADERS.indexOf('udisc_username')] = trimmedUdisc;
        newPlayer[CLUB_MEMBER_HEADERS.indexOf('pdga_number')] = trimmedPdga;
        newPlayer[CLUB_MEMBER_HEADERS.indexOf('current_tag')] = inTagNum;
        newPlayer[CLUB_MEMBER_HEADERS.indexOf('is_active')] = true;
        newPlayer[CLUB_MEMBER_HEADERS.indexOf('created_at')] = now;
        newPlayer[CLUB_MEMBER_HEADERS.indexOf('updated_at')] = now;

        playersSheet.appendRow(newPlayer);

        memberId = newMemberNumber;
        memberRow = newPlayer;
        isNewMember = true;
      } finally {
        lock.releaseLock();
      }
    }

    // Update ClubMembers.current_tag with the tag they are checking in with
    if (!isNewMember) {
      const memberRowIndexForTag = playersData.indexOf(memberRow) + 1;
      playersSheet.getRange(memberRowIndexForTag, playerCurrentTagCol + 1).setValue(inTagNum);
    }
  }

  // --- Step 2: Find the most recent weekly tab ---
  const sheets = spreadsheet.getSheets();
  const weekTabs = sheets
    .map(s => s.getName())
    .filter(name => /^Week \d{4}-\d{2}-\d{2}$/.test(name))
    .sort()
    .reverse();

  if (weekTabs.length === 0) {
    return respond('error', 'No weekly tabs found. Admin must create a weekly tab first.');
  }

  const mostRecentTabName = weekTabs[0];
  const recordsSheet = spreadsheet.getSheetByName(mostRecentTabName);

  // --- Step 3: Check for duplicate check-in ---
  const recordsData = recordsSheet.getDataRange().getValues();
  const recordsHeaders = recordsData[0];

  const recordPlayerIdCol = recordsHeaders.indexOf('member_number');

  for (let i = 1; i < recordsData.length; i++) {
    if (recordsData[i][recordPlayerIdCol] === memberId) {
      return respond('error', 'You are already checked in for this league.');
    }
  }

  // --- Step 4: Write the check-in record ---
  var recordTimestamp = new Date().toISOString();

  const newRecord = new Array(WEEKLY_RECORD_HEADERS.length).fill('');
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('member_number')] = memberId;
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('player_name_snapshot')] = memberRow[playerNameCol] || trimmedName;
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_username_snapshot')] = memberRow[playerUdiscCol] || trimmedUdisc;
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('pdga_number_snapshot')] = memberRow[playerPdgaCol] || trimmedPdga;
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('in_tag')] = inTagNum;
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('checked_in')] = true;
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('signed_in_at')] = recordTimestamp;
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('paid')] = paid === true || paid === 'TRUE';
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('ctp')] = ctp === true || ctp === 'TRUE';
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('ace_pot')] = ace_pot === true || ace_pot === 'TRUE';
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('created_at')] = recordTimestamp;
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('updated_at')] = recordTimestamp;

  recordsSheet.appendRow(newRecord);

  return respond('ok', 'Check-in successful.', {
    member_number: memberId,
    player_name: trimmedName,
    in_tag: inTagNum,
    weekly_tab: mostRecentTabName,
    league: leagueId
  });
}

/**
 * Creates the League sheet if it does not already exist.
 * Initializes with headers and an empty row for future settings.
 * Idempotent: returns alreadyExisted=true if the sheet already exists.
 * Migrates existing 12-column sheets to the current 15-column schema.
 * Ensures League is at position 1 (first tab).
 */
function handleCreateLeagueSheet(data) {
  const spreadsheet = resolveSpreadsheet(leagueSelectorFrom(data));
  const format = resolveLeagueFormat(leagueSelectorFrom(data));

  let migrated = false;
  if (format === LEAGUE_FORMAT_SINGLES) {
    migrated = migrateOldLeagueSheet(spreadsheet);
  }

  const result = ensureLeagueSheetForFormat(spreadsheet, format);
  removeDefaultBlankSheet(spreadsheet);

  if (migrated) {
    return respond('ok', 'League sheet migrated to new schema.', {
      alreadyExisted: true,
      migrated: true,
      columns: getLeagueSheetHeaders(format).length
    });
  }

  if (result.created) {
    return respond('ok', 'League sheet created successfully.', {
      alreadyExisted: false,
      columns: getLeagueSheetHeaders(format).length
    });
  }

  return respond('ok', 'League sheet already exists.', {
    alreadyExisted: true,
    migrated: false
  });
}

/**
 * Reads the League settings from the League sheet.
 * Returns the current state with a status field indicating:
 *   - "missing" if the League sheet does not exist
 *   - "empty" if the sheet exists but has no settings row
 *   - "ok" if the sheet exists and contains settings
 */
function handleGetLeagueSettings(data) {
  const spreadsheet = resolveSpreadsheet(leagueSelectorFrom(data));
  const sheet = spreadsheet.getSheetByName('League');

  if (!sheet) {
    return respond('ok', 'League sheet not found.', {
      state: 'missing'
    });
  }

  const allData = sheet.getDataRange().getValues();

  if (allData.length < 2) {
    return respond('ok', 'League sheet exists but has no settings.', {
      state: 'empty'
    });
  }

  const headers = allData[0];
  const row = allData[1];
  const settings = {};

  for (let i = 0; i < headers.length; i++) {
    const key = headers[i];
    const val = row[i];
    // Preserve blank strings and numbers; only coerce null/undefined to empty string
    settings[key] = (val === null || val === undefined) ? '' : val;
  }

  return respond('ok', 'League settings loaded.', {
    state: 'ok',
    settings: settings
  });
}

/**
 * Saves or updates League settings on the League sheet.
 * Numeric fields: entry_fee, ace_pot_contribution, ace_pot_current_total,
 *   ace_pot_calculated_total, ace_pot_total, ctp_contribution,
 *   ctp_calculated_total, ctp_total.
 *   Must be non-negative numbers. Blank is allowed (treated as empty).
 * Optional text fields: league_name, description, location, schedule, contact_information.
 *   Blank values are preserved (not overwritten with defaults).
 * Timestamps: created_at is preserved on update; updated_at is set on every save.
 */
function handleSaveLeagueSettings(data) {
  const settings = data.settings;

  if (!settings || typeof settings !== 'object') {
    return respond('error', 'No settings provided.');
  }

  const spreadsheet = resolveSpreadsheet(leagueSelectorFrom(data));
  const sheet = spreadsheet.getSheetByName('League');

  if (!sheet) {
    return respond('error', 'League sheet not found. Create it first.');
  }

  // Validate numeric fields
  const numericFields = [
    'entry_fee', 'ace_pot_contribution', 'ace_pot_current_total',
    'ace_pot_calculated_total', 'ace_pot_total',
    'ctp_contribution', 'ctp_calculated_total', 'ctp_total'
  ];
  for (const field of numericFields) {
    const raw = settings[field];
    // Allow blank/empty (treated as empty)
    if (raw === '' || raw === null || raw === undefined) {
      continue;
    }
    const num = Number(raw);
    if (isNaN(num) || num < 0) {
      return respond('error', 'Field "' + field + '" must be a non-negative number.');
    }
  }

  const allData = sheet.getDataRange().getValues();
  const now = new Date().toISOString();
  const hasExistingRow = allData.length >= 2;

  // Preserve created_at from existing row, or set new
  let createdAt = now;
  if (hasExistingRow) {
    const headers = allData[0];
    const existingRow = allData[1];
    const createdAtIdx = headers.indexOf('created_at');
    if (createdAtIdx !== -1 && existingRow[createdAtIdx]) {
      createdAt = existingRow[createdAtIdx];
    }
  }

  // Build the row values in header order
  const newRow = [];
  for (const header of LEAGUE_SHEET_HEADERS) {
    if (header === 'created_at') {
      newRow.push(createdAt);
    } else if (header === 'updated_at') {
      newRow.push(now);
    } else if (numericFields.indexOf(header) !== -1) {
      const raw = settings[header];
      newRow.push((raw === '' || raw === null || raw === undefined) ? '' : Number(raw));
    } else {
      const val = settings[header];
      newRow.push((val === null || val === undefined) ? '' : val);
    }
  }

  if (hasExistingRow) {
    sheet.getRange(2, 1, 1, newRow.length).setValues([newRow]);
  } else {
    sheet.appendRow(newRow);
  }

  // Return the saved settings as an object
  const saved = {};
  for (let i = 0; i < LEAGUE_SHEET_HEADERS.length; i++) {
    saved[LEAGUE_SHEET_HEADERS[i]] = newRow[i];
  }

  return respond('ok', 'League settings saved.', {
    settings: saved
  });
}

/**
 * Returns a list of existing weekly league tabs.
 * Scans sheet names for the pattern "Week YYYY-MM-DD" and returns them sorted
 * by date descending (most recent first).
 */
function handleGetWeeklyTabs(data) {
  const spreadsheet = resolveSpreadsheet(leagueSelectorFrom(data));
  const sheets = spreadsheet.getSheets();
  const weekTabs = [];

  for (let i = 0; i < sheets.length; i++) {
    const name = sheets[i].getName();
    const match = name.match(/^Week (\d{4}-\d{2}-\d{2})$/);
    if (match) {
      weekTabs.push({
        date: match[1],
        sheet_name: name
      });
    }
  }

  // Sort by date descending (most recent first)
  weekTabs.sort(function(a, b) {
    return b.date.localeCompare(a.date);
  });

  return respond('ok', 'Weekly tabs loaded.', {
    weeks: weekTabs
  });
}

/**
 * Loads pre-round review data for a specific league date.
 * Reads the weekly sheet, counts participating players, and calculates
 * ace pot and CTP totals based on League settings.
 *
 * Inputs: league_date (required, YYYY-MM-DD format)
 */
function handleGetPreRoundReview(data) {
  const leagueDate = data.league_date;

  // Validate date format
  if (!leagueDate || !/^\d{4}-\d{2}-\d{2}$/.test(leagueDate)) {
    return respond('error', 'Invalid or missing league_date. Expected YYYY-MM-DD format.');
  }

  const tabName = 'Week ' + leagueDate;
  const spreadsheet = resolveSpreadsheet(leagueSelectorFrom(data));

  // Check if weekly sheet exists
  const weeklySheet = spreadsheet.getSheetByName(tabName);
  if (!weeklySheet) {
    return respond('error', 'Weekly tab not found: ' + tabName + '. Create the league day first.');
  }

  // Load League settings
  const leagueSheet = spreadsheet.getSheetByName('League');
  if (!leagueSheet) {
    return respond('error', 'League sheet not found. Create it first to configure ace pot and CTP settings.');
  }

  const leagueData = leagueSheet.getDataRange().getValues();
  if (leagueData.length < 2) {
    return respond('error', 'League sheet has no settings row. Configure league settings first.');
  }

  const leagueHeaders = leagueData[0];
  const leagueRow = leagueData[1];

  // Extract League settings
  const acePotContribution = Number(leagueRow[leagueHeaders.indexOf('ace_pot_contribution')]) || 0;
  const acePotCurrentTotal = Number(leagueRow[leagueHeaders.indexOf('ace_pot_current_total')]) || 0;
  const ctpContribution = Number(leagueRow[leagueHeaders.indexOf('ctp_contribution')]) || 0;
  const acePotTotal = leagueRow[leagueHeaders.indexOf('ace_pot_total')];
  const ctpTotal = leagueRow[leagueHeaders.indexOf('ctp_total')];

  // Read weekly records
  const weeklyData = weeklySheet.getDataRange().getValues();
  if (weeklyData.length < 2) {
    // Headers only, no records
    return respond('ok', 'No players have checked in yet.', {
      league_date: leagueDate,
      weekly_tab: tabName,
      participating_count: 0,
      ace_pot_participant_count: 0,
      ctp_participant_count: 0,
      ace_pot_current_total: acePotCurrentTotal,
      ace_pot_contribution: acePotContribution,
      ace_pot_calculated_total: acePotCurrentTotal,
      ace_pot_total: acePotTotal !== undefined && acePotTotal !== '' ? acePotTotal : acePotCurrentTotal,
      ctp_contribution: ctpContribution,
      ctp_calculated_total: 0,
      ctp_total: ctpTotal !== undefined && ctpTotal !== '' ? ctpTotal : 0
    });
  }

  const weeklyHeaders = weeklyData[0];
  const checkedInCol = weeklyHeaders.indexOf('checked_in');
  const ctpCol = weeklyHeaders.indexOf('ctp');
  const acePotCol = weeklyHeaders.indexOf('ace_pot');

  // Count participants
  let participatingCount = 0;
  let acePotParticipantCount = 0;
  let ctpParticipantCount = 0;

  for (let i = 1; i < weeklyData.length; i++) {
    const row = weeklyData[i];
    const isCheckedIn = row[checkedInCol] === true || row[checkedInCol] === 'TRUE';

    if (isCheckedIn) {
      participatingCount++;

      const isAcePot = row[acePotCol] === true || row[acePotCol] === 'TRUE';
      if (isAcePot) {
        acePotParticipantCount++;
      }

      const isCtp = row[ctpCol] === true || row[ctpCol] === 'TRUE';
      if (isCtp) {
        ctpParticipantCount++;
      }
    }
  }

  // Calculate totals
  const acePotCalculatedTotal = acePotCurrentTotal + (acePotContribution * acePotParticipantCount);
  const ctpCalculatedTotal = ctpContribution * ctpParticipantCount;

  return respond('ok', 'Pre-round review loaded.', {
    league_date: leagueDate,
    weekly_tab: tabName,
    participating_count: participatingCount,
    ace_pot_participant_count: acePotParticipantCount,
    ctp_participant_count: ctpParticipantCount,
    ace_pot_current_total: acePotCurrentTotal,
    ace_pot_contribution: acePotContribution,
    ace_pot_calculated_total: acePotCalculatedTotal,
    ace_pot_total: acePotTotal !== undefined && acePotTotal !== '' ? acePotTotal : acePotCalculatedTotal,
    ctp_contribution: ctpContribution,
    ctp_calculated_total: ctpCalculatedTotal,
    ctp_total: ctpTotal !== undefined && ctpTotal !== '' ? ctpTotal : ctpCalculatedTotal
  });
}

/**
 * Saves pre-round review overrides to the League sheet.
 * Recalculates values server-side from the weekly sheet and saves both
 * calculated values and organizer overrides.
 *
 * Inputs: league_date (required), ace_pot_total (required), ctp_total (required)
 */
function handleSavePreRoundReview(data) {
  const leagueDate = data.league_date;
  const acePotTotalOverride = data.ace_pot_total;
  const ctpTotalOverride = data.ctp_total;

  // Validate date format
  if (!leagueDate || !/^\d{4}-\d{2}-\d{2}$/.test(leagueDate)) {
    return respond('error', 'Invalid or missing league_date. Expected YYYY-MM-DD format.');
  }

  // Validate totals are non-negative numbers
  if (acePotTotalOverride === undefined || acePotTotalOverride === null || acePotTotalOverride === '') {
    return respond('error', 'ace_pot_total is required.');
  }
  if (ctpTotalOverride === undefined || ctpTotalOverride === null || ctpTotalOverride === '') {
    return respond('error', 'ctp_total is required.');
  }

  const acePotTotalNum = Number(acePotTotalOverride);
  const ctpTotalNum = Number(ctpTotalOverride);

  if (isNaN(acePotTotalNum) || acePotTotalNum < 0) {
    return respond('error', 'ace_pot_total must be a non-negative number.');
  }
  if (isNaN(ctpTotalNum) || ctpTotalNum < 0) {
    return respond('error', 'ctp_total must be a non-negative number.');
  }

  const tabName = 'Week ' + leagueDate;
  const spreadsheet = resolveSpreadsheet(leagueSelectorFrom(data));

  // Verify weekly sheet exists
  const weeklySheet = spreadsheet.getSheetByName(tabName);
  if (!weeklySheet) {
    return respond('error', 'Weekly tab not found: ' + tabName + '. Cannot save review.');
  }

  // Verify League sheet exists
  const leagueSheet = spreadsheet.getSheetByName('League');
  if (!leagueSheet) {
    return respond('error', 'League sheet not found.');
  }

  const leagueData = leagueSheet.getDataRange().getValues();
  if (leagueData.length < 2) {
    return respond('error', 'League sheet has no settings row.');
  }

  const leagueHeaders = leagueData[0];

  // Recalculate from weekly sheet (do not trust browser-calculated values)
  const weeklyData = weeklySheet.getDataRange().getValues();
  const weeklyHeaders = weeklyData[0];
  const checkedInCol = weeklyHeaders.indexOf('checked_in');
  const ctpCol = weeklyHeaders.indexOf('ctp');
  const acePotCol = weeklyHeaders.indexOf('ace_pot');

  let acePotParticipantCount = 0;
  let ctpParticipantCount = 0;

  for (let i = 1; i < weeklyData.length; i++) {
    const row = weeklyData[i];
    const isCheckedIn = row[checkedInCol] === true || row[checkedInCol] === 'TRUE';

    if (isCheckedIn) {
      const isAcePot = row[acePotCol] === true || row[acePotCol] === 'TRUE';
      if (isAcePot) {
        acePotParticipantCount++;
      }

      const isCtp = row[ctpCol] === true || row[ctpCol] === 'TRUE';
      if (isCtp) {
        ctpParticipantCount++;
      }
    }
  }

  // Get League settings for calculation
  const leagueRow = leagueData[1];
  const acePotContribution = Number(leagueRow[leagueHeaders.indexOf('ace_pot_contribution')]) || 0;
  const acePotCurrentTotal = Number(leagueRow[leagueHeaders.indexOf('ace_pot_current_total')]) || 0;
  const ctpContribution = Number(leagueRow[leagueHeaders.indexOf('ctp_contribution')]) || 0;

  // Calculate values
  const acePotCalculatedTotal = acePotCurrentTotal + (acePotContribution * acePotParticipantCount);
  const ctpCalculatedTotal = ctpContribution * ctpParticipantCount;

  // Update League sheet row
  const now = new Date().toISOString();

  // Update calculated and final totals
  const acePotCalculatedCol = leagueHeaders.indexOf('ace_pot_calculated_total');
  const acePotTotalCol = leagueHeaders.indexOf('ace_pot_total');
  const ctpCalculatedCol = leagueHeaders.indexOf('ctp_calculated_total');
  const ctpTotalCol = leagueHeaders.indexOf('ctp_total');
  const updatedAtCol = leagueHeaders.indexOf('updated_at');

  // Write updated values
  leagueSheet.getRange(2, acePotCalculatedCol + 1).setValue(acePotCalculatedTotal);
  leagueSheet.getRange(2, acePotTotalCol + 1).setValue(acePotTotalNum);
  leagueSheet.getRange(2, ctpCalculatedCol + 1).setValue(ctpCalculatedTotal);
  leagueSheet.getRange(2, ctpTotalCol + 1).setValue(ctpTotalNum);
  leagueSheet.getRange(2, updatedAtCol + 1).setValue(now);

  return respond('ok', 'Pre-round review saved.', {
    league_date: leagueDate,
    ace_pot_calculated_total: acePotCalculatedTotal,
    ace_pot_total: acePotTotalNum,
    ctp_calculated_total: ctpCalculatedTotal,
    ctp_total: ctpTotalNum
  });
}

/**
 * Previews a UDisc import against the selected weekly sheet.
 * Reads the weekly sheet and ClubMembers, matches each UDisc row,
 * and returns categorized results without writing anything.
 *
 * Inputs: league_date (required, YYYY-MM-DD), rows (required, array of parsed UDisc row objects)
 */
function handlePreviewUdiscImport(data) {
  const leagueDate = data.league_date;
  const rows = data.rows;

  if (!leagueDate || !/^\d{4}-\d{2}-\d{2}$/.test(leagueDate)) {
    return respond('error', 'Invalid or missing league_date. Expected YYYY-MM-DD.');
  }
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return respond('error', 'No UDisc rows provided.');
  }

  const tabName = 'Week ' + leagueDate;
  const spreadsheet = resolveSpreadsheet(leagueSelectorFrom(data));

  const weeklySheet = spreadsheet.getSheetByName(tabName);
  if (!weeklySheet) {
    return respond('error', 'Weekly tab not found: ' + tabName + '.');
  }

  const clubSheet = spreadsheet.getSheetByName('ClubMembers');
  if (!clubSheet) {
    return respond('error', 'ClubMembers tab not found.');
  }

  // Read weekly sheet data
  const weeklyData = weeklySheet.getDataRange().getValues();
  const weeklyHeaders = weeklyData[0];

  const wMemberCol = weeklyHeaders.indexOf('member_number');
  const wNameCol = weeklyHeaders.indexOf('player_name_snapshot');
  const wUdiscCol = weeklyHeaders.indexOf('udisc_username_snapshot');
  const wPdgaCol = weeklyHeaders.indexOf('pdga_number_snapshot');
  const wInTagCol = weeklyHeaders.indexOf('in_tag');
  const wCheckedInCol = weeklyHeaders.indexOf('checked_in');
  const wPaidCol = weeklyHeaders.indexOf('paid');
  const wCtpCol = weeklyHeaders.indexOf('ctp');
  const wAcePotCol = weeklyHeaders.indexOf('ace_pot');

  // Build weekly indexes
  var weeklyByUsername = {};
  var weeklyByPdga = {};
  var weeklyByName = {};

  for (var i = 1; i < weeklyData.length; i++) {
    var row = weeklyData[i];
    var udisc = (row[wUdiscCol] || '').toString().trim().toLowerCase();
    var pdga = (row[wPdgaCol] || '').toString().trim();
    var name = (row[wNameCol] || '').toString().trim().toLowerCase();
    var memberNum = row[wMemberCol];

    if (udisc) weeklyByUsername[udisc] = { row: row, index: i };
    if (pdga) weeklyByPdga[pdga] = { row: row, index: i };
    if (name) {
      if (!weeklyByName[name]) weeklyByName[name] = [];
      weeklyByName[name].push({ row: row, index: i });
    }
  }

  // Read ClubMembers data
  var clubData = clubSheet.getDataRange().getValues();
  var clubHeaders = clubData[0];

  var cMemberCol = clubHeaders.indexOf('member_number');
  var cNameCol = clubHeaders.indexOf('name');
  var cUdiscCol = clubHeaders.indexOf('udisc_username');
  var cPdgaCol = clubHeaders.indexOf('pdga_number');
  var cActiveCol = clubHeaders.indexOf('is_active');

  // Build ClubMembers indexes (active members only)
  var clubByUsername = {};
  var clubByPdga = {};

  for (var j = 1; j < clubData.length; j++) {
    var crow = clubData[j];
    var cActive = crow[cActiveCol];
    if (cActive !== true && cActive !== 'TRUE') continue;

    var cUdisc = (crow[cUdiscCol] || '').toString().trim().toLowerCase();
    var cPdga = (crow[cPdgaCol] || '').toString().trim();
    var cMemberNum = crow[cMemberCol];

    if (cUdisc) clubByUsername[cUdisc] = cMemberNum;
    if (cPdga) clubByPdga[cPdga] = cMemberNum;
  }

  // Categorize each UDisc row
  var matched = [];
  var existingMemberNewWeekly = [];
  var completelyNew = [];
  var ambiguous = [];
  var errors = [];

  for (var r = 0; r < rows.length; r++) {
    var udiscRow = rows[r];
    var uName = (udiscRow.name || '').toString().trim();
    var uUsername = (udiscRow.username || '').toString().trim();
    var uPdga = (udiscRow.pdga_number || '').toString().trim();

    // Require at least a name
    if (!uName) {
      errors.push({
        udisc_name: '', udisc_username: uUsername, udisc_pdga: uPdga,
        row_index: r, error: 'No identifying information (name is empty).'
      });
      continue;
    }

    var found = false;

    // Step 1: Match by UDisc username against weekly records
    if (uUsername) {
      var match = weeklyByUsername[uUsername.toLowerCase()];
      if (match) {
        matched.push(buildMatchEntry(udiscRow, match.row, 'username'));
        found = true;
      }
    }

    // Step 2: Match by PDGA number against weekly records
    if (!found && uPdga) {
      var match = weeklyByPdga[uPdga];
      if (match) {
        matched.push(buildMatchEntry(udiscRow, match.row, 'pdga'));
        found = true;
      }
    }

    // Step 3: Match by player name against weekly records
    if (!found) {
      var nameMatches = weeklyByName[uName.toLowerCase()];
      if (nameMatches && nameMatches.length === 1) {
        matched.push(buildMatchEntry(udiscRow, nameMatches[0].row, 'name'));
        found = true;
      } else if (nameMatches && nameMatches.length > 1) {
        ambiguous.push({
          udisc_name: uName, udisc_username: uUsername, udisc_pdga: uPdga,
          possible_matches: nameMatches.map(function(m) {
            return {
              member_number: m.row[wMemberCol],
              name: m.row[wNameCol],
              udisc_username: m.row[wUdiscCol]
            };
          }),
          error: 'Multiple weekly records match by name. Requires PDGA number or username to disambiguate.'
        });
        found = true;
      }
    }

    if (found) continue;

    // Step 4: No weekly match — check ClubMembers
    var memberNum = null;
    var matchMethod = null;

    if (uUsername) {
      memberNum = clubByUsername[uUsername.toLowerCase()];
      if (memberNum) matchMethod = 'udisc_username_to_club_members';
    }
    if (!memberNum && uPdga) {
      memberNum = clubByPdga[uPdga];
      if (memberNum) matchMethod = 'udisc_pdga_to_club_members';
    }

    if (memberNum) {
      // Existing ClubMembers player, no weekly record yet
      var existingName = '';
      for (var c = 1; c < clubData.length; c++) {
        if (clubData[c][cMemberCol] === memberNum) {
          existingName = clubData[c][cNameCol] || '';
          break;
        }
      }
      existingMemberNewWeekly.push({
        is_new: true, new_type: 'existing_member',
        udisc_name: uName, udisc_username: uUsername, udisc_pdga: uPdga,
        member_number: memberNum,
        existing_club_member_name: existingName,
        match_method: matchMethod,
        fields_to_import: buildFieldsToImport(udiscRow)
      });
    } else {
      // Completely new player — not in ClubMembers
      if (!uUsername && !uPdga) {
        errors.push({
          udisc_name: uName, udisc_username: uUsername, udisc_pdga: uPdga,
          row_index: r, error: 'No PDGA number or UDisc username for new player creation.'
        });
      } else {
        completelyNew.push({
          is_new: true, new_type: 'new_member',
          udisc_name: uName, udisc_username: uUsername, udisc_pdga: uPdga,
          fields_to_import: buildFieldsToImport(udiscRow)
        });
      }
    }
  }

  // Identify weekly players missing from UDisc
  var matchedMemberNumbers = {};
  for (var m = 0; m < matched.length; m++) {
    matchedMemberNumbers[matched[m].member_number] = true;
  }

  var missingFromUdisc = [];
  for (var w = 1; w < weeklyData.length; w++) {
    var wm = weeklyData[w][wMemberCol];
    if (!matchedMemberNumbers[wm]) {
      missingFromUdisc.push({
        member_number: wm,
        player_name: weeklyData[w][wNameCol],
        udisc_username: weeklyData[w][wUdiscCol],
        pdga_number: weeklyData[w][wPdgaCol]
      });
    }
  }

  return respond('ok', 'Import preview generated.', {
    league_date: leagueDate,
    weekly_tab: tabName,
    summary: {
      total_udisc_rows: rows.length,
      matched_update: matched.length,
      existing_member_new_weekly: existingMemberNewWeekly.length,
      completely_new: completelyNew.length,
      missing_from_udisc: missingFromUdisc.length,
      ambiguous: ambiguous.length,
      errors: errors.length
    },
    matched: matched,
    existing_member_new_weekly: existingMemberNewWeekly,
    completely_new: completelyNew,
    missing_from_udisc: missingFromUdisc,
    ambiguous: ambiguous,
    errors: errors
  });
}

// ─── Doubles import preview (read-only) ─────────────────────────────────────
//
// A UDisc doubles export is one row per team: `name` is "A & B" and
// `usernames` is the comma-joined pair. The functions below split a row into
// independent partners, match each partner on its own (never letting one
// partner's match decide the other's), and compute a pair-level verdict. The
// whole path is read-only: it never appends or writes a sheet row.

/**
 * Splits the UDisc doubles handle cell into individual handles.
 *
 * Accepts the plural `usernames` cell (comma-joined, e.g. "damon31,donjoses")
 * and the singular `username` cell (solo/back-compat). Malformed input is
 * reported as validation codes; the caller decides the pair verdict.
 *
 * Returns { handles, warnings, errors }.
 */
function parseDoublesHandles(rawValue) {
  var text = (rawValue === null || rawValue === undefined) ? '' : rawValue.toString().trim();
  if (!text) {
    return { handles: [], warnings: [], errors: [] };
  }

  var parts = text.split(',');
  var handles = [];
  var warnings = [];

  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (!part) {
      warnings.push('blank_handle');
      continue;
    }
    handles.push(part);
  }

  if (handles.length > 2) {
    warnings.push('too_many_handles');
  }

  if (handles.length === 2 && handles[0].toLowerCase() === handles[1].toLowerCase()) {
    // Same handle twice — treat as a solo participant and flag for review.
    warnings.push('duplicate_handle');
    handles = [handles[0]];
  }

  return { handles: handles, warnings: warnings, errors: [] };
}

/**
 * Splits a UDisc doubles `name` cell into partner display names.
 *
 * Splits on the LAST ampersand so names containing earlier ampersands stay
 * intact. No ampersand means a solo participant. An ampersand with an empty
 * side is malformed; an ampersand that is not space-padded (e.g. "AT&T") is
 * ambiguous and is flagged for admin review rather than silently trusted.
 *
 * Returns { partnerNames, warnings, errors }.
 */
function parseDoublesPairName(rawValue) {
  var text = (rawValue === null || rawValue === undefined) ? '' : rawValue.toString().trim();
  if (!text) {
    return { partnerNames: [], warnings: [], errors: ['missing_name'] };
  }

  var idx = text.lastIndexOf('&');
  if (idx === -1) {
    return { partnerNames: [text], warnings: [], errors: [] };
  }

  var left = text.slice(0, idx).trim();
  var right = text.slice(idx + 1).trim();
  var warnings = [];
  var errors = [];

  if (!left || !right) {
    errors.push('malformed_ampersand');
  } else {
    var before = text.charAt(idx - 1);
    var after = text.charAt(idx + 1);
    if (before !== ' ' || after !== ' ') {
      warnings.push('ambiguous_ampersand');
    }
  }

  return { partnerNames: [left, right], warnings: warnings, errors: errors };
}

/**
 * Parses one UDisc doubles row into independent partner identity objects.
 * Parsing is deliberately separate from matching so both are testable alone.
 *
 * Returns { source_name, source_usernames, is_solo, partners, warnings, errors }.
 */
function parseDoublesRow(udiscRow) {
  var row = udiscRow || {};

  var hasPlural = row.usernames !== undefined && row.usernames !== null && row.usernames.toString().trim() !== '';
  var handleCell = hasPlural ? row.usernames : (row.username !== undefined ? row.username : '');

  var handleResult = parseDoublesHandles(handleCell);
  var nameResult = parseDoublesPairName(row.name);

  var handles = handleResult.handles;
  var names = nameResult.partnerNames;
  var warnings = handleResult.warnings.concat(nameResult.warnings);
  var errors = handleResult.errors.concat(nameResult.errors);

  if (handles.length > 0 && names.length > 0 && handles.length !== names.length) {
    warnings.push('partner_count_mismatch');
  }

  var count = Math.max(handles.length, names.length);
  if (count === 0) count = 1;
  var isSolo = count === 1;

  var partners = [];
  for (var i = 0; i < count; i++) {
    var name = names[i] !== undefined ? names[i] : '';
    var username = handles[i] !== undefined ? handles[i] : '';
    if (!name && !username) {
      errors.push('blank_partner');
    }
    partners.push({
      partner_index: i,
      name: name,
      username: username,
      // The doubles export has no per-player PDGA. Only a solo row can safely
      // carry the row-level PDGA number; a pair member must never inherit it.
      pdga_number: (isSolo && row.pdga_number) ? row.pdga_number.toString().trim() : '',
      match: null
    });
  }

  return {
    source_name: (row.name || '').toString(),
    source_usernames: handleCell === undefined || handleCell === null ? '' : handleCell.toString(),
    is_solo: isSolo,
    partners: partners,
    warnings: uniqueStrings(warnings),
    errors: uniqueStrings(errors)
  };
}

/** Returns the input list with duplicates removed, preserving first-seen order. */
function uniqueStrings(list) {
  var seen = {};
  var out = [];
  for (var i = 0; i < list.length; i++) {
    var value = list[i];
    if (!seen[value]) {
      seen[value] = true;
      out.push(value);
    }
  }
  return out;
}

/** Builds the match-result skeleton shared by every matching path. */
function emptyDoublesMatch() {
  return {
    status: 'unmatched',
    source: null,
    confidence: 'none',
    member_number: null,
    matched_name: '',
    matched_username: '',
    club_member: false,
    candidates: []
  };
}

function weeklyDoublesMatch(entry, source, indexes) {
  var result = emptyDoublesMatch();
  result.status = 'matched';
  result.source = source;
  result.confidence = source === 'weekly_name' ? 'medium' : 'high';
  result.member_number = entry.row[indexes.wMemberCol];
  result.matched_name = entry.row[indexes.wNameCol] || '';
  result.matched_username = entry.row[indexes.wUdiscCol] || '';
  result.club_member = true;
  return result;
}

function clubDoublesMatch(memberNumber, source, indexes) {
  var result = emptyDoublesMatch();
  var record = indexes.clubByMember[memberNumber] || null;
  result.status = 'matched';
  result.source = source;
  result.confidence = source === 'club_name' ? 'medium' : 'high';
  result.member_number = memberNumber;
  result.matched_name = record ? record.name : '';
  result.matched_username = record ? record.udisc_username : '';
  result.club_member = true;
  return result;
}

/**
 * Matches a single doubles partner through the existing identity chain:
 * weekly username -> weekly PDGA -> weekly name (unique) -> ClubMembers
 * username -> ClubMembers PDGA -> ClubMembers name (unique).
 *
 * A partner is matched independently; nothing here reads another partner's
 * result. Ambiguous name matches are returned as `ambiguous` with candidates
 * and are never auto-created. An identity with a username/PDGA that exists
 * nowhere is `new`; a name-only partner with no match is `unmatched`.
 */
function matchDoublesPartner(partner, indexes) {
  var username = (partner.username || '').toString().trim().toLowerCase();
  var pdga = (partner.pdga_number || '').toString().trim();
  var name = (partner.name || '').toString().trim().toLowerCase();

  if (username && indexes.weeklyByUsername[username]) {
    return weeklyDoublesMatch(indexes.weeklyByUsername[username], 'weekly_username', indexes);
  }
  if (pdga && indexes.weeklyByPdga[pdga]) {
    return weeklyDoublesMatch(indexes.weeklyByPdga[pdga], 'weekly_pdga', indexes);
  }
  if (name && indexes.weeklyByName[name]) {
    var weeklyNameMatches = indexes.weeklyByName[name];
    if (weeklyNameMatches.length === 1) {
      return weeklyDoublesMatch(weeklyNameMatches[0], 'weekly_name', indexes);
    }
    var weeklyAmbiguous = emptyDoublesMatch();
    weeklyAmbiguous.status = 'ambiguous';
    weeklyAmbiguous.source = 'weekly_name';
    weeklyAmbiguous.confidence = 'low';
    weeklyAmbiguous.candidates = weeklyNameMatches.map(function (entry) {
      return {
        member_number: entry.row[indexes.wMemberCol],
        name: entry.row[indexes.wNameCol] || '',
        udisc_username: entry.row[indexes.wUdiscCol] || ''
      };
    });
    return weeklyAmbiguous;
  }

  if (username && indexes.clubByUsername[username]) {
    return clubDoublesMatch(indexes.clubByUsername[username], 'club_username', indexes);
  }
  if (pdga && indexes.clubByPdga[pdga]) {
    return clubDoublesMatch(indexes.clubByPdga[pdga], 'club_pdga', indexes);
  }
  if (name && indexes.clubByName[name]) {
    var clubNameMatches = indexes.clubByName[name];
    if (clubNameMatches.length === 1) {
      return clubDoublesMatch(clubNameMatches[0].member_number, 'club_name', indexes);
    }
    var clubAmbiguous = emptyDoublesMatch();
    clubAmbiguous.status = 'ambiguous';
    clubAmbiguous.source = 'club_name';
    clubAmbiguous.confidence = 'low';
    clubAmbiguous.candidates = clubNameMatches.slice();
    return clubAmbiguous;
  }

  var result = emptyDoublesMatch();
  if (username || pdga) {
    // Known identity, not on the roster yet — eligible for auto-creation.
    result.status = 'new';
    result.source = 'new';
    result.confidence = 'medium';
  } else if (name) {
    result.status = 'unmatched';
    result.source = 'name_only';
    result.confidence = 'none';
  }
  return result;
}

/**
 * Computes the pair-level verdict from the parsed row plus each partner's
 * independent match. Malformed rows are blocked; ambiguous or unmatched
 * partners force manual review; only a fully resolved pair is `ready`.
 * An ambiguous partner is never hidden by the other partner's match.
 */
function computeDoublesPairVerdict(parsed, partners) {
  if (parsed.errors && parsed.errors.length > 0) {
    return { verdict: 'blocked', reason: parsed.errors[0] };
  }
  for (var i = 0; i < partners.length; i++) {
    if (partners[i].match.status === 'ambiguous') {
      return { verdict: 'review', reason: 'ambiguous_match' };
    }
    if (partners[i].match.status === 'unmatched') {
      return { verdict: 'review', reason: 'unmatched_partner' };
    }
  }
  if (parsed.warnings && parsed.warnings.length > 0) {
    return { verdict: 'review', reason: parsed.warnings[0] };
  }
  return { verdict: 'ready', reason: 'all_partners_resolved' };
}

/** Builds the active-roster override list returned to the admin UI. */
function buildDoublesRoster(clubData, headers) {
  var memberCol = headers.indexOf('member_number');
  var nameCol = headers.indexOf('name');
  var udiscCol = headers.indexOf('udisc_username');
  var pdgaCol = headers.indexOf('pdga_number');
  var activeCol = headers.indexOf('is_active');

  var roster = [];
  for (var i = 1; i < clubData.length; i++) {
    var row = clubData[i];
    var active = row[activeCol];
    if (active !== true && active !== 'TRUE') continue;
    roster.push({
      member_number: row[memberCol],
      name: row[nameCol] || '',
      udisc_username: row[udiscCol] || '',
      pdga_number: (row[pdgaCol] || '').toString()
    });
  }
  return roster;
}

/**
 * Previews a UDisc doubles export against the selected weekly sheet.
 *
 * Read-only: the only sheet access is getDataRange().getValues(). No row is
 * appended, updated, or created, and no ClubMembers record is touched. The
 * response carries the parsed pairs, each partner's independent match, the
 * pair verdict, and the active roster for admin overrides.
 *
 * Inputs: league_date (required), rows (required), spreadsheetId (doubles).
 */
function handlePreviewUdiscImportDoubles(data) {
  if (resolveLeagueFormat(leagueSelectorFrom(data)) !== LEAGUE_FORMAT_DOUBLES) {
    return respond('error', 'Doubles import preview is only available for the doubles spreadsheet.');
  }

  var leagueDate = data.league_date;
  var rows = data.rows;

  if (!leagueDate || !/^\d{4}-\d{2}-\d{2}$/.test(leagueDate)) {
    return respond('error', 'Invalid or missing league_date. Expected YYYY-MM-DD.');
  }
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return respond('error', 'No UDisc rows provided.');
  }

  var tabName = 'Week ' + leagueDate;
  var spreadsheet = resolveSpreadsheet(leagueSelectorFrom(data));

  var weeklySheet = spreadsheet.getSheetByName(tabName);
  if (!weeklySheet) {
    return respond('error', 'Weekly tab not found: ' + tabName + '.');
  }
  var clubSheet = spreadsheet.getSheetByName('ClubMembers');
  if (!clubSheet) {
    return respond('error', 'ClubMembers tab not found.');
  }

  // ── Weekly identity indexes ──
  var weeklyData = weeklySheet.getDataRange().getValues();
  var weeklyHeaders = weeklyData[0];
  var wMemberCol = weeklyHeaders.indexOf('member_number');
  var wNameCol = weeklyHeaders.indexOf('player_name_snapshot');
  var wUdiscCol = weeklyHeaders.indexOf('udisc_username_snapshot');
  var wPdgaCol = weeklyHeaders.indexOf('pdga_number_snapshot');

  var weeklyByUsername = {};
  var weeklyByPdga = {};
  var weeklyByName = {};

  for (var i = 1; i < weeklyData.length; i++) {
    var wrow = weeklyData[i];
    var wUsername = (wrow[wUdiscCol] || '').toString().trim().toLowerCase();
    var wPdga = (wrow[wPdgaCol] || '').toString().trim();
    var wName = (wrow[wNameCol] || '').toString().trim().toLowerCase();
    var entry = { row: wrow, index: i };

    if (wUsername) weeklyByUsername[wUsername] = entry;
    if (wPdga) weeklyByPdga[wPdga] = entry;
    if (wName) {
      if (!weeklyByName[wName]) weeklyByName[wName] = [];
      weeklyByName[wName].push(entry);
    }
  }

  // ── Active ClubMembers indexes (roster) ──
  var clubData = clubSheet.getDataRange().getValues();
  var clubHeaders = clubData[0];
  var cMemberCol = clubHeaders.indexOf('member_number');
  var cNameCol = clubHeaders.indexOf('name');
  var cUdiscCol = clubHeaders.indexOf('udisc_username');
  var cPdgaCol = clubHeaders.indexOf('pdga_number');
  var cActiveCol = clubHeaders.indexOf('is_active');

  var clubByUsername = {};
  var clubByPdga = {};
  var clubByName = {};
  var clubByMember = {};

  for (var j = 1; j < clubData.length; j++) {
    var crow = clubData[j];
    var cActive = crow[cActiveCol];
    if (cActive !== true && cActive !== 'TRUE') continue;

    var cUsername = (crow[cUdiscCol] || '').toString().trim().toLowerCase();
    var cPdga = (crow[cPdgaCol] || '').toString().trim();
    var cName = (crow[cNameCol] || '').toString().trim().toLowerCase();
    var memberNumber = crow[cMemberCol];

    if (cUsername) clubByUsername[cUsername] = memberNumber;
    if (cPdga) clubByPdga[cPdga] = memberNumber;
    if (cName) {
      if (!clubByName[cName]) clubByName[cName] = [];
      clubByName[cName].push({
        member_number: memberNumber,
        name: crow[cNameCol] || '',
        udisc_username: crow[cUdiscCol] || ''
      });
    }
    clubByMember[memberNumber] = {
      member_number: memberNumber,
      name: crow[cNameCol] || '',
      udisc_username: crow[cUdiscCol] || ''
    };
  }

  var indexes = {
    wMemberCol: wMemberCol,
    wNameCol: wNameCol,
    wUdiscCol: wUdiscCol,
    weeklyByUsername: weeklyByUsername,
    weeklyByPdga: weeklyByPdga,
    weeklyByName: weeklyByName,
    clubByUsername: clubByUsername,
    clubByPdga: clubByPdga,
    clubByName: clubByName,
    clubByMember: clubByMember
  };

  // ── Parse + match each row, independently per partner ──
  var pairs = [];
  var summary = {
    total_udisc_rows: rows.length,
    pairs: 0,
    solos: 0,
    partners: 0,
    ready: 0,
    review: 0,
    blocked: 0
  };

  for (var r = 0; r < rows.length; r++) {
    var parsed = parseDoublesRow(rows[r] || {});
    for (var p = 0; p < parsed.partners.length; p++) {
      parsed.partners[p].match = matchDoublesPartner(parsed.partners[p], indexes);
    }
    var verdict = computeDoublesPairVerdict(parsed, parsed.partners);

    pairs.push({
      row_index: r,
      raw_name: parsed.source_name,
      raw_usernames: parsed.source_usernames,
      is_solo: parsed.is_solo,
      partners: parsed.partners,
      validation: { errors: parsed.errors, warnings: parsed.warnings },
      verdict: verdict.verdict,
      verdict_reason: verdict.reason
    });

    summary.partners += parsed.partners.length;
    if (parsed.is_solo) summary.solos++; else summary.pairs++;
    summary[verdict.verdict] = (summary[verdict.verdict] || 0) + 1;
  }

  return respond('ok', 'Doubles import preview generated.', {
    league_date: leagueDate,
    weekly_tab: tabName,
    format: LEAGUE_FORMAT_DOUBLES,
    preview_only: true,
    live_sheet_writes: 0,
    summary: summary,
    roster: buildDoublesRoster(clubData, clubHeaders),
    pairs: pairs
  });
}

/**
 * Commits an approved UDisc import to the selected weekly sheet.
 * Revalidates matching server-side. Updates matched rows in place,
 * creates new weekly rows for existing ClubMembers players,
 * and creates both ClubMembers + weekly rows for entirely new players.
 *
 * Inputs: league_date (required), rows (required), approved (must be true)
 */
function handleCommitUdiscImport(data) {
  var leagueDate = data.league_date;
  var rows = data.rows;
  var approved = data.approved;

  if (!leagueDate || !/^\d{4}-\d{2}-\d{2}$/.test(leagueDate)) {
    return respond('error', 'Invalid or missing league_date.');
  }
  if (!approved) {
    return respond('error', 'Import not approved.');
  }
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return respond('error', 'No UDisc rows provided.');
  }

  var tabName = 'Week ' + leagueDate;
  var spreadsheet = resolveSpreadsheet(leagueSelectorFrom(data));

  var weeklySheet = spreadsheet.getSheetByName(tabName);
  if (!weeklySheet) {
    return respond('error', 'Weekly tab not found: ' + tabName + '.');
  }

  var clubSheet = spreadsheet.getSheetByName('ClubMembers');
  if (!clubSheet) {
    return respond('error', 'ClubMembers tab not found.');
  }

  // Re-read and revalidate all data server-side (do not trust preview payload)
  var weeklyData = weeklySheet.getDataRange().getValues();
  var weeklyHeaders = weeklyData[0];

  var wMemberCol = weeklyHeaders.indexOf('member_number');
  var wNameCol = weeklyHeaders.indexOf('player_name_snapshot');
  var wUdiscCol = weeklyHeaders.indexOf('udisc_username_snapshot');
  var wPdgaCol = weeklyHeaders.indexOf('pdga_number_snapshot');

  // Build weekly indexes
  var weeklyByUsername = {};
  var weeklyByPdga = {};
  var weeklyByName = {};

  for (var i = 1; i < weeklyData.length; i++) {
    var row = weeklyData[i];
    var udisc = (row[wUdiscCol] || '').toString().trim().toLowerCase();
    var pdga = (row[wPdgaCol] || '').toString().trim();
    var name = (row[wNameCol] || '').toString().trim().toLowerCase();

    if (udisc) weeklyByUsername[udisc] = { row: row, index: i };
    if (pdga) weeklyByPdga[pdga] = { row: row, index: i };
    if (name) {
      if (!weeklyByName[name]) weeklyByName[name] = [];
      weeklyByName[name].push({ row: row, index: i });
    }
  }

  // Read and index ClubMembers
  var clubData = clubSheet.getDataRange().getValues();
  var clubHeaders = clubData[0];

  var cMemberCol = clubHeaders.indexOf('member_number');
  var cNameCol = clubHeaders.indexOf('name');
  var cUdiscCol = clubHeaders.indexOf('udisc_username');
  var cPdgaCol = clubHeaders.indexOf('pdga_number');
  var cActiveCol = clubHeaders.indexOf('is_active');

  var clubByUsername = {};
  var clubByPdga = {};

  for (var j = 1; j < clubData.length; j++) {
    var crow = clubData[j];
    var cActive = crow[cActiveCol];
    if (cActive !== true && cActive !== 'TRUE') continue;

    var cUdisc = (crow[cUdiscCol] || '').toString().trim().toLowerCase();
    var cPdga = (crow[cPdgaCol] || '').toString().trim();

    if (cUdisc) clubByUsername[cUdisc] = crow[cMemberCol];
    if (cPdga) clubByPdga[cPdga] = crow[cMemberCol];
  }

  // Track created member_numbers in this batch to prevent duplicates
  var batchMemberNumbers = {};
  var matchedUpdated = 0;
  var existingMemberWeeklyCreated = 0;
  var newMembersCreated = 0;
  var createdMemberNumbers = [];

  var now = new Date().toISOString();

  for (var r = 0; r < rows.length; r++) {
    var udiscRow = rows[r];
    var uName = (udiscRow.name || '').toString().trim();
    var uUsername = (udiscRow.username || '').toString().trim();
    var uPdga = (udiscRow.pdga_number || '').toString().trim();

    if (!uName) continue;

    // --- Revalidate matching server-side ---
    var weeklyMatch = null;
    var matchMethod = null;

    // Step 1: username match against weekly records
    if (uUsername) {
      var m = weeklyByUsername[uUsername.toLowerCase()];
      if (m) { weeklyMatch = m; matchMethod = 'username'; }
    }
    // Step 2: PDGA match against weekly records
    if (!weeklyMatch && uPdga) {
      var m = weeklyByPdga[uPdga];
      if (m) { weeklyMatch = m; matchMethod = 'pdga'; }
    }
    // Step 3: name match against weekly records
    if (!weeklyMatch) {
      var nameMatches = weeklyByName[uName.toLowerCase()];
      if (nameMatches && nameMatches.length === 1) {
        weeklyMatch = nameMatches[0];
        matchMethod = 'name';
      }
    }

    if (weeklyMatch) {
      // --- Path 1: Update existing weekly record in place ---
      var targetRowIndex = weeklyMatch.index + 1;
      var existingRow = weeklyMatch.row;
      var values = existingRow.slice();

      // Read current row state (may have changed since preview)
      var currentRow = weeklySheet.getRange(targetRowIndex, 1, 1, weeklyHeaders.length).getValues()[0];
      values = currentRow.slice();

      // Write UDisc import fields only — protected fields untouched
      values[weeklyHeaders.indexOf('udisc_name_import')] = uName;
      values[weeklyHeaders.indexOf('udisc_username_import')] = uUsername;
      values[weeklyHeaders.indexOf('udisc_pdga_number_import')] = uPdga;
      values[weeklyHeaders.indexOf('score')] = udiscRow.round_total_score !== undefined ? udiscRow.round_total_score : '';
      values[weeklyHeaders.indexOf('round_relative_score')] = udiscRow.round_relative_score !== undefined ? udiscRow.round_relative_score : '';
      values[weeklyHeaders.indexOf('round_rating')] = udiscRow.round_rating !== undefined ? udiscRow.round_rating : '';
      values[weeklyHeaders.indexOf('event_relative_score')] = udiscRow.event_relative_score !== undefined ? udiscRow.event_relative_score : '';
      values[weeklyHeaders.indexOf('event_total_score')] = udiscRow.event_total_score !== undefined ? udiscRow.event_total_score : '';
      values[weeklyHeaders.indexOf('udisc_checked_in')] = udiscRow.checked_in === true || udiscRow.checked_in === 'TRUE';
      values[weeklyHeaders.indexOf('udisc_paid')] = udiscRow.paid === true || udiscRow.paid === 'TRUE';
      values[weeklyHeaders.indexOf('starting_hole')] = udiscRow.starting_hole !== undefined ? udiscRow.starting_hole : '';
      values[weeklyHeaders.indexOf('start_time')] = udiscRow.start_time !== undefined ? udiscRow.start_time : '';
      values[weeklyHeaders.indexOf('division')] = udiscRow.division !== undefined ? udiscRow.division : '';
      values[weeklyHeaders.indexOf('udisc_position')] = udiscRow.position !== undefined ? udiscRow.position : '';
      values[weeklyHeaders.indexOf('udisc_position_raw')] = udiscRow.position_raw !== undefined ? udiscRow.position_raw : '';
      values[weeklyHeaders.indexOf('udisc_ending_tag')] = udiscRow.bag_tag_at_end !== undefined ? udiscRow.bag_tag_at_end : '';
      for (var h = 1; h <= 18; h++) {
        var holeKey = 'hole_' + h;
        values[weeklyHeaders.indexOf(holeKey)] = udiscRow[holeKey] !== undefined ? udiscRow[holeKey] : '';
      }
      values[weeklyHeaders.indexOf('updated_at')] = now;

      weeklySheet.getRange(targetRowIndex, 1, 1, weeklyHeaders.length).setValues([values]);
      matchedUpdated++;

    } else {
      // --- Not a weekly record match — check ClubMembers ---
      var existingMemberNum = null;
      var existingMemberName = '';

      if (uUsername) {
        existingMemberNum = clubByUsername[uUsername.toLowerCase()];
      }
      if (!existingMemberNum && uPdga) {
        existingMemberNum = clubByPdga[uPdga];
      }

      if (existingMemberNum) {
        // Verify ClubMembers row still exists and is active
        var memberStillValid = false;
        for (var c = 1; c < clubData.length; c++) {
          if (clubData[c][cMemberCol] === existingMemberNum &&
              (clubData[c][cActiveCol] === true || clubData[c][cActiveCol] === 'TRUE')) {
            existingMemberName = clubData[c][cNameCol] || '';
            memberStillValid = true;
            break;
          }
        }
        if (!memberStillValid) continue;

        // Check batch dedup
        if (batchMemberNumbers[existingMemberNum]) continue;
        batchMemberNumbers[existingMemberNum] = true;

        // Double-check: does a weekly record already exist?
        var existingWeekly = weeklySheet.getDataRange().getValues();
        var alreadyExists = false;
        for (var w = 1; w < existingWeekly.length; w++) {
          if (existingWeekly[w][wMemberCol] === existingMemberNum) {
            alreadyExists = true;
            break;
          }
        }
        if (alreadyExists) continue;

        // --- Path 2: Existing ClubMembers player, create new weekly row ---
        var newRecord = new Array(WEEKLY_RECORD_HEADERS.length).fill('');
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('member_number')] = existingMemberNum;
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('player_name_snapshot')] = existingMemberName;
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_username_snapshot')] = uUsername;
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('pdga_number_snapshot')] = uPdga;
        // in_tag: blank — not invented
        // out_tag: blank — not calculated
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('checked_in')] = true;
        // signed_in_at: blank — player did not check in through the app
        // paid: FALSE — not invented
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('paid')] = false;
        // ctp: FALSE — not invented
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('ctp')] = false;
        // ace_pot: FALSE — not invented
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('ace_pot')] = false;
        // UDisc import fields
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_name_import')] = uName;
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_username_import')] = uUsername;
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_pdga_number_import')] = uPdga;
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('score')] = udiscRow.round_total_score !== undefined ? udiscRow.round_total_score : '';
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('round_relative_score')] = udiscRow.round_relative_score !== undefined ? udiscRow.round_relative_score : '';
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('round_rating')] = udiscRow.round_rating !== undefined ? udiscRow.round_rating : '';
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('event_relative_score')] = udiscRow.event_relative_score !== undefined ? udiscRow.event_relative_score : '';
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('event_total_score')] = udiscRow.event_total_score !== undefined ? udiscRow.event_total_score : '';
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_checked_in')] = udiscRow.checked_in === true || udiscRow.checked_in === 'TRUE';
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_paid')] = udiscRow.paid === true || udiscRow.paid === 'TRUE';
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('starting_hole')] = udiscRow.starting_hole !== undefined ? udiscRow.starting_hole : '';
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('start_time')] = udiscRow.start_time !== undefined ? udiscRow.start_time : '';
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('division')] = udiscRow.division !== undefined ? udiscRow.division : '';
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_position')] = udiscRow.position !== undefined ? udiscRow.position : '';
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_position_raw')] = udiscRow.position_raw !== undefined ? udiscRow.position_raw : '';
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_ending_tag')] = udiscRow.bag_tag_at_end !== undefined ? udiscRow.bag_tag_at_end : '';
        for (var h = 1; h <= 18; h++) {
          newRecord[WEEKLY_RECORD_HEADERS.indexOf('hole_' + h)] = udiscRow['hole_' + h] !== undefined ? udiscRow['hole_' + h] : '';
        }
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('created_at')] = now;
        newRecord[WEEKLY_RECORD_HEADERS.indexOf('updated_at')] = now;

        weeklySheet.appendRow(newRecord);
        existingMemberWeeklyCreated++;

      } else {
        // --- Path 3: Completely new player — create ClubMembers + weekly row ---
        if (!uUsername && !uPdga) continue;

        // Check if this username/PDGA was already assigned a member_number in this batch
        var batchKey = (uUsername || '') + '|' + (uPdga || '');
        var alreadyBatchAssigned = false;
        for (var bk in batchMemberNumbers) {
          // batchMemberNumbers stores member_numbers; we need identity-based dedup
        }

        // Check existing ClubMembers one more time
        var doubleCheck = null;
        if (uUsername && clubByUsername[uUsername.toLowerCase()]) {
          doubleCheck = clubByUsername[uUsername.toLowerCase()];
        }
        if (!doubleCheck && uPdga && clubByPdga[uPdga]) {
          doubleCheck = clubByPdga[uPdga];
        }
        if (doubleCheck) {
          // Became an existing member between preview and commit — treat as Path 2
          if (batchMemberNumbers[doubleCheck]) continue;
          batchMemberNumbers[doubleCheck] = true;
          // Find ClubMembers name
          var cmName = '';
          for (var cc = 1; cc < clubData.length; cc++) {
            if (clubData[cc][cMemberCol] === doubleCheck) {
              cmName = clubData[cc][cNameCol] || '';
              break;
            }
          }
          var newRecord2 = new Array(WEEKLY_RECORD_HEADERS.length).fill('');
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('member_number')] = doubleCheck;
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('player_name_snapshot')] = cmName;
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('udisc_username_snapshot')] = uUsername;
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('pdga_number_snapshot')] = uPdga;
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('checked_in')] = true;
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('paid')] = false;
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('ctp')] = false;
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('ace_pot')] = false;
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('udisc_name_import')] = uName;
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('udisc_username_import')] = uUsername;
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('udisc_pdga_number_import')] = uPdga;
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('score')] = udiscRow.round_total_score !== undefined ? udiscRow.round_total_score : '';
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('round_relative_score')] = udiscRow.round_relative_score !== undefined ? udiscRow.round_relative_score : '';
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('round_rating')] = udiscRow.round_rating !== undefined ? udiscRow.round_rating : '';
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('event_relative_score')] = udiscRow.event_relative_score !== undefined ? udiscRow.event_relative_score : '';
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('event_total_score')] = udiscRow.event_total_score !== undefined ? udiscRow.event_total_score : '';
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('udisc_checked_in')] = udiscRow.checked_in === true || udiscRow.checked_in === 'TRUE';
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('udisc_paid')] = udiscRow.paid === true || udiscRow.paid === 'TRUE';
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('starting_hole')] = udiscRow.starting_hole !== undefined ? udiscRow.starting_hole : '';
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('start_time')] = udiscRow.start_time !== undefined ? udiscRow.start_time : '';
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('division')] = udiscRow.division !== undefined ? udiscRow.division : '';
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('udisc_position')] = udiscRow.position !== undefined ? udiscRow.position : '';
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('udisc_position_raw')] = udiscRow.position_raw !== undefined ? udiscRow.position_raw : '';
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('udisc_ending_tag')] = udiscRow.bag_tag_at_end !== undefined ? udiscRow.bag_tag_at_end : '';
          for (var h2 = 1; h2 <= 18; h2++) {
            newRecord2[WEEKLY_RECORD_HEADERS.indexOf('hole_' + h2)] = udiscRow['hole_' + h2] !== undefined ? udiscRow['hole_' + h2] : '';
          }
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('created_at')] = now;
          newRecord2[WEEKLY_RECORD_HEADERS.indexOf('updated_at')] = now;
          weeklySheet.appendRow(newRecord2);
          existingMemberWeeklyCreated++;
          continue;
        }

        // Create new ClubMembers row with LockService
        var lock = LockService.getScriptLock();
        try {
          lock.waitLock(10000);

          // Re-read ClubMembers inside lock to catch rows created earlier in this batch
          var freshClubData = clubSheet.getDataRange().getValues();
          var maxMemberNumber = 0;
          var duplicateDetected = false;
          for (var cr = 1; cr < freshClubData.length; cr++) {
            var val = freshClubData[cr][cMemberCol];
            var num = parseInt(val, 10);
            if (!isNaN(num) && num > maxMemberNumber) {
              maxMemberNumber = num;
            }
            // Check for duplicate identity (username or PDGA already exists)
            var existingUdisc = (freshClubData[cr][cUdiscCol] || '').toString().trim().toLowerCase();
            var existingPdga = (freshClubData[cr][cPdgaCol] || '').toString().trim();
            if (uUsername && existingUdisc === uUsername.toLowerCase()) {
              duplicateDetected = true;
              break;
            }
            if (uPdga && existingPdga === uPdga) {
              duplicateDetected = true;
              break;
            }
          }
          if (duplicateDetected) {
            lock.releaseLock();
            continue;
          }

          var newMemberNumber = maxMemberNumber + 1;

          // Create ClubMembers row
          var newClubRow = new Array(CLUB_MEMBER_HEADERS.length).fill('');
          newClubRow[CLUB_MEMBER_HEADERS.indexOf('member_number')] = newMemberNumber;
          newClubRow[CLUB_MEMBER_HEADERS.indexOf('name')] = uName;
          newClubRow[CLUB_MEMBER_HEADERS.indexOf('udisc_username')] = uUsername;
          newClubRow[CLUB_MEMBER_HEADERS.indexOf('pdga_number')] = uPdga;
          // current_tag: empty — not invented, admin must assign before next league day
          newClubRow[CLUB_MEMBER_HEADERS.indexOf('is_active')] = true;
          newClubRow[CLUB_MEMBER_HEADERS.indexOf('created_at')] = now;
          newClubRow[CLUB_MEMBER_HEADERS.indexOf('updated_at')] = now;

          clubSheet.appendRow(newClubRow);

          batchMemberNumbers[newMemberNumber] = true;
          createdMemberNumbers.push(newMemberNumber);

          // Create weekly record
          var newWeeklyRecord = new Array(WEEKLY_RECORD_HEADERS.length).fill('');
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('member_number')] = newMemberNumber;
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('player_name_snapshot')] = uName;
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_username_snapshot')] = uUsername;
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('pdga_number_snapshot')] = uPdga;
          // in_tag: blank — not invented
          // out_tag: blank — not calculated
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('checked_in')] = true;
          // signed_in_at: blank — player did not check in through the app
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('paid')] = false;
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('ctp')] = false;
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('ace_pot')] = false;
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_name_import')] = uName;
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_username_import')] = uUsername;
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_pdga_number_import')] = uPdga;
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('score')] = udiscRow.round_total_score !== undefined ? udiscRow.round_total_score : '';
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('round_relative_score')] = udiscRow.round_relative_score !== undefined ? udiscRow.round_relative_score : '';
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('round_rating')] = udiscRow.round_rating !== undefined ? udiscRow.round_rating : '';
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('event_relative_score')] = udiscRow.event_relative_score !== undefined ? udiscRow.event_relative_score : '';
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('event_total_score')] = udiscRow.event_total_score !== undefined ? udiscRow.event_total_score : '';
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_checked_in')] = udiscRow.checked_in === true || udiscRow.checked_in === 'TRUE';
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_paid')] = udiscRow.paid === true || udiscRow.paid === 'TRUE';
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('starting_hole')] = udiscRow.starting_hole !== undefined ? udiscRow.starting_hole : '';
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('start_time')] = udiscRow.start_time !== undefined ? udiscRow.start_time : '';
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('division')] = udiscRow.division !== undefined ? udiscRow.division : '';
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_position')] = udiscRow.position !== undefined ? udiscRow.position : '';
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_position_raw')] = udiscRow.position_raw !== undefined ? udiscRow.position_raw : '';
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_ending_tag')] = udiscRow.bag_tag_at_end !== undefined ? udiscRow.bag_tag_at_end : '';
          for (var h3 = 1; h3 <= 18; h3++) {
            newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('hole_' + h3)] = udiscRow['hole_' + h3] !== undefined ? udiscRow['hole_' + h3] : '';
          }
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('created_at')] = now;
          newWeeklyRecord[WEEKLY_RECORD_HEADERS.indexOf('updated_at')] = now;

          weeklySheet.appendRow(newWeeklyRecord);
          newMembersCreated++;

        } finally {
          lock.releaseLock();
        }
      }
    }
  }

  return respond('ok', 'Import committed.', {
    summary: {
      matched_updated: matchedUpdated,
      existing_member_weekly_created: existingMemberWeeklyCreated,
      new_members_created: newMembersCreated,
      total_affected: matchedUpdated + existingMemberWeeklyCreated + newMembersCreated
    },
    created_member_numbers: createdMemberNumbers
  });
}

/**
 * Builds the fields_to_import object from a UDisc row.
 */
function buildFieldsToImport(udiscRow) {
  var fields = {
    udisc_name_import: udiscRow.name || '',
    udisc_username_import: udiscRow.username || '',
    udisc_pdga_number_import: (udiscRow.pdga_number || '').toString(),
    score: udiscRow.round_total_score,
    round_relative_score: udiscRow.round_relative_score,
    round_rating: udiscRow.round_rating,
    event_relative_score: udiscRow.event_relative_score,
    event_total_score: udiscRow.event_total_score,
    udisc_checked_in: udiscRow.checked_in,
    udisc_paid: udiscRow.paid,
    starting_hole: udiscRow.starting_hole,
    start_time: udiscRow.start_time,
    division: udiscRow.division,
    udisc_position: udiscRow.position,
    udisc_position_raw: udiscRow.position_raw,
    udisc_ending_tag: udiscRow.bag_tag_at_end
  };
  for (var h = 1; h <= 18; h++) {
    fields['hole_' + h] = udiscRow['hole_' + h];
  }
  return fields;
}

/**
 * Builds a matched entry object for the preview response.
 */
function buildMatchEntry(udiscRow, weeklyRow, matchMethod) {
  var headers = WEEKLY_RECORD_HEADERS;
  return {
    is_new: false,
    udisc_name: udiscRow.name || '',
    udisc_username: udiscRow.username || '',
    udisc_pdga: (udiscRow.pdga_number || '').toString(),
    member_number: weeklyRow[headers.indexOf('member_number')],
    weekly_player_name: weeklyRow[headers.indexOf('player_name_snapshot')],
    match_method: matchMethod,
    fields_to_import: buildFieldsToImport(udiscRow),
    existing_values: {
      in_tag: weeklyRow[headers.indexOf('in_tag')],
      checked_in: weeklyRow[headers.indexOf('checked_in')],
      paid: weeklyRow[headers.indexOf('paid')],
      ctp: weeklyRow[headers.indexOf('ctp')],
      ace_pot: weeklyRow[headers.indexOf('ace_pot')]
    }
  };
}

/**
 * Calculates tag assignments for a weekly league.
 * Reads all player records from the selected Week YYYY-MM-DD sheet.
 * Includes every player regardless of checked_in, score, or in_tag status.
 *
 * Inputs: league_date (required, YYYY-MM-DD format)
 */
function handleCalculateTags(data) {
  var format = resolveLeagueFormat(leagueSelectorFrom(data));
  if (format === LEAGUE_FORMAT_DOUBLES) {
    return respond('error', 'Tag operations are not available for the doubles league.');
  }

  var leagueDate = data.league_date;

  if (!leagueDate || !/^\d{4}-\d{2}-\d{2}$/.test(leagueDate)) {
    return respond('error', 'Invalid or missing league_date.');
  }

  var tabName = 'Week ' + leagueDate;
  var spreadsheet = resolveSpreadsheet(leagueSelectorFrom(data));
  var weeklySheet = spreadsheet.getSheetByName(tabName);

  if (!weeklySheet) {
    return respond('error', 'Weekly tab not found: ' + tabName + '.');
  }

  var weeklyData = weeklySheet.getDataRange().getValues();
  var headers = weeklyData[0];

  var hMember = headers.indexOf('member_number');
  var hName = headers.indexOf('player_name_snapshot');
  var hInTag = headers.indexOf('in_tag');
  var hOutTag = headers.indexOf('out_tag');
  var hScore = headers.indexOf('score');
  var hCheckedIn = headers.indexOf('checked_in');

  // Collect all players from the sheet
  var players = [];
  for (var i = 1; i < weeklyData.length; i++) {
    var row = weeklyData[i];
    var memberNumber = row[hMember];
    if (memberNumber === '' || memberNumber === null || memberNumber === undefined) continue;

    var inTag = row[hInTag];
    var inTagNum = parseInt(inTag, 10);
    var hasValidTag = !isNaN(inTagNum) && inTagNum >= 1;

    var score = row[hScore];
    var scoreNum = parseInt(score, 10);
    var hasValidScore = !isNaN(scoreNum);

    players.push({
      row_index: i,
      member_number: memberNumber,
      player_name: row[hName] || '',
      in_tag: hasValidTag ? inTagNum : null,
      in_tag_raw: inTag,
      score: hasValidScore ? scoreNum : null,
      score_raw: score,
      checked_in: row[hCheckedIn],
      out_tag_current: row[hOutTag]
    });
  }

  // Build tag pool from valid in_tag values
  var tagPool = [];
  var seenTags = {};
  for (var p = 0; p < players.length; p++) {
    if (players[p].in_tag !== null && !seenTags[players[p].in_tag]) {
      tagPool.push(players[p].in_tag);
      seenTags[players[p].in_tag] = true;
    }
  }
  tagPool.sort(function(a, b) { return a - b; });

  // Rank players: valid scores first (ascending), then no-score players (by in_tag ascending)
  var withScore = [];
  var noScore = [];
  for (var q = 0; q < players.length; q++) {
    if (players[q].score !== null) {
      withScore.push(players[q]);
    } else {
      noScore.push(players[q]);
    }
  }

  withScore.sort(function(a, b) {
    if (a.score !== b.score) return a.score - b.score;
    // Tie-break by in_tag: valid tags sort lower; null tags sort last
    if (a.in_tag !== null && b.in_tag !== null) return a.in_tag - b.in_tag;
    if (a.in_tag !== null) return -1;
    if (b.in_tag !== null) return 1;
    return 0;
  });

  noScore.sort(function(a, b) {
    if (a.in_tag !== null && b.in_tag !== null) return a.in_tag - b.in_tag;
    if (a.in_tag !== null) return -1;
    if (b.in_tag !== null) return 1;
    return 0;
  });

  var ranked = withScore.concat(noScore);

  // Assign tags from pool in rank order
  var poolIndex = 0;
  for (var r = 0; r < ranked.length; r++) {
    if (poolIndex < tagPool.length) {
      ranked[r].proposed_out_tag = tagPool[poolIndex];
      poolIndex++;
    } else {
      ranked[r].proposed_out_tag = null;
    }
    ranked[r].rank = r + 1;
  }

  // Build response
  var result = [];
  for (var s = 0; s < ranked.length; s++) {
    var pl = ranked[s];
    result.push({
      rank: pl.rank,
      member_number: pl.member_number,
      player_name: pl.player_name,
      in_tag: pl.in_tag,
      score: pl.score,
      proposed_out_tag: pl.proposed_out_tag,
      has_valid_tag: pl.in_tag !== null,
      has_valid_score: pl.score !== null
    });
  }

  return respond('ok', 'Tag calculation preview.', {
    league_date: leagueDate,
    tab_name: tabName,
    total_players: players.length,
    tag_pool: tagPool,
    tag_pool_count: tagPool.length,
    players: result
  });
}

/**
 * Confirms and writes tag assignments for a weekly league.
 * Re-runs the calculation and writes out_tag values to the sheet.
 *
 * Inputs: league_date (required, YYYY-MM-DD format)
 */
function handleConfirmTags(data) {
  var format = resolveLeagueFormat(leagueSelectorFrom(data));
  if (format === LEAGUE_FORMAT_DOUBLES) {
    return respond('error', 'Tag operations are not available for the doubles league.');
  }

  var leagueDate = data.league_date;

  if (!leagueDate || !/^\d{4}-\d{2}-\d{2}$/.test(leagueDate)) {
    return respond('error', 'Invalid or missing league_date.');
  }

  var tabName = 'Week ' + leagueDate;
  var spreadsheet = resolveSpreadsheet(leagueSelectorFrom(data));
  var weeklySheet = spreadsheet.getSheetByName(tabName);

  if (!weeklySheet) {
    return respond('error', 'Weekly tab not found: ' + tabName + '.');
  }

  var weeklyData = weeklySheet.getDataRange().getValues();
  var headers = weeklyData[0];

  var hMember = headers.indexOf('member_number');
  var hInTag = headers.indexOf('in_tag');
  var hOutTag = headers.indexOf('out_tag');
  var hScore = headers.indexOf('score');
  var hUpdatedAt = headers.indexOf('updated_at');

  // Collect all players
  var players = [];
  for (var i = 1; i < weeklyData.length; i++) {
    var row = weeklyData[i];
    var memberNumber = row[hMember];
    if (memberNumber === '' || memberNumber === null || memberNumber === undefined) continue;

    var inTag = row[hInTag];
    var inTagNum = parseInt(inTag, 10);
    var hasValidTag = !isNaN(inTagNum) && inTagNum >= 1;

    var score = row[hScore];
    var scoreNum = parseInt(score, 10);
    var hasValidScore = !isNaN(scoreNum);

    players.push({
      row_index: i,
      in_tag: hasValidTag ? inTagNum : null,
      score: hasValidScore ? scoreNum : null
    });
  }

  // Build tag pool
  var tagPool = [];
  var seenTags = {};
  for (var p = 0; p < players.length; p++) {
    if (players[p].in_tag !== null && !seenTags[players[p].in_tag]) {
      tagPool.push(players[p].in_tag);
      seenTags[players[p].in_tag] = true;
    }
  }
  tagPool.sort(function(a, b) { return a - b; });

  // Rank players
  var withScore = [];
  var noScore = [];
  for (var q = 0; q < players.length; q++) {
    if (players[q].score !== null) {
      withScore.push(players[q]);
    } else {
      noScore.push(players[q]);
    }
  }

  withScore.sort(function(a, b) {
    if (a.score !== b.score) return a.score - b.score;
    if (a.in_tag !== null && b.in_tag !== null) return a.in_tag - b.in_tag;
    if (a.in_tag !== null) return -1;
    if (b.in_tag !== null) return 1;
    return 0;
  });

  noScore.sort(function(a, b) {
    if (a.in_tag !== null && b.in_tag !== null) return a.in_tag - b.in_tag;
    if (a.in_tag !== null) return -1;
    if (b.in_tag !== null) return 1;
    return 0;
  });

  var ranked = withScore.concat(noScore);

  // Assign tags and write to sheet
  var poolIndex = 0;
  var now = new Date().toISOString();
  var updated = 0;

  for (var r = 0; r < ranked.length; r++) {
    var pl = ranked[r];
    var outTag = null;
    if (poolIndex < tagPool.length) {
      outTag = tagPool[poolIndex];
      poolIndex++;
    }

    var sheetRow = pl.row_index + 1;
    weeklySheet.getRange(sheetRow, hOutTag + 1).setValue(outTag !== null ? outTag : '');
    weeklySheet.getRange(sheetRow, hUpdatedAt + 1).setValue(now);
    updated++;
  }

  return respond('ok', 'Tag assignments written.', {
    league_date: leagueDate,
    tab_name: tabName,
    players_updated: updated,
    tag_pool_used: tagPool.length
  });
}

/**
 * Finalizes a round by propagating out_tag values from the weekly sheet
 * to each matching ClubMembers record's current_tag.
 *
 * Inputs: league_date (required, YYYY-MM-DD format)
 *
 * For each player row with a confirmed, nonblank out_tag:
 *   - Find the matching ClubMembers row by member_number
 *   - Update ClubMembers.current_tag to the weekly out_tag
 *
 * Players without a matching ClubMembers record or without a nonblank
 * out_tag are skipped. Returns a summary of updated and skipped records.
 */
function handleFinalizeRound(data) {
  var format = resolveLeagueFormat(leagueSelectorFrom(data));
  if (format === LEAGUE_FORMAT_DOUBLES) {
    return respond('error', 'Tag operations are not available for the doubles league.');
  }

  var leagueDate = data.league_date;

  if (!leagueDate || !/^\d{4}-\d{2}-\d{2}$/.test(leagueDate)) {
    return respond('error', 'Invalid or missing league_date.');
  }

  var tabName = 'Week ' + leagueDate;
  var spreadsheet = resolveSpreadsheet(leagueSelectorFrom(data));
  var weeklySheet = spreadsheet.getSheetByName(tabName);

  if (!weeklySheet) {
    return respond('error', 'Weekly tab not found: ' + tabName + '.');
  }

  var clubSheet = spreadsheet.getSheetByName('ClubMembers');
  if (!clubSheet) {
    return respond('error', 'ClubMembers tab not found.');
  }

  // Read weekly sheet
  var weeklyData = weeklySheet.getDataRange().getValues();
  var wHeaders = weeklyData[0];

  var wMember = wHeaders.indexOf('member_number');
  var wName = wHeaders.indexOf('player_name_snapshot');
  var wOutTag = wHeaders.indexOf('out_tag');
  var wInTag = wHeaders.indexOf('in_tag');

  // Read ClubMembers sheet
  var clubData = clubSheet.getDataRange().getValues();
  var cHeaders = clubData[0];

  var cMemberCol = cHeaders.indexOf('member_number');
  var cNameCol = cHeaders.indexOf('name');
  var cCurrentTagCol = cHeaders.indexOf('current_tag');
  var cActiveCol = cHeaders.indexOf('is_active');

  // Build ClubMembers index: member_number -> { row_index, name, is_active }
  var clubByNumber = {};
  for (var j = 1; j < clubData.length; j++) {
    var crow = clubData[j];
    var memberNum = crow[cMemberCol];
    if (memberNum === '' || memberNum === null || memberNum === undefined) continue;
    clubByNumber[memberNum] = {
      row_index: j,
      name: crow[cNameCol] || '',
      is_active: crow[cActiveCol]
    };
  }

  // Process each weekly player row
  var updated = [];
  var skippedNoOutTag = [];
  var skippedNoClubMember = [];

  for (var i = 1; i < weeklyData.length; i++) {
    var row = weeklyData[i];
    var memberNumber = row[wMember];
    if (memberNumber === '' || memberNumber === null || memberNumber === undefined) continue;

    var outTag = row[wOutTag];
    var outTagNum = parseInt(outTag, 10);

    // Skip players without a confirmed, nonblank out_tag
    if (outTag === '' || outTag === null || outTag === undefined || isNaN(outTagNum)) {
      skippedNoOutTag.push({
        member_number: memberNumber,
        player_name: row[wName] || '',
        in_tag: row[wInTag],
        out_tag_raw: outTag
      });
      continue;
    }

    // Find matching ClubMembers record
    var clubRecord = clubByNumber[memberNumber];
    if (!clubRecord) {
      skippedNoClubMember.push({
        member_number: memberNumber,
        player_name: row[wName] || '',
        out_tag: outTagNum
      });
      continue;
    }

    // Update ClubMembers.current_tag
    var oldTag = clubSheet.getRange(clubRecord.row_index + 1, cCurrentTagCol + 1).getValue();
    clubSheet.getRange(clubRecord.row_index + 1, cCurrentTagCol + 1).setValue(outTagNum);

    updated.push({
      member_number: memberNumber,
      player_name: clubRecord.name,
      old_tag: oldTag,
      new_tag: outTagNum
    });
  }

  return respond('ok', 'Round finalized. ' + updated.length + ' ClubMembers records updated.', {
    league_date: leagueDate,
    tab_name: tabName,
    updated: updated,
    skipped_no_out_tag: skippedNoOutTag,
    skipped_no_club_member: skippedNoClubMember,
    summary: {
      updated_count: updated.length,
      skipped_no_out_tag_count: skippedNoOutTag.length,
      skipped_no_club_member_count: skippedNoClubMember.length
    }
  });
}

/**
 * Builds and returns a JSON response.
 */
function respond(status, message, extra) {
  const response = Object.assign({
    status: status,
    message: message,
    timestamp: new Date().toISOString()
  }, extra || {});

  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}
