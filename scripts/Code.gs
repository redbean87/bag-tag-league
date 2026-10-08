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

// Scoring methods are an independent axis from format: `format` says how a
// score is made up (singles/doubles), `scoring` says what is settled
// (tags/points). The capability flags (usesTags/usesPoints/hasPairs) derive
// from these two enums, never from a league id, so a future format x scoring
// league routes without touching the handlers that branch on them.
const SCORING_TAGS = 'tags';
const SCORING_POINTS = 'points';
const SCORING_METHODS = [SCORING_TAGS, SCORING_POINTS];

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

// Doubles ClubMembers headers: the tag-free singles columns plus the
// season_points cache column. Totals are always derived live from committed
// weeks; the column is a denormalized copy kept current on every points write
// (the UDisc import commit) so the ClubMembers tab itself holds the totals. A
// roster provisioned before the detag is upgraded in place by the drop-column
// migration.
const CLUB_MEMBER_HEADERS_DETAG = CLUB_MEMBER_HEADERS.filter(function(header) {
  return header !== 'current_tag';
});

const CLUB_MEMBER_HEADERS_DOUBLES = CLUB_MEMBER_HEADERS_DETAG.concat([
  'season_points'
]);

// Human-first weekly column groups. A human reading a week tab should see the
// identity, pair, score, and points/tag columns before the long tail of import
// and reference fields. Header names never change, so every reader that
// resolves a column by name keeps working after the reorder.
const WEEKLY_RECORD_NAME_HEADERS = [
  'member_number',
  'player_name_snapshot',
  'udisc_username_snapshot',
  'pdga_number_snapshot'
];

// Doubles pair linkage. Singles has no pair concept.
const WEEKLY_RECORD_PAIR_HEADERS = [
  'pair_key',
  'partner_member_number'
];

// Doubles team-placement columns. Singles has no team concept.
const WEEKLY_RECORD_TEAM_HEADERS = [
  'team_position',
  'team_position_raw'
];

const WEEKLY_RECORD_SCORE_HEADERS = [
  'score'
];

// Singles settles bags with tags, so the active tag columns are the singles
// points set. udisc_ending_tag is reference-only and stays in the tail.
const WEEKLY_RECORD_TAG_HEADERS = [
  'in_tag',
  'out_tag'
];

// Every tag column the weekly schema can carry. A points-scoring league drops
// all three through the gated detag migration; the singles tags league keeps
// in_tag/out_tag promoted (WEEKLY_RECORD_TAG_HEADERS) and udisc_ending_tag in
// the tail.
const WEEKLY_RECORD_DETAG_HEADERS = [
  'in_tag',
  'out_tag',
  'udisc_ending_tag'
];

// Doubles points columns. `weekly_points` is computed from the committed
// placement at import commit; `weekly_points_status` is a retired column kept
// only for schema compatibility.
const WEEKLY_RECORD_POINTS_HEADERS = [
  'weekly_points',
  'weekly_points_status'
];

// Legacy (pre-human-first) weekly column order, kept verbatim so the placed-
// sheet migration can recognize an un-migrated layout. This is also the pool
// the human-first constants draw from, which preserves the historical relative
// order of every column that is not promoted.
const WEEKLY_RECORD_HEADERS_LEGACY = [
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

// The tag-free weekly base for a points-scoring league: the singles legacy pool
// minus the three tag columns. The header builders and the column-order
// known-set check draw from this, so the 51-column doubles end-state derives
// from the format x scoring model rather than a hand-written list.
const WEEKLY_RECORD_HEADERS_LEGACY_DETAG = WEEKLY_RECORD_HEADERS_LEGACY.filter(function(header) {
  return WEEKLY_RECORD_DETAG_HEADERS.indexOf(header) === -1;
});

// The tags-carrying weekly pool for a pairs/points league, kept only so the
// drop migration and the topology check can recognize an un-migrated doubles
// sheet during the transition. New sheets use the tag-free pool below.
const WEEKLY_RECORD_HEADERS_LEGACY_DOUBLES_TAGGED = WEEKLY_RECORD_HEADERS_LEGACY.concat([
  'pair_key',
  'partner_member_number',
  'team_position',
  'team_position_raw',
  'weekly_points',
  'weekly_points_status'
]);

const WEEKLY_RECORD_HEADERS_LEGACY_DOUBLES = WEEKLY_RECORD_HEADERS_LEGACY_DETAG.concat([
  'pair_key',
  'partner_member_number',
  'team_position',
  'team_position_raw',
  'weekly_points',
  'weekly_points_status'
]);

/**
 * Reorders a column set so each human-first group leads, then every remaining
 * column follows in its original relative order. Columns are matched by name,
 * and a group member that is not present in the set is skipped, so the same
 * helper serves singles and doubles without forcing a shared schema.
 */
function orderWeeklyHeaders(columns, humanFirstGroups) {
  var ordered = [];
  function push(header) {
    if (columns.indexOf(header) !== -1 && ordered.indexOf(header) === -1) {
      ordered.push(header);
    }
  }
  for (var g = 0; g < humanFirstGroups.length; g++) {
    for (var h = 0; h < humanFirstGroups[g].length; h++) {
      push(humanFirstGroups[g][h]);
    }
  }
  for (var c = 0; c < columns.length; c++) {
    push(columns[c]);
  }
  return ordered;
}

// WeeklyPlayerRecords column headers, human-first (48 columns). Names, score,
// then the singles bag-tag columns lead; the remaining 41 keep their order.
const WEEKLY_RECORD_HEADERS = orderWeeklyHeaders(
  WEEKLY_RECORD_HEADERS_LEGACY,
  [WEEKLY_RECORD_NAME_HEADERS, WEEKLY_RECORD_SCORE_HEADERS, WEEKLY_RECORD_TAG_HEADERS]
);

// Doubles WeeklyPlayerRecords headers, human-first (51 columns). Names, pair
// linkage, score, and the points lifecycle lead, then the remaining tag-free
// columns in their historical order. The tag columns are gone from the
// doubles schema; a pre-detag sheet is recognized by
// WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED until the gated drop migration runs.
const WEEKLY_RECORD_HEADERS_DOUBLES = orderWeeklyHeaders(
  WEEKLY_RECORD_HEADERS_LEGACY_DOUBLES,
  [
    WEEKLY_RECORD_NAME_HEADERS,
    WEEKLY_RECORD_PAIR_HEADERS,
    WEEKLY_RECORD_SCORE_HEADERS,
    WEEKLY_RECORD_POINTS_HEADERS
  ]
);

// The pre-detag canonical doubles order (54 columns), recognized as
// "known-but-being-dropped" until the gated drop migration removes the tags.
const WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED = orderWeeklyHeaders(
  WEEKLY_RECORD_HEADERS_LEGACY_DOUBLES_TAGGED,
  [
    WEEKLY_RECORD_NAME_HEADERS,
    WEEKLY_RECORD_PAIR_HEADERS,
    WEEKLY_RECORD_SCORE_HEADERS,
    WEEKLY_RECORD_POINTS_HEADERS
  ]
);

// There is no points lifecycle. The UDisc import commit is the single points
// computation boundary and the only writer of `weekly_points`; totals are
// summed live from the committed values and mirrored into the ClubMembers
// `season_points` cache after each commit. The `weekly_points_status` column is
// kept in the header schema so existing spreadsheets migrate cleanly, but no
// code reads or writes a lifecycle status anymore.

// Decided doubles scoring rule: team placement 1st/2nd/3rd earns 2/1.5/1 and
// every other participant (including a blank/DNF placement) earns 0.5 showing
// up credit. Both partners receive the identical value; a solo receives the
// full value. Keeping the map as data makes the matrix easy to audit.
const DOUBLES_POINTS_BY_PLACE = {
  1: 2,
  2: 1.5,
  3: 1
};
const DOUBLES_POINTS_PARTICIPATION = 0.5;

// Batch-map scope sentinel for solo (keyless) rows. A solo never fabricates a
// pair_key; inside the commit batch it still needs a scope key so a solo row
// and a pair row claiming the same member conflict rather than double-write.
const DOUBLES_SOLO_SCOPE = '__solo__';

// League sheet base column headers (15 columns). The settings row values live
// in these columns; the two metadata enums below are appended after them.
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

// League metadata columns appended to every League sheet: the stored format
// and scoring string enums. The registry (LEAGUE_SPREADSHEETS) is the routing
// authority; the sheet records the same values as per-spreadsheet confirmation
// so drift is visible. Decided 2026-10-08: singles sheets extend to 17 columns,
// so both formats carry both metadata columns.
const LEAGUE_SHEET_METADATA_HEADERS = ['league_format', 'scoring'];

const LEAGUE_SHEET_HEADERS_EXTENDED = LEAGUE_SHEET_HEADERS.concat(LEAGUE_SHEET_METADATA_HEADERS);

// Kept name for callers written before singles carried metadata; the doubles
// schema and the extended singles schema are the same 17-column set now.
const LEAGUE_SHEET_HEADERS_DOUBLES = LEAGUE_SHEET_HEADERS_EXTENDED;

// ─── Spreadsheet routing ─────────────────────────────────────────────────────

// Opaque public league ids carried in QR URLs and request payloads. These are
// the only league selectors the client is expected to send; the server maps
// each one to an allow-listed spreadsheet below. They mirror the ids in
// src/shared/league-format.js.
const LEAGUE_ID_SINGLES = 'b-rads-league';
const LEAGUE_ID_DOUBLES = 'nightfliers-random-dubs';
const DEFAULT_LEAGUE_ID = LEAGUE_ID_SINGLES;

// Server-side allow-list and league table: opaque league id -> authorized
// spreadsheet id plus the deploy-time authoritative format and scoring. A
// client can only ever select one of these spreadsheets; a raw Google
// spreadsheet id is never accepted as storage authority. Routing derives the
// capability rules from this table, never from the league id directly.
const LEAGUE_SPREADSHEETS = [
  { id: LEAGUE_ID_SINGLES, format: LEAGUE_FORMAT_SINGLES, scoring: SCORING_TAGS, spreadsheetId: SPREADSHEET_ID },
  { id: LEAGUE_ID_DOUBLES, format: LEAGUE_FORMAT_DOUBLES, scoring: SCORING_POINTS, spreadsheetId: SPREADSHEET_ID_DOUBLES }
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
 * Normalizes a format value against the server allow-list. An unknown value is
 * never coerced silently: it resolves to the singles default and is logged so
 * a typo degrades loudly instead of silently mis-routing.
 */
function normalizeFormat(format) {
  if (LEAGUE_FORMATS.indexOf(format) !== -1) return format;
  if (format !== undefined && format !== null && format !== '') {
    Logger.log('Unknown league format "' + format + '"; defaulting to ' + LEAGUE_FORMAT_SINGLES + '.');
  }
  return LEAGUE_FORMAT_SINGLES;
}

/**
 * Normalizes a scoring value against the server allow-list. An unknown value
 * resolves to the tags default and is logged.
 */
function normalizeScoring(scoring) {
  if (SCORING_METHODS.indexOf(scoring) !== -1) return scoring;
  if (scoring !== undefined && scoring !== null && scoring !== '') {
    Logger.log('Unknown league scoring "' + scoring + '"; defaulting to ' + SCORING_TAGS + '.');
  }
  return SCORING_TAGS;
}

/**
 * Resolves the capability rules for a requested selector. The league table is
 * the deploy-time authority for both format and scoring. Capability flags are
 * the only thing handlers branch on, so a future format x scoring league needs
 * no handler change.
 */
function getLeagueRules(selector) {
  var record = leagueRecordById(resolveLeagueId(selector));
  var format = normalizeFormat(record ? record.format : null);
  var scoring = normalizeScoring(record ? record.scoring : null);
  return {
    format: format,
    scoring: scoring,
    usesTags: scoring === SCORING_TAGS,
    usesPoints: scoring === SCORING_POINTS,
    hasPairs: format === LEAGUE_FORMAT_DOUBLES
  };
}

/**
 * Resolves the league format for a requested selector through the league
 * table. Kept for callers that only need the format string.
 */
function resolveLeagueFormat(selector) {
  return getLeagueRules(selector).format;
}

/**
 * The deploy-time default scoring for a format when no league record is in
 * hand: singles settles tags, doubles settles points.
 */
function defaultScoringForFormat(format) {
  return normalizeFormat(format) === LEAGUE_FORMAT_DOUBLES ? SCORING_POINTS : SCORING_TAGS;
}

/**
 * Builds capability rules from a (format, scoring) pair. A blank or omitted
 * scoring falls back to that format's registry default, so the older
 * single-argument builder calls keep working through the migration.
 */
function rulesForEnums(format, scoring) {
  var resolvedFormat = normalizeFormat(format);
  var resolvedScoring = normalizeScoring(
    scoring === undefined || scoring === null || scoring === ''
      ? defaultScoringForFormat(resolvedFormat)
      : scoring
  );
  return {
    format: resolvedFormat,
    scoring: resolvedScoring,
    usesTags: resolvedScoring === SCORING_TAGS,
    usesPoints: resolvedScoring === SCORING_POINTS,
    hasPairs: resolvedFormat === LEAGUE_FORMAT_DOUBLES
  };
}

/**
 * Weekly record headers for a (format, scoring) pair. Columns derive from the
 * capability rules: pair/team columns for a pairs format and points columns
 * for a points-scoring league. The tag columns stay in the base pool until the
 * gated destructive drop flips that migration, so today's 48/54 schemas are
 * byte-identical.
 */
function getWeeklyRecordHeaders(format, scoring) {
  return orderWeeklyHeaders(
    weeklyRecordColumnPool(format, scoring),
    weeklyHumanFirstGroups(format, scoring)
  );
}

/**
 * Weekly column pool for a (format, scoring) pair, in historical relative
 * order. Shared by the header builder, the column-order plan's known-set check,
 * and the human-first reorder. A points-scoring league draws the tag-free base
 * so the doubles schema is 51 columns; the singles tags league keeps the tag
 * columns.
 */
function weeklyRecordColumnPool(format, scoring) {
  var rules = rulesForEnums(format, scoring);
  var base = rules.usesTags ? WEEKLY_RECORD_HEADERS_LEGACY : WEEKLY_RECORD_HEADERS_LEGACY_DETAG;
  var columns = base.slice();
  if (rules.hasPairs) {
    columns = columns.concat(WEEKLY_RECORD_PAIR_HEADERS, WEEKLY_RECORD_TEAM_HEADERS);
  }
  if (rules.usesPoints) {
    columns = columns.concat(WEEKLY_RECORD_POINTS_HEADERS);
  }
  return columns;
}

/**
 * League sheet headers for a (format, scoring) pair. Both formats carry both
 * metadata columns (see LEAGUE_SHEET_METADATA_HEADERS); the parameters are
 * accepted for signature symmetry with the other header builders.
 */
function getLeagueSheetHeaders(format, scoring) {
  return LEAGUE_SHEET_HEADERS_EXTENDED;
}

/**
 * ClubMembers headers for a (format, scoring) pair: the base roster columns
 * plus the season_points cache for a points-scoring league. A points league
 * draws the tag-free base (8 columns, no current_tag); a tags league keeps the
 * singles roster byte-identical.
 */
function getClubMemberHeaders(format, scoring) {
  var rules = rulesForEnums(format, scoring);
  var columns = (rules.usesTags ? CLUB_MEMBER_HEADERS : CLUB_MEMBER_HEADERS_DETAG).slice();
  if (rules.usesPoints) columns = columns.concat(['season_points']);
  return columns;
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
 * Ensures the League sheet exists for the given (format, scoring) pair and
 * records both metadata enums. Idempotent and non-destructive.
 *
 * This helper only ensures existence and metadata; it does not migrate the
 * legacy 12-column singles schema, so the existing singles handlers keep their
 * exact behavior. Migration is handled by handleCreateLeagueSheet.
 *
 * Returns { sheet, created }.
 */
function ensureLeagueSheetForFormat(spreadsheet, format, scoring) {
  var rules = rulesForEnums(format, scoring);
  var headers = getLeagueSheetHeaders(rules.format, rules.scoring);
  var existing = spreadsheet.getSheetByName('League');

  if (!existing) {
    var sheet = spreadsheet.insertSheet('League');
    sheet.appendRow(headers);

    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setFontWeight('bold');
    sheet.setFrozenRows(1);

    ensureLeagueMetadataValues(sheet, rules.format, rules.scoring);

    moveSheetToPosition(spreadsheet, 'League', 0);
    return { sheet: sheet, created: true };
  }

  ensureLeagueMetadataValues(existing, rules.format, rules.scoring);

  if (existing.getIndex() !== 1) {
    moveSheetToPosition(spreadsheet, 'League', 0);
  }

  return { sheet: existing, created: false };
}

/**
 * Ensures both League metadata columns exist and record the supplied enums.
 * Idempotent: an existing column is only rewritten with the same value.
 */
function ensureLeagueMetadataValues(sheet, format, scoring) {
  ensureLeagueFormatValue(sheet, format);
  ensureLeagueScoringValue(sheet, scoring);
}

/**
 * Migrates the legacy 12-column singles League sheet to the 15 base-column
 * schema (the metadata columns are added by ensureLeagueSheetForFormat).
 * Returns true when a migration happened. Only handleCreateLeagueSheet calls
 * this, matching the original singles behavior.
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
 * Ensures the League sheet's settings row records scoring. Adds the scoring
 * column when a pre-existing sheet lacks it. Idempotent and non-destructive.
 * Returns the 0-based column index of scoring.
 */
function ensureLeagueScoringValue(sheet, scoring) {
  var lastColumn = Math.max(sheet.getLastColumn(), 1);
  var headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var scoringCol = headers.indexOf('scoring');

  if (scoringCol === -1) {
    scoringCol = headers.length;
    sheet.getRange(1, scoringCol + 1).setValue('scoring');
    sheet.getRange(1, scoringCol + 1).setFontWeight('bold');
  }

  if (sheet.getLastRow() < 2) {
    var blankRow = new Array(scoringCol + 1).fill('');
    blankRow[scoringCol] = scoring;
    sheet.appendRow(blankRow);
  } else {
    sheet.getRange(2, scoringCol + 1).setValue(scoring);
  }

  return scoringCol;
}

/**
 * Ensures the doubles weekly template tab exists with the format's weekly
 * headers. The template is a non-dated sheet so it never appears as a league
 * week. Idempotent. Returns { sheet, created }.
 */
function ensureWeekTemplateSheet(spreadsheet, format, scoring) {
  var headers = getWeeklyRecordHeaders(format, scoring);
  var result = ensureCanonicalSheet(spreadsheet, WEEK_TEMPLATE_SHEET_NAME, headers);
  return { sheet: result.sheet, created: !result.alreadyExisted };
}

/**
 * Creates (or returns) a dated weekly tab for the doubles spreadsheet using
 * the doubles headers. Returns { sheet, created }.
 */
function ensureWeekSheet(spreadsheet, leagueDate, format, scoring) {
  if (!leagueDate || !/^\d{4}-\d{2}-\d{2}$/.test(leagueDate)) {
    throw new Error('leagueDate must be YYYY-MM-DD.');
  }

  var tabName = 'Week ' + leagueDate;
  var existing = spreadsheet.getSheetByName(tabName);
  if (existing) {
    return { sheet: existing, created: false };
  }

  var headers = getWeeklyRecordHeaders(format, scoring);
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
 * Values are copied by header name, not by position: the doubles roster no
 * longer carries `current_tag`, so a positional copy would shift every column
 * after pdga_number into the wrong field. `current_tag` is never copied and
 * `season_points` has no singles source, so both land blank.
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

  var doublesHeaders = getSheetHeaders(doublesSheet);
  var singlesHeaders = getSheetHeaders(singlesSheet);
  var memberCol = doublesHeaders.indexOf('member_number');
  var sourceMemberCol = singlesHeaders.indexOf('member_number');
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
    var memberNumber = sourceRow[sourceMemberCol];

    if (memberNumber === '' || memberNumber === null || memberNumber === undefined) {
      continue;
    }
    if (existing[memberNumber]) {
      skippedExisting++;
      continue;
    }

    var newRow = new Array(doublesHeaders.length).fill('');
    for (var c = 0; c < doublesHeaders.length; c++) {
      var header = doublesHeaders[c];
      // A points roster has no current_tag, and a legacy doubles roster that
      // still carries one must not receive it either. season_points is a
      // derived cache with no singles source.
      if (header === 'current_tag' || header === 'season_points') continue;
      var sourceIndex = singlesHeaders.indexOf(header);
      if (sourceIndex !== -1 && sourceIndex < sourceRow.length) {
        newRow[c] = sourceRow[sourceIndex];
      }
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
  var league = ensureLeagueSheetForFormat(doublesSpreadsheet, LEAGUE_FORMAT_DOUBLES, SCORING_POINTS);

  var club = ensureCanonicalSheet(
    doublesSpreadsheet,
    'ClubMembers',
    getClubMemberHeaders(LEAGUE_FORMAT_DOUBLES, SCORING_POINTS)
  );
  if (club.sheet.getIndex() !== 2) {
    moveSheetToPosition(doublesSpreadsheet, 'ClubMembers', 1);
  }

  var template = ensureWeekTemplateSheet(doublesSpreadsheet, LEAGUE_FORMAT_DOUBLES, SCORING_POINTS);

  organizeWeekSheetsChronologically(doublesSpreadsheet);
  removeDefaultBlankSheet(doublesSpreadsheet);

  var seed = singlesSpreadsheet
    ? seedRosterFromSingles(singlesSpreadsheet, doublesSpreadsheet)
    : { seeded: 0, seeded_member_numbers: [], skipped_existing: 0, error: 'No singles spreadsheet supplied.' };

  return {
    league: { created: league.created, league_format: LEAGUE_FORMAT_DOUBLES, scoring: SCORING_POINTS },
    club_members: { created: !club.alreadyExisted },
    week_template: { created: template.created },
    roster_seed: seed
  };
}

/**
 * Authoritative doubles provisioning-state check. Doubles are considered
 * provisioned only when every required artifact is present and the League
 * sheet records the registry's doubles league_format and scoring method:
 *   - ClubMembers sheet is present.
 *   - League sheet is present.
 *   - League sheet records league_format=doubles.
 *   - League sheet records scoring=points.
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
  var expected = getLeagueRules(LEAGUE_ID_DOUBLES);
  var leagueFormat = readLeagueFormat(league);
  var leagueFormatMatches = leagueFormat === expected.format;
  var leagueScoring = readLeagueScoring(league);
  var leagueScoringMatches = leagueScoring === expected.scoring;

  return {
    provisioned: !!(league && clubMembers && weekTemplate && leagueFormatMatches && leagueScoringMatches),
    league_present: !!league,
    club_members_present: !!clubMembers,
    week_template_present: !!weekTemplate,
    league_format: leagueFormat,
    league_format_matches: leagueFormatMatches,
    scoring: leagueScoring,
    scoring_matches: leagueScoringMatches
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
 * Reads the scoring stored on the League sheet, or null when absent.
 */
function readLeagueScoring(sheet) {
  if (!sheet || sheet.getLastRow() < 2) return null;
  var headers = getSheetHeaders(sheet);
  var scoringCol = headers.indexOf('scoring');
  if (scoringCol === -1) return null;
  var value = sheet.getRange(2, scoringCol + 1).getValue();
  return value === '' || value === null || value === undefined ? null : value;
}

/**
 * Whether a League header row matches the expected metadata schema for a
 * (format, scoring) pair. The current 17-column layout is required; the two
 * pre-migration layouts (bare 15-column singles, 16-column doubles) are also
 * accepted as "known but un-migrated" so the topology check does not fail on a
 * sheet the gated extension has not reached yet.
 */
function leagueHeadersMatch(headers, format, scoring) {
  var rules = rulesForEnums(format, scoring);
  if (arraysEqual(headers, getLeagueSheetHeaders(rules.format, rules.scoring))) return true;
  if (rules.format === LEAGUE_FORMAT_SINGLES && arraysEqual(headers, LEAGUE_SHEET_HEADERS)) return true;
  if (rules.format === LEAGUE_FORMAT_DOUBLES &&
      arraysEqual(headers, LEAGUE_SHEET_HEADERS.concat(['league_format']))) return true;
  return false;
}

/**
 * Whether a ClubMembers header row matches a (format, scoring) pair. A roster
 * provisioned before the detag may still carry the now-dropped current_tag
 * column, and a points roster may or may not yet carry season_points, so those
 * pre-migration layouts are accepted as "known but un-migrated" until the
 * gated drop runs. Totals are aggregated live and never read the cache.
 */
function clubMemberHeadersMatch(headers, format, scoring) {
  var rules = rulesForEnums(format, scoring);
  if (arraysEqual(headers, getClubMemberHeaders(rules.format, rules.scoring))) return true;
  if (arraysEqual(headers, CLUB_MEMBER_HEADERS)) return true;
  if (rules.usesPoints && arraysEqual(headers, CLUB_MEMBER_HEADERS.concat(['season_points']))) return true;
  return false;
}

/**
 * Whether a weekly header row matches a (format, scoring) pair. A points
 * league provisioned before the detag still carries the tag columns, so the
 * pre-detag canonical layout is accepted as "known but un-migrated" until the
 * gated drop runs.
 */
function weeklyHeadersMatch(headers, format, scoring) {
  var rules = rulesForEnums(format, scoring);
  if (arraysEqual(headers, getWeeklyRecordHeaders(rules.format, rules.scoring))) return true;
  if (!rules.usesTags && arraysEqual(headers, WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED)) return true;
  return false;
}

/**
 * Inspects a spreadsheet against the expected topology/headers for a
 * (format, scoring) pair. Returns a plain report object suitable for logging or
 * tests.
 */
function inspectSpreadsheetTopology(spreadsheet, format, scoring) {
  var rules = rulesForEnums(format, scoring);
  var league = spreadsheet.getSheetByName('League');
  var club = spreadsheet.getSheetByName('ClubMembers');
  var template = spreadsheet.getSheetByName(WEEK_TEMPLATE_SHEET_NAME);
  var leagueFormat = readLeagueFormat(league);
  var leagueScoring = readLeagueScoring(league);

  return {
    sheet_names: spreadsheet.getSheets().map(function(s) { return s.getName(); }),
    league: {
      present: !!league,
      headers_match: leagueHeadersMatch(getSheetHeaders(league), rules.format, rules.scoring),
      league_format: leagueFormat,
      league_format_matches: leagueFormat === rules.format,
      scoring: leagueScoring,
      scoring_matches: leagueScoring === rules.scoring
    },
    club_members: {
      present: !!club,
      headers_match: clubMemberHeadersMatch(getSheetHeaders(club), rules.format, rules.scoring)
    },
    week_template: {
      present: !!template,
      headers_match: weeklyHeadersMatch(getSheetHeaders(template), rules.format, rules.scoring)
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

// ─── Weekly column-order migration ───────────────────────────────────────────

// Script-property approval gate for the live migration. The captain sets
//
//   WEEKLY_COLUMN_ORDER_MIGRATION_APPROVAL = 'bag-column-order-c1'
//
// in the Apps Script project before running the apply entry point. Nothing in
// deployment, startup, tests, or ordinary sheet operations sets this property,
// so the migration cannot run unless a captain explicitly opts in.
var WEEKLY_COLUMN_ORDER_MIGRATION_APPROVAL_PROPERTY = 'WEEKLY_COLUMN_ORDER_MIGRATION_APPROVAL';
var WEEKLY_COLUMN_ORDER_MIGRATION_APPROVAL_TOKEN = 'bag-column-order-c1';

// Core columns every weekly PlayerRecords header row must carry. These never
// appear together on ClubMembers or League, so the migration can find weekly
// sheets by header name instead of by tab name.
var WEEKLY_RECORD_CORE_HEADERS = [
  'member_number',
  'player_name_snapshot',
  'score',
  'hole_1'
];

/**
 * Whether a header row describes a weekly PlayerRecords sheet.
 */
function isWeeklyRecordHeaderRow(headers) {
  if (!headers || headers.length === 0) return false;
  for (var i = 0; i < WEEKLY_RECORD_CORE_HEADERS.length; i++) {
    if (headers.indexOf(WEEKLY_RECORD_CORE_HEADERS[i]) === -1) return false;
  }
  return true;
}

/**
 * The full known weekly column set for a (format, scoring) pair. Used to flag a
 * sheet that carries a column the migration does not recognize. A points
 * league's tag columns are still accepted here as "known-but-being-dropped"
 * during the transition, so the human-first reorder dry run does not fail on
 * the very columns the gated drop migration is about to remove.
 */
function weeklyColumnsKnownForFormat(format, scoring) {
  var columns = weeklyRecordColumnPool(format, scoring).slice();
  for (var i = 0; i < WEEKLY_RECORD_DETAG_HEADERS.length; i++) {
    if (columns.indexOf(WEEKLY_RECORD_DETAG_HEADERS[i]) === -1) {
      columns.push(WEEKLY_RECORD_DETAG_HEADERS[i]);
    }
  }
  return columns;
}

/**
 * Human-first groups for a (format, scoring) pair, in promotion order. Pair and
 * points groups follow the capabilities, so a future format x scoring league
 * promotes the columns it actually carries.
 */
function weeklyHumanFirstGroups(format, scoring) {
  var rules = rulesForEnums(format, scoring);
  var groups = [WEEKLY_RECORD_NAME_HEADERS];
  if (rules.hasPairs) groups.push(WEEKLY_RECORD_PAIR_HEADERS);
  groups.push(WEEKLY_RECORD_SCORE_HEADERS);
  if (rules.usesPoints) groups.push(WEEKLY_RECORD_POINTS_HEADERS);
  if (rules.usesTags) groups.push(WEEKLY_RECORD_TAG_HEADERS);
  return groups;
}

/**
 * Whether the live migration has been explicitly authorized by the captain.
 * A missing or mismatched Script Property means "not authorized".
 */
function isWeeklyColumnOrderMigrationAuthorized() {
  try {
    var value = PropertiesService.getScriptProperties()
      .getProperty(WEEKLY_COLUMN_ORDER_MIGRATION_APPROVAL_PROPERTY);
    return value === WEEKLY_COLUMN_ORDER_MIGRATION_APPROVAL_TOKEN;
  } catch (e) {
    return false;
  }
}

/**
 * Plans a human-first reorder of one weekly header row. Pure: only reads the
 * supplied header array and never touches a sheet.
 *
 * Columns are always matched by name. The plan is a permutation of the
 * existing columns, so no column is added or dropped and every value/formula
 * moves with its column. Returns:
 *   { status: 'already-canonical', headers, target_headers, unknown_headers }
 *   { status: 'reorder', headers, target_headers, permutation, unknown_headers }
 *   { status: 'error', error }
 *
 * Ambiguous layouts fail instead of guessing: a blank or duplicate header, a
 * weekly core column that is missing, or a column outside the format's known
 * schema all return an error so the captain can inspect the sheet first.
 */
function planWeeklyColumnReorder(headers, format, scoring) {
  if (!headers || headers.length === 0) {
    return { status: 'error', error: 'Weekly header row is empty.' };
  }

  var seen = {};
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];
    if (header === '' || header === null || header === undefined) {
      return { status: 'error', error: 'Weekly header row has a blank column at position ' + (i + 1) + '.' };
    }
    if (Object.prototype.hasOwnProperty.call(seen, header)) {
      return { status: 'error', error: 'Weekly header row has a duplicate column: ' + header + '.' };
    }
    seen[header] = true;
  }

  var missing = [];
  for (var c = 0; c < WEEKLY_RECORD_CORE_HEADERS.length; c++) {
    if (headers.indexOf(WEEKLY_RECORD_CORE_HEADERS[c]) === -1) {
      missing.push(WEEKLY_RECORD_CORE_HEADERS[c]);
    }
  }
  if (missing.length > 0) {
    return { status: 'error', error: 'Weekly header row is missing required columns: ' + missing.join(', ') + '.' };
  }

  var known = weeklyColumnsKnownForFormat(format, scoring);
  var unknown = headers.filter(function(h) { return known.indexOf(h) === -1; });
  if (unknown.length > 0) {
    return {
      status: 'error',
      error: 'Weekly header row has unrecognized columns: ' + unknown.join(', ') + '.'
    };
  }

  var target = orderWeeklyHeaders(headers, weeklyHumanFirstGroups(format, scoring));
  if (arraysEqual(headers, target)) {
    return {
      status: 'already-canonical',
      headers: headers.slice(),
      target_headers: target,
      unknown_headers: []
    };
  }

  var permutation = [];
  for (var t = 0; t < target.length; t++) {
    permutation.push(headers.indexOf(target[t]));
  }

  return {
    status: 'reorder',
    headers: headers.slice(),
    target_headers: target,
    permutation: permutation,
    unknown_headers: []
  };
}

/**
 * Writes a reorder plan onto a sheet, preserving every cell value and formula.
 * Reads formulas alongside values so a formula column survives the move. Only
 * called by migrateWeeklyColumnOrder after the authorization gate.
 */
function applyWeeklyColumnReorder(sheet, plan) {
  if (plan.status === 'already-canonical') {
    return { status: 'already-canonical', sheet_name: sheet.getName(), data_rows: 0 };
  }
  if (plan.status !== 'reorder') {
    throw new Error(plan.error || 'Invalid weekly column reorder plan.');
  }

  var lastRow = sheet.getLastRow();
  var lastColumn = sheet.getLastColumn();
  if (lastRow < 1) {
    return { status: 'already-canonical', sheet_name: sheet.getName(), data_rows: 0 };
  }

  var range = sheet.getRange(1, 1, lastRow, lastColumn);
  var values = range.getValues();
  var formulas = typeof range.getFormulas === 'function' ? range.getFormulas() : [];

  var reordered = [];
  var reorderedFormulas = [];
  for (var r = 0; r < values.length; r++) {
    var row = values[r];
    var rowFormulas = formulas.length > r ? formulas[r] : [];
    var out = [];
    var outFormulas = [];
    for (var c = 0; c < plan.permutation.length; c++) {
      var source = plan.permutation[c];
      out.push(row[source]);
      outFormulas.push(rowFormulas.length > source ? rowFormulas[source] : '');
    }
    reordered.push(out);
    reorderedFormulas.push(outFormulas);
  }

  sheet.clear();
  sheet.getRange(1, 1, reordered.length, plan.target_headers.length).setValues(reordered);
  // setValues writes a formula cell's computed value; restore the formula text
  // itself for every formula cell so the column move is lossless.
  for (var fr = 0; fr < reorderedFormulas.length; fr++) {
    for (var fc = 0; fc < reorderedFormulas[fr].length; fc++) {
      var formula = reorderedFormulas[fr][fc];
      if (formula !== '' && formula !== null && formula !== undefined) {
        sheet.getRange(fr + 1, fc + 1).setFormula(formula);
      }
    }
  }
  sheet.getRange(1, 1, 1, plan.target_headers.length).setFontWeight('bold');
  sheet.setFrozenRows(1);

  return {
    status: 'reordered',
    sheet_name: sheet.getName(),
    data_rows: reordered.length - 1,
    columns: plan.target_headers.length
  };
}

/**
 * Migrates every weekly PlayerRecords sheet in a spreadsheet to the human-first
 * order. Weekly sheets are discovered by header name, so dated Week tabs and
 * the Week template are covered without a name hard-list.
 *
 * Dry-run by default: with `apply: false` it writes nothing and returns the
 * planned order per sheet. With `apply: true` it refuses unless the captain has
 * set the approval Script Property, then reorders every sheet. A sheet that is
 * already canonical is a no-op, and an ambiguous layout fails before any other
 * sheet in the run is written.
 *
 * Returns { applied, authorized, results } or { applied: false, error }.
 */
function migrateWeeklyColumnOrder(spreadsheet, format, options) {
  options = options || {};
  var apply = options.apply === true;
  var scoring = options.scoring;
  var sheets = spreadsheet.getSheets();
  var plans = [];
  var results = [];

  if (apply && !isWeeklyColumnOrderMigrationAuthorized()) {
    return {
      applied: false,
      authorized: false,
      error: 'Weekly column-order migration is not authorized. Set the ' +
        WEEKLY_COLUMN_ORDER_MIGRATION_APPROVAL_PROPERTY + ' Script Property to authorize it.',
      results: []
    };
  }

  var scanError = null;
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var headers = getSheetHeaders(sheet);
    if (!isWeeklyRecordHeaderRow(headers)) continue;

    var plan = planWeeklyColumnReorder(headers, format, scoring);
    if (plan.status === 'error') {
      scanError = { sheet_name: sheet.getName(), error: plan.error };
      break;
    }
    plans.push({ sheet: sheet, plan: plan });
  }

  if (scanError) {
    return { applied: false, authorized: true, error: scanError.error, failed_sheet: scanError.sheet_name, results: [] };
  }

  for (var p = 0; p < plans.length; p++) {
    var entry = plans[p];
    if (entry.plan.status === 'already-canonical') {
      results.push({ sheet_name: entry.sheet.getName(), status: 'already-canonical' });
      continue;
    }
    if (!apply) {
      results.push({
        sheet_name: entry.sheet.getName(),
        status: 'would-reorder',
        from: entry.plan.headers,
        to: entry.plan.target_headers
      });
      continue;
    }
    var applied = applyWeeklyColumnReorder(entry.sheet, entry.plan);
    results.push({
      sheet_name: entry.sheet.getName(),
      status: 'reordered',
      from: entry.plan.headers,
      to: entry.plan.target_headers,
      data_rows: applied.data_rows,
      columns: applied.columns
    });
  }

  return { applied: apply, authorized: true, results: results };
}

/**
 * Admin/operator handler: dry-run or apply the weekly column-order migration.
 * Always defaults to a dry run that writes nothing. Applying is refused unless
 * the captain approval Script Property is present, so this cannot run from a
 * deploy, page load, or ordinary sheet operation.
 *
 * Inputs: league/spreadsheetId selector, apply (boolean, default false).
 */
function handleMigrateWeeklyColumnOrder(data) {
  data = data || {};
  var selector = leagueSelectorFrom(data);
  var rules = getLeagueRules(selector);
  var format = rules.format;
  var apply = data.apply === true || data.apply === 'true';
  var spreadsheet = resolveSpreadsheet(selector);

  var report = migrateWeeklyColumnOrder(spreadsheet, rules.format, { apply: apply, scoring: rules.scoring });
  if (report.error) {
    return respond('error', report.error, {
      format: format,
      scoring: rules.scoring,
      applied: false,
      authorized: report.authorized === true,
      failed_sheet: report.failed_sheet || null
    });
  }

  var changed = report.results.filter(function(r) {
    return r.status === 'reordered' || r.status === 'would-reorder';
  }).length;
  var message = apply
    ? 'Weekly column-order migration applied to ' + changed + ' sheet(s).'
    : 'Weekly column-order migration dry run: ' + changed + ' sheet(s) would change. No writes were made.';

  return respond('ok', message, {
    format: format,
    scoring: rules.scoring,
    applied: apply,
    authorized: report.authorized === true,
    sheets_changed: changed,
    results: report.results
  });
}

// ─── End weekly column-order migration ──────────────────────────────────────

// ─── Detag column-drop migration ────────────────────────────────────────────

// The destructive detag drop has no script-property interlock. The safety
// model is the explicit operator go plus the preview: run the dry run first and
// inspect exactly which columns will be removed before applying.

/**
 * The weekly tag columns a (format, scoring) pair no longer uses. A
 * tag-scoring league returns an empty list, so this migration can never remove
 * tag data from a league that still settles tags.
 */
function detagDropHeadersForWeekly(format, scoring) {
  return rulesForEnums(format, scoring).usesTags ? [] : WEEKLY_RECORD_DETAG_HEADERS.slice();
}

/**
 * The ClubMembers tag columns a (format, scoring) pair no longer uses. A
 * tag-scoring league keeps current_tag.
 */
function detagDropHeadersForClubMembers(format, scoring) {
  return rulesForEnums(format, scoring).usesTags ? [] : ['current_tag'];
}

/**
 * Plans the removal of the given tag columns from one header row. Pure: only
 * reads the supplied header array and never touches a sheet. Returns:
 *   { status: 'no-drop', headers, target_headers, drop_headers }
 *   { status: 'drop', headers, target_headers, drop_headers }
 *   { status: 'error', error }
 *
 * Ambiguous layouts fail instead of guessing: a blank or duplicate header
 * returns an error so the captain can inspect the sheet first.
 */
function planTagColumnDrops(headers, dropHeaders) {
  if (!headers || headers.length === 0) {
    return { status: 'error', error: 'Header row is empty.' };
  }

  var seen = {};
  for (var i = 0; i < headers.length; i++) {
    var header = headers[i];
    if (header === '' || header === null || header === undefined) {
      return { status: 'error', error: 'Header row has a blank column at position ' + (i + 1) + '.' };
    }
    if (Object.prototype.hasOwnProperty.call(seen, header)) {
      return { status: 'error', error: 'Header row has a duplicate column: ' + header + '.' };
    }
    seen[header] = true;
  }

  var drop = [];
  for (var d = 0; d < dropHeaders.length; d++) {
    if (headers.indexOf(dropHeaders[d]) !== -1) drop.push(dropHeaders[d]);
  }

  if (drop.length === 0) {
    return {
      status: 'no-drop',
      headers: headers.slice(),
      target_headers: headers.slice(),
      drop_headers: []
    };
  }

  var target = headers.filter(function(header) {
    return drop.indexOf(header) === -1;
  });

  return {
    status: 'drop',
    headers: headers.slice(),
    target_headers: target,
    drop_headers: drop
  };
}

/**
 * Deletes the planned tag columns from a sheet. Deletes from the highest
 * position to the lowest so earlier indices stay valid. Only called by
 * migrateDetagColumnDrops after the plan is confirmed.
 */
function applyTagColumnDrops(sheet, plan) {
  if (plan.status === 'no-drop') {
    return { status: 'no-drop', sheet_name: sheet.getName(), dropped_columns: [] };
  }
  if (plan.status !== 'drop') {
    throw new Error(plan.error || 'Invalid tag column-drop plan.');
  }

  var positions = plan.drop_headers.map(function(header) {
    return plan.headers.indexOf(header);
  }).sort(function(a, b) {
    return b - a;
  });

  for (var i = 0; i < positions.length; i++) {
    sheet.deleteColumn(positions[i] + 1);
  }

  var remaining = getSheetHeaders(sheet);
  if (remaining.length > 0) {
    sheet.getRange(1, 1, 1, remaining.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }

  return {
    status: 'dropped',
    sheet_name: sheet.getName(),
    dropped_columns: plan.drop_headers.slice(),
    columns: remaining.length
  };
}

/**
 * Migrates a spreadsheet to the tag-free schema for its (format, scoring)
 * pair. Weekly sheets are discovered by header name (so dated Week tabs and
 * the Week template are covered without a name hard-list) and ClubMembers is
 * found by name; a tag-scoring league drops nothing.
 *
 * Dry-run by default: with `apply: false` it writes nothing and returns the
 * planned drops per sheet. With `apply: true` it deletes every planned tag
 * column; the preview and its review are the safety check, and there is no
 * script-property interlock. A sheet with nothing to drop is a no-op, and an
 * ambiguous layout fails before any other sheet in the run is written.
 *
 * Returns { applied, results } or { applied: false, error }.
 */
function migrateDetagColumnDrops(spreadsheet, format, options) {
  options = options || {};
  var apply = options.apply === true;
  var rules = rulesForEnums(format, options.scoring);
  var weeklyDrop = detagDropHeadersForWeekly(rules.format, rules.scoring);
  var clubDrop = detagDropHeadersForClubMembers(rules.format, rules.scoring);
  var sheets = spreadsheet.getSheets();
  var plans = [];
  var results = [];

  var scanError = null;
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var headers = getSheetHeaders(sheet);
    if (!isWeeklyRecordHeaderRow(headers)) continue;

    var plan = planTagColumnDrops(headers, weeklyDrop);
    if (plan.status === 'error') {
      scanError = { sheet_name: sheet.getName(), error: plan.error };
      break;
    }
    plans.push({ sheet: sheet, plan: plan, kind: 'weekly' });
  }

  if (!scanError) {
    var club = spreadsheet.getSheetByName('ClubMembers');
    if (club) {
      var clubHeaders = getSheetHeaders(club);
      if (clubHeaders.indexOf('member_number') !== -1) {
        var clubPlan = planTagColumnDrops(clubHeaders, clubDrop);
        if (clubPlan.status === 'error') {
          scanError = { sheet_name: club.getName(), error: clubPlan.error };
        } else {
          plans.push({ sheet: club, plan: clubPlan, kind: 'club_members' });
        }
      }
    }
  }

  if (scanError) {
    return { applied: false, error: scanError.error, failed_sheet: scanError.sheet_name, results: [] };
  }

  for (var p = 0; p < plans.length; p++) {
    var entry = plans[p];
    if (entry.plan.status === 'no-drop') {
      results.push({ sheet_name: entry.sheet.getName(), kind: entry.kind, status: 'no-drop' });
      continue;
    }
    if (!apply) {
      results.push({
        sheet_name: entry.sheet.getName(),
        kind: entry.kind,
        status: 'would-drop',
        drop_headers: entry.plan.drop_headers.slice(),
        from: entry.plan.headers,
        to: entry.plan.target_headers
      });
      continue;
    }
    var applied = applyTagColumnDrops(entry.sheet, entry.plan);
    results.push({
      sheet_name: entry.sheet.getName(),
      kind: entry.kind,
      status: 'dropped',
      drop_headers: applied.dropped_columns,
      to: entry.plan.target_headers,
      columns: applied.columns
    });
  }

  return { applied: apply, results: results };
}

/**
 * Admin/operator handler: dry-run or apply the detag column-drop migration.
 * Always defaults to a dry run that writes nothing; run the dry run and review
 * the planned columns before applying. A tag-scoring league is a no-op (its
 * drop list is empty), so no tag data is ever removed there.
 *
 * Inputs: league/spreadsheetId selector, apply (boolean, default false).
 */
function handleMigrateDetagColumnDrops(data) {
  data = data || {};
  var selector = leagueSelectorFrom(data);
  var rules = getLeagueRules(selector);
  var apply = data.apply === true || data.apply === 'true';
  var spreadsheet = resolveSpreadsheet(selector);

  var report = migrateDetagColumnDrops(spreadsheet, rules.format, { apply: apply, scoring: rules.scoring });
  if (report.error) {
    return respond('error', report.error, {
      format: rules.format,
      scoring: rules.scoring,
      applied: false,
      failed_sheet: report.failed_sheet || null
    });
  }

  var changed = report.results.filter(function(r) {
    return r.status === 'dropped' || r.status === 'would-drop';
  }).length;
  var message = apply
    ? 'Detag column-drop migration applied to ' + changed + ' sheet(s).'
    : 'Detag column-drop migration dry run: ' + changed + ' sheet(s) would change. No writes were made.';

  return respond('ok', message, {
    format: rules.format,
    scoring: rules.scoring,
    applied: apply,
    sheets_changed: changed,
    results: report.results
  });
}

// ─── End detag column-drop migration ────────────────────────────────────────

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
    if (data.action === 'listClubMembers') {
      return handleListClubMembers(data);
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
    if (data.action === 'commitUdiscImportDoubles') {
      return handleCommitUdiscImportDoubles(data);
    }
    if (data.action === 'calculatePoints') {
      return handleCalculatePoints(data);
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
    if (data.action === 'migrateWeeklyColumnOrder') {
      return handleMigrateWeeklyColumnOrder(data);
    }
    if (data.action === 'migrateDetagColumnDrops') {
      return handleMigrateDetagColumnDrops(data);
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
  const rules = getLeagueRules(leagueSelectorFrom(data));

  // Ensure League exists first — prerequisite for canonical order
  ensureLeagueSheetForFormat(spreadsheet, rules.format, rules.scoring);

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
  const clubHeaders = getClubMemberHeaders(rules.format, rules.scoring);
  sheet.appendRow(clubHeaders);

  const headerRange = sheet.getRange(1, 1, 1, clubHeaders.length);
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
    columns: clubHeaders.length
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
  const rules = getLeagueRules(leagueSelectorFrom(data));
  const weekHeaders = getWeeklyRecordHeaders(rules.format, rules.scoring);

  // Ensure canonical prerequisite sheets exist in correct order
  ensureLeagueSheetForFormat(spreadsheet, rules.format, rules.scoring);

  ensureCanonicalSheet(spreadsheet, 'ClubMembers', getClubMemberHeaders(rules.format, rules.scoring));
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
  const rules = getLeagueRules(leagueSelectorFrom(data));

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

  // Points members carry their season total (the live sum of all committed
  // weekly points) in every search result; tag members keep a tag-only payload.
  const seasonTotals = rules.usesPoints ? sumSeasonPointsByMember(spreadsheet) : null;

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
      const result = {
        member_number: row[memberNumberCol],
        name: name,
        udisc_username: udisc,
        pdga_number: pdga
      };
      // Tag data belongs to tag-scoring leagues; a points-scoring search
      // response stays tag-free and carries season_points instead.
      if (rules.usesTags) {
        result.current_tag = row[currentTagCol];
      } else {
        // Missing totals render as 0 rather than null/NaN so the member
        // listing never shows an empty calculation.
        result.season_points = seasonTotals[row[memberNumberCol]] !== undefined
          ? seasonTotals[row[memberNumberCol]]
          : 0;
      }
      results.push(result);
    }
  }

  return respond('ok', 'Search complete.', { results: results, league: leagueId });
}

/**
 * Lists club members for the selected league.
 *
 * Doubles member records include `season_points`, the live sum of that
 * member's committed weekly points. The live sum is the source of truth; the
 * stored ClubMembers column is a mirror of it. A member with no committed
 * weeks reports 0 and is never omitted. Singles records omit season_points
 * entirely so the singles payload and views stay exactly as they were.
 *
 * Inputs: league (optional routing selector)
 */
function handleListClubMembers(data) {
  const leagueId = resolveLeagueId(leagueSelectorFrom(data));
  const rules = getLeagueRules(leagueSelectorFrom(data));
  const format = rules.format;
  const spreadsheet = resolveSpreadsheet(leagueSelectorFrom(data));
  const playersSheet = spreadsheet.getSheetByName('ClubMembers');

  if (!playersSheet) {
    return respond('ok', 'No members found.', { league: leagueId, format: format, members: [] });
  }

  const playersData = playersSheet.getDataRange().getValues();
  const playersHeaders = playersData[0] || [];

  const memberNumberCol = playersHeaders.indexOf('member_number');
  const nameCol = playersHeaders.indexOf('name');
  const udiscCol = playersHeaders.indexOf('udisc_username');
  const pdgaCol = playersHeaders.indexOf('pdga_number');
  const currentTagCol = playersHeaders.indexOf('current_tag');
  const isActiveCol = playersHeaders.indexOf('is_active');

  // One aggregation shared by every points member listing; it sums the
  // points persisted at import commit, so a committed week always counts.
  const seasonTotals = rules.usesPoints ? sumSeasonPointsByMember(spreadsheet) : null;

  const members = [];
  for (let i = 1; i < playersData.length; i++) {
    const row = playersData[i];
    const memberNumber = row[memberNumberCol];
    if (memberNumber === '' || memberNumber === null || memberNumber === undefined) continue;

    const isActive = row[isActiveCol] === true || row[isActiveCol] === 'TRUE';
    const member = {
      member_number: memberNumber,
      name: (row[nameCol] || '').toString(),
      udisc_username: (row[udiscCol] || '').toString(),
      pdga_number: (row[pdgaCol] || '').toString(),
      is_active: isActive
    };

    if (rules.usesPoints) {
      member.season_points = seasonTotals[memberNumber] !== undefined
        ? seasonTotals[memberNumber]
        : 0;
    } else {
      member.current_tag = row[currentTagCol];
    }

    members.push(member);
  }

  return respond('ok', 'Members loaded.', { league: leagueId, format: format, members: members });
}

/**
 * Submits a player check-in. Handles registration/check-in in a single flow:
 * 1. Finds or creates the club member record
 * 2. Finds the most recent weekly tab
 * 3. Checks for duplicate check-in
 * 4. Writes the weekly check-in record with identity snapshots
 *
 * Inputs: name (required), udisc_username (optional), pdga_number (optional),
 *         in_tag (singles only; required positive integer), paid (boolean),
 *         ctp (boolean), ace_pot (boolean)
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

  const leagueId = resolveLeagueId(leagueSelectorFrom(data));
  const rules = getLeagueRules(leagueSelectorFrom(data));
  const format = rules.format;
  // Tag collection belongs to tag-scoring leagues. A points-scoring league
  // ignores any client-supplied tag and never requires, validates, or
  // persists one.
  const usesTags = rules.usesTags;

  let inTagNum = null;
  if (usesTags) {
    if (in_tag === undefined || in_tag === null || in_tag === '') {
      return respond('error', 'in_tag is required.');
    }

    inTagNum = parseInt(in_tag, 10);
    if (isNaN(inTagNum) || inTagNum < 1) {
      return respond('error', 'Please enter a valid tag number (1 or higher).');
    }
  }

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
    if (usesTags && playerCurrentTagCol !== -1) playersSheet.getRange(memberRowIndex + 1, playerCurrentTagCol + 1).setValue(inTagNum);
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

        // Build the row against the sheet's own header so a roster that
        // carries the doubles season_points cache column stays aligned.
        var newPlayer = new Array(playersHeaders.length).fill('');
        newPlayer[playersHeaders.indexOf('member_number')] = newMemberNumber;
        newPlayer[playersHeaders.indexOf('name')] = trimmedName;
        newPlayer[playersHeaders.indexOf('udisc_username')] = trimmedUdisc;
        newPlayer[playersHeaders.indexOf('pdga_number')] = trimmedPdga;
        if (usesTags) newPlayer[playersHeaders.indexOf('current_tag')] = inTagNum;
        newPlayer[playersHeaders.indexOf('is_active')] = true;
        newPlayer[playersHeaders.indexOf('created_at')] = now;
        newPlayer[playersHeaders.indexOf('updated_at')] = now;

        playersSheet.appendRow(newPlayer);

        memberId = newMemberNumber;
        memberRow = newPlayer;
        isNewMember = true;
      } finally {
        lock.releaseLock();
      }
    }

    // Update ClubMembers.current_tag with the tag they are checking in with.
    // Tag-scoring leagues only.
    if (usesTags && !isNewMember) {
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

  const weeklyHeaders = getWeeklyRecordHeaders(rules.format, rules.scoring);
  const newRecord = new Array(weeklyHeaders.length).fill('');
  newRecord[weeklyHeaders.indexOf('member_number')] = memberId;
  newRecord[weeklyHeaders.indexOf('player_name_snapshot')] = memberRow[playerNameCol] || trimmedName;
  newRecord[weeklyHeaders.indexOf('udisc_username_snapshot')] = memberRow[playerUdiscCol] || trimmedUdisc;
  newRecord[weeklyHeaders.indexOf('pdga_number_snapshot')] = memberRow[playerPdgaCol] || trimmedPdga;
  if (usesTags) newRecord[weeklyHeaders.indexOf('in_tag')] = inTagNum;
  newRecord[weeklyHeaders.indexOf('checked_in')] = true;
  newRecord[weeklyHeaders.indexOf('signed_in_at')] = recordTimestamp;
  newRecord[weeklyHeaders.indexOf('paid')] = paid === true || paid === 'TRUE';
  newRecord[weeklyHeaders.indexOf('ctp')] = ctp === true || ctp === 'TRUE';
  newRecord[weeklyHeaders.indexOf('ace_pot')] = ace_pot === true || ace_pot === 'TRUE';
  newRecord[weeklyHeaders.indexOf('created_at')] = recordTimestamp;
  newRecord[weeklyHeaders.indexOf('updated_at')] = recordTimestamp;

  recordsSheet.appendRow(newRecord);

  // A tag-scoring league echoes the collected tag; a points-scoring league
  // returns a tag-free payload.
  const success = usesTags
    ? {
        member_number: memberId,
        player_name: trimmedName,
        in_tag: inTagNum,
        weekly_tab: mostRecentTabName,
        league: leagueId
      }
    : {
        member_number: memberId,
        player_name: trimmedName,
        weekly_tab: mostRecentTabName,
        league: leagueId
      };

  return respond('ok', 'Check-in successful.', success);
}

/**
 * Creates the League sheet if it does not already exist.
 * Initializes with headers and an empty row for future settings.
 * Idempotent: returns alreadyExisted=true if the sheet already exists.
 * Migrates existing 12-column sheets to the 15 base-column schema and records
 * both metadata enums.
 * Ensures League is at position 1 (first tab).
 */
function handleCreateLeagueSheet(data) {
  const spreadsheet = resolveSpreadsheet(leagueSelectorFrom(data));
  const rules = getLeagueRules(leagueSelectorFrom(data));

  let migrated = false;
  if (rules.format === LEAGUE_FORMAT_SINGLES) {
    migrated = migrateOldLeagueSheet(spreadsheet);
  }

  const result = ensureLeagueSheetForFormat(spreadsheet, rules.format, rules.scoring);
  removeDefaultBlankSheet(spreadsheet);

  if (migrated) {
    return respond('ok', 'League sheet migrated to new schema.', {
      alreadyExisted: true,
      migrated: true,
      columns: getLeagueSheetHeaders(rules.format, rules.scoring).length
    });
  }

  if (result.created) {
    return respond('ok', 'League sheet created successfully.', {
      alreadyExisted: false,
      columns: getLeagueSheetHeaders(rules.format, rules.scoring).length
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

  // Validate the two metadata enums against their allow-lists. They are
  // recorded by provisioning and the gated migration, never by this settings
  // form (the admin renders them read-only), so an unknown value is rejected
  // rather than silently coerced or written.
  const enumFields = { league_format: LEAGUE_FORMATS, scoring: SCORING_METHODS };
  for (const field of Object.keys(enumFields)) {
    const raw = settings[field];
    if (raw === '' || raw === null || raw === undefined) {
      continue;
    }
    if (enumFields[field].indexOf(raw) === -1) {
      return respond('error', 'Field "' + field + '" must be one of: ' + enumFields[field].join(', ') + '.');
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
  if (!getLeagueRules(leagueSelectorFrom(data)).usesTags) {
    return respond('error', 'Tag-based UDisc import preview is not available for this league\'s scoring method.');
  }

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

/**
 * Normalizes one doubles partner to a single canonical identity token for the
 * pair key. Username wins over display name, mirroring the import match chain
 * (weekly username -> ... -> name). The token is prefixed so a username that
 * happens to equal another partner's display name can never collide.
 *
 * Returns '' when the partner carries no usable identity.
 */
function normalizeDoublesIdentityToken(partner) {
  if (!partner) return '';
  var username = (partner.username || '').toString().trim().toLowerCase();
  if (username) return 'u:' + username;
  var name = (partner.name || '').toString().trim().toLowerCase();
  if (name) return 'n:' + name;
  return '';
}

/**
 * Computes the ratified doubles pair key: a date-scoped, order-independent key
 * built from the two partners' canonical identity tokens.
 *
 *   dubs:<league_date>:<tokenA>+<tokenB>   (tokens sorted ascending)
 *
 * Properties:
 *  - deterministic and symmetric: (A, B) and (B, A) produce the same key;
 *  - week-scoped: the same two humans pairing another week is a new pair;
 *  - solo/keyless: a solo row (or a row whose partner identities are unusable,
 *    duplicated, or not exactly two) returns null rather than fabricating a
 *    pair.
 */
function computeDoublesPairKey(parsed, leagueDate) {
  if (!parsed || parsed.is_solo) return null;
  var partners = parsed.partners || [];
  if (partners.length !== 2) return null;

  var a = normalizeDoublesIdentityToken(partners[0]);
  var b = normalizeDoublesIdentityToken(partners[1]);
  if (!a || !b) return null;
  if (a === b) return null; // duplicate identity — admin must resolve, never auto-keyed

  var tokens = [a, b].sort();
  return 'dubs:' + leagueDate + ':' + tokens.join('+');
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
  if (!getLeagueRules(leagueSelectorFrom(data)).hasPairs) {
    return respond('error', 'Pair-based UDisc import preview is not available for this league\'s format.');
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

// ─── Commit helpers shared by the singles and doubles import commit paths ───

/**
 * Builds the weekly identity indexes used to re-match imported rows at commit
 * time. Every lookup is server-side against a fresh sheet read; preview
 * payloads are never trusted.
 *
 * Rows are indexed by lowercased trimmed UDisc username, trimmed PDGA number,
 * and lowercased trimmed player name. `entries` keeps every row (with its
 * pair_key and member_number) so doubles can apply pair-scope restrictions and
 * detect member conflicts without a second read.
 */
function buildWeeklyMatchIndexes(weeklyData, headers) {
  var memberCol = headers.indexOf('member_number');
  var nameCol = headers.indexOf('player_name_snapshot');
  var udiscCol = headers.indexOf('udisc_username_snapshot');
  var pdgaCol = headers.indexOf('pdga_number_snapshot');
  var pairKeyCol = headers.indexOf('pair_key');

  var byUsername = {};
  var byPdga = {};
  var byName = {};
  var byMember = {};
  var entries = [];

  for (var i = 1; i < weeklyData.length; i++) {
    var row = weeklyData[i];
    var username = (row[udiscCol] || '').toString().trim().toLowerCase();
    var pdga = (row[pdgaCol] || '').toString().trim();
    var name = (row[nameCol] || '').toString().trim().toLowerCase();
    var pairKey = pairKeyCol === -1 ? '' : (row[pairKeyCol] || '').toString().trim();
    var memberNumber = row[memberCol];

    var entry = {
      row: row,
      index: i,
      pair_key: pairKey,
      member_number: memberNumber,
      username: username,
      pdga: pdga,
      name: name
    };
    entries.push(entry);

    if (username) byUsername[username] = entry;
    if (pdga) byPdga[pdga] = entry;
    if (name) {
      if (!byName[name]) byName[name] = [];
      byName[name].push(entry);
    }
    if (memberNumber !== undefined && memberNumber !== null && memberNumber !== '') {
      byMember[memberNumber] = entry;
    }
  }

  return {
    memberCol: memberCol,
    nameCol: nameCol,
    udiscCol: udiscCol,
    pdgaCol: pdgaCol,
    pairKeyCol: pairKeyCol,
    byUsername: byUsername,
    byPdga: byPdga,
    byName: byName,
    byMember: byMember,
    entries: entries
  };
}

/**
 * Builds the active ClubMembers indexes used to re-match imported identity
 * (username then PDGA, plus unique name) and to verify admin overrides.
 * Inactive members are excluded.
 */
function buildClubMatchIndexes(clubData, headers) {
  var memberCol = headers.indexOf('member_number');
  var nameCol = headers.indexOf('name');
  var udiscCol = headers.indexOf('udisc_username');
  var pdgaCol = headers.indexOf('pdga_number');
  var activeCol = headers.indexOf('is_active');

  var byUsername = {};
  var byPdga = {};
  var byName = {};
  var byMember = {};

  for (var j = 1; j < clubData.length; j++) {
    var row = clubData[j];
    var active = row[activeCol];
    if (active !== true && active !== 'TRUE') continue;

    var memberNumber = row[memberCol];
    var name = (row[nameCol] || '').toString();
    var username = (row[udiscCol] || '').toString().trim().toLowerCase();
    var pdga = (row[pdgaCol] || '').toString().trim();
    var lowerName = name.trim().toLowerCase();

    if (username) byUsername[username] = memberNumber;
    if (pdga) byPdga[pdga] = memberNumber;
    if (lowerName) {
      if (!byName[lowerName]) byName[lowerName] = [];
      byName[lowerName].push({
        member_number: memberNumber,
        name: name,
        udisc_username: row[udiscCol] || ''
      });
    }
    byMember[memberNumber] = {
      member_number: memberNumber,
      name: name,
      udisc_username: row[udiscCol] || ''
    };
  }

  return {
    memberCol: memberCol,
    nameCol: nameCol,
    udiscCol: udiscCol,
    pdgaCol: pdgaCol,
    activeCol: activeCol,
    byUsername: byUsername,
    byPdga: byPdga,
    byName: byName,
    byMember: byMember
  };
}

/**
 * Restricts the weekly indexes to the rows a doubles partner may match:
 * keyless (solo) rows plus rows already carrying this pair's key. Without the
 * restriction a partner's update could land on a row belonging to a different
 * imported pair and corrupt that pair's linkage.
 */
function scopeWeeklyIndexes(indexes, pairKey, isSolo) {
  var byUsername = {};
  var byPdga = {};
  var byName = {};
  var byMember = {};

  for (var i = 0; i < indexes.entries.length; i++) {
    var entry = indexes.entries[i];
    if (isSolo) {
      if (entry.pair_key) continue;
    } else {
      if (entry.pair_key && entry.pair_key !== pairKey) continue;
    }

    if (entry.username) byUsername[entry.username] = { row: entry.row, index: entry.index };
    if (entry.pdga) byPdga[entry.pdga] = { row: entry.row, index: entry.index };
    if (entry.name) {
      if (!byName[entry.name]) byName[entry.name] = [];
      byName[entry.name].push({ row: entry.row, index: entry.index });
    }
    byMember[entry.member_number] = entry;
  }

  return { byUsername: byUsername, byPdga: byPdga, byName: byName, byMember: byMember };
}

/**
 * Shapes the scoped weekly indexes plus the full club indexes into the object
 * `matchDoublesPartner` expects.
 */
function buildDoublesMatchIndexes(scoped, clubIndexes, weeklyIndexes) {
  return {
    wMemberCol: weeklyIndexes.memberCol,
    wNameCol: weeklyIndexes.nameCol,
    wUdiscCol: weeklyIndexes.udiscCol,
    weeklyByUsername: scoped.byUsername,
    weeklyByPdga: scoped.byPdga,
    weeklyByName: scoped.byName,
    clubByUsername: clubIndexes.byUsername,
    clubByPdga: clubIndexes.byPdga,
    clubByName: clubIndexes.byName,
    clubByMember: clubIndexes.byMember
  };
}

/** True when an existing weekly row belongs to this row's pair scope. */
function doublesSameScope(existingPairKey, pairKey, isSolo) {
  var key = (existingPairKey || '').toString().trim();
  if (isSolo) return key === '';
  var wanted = (pairKey || '').toString().trim();
  // A keyless row is an unassigned check-in (or a solo) and can be claimed by
  // any pair; two present keys must match exactly. This mirrors
  // scopeWeeklyIndexes and the ratified keyless-or-same-key scope rule.
  return wanted === '' || key === '' || key === wanted;
}

/**
 * Verifies an admin-supplied partner override. A claim is never trusted: the
 * member must exist and be active, and must not already hold a weekly row in a
 * different pair scope. Returns { ok, match, reason }.
 */
function verifyDoublesOverride(partner, matchIndexes, weeklyIndexes, pairKey, isSolo) {
  var memberNumber = parseInt(partner.requested_member_number, 10);
  if (isNaN(memberNumber)) return { ok: false, reason: 'invalid_override' };

  var member = matchIndexes.clubByMember[memberNumber];
  if (!member) return { ok: false, reason: 'invalid_override' };

  var existing = weeklyIndexes.byMember[memberNumber];
  if (existing && !doublesSameScope(existing.pair_key, pairKey, isSolo)) {
    return { ok: false, reason: 'member_conflict' };
  }

  var match = emptyDoublesMatch();
  match.status = 'matched';
  match.source = 'admin_override';
  match.confidence = 'high';
  match.member_number = memberNumber;
  match.matched_name = member.name || '';
  match.matched_username = member.udisc_username || '';
  match.club_member = true;
  return { ok: true, match: match };
}

/** Maps a resolved partner match onto a commit path. */
function doublesPartnerPath(match) {
  if (!match) return null;
  if (match.status === 'matched') {
    return (match.source || '').indexOf('weekly_') === 0 ? 'update' : 'existing_new_row';
  }
  if (match.status === 'new') return 'create';
  return null;
}

/**
 * Builds the UDisc import fields for a weekly row exactly as the singles
 * committer writes them (blank for absent optional values, booleans coerced).
 */
function buildCommitImportFields(udiscRow) {
  var row = udiscRow || {};
  function defined(value) {
    return value !== undefined ? value : '';
  }

  var fields = {
    udisc_name_import: (row.name || '').toString().trim(),
    udisc_username_import: (row.username || '').toString().trim(),
    udisc_pdga_number_import: (row.pdga_number || '').toString().trim(),
    score: defined(row.round_total_score),
    round_relative_score: defined(row.round_relative_score),
    round_rating: defined(row.round_rating),
    event_relative_score: defined(row.event_relative_score),
    event_total_score: defined(row.event_total_score),
    udisc_checked_in: row.checked_in === true || row.checked_in === 'TRUE',
    udisc_paid: row.paid === true || row.paid === 'TRUE',
    starting_hole: defined(row.starting_hole),
    start_time: defined(row.start_time),
    division: defined(row.division),
    udisc_position: defined(row.position),
    udisc_position_raw: defined(row.position_raw),
    udisc_ending_tag: defined(row.bag_tag_at_end)
  };

  for (var h = 1; h <= 18; h++) {
    fields['hole_' + h] = defined(row['hole_' + h]);
  }
  return fields;
}

/**
 * Builds the import fields for one doubles partner row. The shared team
 * scorecard columns come from the raw UDisc pair row, but the identity columns
 * are the partner's own name/username/PDGA (the raw row carries the pair name
 * and comma-joined usernames, not one partner's identity).
 *
 * The shared builder carries `udisc_ending_tag`; a points-scoring league
 * settles placement, not bag tags, so that key is dropped here. This is the
 * capability-gated form of the detag slice that stops the one remaining live
 * tag write to a doubles sheet. Existing stored values are never touched.
 */
function buildDoublesImportFields(udiscRow, partner, rules) {
  var fields = buildCommitImportFields(udiscRow);
  if (!rules || !rules.usesTags) delete fields.udisc_ending_tag;
  fields.udisc_name_import = (partner.name || '').toString().trim();
  fields.udisc_username_import = (partner.username || '').toString().trim();
  fields.udisc_pdga_number_import = (partner.pdga_number || '').toString().trim();
  return fields;
}

/** Writes a { header: value } map onto a row array by header index. */
function applyFieldsByName(target, headers, fields) {
  for (var key in fields) {
    var index = headers.indexOf(key);
    if (index !== -1) target[index] = fields[key];
  }
}

/**
 * Builds a full new weekly row (singles 48-column or doubles 54-column) with
 * the same fixed defaults the singles committer uses. `pairFields` is applied
 * last so doubles-only columns ride the same write.
 */
function buildNewWeeklyRecord(headers, identity, importFields, pairFields, now) {
  var record = new Array(headers.length).fill('');

  record[headers.indexOf('member_number')] = identity.member_number;
  record[headers.indexOf('player_name_snapshot')] = identity.name;
  record[headers.indexOf('udisc_username_snapshot')] = identity.username;
  record[headers.indexOf('pdga_number_snapshot')] = identity.pdga;
  // in_tag / out_tag / signed_in_at: blank — not invented
  record[headers.indexOf('checked_in')] = true;
  record[headers.indexOf('paid')] = false;
  record[headers.indexOf('ctp')] = false;
  record[headers.indexOf('ace_pot')] = false;

  applyFieldsByName(record, headers, importFields);
  if (pairFields) applyFieldsByName(record, headers, pairFields);

  record[headers.indexOf('created_at')] = now;
  record[headers.indexOf('updated_at')] = now;
  return record;
}

/**
 * Updates an existing weekly row in place from the current row contents so
 * protected fields (member_number, snapshots, in_tag, out_tag, checked_in,
 * paid, ctp, ace_pot, notes) survive a re-import.
 */
function updateWeeklyImportRow(sheet, rowIndex, headers, fields, now) {
  var current = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
  applyFieldsByName(current, headers, fields);
  current[headers.indexOf('updated_at')] = now;
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([current]);
}

/**
 * Creates a ClubMembers row for a new identity. The caller must already hold
 * the script lock. Re-reads ClubMembers under the lock, scans for a duplicate
 * username/PDGA, allocates max+1, and appends.
 *
 * Returns { created, member_number, row_position, reason }:
 *  - created true  -> a new member row was appended;
 *  - created false -> the identity already exists; member_number points at it.
 */
function createClubMemberUnderLock(clubSheet, clubHeaders, identity, now) {
  var memberCol = clubHeaders.indexOf('member_number');
  var nameCol = clubHeaders.indexOf('name');
  var udiscCol = clubHeaders.indexOf('udisc_username');
  var pdgaCol = clubHeaders.indexOf('pdga_number');
  var activeCol = clubHeaders.indexOf('is_active');

  var username = (identity.username || '').toString().trim().toLowerCase();
  var pdga = (identity.pdga || '').toString().trim();

  var freshData = clubSheet.getDataRange().getValues();
  var maxMemberNumber = 0;
  for (var i = 1; i < freshData.length; i++) {
    var value = parseInt(freshData[i][memberCol], 10);
    if (!isNaN(value) && value > maxMemberNumber) maxMemberNumber = value;

    var existingUsername = (freshData[i][udiscCol] || '').toString().trim().toLowerCase();
    var existingPdga = (freshData[i][pdgaCol] || '').toString().trim();
    if (username && existingUsername === username) {
      return { created: false, member_number: freshData[i][memberCol], row_position: null, reason: 'duplicate_identity' };
    }
    if (pdga && existingPdga === pdga) {
      return { created: false, member_number: freshData[i][memberCol], row_position: null, reason: 'duplicate_identity' };
    }
  }

  var newMemberNumber = maxMemberNumber + 1;
  var row = new Array(clubHeaders.length).fill('');
  row[memberCol] = newMemberNumber;
  row[nameCol] = (identity.name || '').toString();
  row[udiscCol] = (identity.username || '').toString();
  row[pdgaCol] = (identity.pdga || '').toString();
  // current_tag: empty — not invented, admin assigns before the next league day
  row[activeCol] = true;
  row[clubHeaders.indexOf('created_at')] = now;
  row[clubHeaders.indexOf('updated_at')] = now;

  clubSheet.appendRow(row);
  return { created: true, member_number: newMemberNumber, row_position: clubSheet.getLastRow(), reason: '' };
}

/** Normalizes the per-row admin override payload into { partner_index: member_number }. */
function normalizeDoublesOverrides(overrides, rowIndex) {
  if (!overrides) return {};
  var rowOverrides = overrides[rowIndex];
  if (!rowOverrides) return {};

  var normalized = {};
  if (Array.isArray(rowOverrides)) {
    for (var i = 0; i < rowOverrides.length; i++) {
      if (rowOverrides[i] !== undefined && rowOverrides[i] !== null && rowOverrides[i] !== '') {
        normalized[i] = parseInt(rowOverrides[i], 10);
      }
    }
    return normalized;
  }

  for (var key in rowOverrides) {
    if (rowOverrides[key] !== undefined && rowOverrides[key] !== null && rowOverrides[key] !== '') {
      normalized[parseInt(key, 10)] = parseInt(rowOverrides[key], 10);
    }
  }
  return normalized;
}

/** Builds the doubles-only columns written onto one partner's weekly row. */
function buildDoublesPairFields(headers, udiscRow, memberNumber, pairKey, isSolo) {
  var row = udiscRow || {};
  var fields = {};
  if (headers.indexOf('pair_key') !== -1) {
    fields.pair_key = pairKey === null || pairKey === undefined ? '' : pairKey;
  }
  // partner_member_number is intentionally the row's own member_number: it is a
  // redundant pair-scan aid; member_number stays authoritative (audit Q1).
  if (headers.indexOf('partner_member_number') !== -1) {
    fields.partner_member_number = memberNumber;
  }
  if (headers.indexOf('team_position') !== -1) {
    fields.team_position = row.position !== undefined ? row.position : '';
  }
  if (headers.indexOf('team_position_raw') !== -1) {
    fields.team_position_raw = row.position_raw !== undefined ? row.position_raw : '';
  }
  if (headers.indexOf('weekly_points') !== -1) {
    // Points are computed here, at import commit, from the committed placement.
    // Because it is a pure function of the placement, a re-import recomputes
    // and overwrites the same value instead of accumulating.
    fields.weekly_points = doublesPointsForPosition(row.position_raw);
  }
  if (headers.indexOf('weekly_points_status') !== -1) {
    // The status column is retired: a committed row is identified by its
    // populated weekly_points, so clear any legacy lifecycle label.
    fields.weekly_points_status = '';
  }
  return fields;
}

/** Finds the first weekly entry whose identity matches a partner's. */
function findWeeklyIdentity(indexes, partner) {
  var username = (partner.username || '').toString().trim().toLowerCase();
  var pdga = (partner.pdga_number || '').toString().trim();
  for (var i = 0; i < indexes.entries.length; i++) {
    var entry = indexes.entries[i];
    if (username && entry.username === username) return entry;
    if (pdga && entry.pdga === pdga) return entry;
  }
  return null;
}

/**
 * Detects commit-only conflicts for a ready doubles row against authoritative
 * server state. Returns a reason code ('member_conflict' | 'identity_changed')
 * or null. `includeIdentityChange` is false until every plan member is known.
 */
function detectDoublesConflict(plan, pairKey, isSolo, scopeKey, weeklyIndexes, memberToPairKey, includeIdentityChange) {
  var i;

  // Two partners resolving to the same member would write that member twice.
  var seenMembers = {};
  for (i = 0; i < plan.length; i++) {
    var planMember = plan[i].member_number;
    if (planMember === null || planMember === undefined) continue;
    if (seenMembers[planMember]) return 'member_conflict';
    seenMembers[planMember] = true;
  }

  for (i = 0; i < plan.length; i++) {
    var memberNumber = plan[i].member_number;
    if (memberNumber === null || memberNumber === undefined) continue;
    if (memberToPairKey[memberNumber] !== undefined && memberToPairKey[memberNumber] !== scopeKey) {
      return 'member_conflict';
    }
  }

  for (i = 0; i < plan.length; i++) {
    var m = plan[i].member_number;
    if (m === null || m === undefined) continue;
    var existing = weeklyIndexes.byMember[m];
    if (existing && !doublesSameScope(existing.pair_key, pairKey, isSolo)) {
      return 'member_conflict';
    }
  }

  for (i = 0; i < plan.length; i++) {
    if (plan[i].path !== 'create') continue;
    var found = findWeeklyIdentity(weeklyIndexes, plan[i].partner);
    if (found && !doublesSameScope(found.pair_key, pairKey, isSolo)) {
      return 'member_conflict';
    }
  }

  if (includeIdentityChange && !isSolo && pairKey) {
    var resolvedKnown = {};
    for (i = 0; i < plan.length; i++) {
      if (plan[i].member_number !== null && plan[i].member_number !== undefined) {
        resolvedKnown[plan[i].member_number] = true;
      }
    }
    for (i = 0; i < weeklyIndexes.entries.length; i++) {
      var entry = weeklyIndexes.entries[i];
      if (entry.pair_key === pairKey && !resolvedKnown[entry.member_number]) {
        return 'identity_changed';
      }
    }
  }

  return null;
}

/** Partner outcomes for one doubles row, from either a resolved plan or matches. */
function buildDoublesPartnerOutcomes(plan, parsed) {
  if (plan) {
    return plan.map(function (item) {
      return {
        partner_index: item.partner_index,
        name: item.partner.name,
        username: item.partner.username,
        member_number: item.member_number,
        path: item.path,
        match_source: item.partner.match ? item.partner.match.source : null,
        match_status: item.partner.match ? item.partner.match.status : null
      };
    });
  }
  return (parsed.partners || []).map(function (partner) {
    return {
      partner_index: partner.partner_index,
      name: partner.name,
      username: partner.username,
      member_number: partner.match ? partner.match.member_number : null,
      path: doublesPartnerPath(partner.match),
      match_source: partner.match ? partner.match.source : null,
      match_status: partner.match ? partner.match.status : null
    };
  });
}

/** Builds one per-row doubles commit outcome. */
function buildDoublesRowResult(rowIndex, parsed, pairKey, isSolo, status, reason, plan) {
  return {
    row_index: rowIndex,
    pair_key: pairKey,
    is_solo: isSolo,
    raw_name: parsed.source_name,
    raw_usernames: parsed.source_usernames,
    status: status,
    reason: reason || '',
    partners: buildDoublesPartnerOutcomes(plan, parsed)
  };
}

/** Best-effort compensating delete of weekly rows appended for a failed pair. */
function compensateAppendedWeeklyRows(appended) {
  for (var i = appended.length - 1; i >= 0; i--) {
    try {
      appended[i].sheet.deleteRow(appended[i].position);
    } catch (error) {
      // Best effort only; Apps Script cannot promise a true rollback.
    }
  }
}

/** Best-effort compensating delete of ClubMembers rows created for a failed pair. */
function compensateAppendedMembers(clubSheet, appendedMembers) {
  for (var i = appendedMembers.length - 1; i >= 0; i--) {
    var created = appendedMembers[i];
    if (!created || !created.created || created.row_position === null || created.row_position === undefined) continue;
    try {
      clubSheet.deleteRow(created.row_position);
    } catch (error) {
      // Best effort only.
    }
  }
}

/**
 * Executes the member phase and weekly phase for one ready doubles row while
 * the caller holds the pair lock. All revalidation reads happen here, inside
 * the lock, against fresh sheet data. Returns a per-row outcome.
 */
function commitDoublesPairUnderLock(context) {
  var weeklySheet = context.weeklySheet;
  var weeklyHeaders = context.weeklyHeaders;
  var clubSheet = context.clubSheet;
  var clubHeaders = context.clubHeaders;
  var parsed = context.parsed;
  var plan = context.plan;
  var pairKey = context.pairKey;
  var scopeKey = context.scopeKey;
  var isSolo = context.isSolo;
  var udiscRow = context.udiscRow;
  var now = context.now;
  var rules = context.rules;
  var claimedPairMember = context.claimedPairMember;
  var memberToPairKey = context.memberToPairKey;
  var createdMemberNumbers = context.createdMemberNumbers;

  // Authoritative fresh reads inside the pair lock.
  var freshWeeklyData = weeklySheet.getDataRange().getValues();
  var freshHeaders = freshWeeklyData[0] && freshWeeklyData[0].length ? freshWeeklyData[0] : weeklyHeaders;
  var freshWeeklyIndexes = buildWeeklyMatchIndexes(freshWeeklyData, freshHeaders);

  var conflict = detectDoublesConflict(plan, pairKey, isSolo, scopeKey, freshWeeklyIndexes, memberToPairKey, false);
  if (conflict) {
    return { status: 'review', reason: conflict, plan: plan };
  }

  // ---- Member phase (0 to 2 creations inside this pair lock) ----
  var appendedMembers = [];
  var pairCreatedNumbers = [];
  try {
    for (var p = 0; p < plan.length; p++) {
      if (plan[p].path !== 'create') continue;
      var identity = {
        name: plan[p].partner.name,
        username: plan[p].partner.username,
        pdga: plan[p].partner.pdga_number
      };
      var created = createClubMemberUnderLock(clubSheet, clubHeaders, identity, now);
      appendedMembers.push(created);
      plan[p].member_number = created.member_number;
      if (created.created) pairCreatedNumbers.push(created.member_number);
    }
  } catch (memberError) {
    compensateAppendedMembers(clubSheet, appendedMembers);
    return { status: 'failed', reason: 'member_phase_failure', plan: plan };
  }

  // Re-check conflicts (and identity drift) now that every member is resolved.
  conflict = detectDoublesConflict(plan, pairKey, isSolo, scopeKey, freshWeeklyIndexes, memberToPairKey, true);
  if (conflict) {
    return { status: 'review', reason: conflict, plan: plan };
  }

  // Idempotent replay: every member already claimed for this exact scope.
  var allClaimed = plan.length > 0;
  var anyClaimed = false;
  for (var a = 0; a < plan.length; a++) {
    if (claimedPairMember[scopeKey + '|' + plan[a].member_number]) {
      anyClaimed = true;
    } else {
      allClaimed = false;
    }
  }
  if (allClaimed) {
    return { status: 'already_committed', reason: 'idempotent_replay', plan: plan };
  }
  if (anyClaimed) {
    return { status: 'review', reason: 'member_conflict', plan: plan };
  }

  // ---- Weekly phase (both partner rows, one pair) ----
  var appendedWeekly = [];
  var appendedCount = 0;
  try {
    for (var w = 0; w < plan.length; w++) {
      var item = plan[w];
      var memberNumber = item.member_number;
      var importFields = buildDoublesImportFields(udiscRow, item.partner, rules);
      var pairFields = buildDoublesPairFields(freshHeaders, udiscRow, memberNumber, pairKey, isSolo);
      var fields = {};
      var key;
      for (key in importFields) fields[key] = importFields[key];
      for (key in pairFields) fields[key] = pairFields[key];

      var target = freshWeeklyIndexes.byMember[memberNumber];
      if (target && doublesSameScope(target.pair_key, pairKey, isSolo)) {
        updateWeeklyImportRow(weeklySheet, target.index + 1, freshHeaders, fields, now);
      } else {
        var snapshotName = item.partner.match && item.partner.match.matched_name
          ? item.partner.match.matched_name
          : item.partner.name;
        var record = buildNewWeeklyRecord(freshHeaders, {
          member_number: memberNumber,
          name: snapshotName,
          username: item.partner.username,
          pdga: item.partner.pdga_number
        }, importFields, pairFields, now);
        weeklySheet.appendRow(record);
        appendedWeekly.push({ sheet: weeklySheet, position: weeklySheet.getLastRow() });
        appendedCount++;
      }
    }
  } catch (weeklyError) {
    compensateAppendedWeeklyRows(appendedWeekly);
    compensateAppendedMembers(clubSheet, appendedMembers);
    return { status: 'failed', reason: 'weekly_phase_failure', plan: plan };
  }

  // Success: publish batch claims and created member numbers.
  for (var k = 0; k < plan.length; k++) {
    claimedPairMember[scopeKey + '|' + plan[k].member_number] = true;
    memberToPairKey[plan[k].member_number] = scopeKey;
  }
  for (var n = 0; n < pairCreatedNumbers.length; n++) {
    createdMemberNumbers.push(pairCreatedNumbers[n]);
  }

  var hadExisting = false;
  if (!isSolo && pairKey) {
    for (var e = 0; e < freshWeeklyIndexes.entries.length; e++) {
      if (freshWeeklyIndexes.entries[e].pair_key === pairKey) { hadExisting = true; break; }
    }
  }
  var status = hadExisting && appendedCount > 0 ? 'repaired' : 'committed';
  return { status: status, reason: '', plan: plan };
}

/**
 * Commits an approved UDisc doubles import to the selected weekly sheet.
 *
 * Doubles rows are grouped by the ratified pair key and processed pair by pair
 * (solo/keyless rows run the singles-shaped path with a keyless scope). Each
 * ready pair is validated, its verdict recomputed server-side, revalidated
 * under a pair-scoped lock, then committed through a member phase followed by a
 * weekly phase. Every attempted row receives an explicit outcome, including
 * failures; no failure is silently dropped and one bad pair never stops the
 * rest of the import.
 *
 * Inputs: league_date (required), rows (required, raw UDisc rows), approved
 * (must be true), overrides (optional per-row, per-partner member claims).
 */
function handleCommitUdiscImportDoubles(data) {
  var rules = getLeagueRules(leagueSelectorFrom(data));
  if (!rules.hasPairs) {
    return respond('error', 'Pair-based UDisc import commit is not available for this league\'s format.');
  }

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

  // Re-read and revalidate all data server-side. The raw rows are the only
  // authority; any client-supplied verdict or match is deliberately ignored.
  var weeklyData = weeklySheet.getDataRange().getValues();
  var weeklyHeaders = weeklyData[0];
  var weeklyIndexes = buildWeeklyMatchIndexes(weeklyData, weeklyHeaders);

  var clubData = clubSheet.getDataRange().getValues();
  var clubHeaders = clubData[0];
  var clubIndexes = buildClubMatchIndexes(clubData, clubHeaders);

  var claimedPairMember = {};
  var memberToPairKey = {};
  var createdMemberNumbers = [];
  var results = [];
  var summary = {
    total_rows: rows.length,
    pairs: 0,
    solos: 0,
    committed: 0,
    repaired: 0,
    already_committed: 0,
    review: 0,
    blocked: 0,
    failed: 0
  };

  var now = new Date().toISOString();

  for (var r = 0; r < rows.length; r++) {
    var udiscRow = rows[r] || {};
    var parsed = parseDoublesRow(udiscRow);
    var isSolo = parsed.is_solo;
    var pairKey = computeDoublesPairKey(parsed, leagueDate);
    var scopeKey = pairKey === null ? DOUBLES_SOLO_SCOPE : pairKey;
    var rowOverrides = normalizeDoublesOverrides(data.overrides, r);

    if (isSolo) summary.solos++; else summary.pairs++;

    // Attach claimed overrides (verified, never trusted, below).
    for (var p = 0; p < parsed.partners.length; p++) {
      if (rowOverrides[p] !== undefined && rowOverrides[p] !== null && rowOverrides[p] !== '') {
        parsed.partners[p].requested_member_number = rowOverrides[p];
      }
    }

    var scoped = scopeWeeklyIndexes(weeklyIndexes, pairKey, isSolo);
    var matchIndexes = buildDoublesMatchIndexes(scoped, clubIndexes, weeklyIndexes);

    // Match every partner server-side; an override is verified, not trusted.
    var overrideFailure = null;
    for (var mp = 0; mp < parsed.partners.length; mp++) {
      var partner = parsed.partners[mp];
      if (partner.requested_member_number !== undefined) {
        var verified = verifyDoublesOverride(partner, matchIndexes, weeklyIndexes, pairKey, isSolo);
        if (verified.ok) {
          partner.match = verified.match;
        } else {
          partner.match = emptyDoublesMatch();
          partner.match.status = 'unmatched';
          partner.match.source = 'invalid_override';
          if (!overrideFailure) overrideFailure = verified.reason || 'invalid_override';
        }
      } else {
        partner.match = matchDoublesPartner(partner, matchIndexes);
      }
    }

    var verdict = computeDoublesPairVerdict(parsed, parsed.partners);

    if (overrideFailure) {
      summary.review++;
      results.push(buildDoublesRowResult(r, parsed, pairKey, isSolo, 'review', overrideFailure));
      continue;
    }
    if (verdict.verdict === 'blocked') {
      summary.blocked++;
      results.push(buildDoublesRowResult(r, parsed, pairKey, isSolo, 'blocked', verdict.reason));
      continue;
    }
    if (verdict.verdict === 'review') {
      summary.review++;
      results.push(buildDoublesRowResult(r, parsed, pairKey, isSolo, 'review', verdict.reason));
      continue;
    }

    // ---- Ready: resolve each partner's path from the scoped fresh snapshot ----
    var plan = [];
    for (var pp = 0; pp < parsed.partners.length; pp++) {
      var planPartner = parsed.partners[pp];
      var path = doublesPartnerPath(planPartner.match);
      var item = {
        partner: planPartner,
        partner_index: planPartner.partner_index,
        path: path,
        member_number: planPartner.match.member_number,
        target_index: null
      };
      var scopedEntry = item.member_number !== null && item.member_number !== undefined
        ? scoped.byMember[item.member_number]
        : null;
      if (scopedEntry) {
        item.path = 'update';
        item.target_index = scopedEntry.index;
      } else if (item.path !== 'create') {
        item.path = 'existing_new_row';
      }
      plan.push(item);
    }

    var conflict = detectDoublesConflict(plan, pairKey, isSolo, scopeKey, weeklyIndexes, memberToPairKey, false);
    if (conflict) {
      summary.review++;
      results.push(buildDoublesRowResult(r, parsed, pairKey, isSolo, 'review', conflict, plan));
      continue;
    }

    // ---- Pair-scoped lock: one lock per ready pair, never a global import lock ----
    var lock = LockService.getScriptLock();
    var locked = false;
    try {
      lock.waitLock(10000);
      locked = true;
    } catch (lockError) {
      summary.failed++;
      results.push(buildDoublesRowResult(r, parsed, pairKey, isSolo, 'failed', 'lock_timeout', plan));
      continue;
    }

    var outcome;
    try {
      outcome = commitDoublesPairUnderLock({
        weeklySheet: weeklySheet,
        weeklyHeaders: weeklyHeaders,
        clubSheet: clubSheet,
        clubHeaders: clubHeaders,
        parsed: parsed,
        plan: plan,
        pairKey: pairKey,
        scopeKey: scopeKey,
        isSolo: isSolo,
        udiscRow: udiscRow,
        now: now,
        rules: rules,
        claimedPairMember: claimedPairMember,
        memberToPairKey: memberToPairKey,
        createdMemberNumbers: createdMemberNumbers
      });
    } finally {
      if (locked) lock.releaseLock();
    }

    results.push(buildDoublesRowResult(r, parsed, pairKey, isSolo, outcome.status, outcome.reason, outcome.plan));
    if (outcome.status === 'committed') summary.committed++;
    else if (outcome.status === 'repaired') summary.repaired++;
    else if (outcome.status === 'already_committed') summary.already_committed++;
    else if (outcome.status === 'failed') summary.failed++;
    else summary.review++;
  }

  var seasonSync = syncDoublesSeasonPoints(spreadsheet);

  return respond('ok', 'Doubles import committed.', {
    format: LEAGUE_FORMAT_DOUBLES,
    league_date: leagueDate,
    summary: summary,
    season_points_synced: seasonSync.synced,
    results: results,
    created_member_numbers: createdMemberNumbers
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
  if (!getLeagueRules(leagueSelectorFrom(data)).usesTags) {
    return respond('error', 'Tag-based UDisc import commit is not available for this league\'s scoring method.');
  }

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
  var weeklyIndexes = buildWeeklyMatchIndexes(weeklyData, weeklyHeaders);

  var clubData = clubSheet.getDataRange().getValues();
  var clubHeaders = clubData[0];
  var clubIndexes = buildClubMatchIndexes(clubData, clubHeaders);

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
    if (uUsername && weeklyIndexes.byUsername[uUsername.toLowerCase()]) {
      weeklyMatch = weeklyIndexes.byUsername[uUsername.toLowerCase()];
      matchMethod = 'username';
    }
    // Step 2: PDGA match against weekly records
    if (!weeklyMatch && uPdga && weeklyIndexes.byPdga[uPdga]) {
      weeklyMatch = weeklyIndexes.byPdga[uPdga];
      matchMethod = 'pdga';
    }
    // Step 3: name match against weekly records
    if (!weeklyMatch) {
      var nameMatches = weeklyIndexes.byName[uName.toLowerCase()];
      if (nameMatches && nameMatches.length === 1) {
        weeklyMatch = nameMatches[0];
        matchMethod = 'name';
      }
    }

    var importFields = buildCommitImportFields(udiscRow);

    if (weeklyMatch) {
      // --- Path 1: Update existing weekly record in place ---
      updateWeeklyImportRow(weeklySheet, weeklyMatch.index + 1, weeklyHeaders, importFields, now);
      matchedUpdated++;

    } else {
      // --- Not a weekly record match — check ClubMembers ---
      var existingMemberNum = null;
      var existingMemberName = '';

      if (uUsername) {
        existingMemberNum = clubIndexes.byUsername[uUsername.toLowerCase()];
      }
      if (!existingMemberNum && uPdga) {
        existingMemberNum = clubIndexes.byPdga[uPdga];
      }

      if (existingMemberNum) {
        // Verify ClubMembers row still exists and is active
        var memberStillValid = false;
        for (var c = 1; c < clubData.length; c++) {
          if (clubData[c][clubIndexes.memberCol] === existingMemberNum &&
              (clubData[c][clubIndexes.activeCol] === true || clubData[c][clubIndexes.activeCol] === 'TRUE')) {
            existingMemberName = clubData[c][clubIndexes.nameCol] || '';
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
          if (existingWeekly[w][weeklyIndexes.memberCol] === existingMemberNum) {
            alreadyExists = true;
            break;
          }
        }
        if (alreadyExists) continue;

        // --- Path 2: Existing ClubMembers player, create new weekly row ---
        var newRecord = buildNewWeeklyRecord(WEEKLY_RECORD_HEADERS, {
          member_number: existingMemberNum,
          name: existingMemberName,
          username: uUsername,
          pdga: uPdga
        }, importFields, null, now);
        weeklySheet.appendRow(newRecord);
        existingMemberWeeklyCreated++;

      } else {
        // --- Path 3: Completely new player — create ClubMembers + weekly row ---
        if (!uUsername && !uPdga) continue;

        // Check existing ClubMembers one more time
        var doubleCheck = null;
        if (uUsername && clubIndexes.byUsername[uUsername.toLowerCase()]) {
          doubleCheck = clubIndexes.byUsername[uUsername.toLowerCase()];
        }
        if (!doubleCheck && uPdga && clubIndexes.byPdga[uPdga]) {
          doubleCheck = clubIndexes.byPdga[uPdga];
        }
        if (doubleCheck) {
          // Became an existing member between preview and commit — treat as Path 2
          if (batchMemberNumbers[doubleCheck]) continue;
          batchMemberNumbers[doubleCheck] = true;
          var cmName = '';
          for (var cc = 1; cc < clubData.length; cc++) {
            if (clubData[cc][clubIndexes.memberCol] === doubleCheck) {
              cmName = clubData[cc][clubIndexes.nameCol] || '';
              break;
            }
          }
          var newRecord2 = buildNewWeeklyRecord(WEEKLY_RECORD_HEADERS, {
            member_number: doubleCheck,
            name: cmName,
            username: uUsername,
            pdga: uPdga
          }, importFields, null, now);
          weeklySheet.appendRow(newRecord2);
          existingMemberWeeklyCreated++;
          continue;
        }

        // Create new ClubMembers row with LockService
        var lock = LockService.getScriptLock();
        try {
          lock.waitLock(10000);

          var memberResult = createClubMemberUnderLock(clubSheet, CLUB_MEMBER_HEADERS, {
            name: uName,
            username: uUsername,
            pdga: uPdga
          }, now);
          if (!memberResult.created) continue;

          var newMemberNumber = memberResult.member_number;
          batchMemberNumbers[newMemberNumber] = true;
          createdMemberNumbers.push(newMemberNumber);

          var newWeeklyRecord = buildNewWeeklyRecord(WEEKLY_RECORD_HEADERS, {
            member_number: newMemberNumber,
            name: uName,
            username: uUsername,
            pdga: uPdga
          }, importFields, null, now);
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
  var rules = getLeagueRules(leagueSelectorFrom(data));
  if (!rules.usesTags) {
    return respond('error', 'Tag operations are not available for this league\'s scoring method.');
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
  var rules = getLeagueRules(leagueSelectorFrom(data));
  if (!rules.usesTags) {
    return respond('error', 'Tag operations are not available for this league\'s scoring method.');
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
  var rules = getLeagueRules(leagueSelectorFrom(data));
  if (!rules.usesTags) {
    return respond('error', 'Tag operations are not available for this league\'s scoring method.');
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

// ─── Doubles points: compute-at-commit + live results ───────────────────────
//
// Points are a single computed value, not a lifecycle. The UDisc import commit
// is the only boundary that persists points: it derives each participant's
// weekly_points directly from their committed team placement. Standings and
// member totals then aggregate those committed values live at read time, and
// the ClubMembers season_points cache is refreshed from the same live sum at
// the end of every commit, so the two can never disagree.
//
// A parallel, format-gated path beside the singles tag chain. Every entry point
// refuses the singles format before opening any sheet, and none of these
// functions reads or writes in_tag / out_tag / current_tag, so a tag event can
// never enter points math and points math can never mutate tag state.

/** Pure scoring rule: placement 1/2/3 -> 2/1.5/1, anything else -> 0.5. */
function doublesPointsForPosition(positionRaw) {
  var place = parseInt(positionRaw, 10);
  if (!isNaN(place) && DOUBLES_POINTS_BY_PLACE[place] !== undefined) {
    return DOUBLES_POINTS_BY_PLACE[place];
  }
  return DOUBLES_POINTS_PARTICIPATION;
}

/**
 * Builds the read-only per-row results view for one doubles week tab. Pure:
 * reads the already-fetched values only and performs no writes. Points are
 * derived from the committed placement with the same rule the import commit
 * applies, so the results view is always reproducible from the sheet. A blank
 * or non-numeric placement earns 0.5 showing-up credit and emits a warning.
 */
function buildDoublesPointsPlan(weeklyData, headers) {
  var hMember = headers.indexOf('member_number');
  var hName = headers.indexOf('player_name_snapshot');
  var hPair = headers.indexOf('pair_key');
  var hPartner = headers.indexOf('partner_member_number');
  var hTeamPosition = headers.indexOf('team_position');
  var hPositionRaw = headers.indexOf('team_position_raw');
  var hPoints = headers.indexOf('weekly_points');

  var rows = [];
  var warnings = [];

  for (var i = 1; i < weeklyData.length; i++) {
    var row = weeklyData[i];
    var memberNumber = row[hMember];
    if (memberNumber === '' || memberNumber === null || memberNumber === undefined) continue;

    var rawPosition = row[hPositionRaw];
    var blankPosition = rawPosition === '' || rawPosition === null || rawPosition === undefined;
    var parsedPosition = parseInt(rawPosition, 10);
    var hasPosition = !blankPosition && !isNaN(parsedPosition) && parsedPosition >= 1;

    var warning = null;
    if (!hasPosition) {
      warning = {
        row_index: i,
        member_number: memberNumber,
        player_name: (hName !== -1 ? row[hName] : '') || '',
        code: 'blank_position',
        message: 'Blank position for member #' + memberNumber + ': credited 0.5 showing-up points.'
      };
      warnings.push(warning);
    }

    rows.push({
      row_index: i,
      member_number: memberNumber,
      player_name: (hName !== -1 ? row[hName] : '') || '',
      pair_key: hPair !== -1 ? (row[hPair] || '') : '',
      partner_member_number: hPartner !== -1 ? (row[hPartner] || '') : '',
      team_position: hTeamPosition !== -1 ? (row[hTeamPosition] || '') : '',
      team_position_raw: rawPosition === undefined ? '' : rawPosition,
      has_position: hasPosition,
      points: doublesPointsForPosition(rawPosition),
      stored_points: hPoints !== -1 ? row[hPoints] : '',
      warning: warning
    });
  }

  return { rows: rows, warnings: warnings };
}

/**
 * Opens and validates the doubles weekly results tab for a league date.
 * Returns { error } instead of a tab when the request cannot be served.
 */
function readDoublesPointsTab(spreadsheet, leagueDate) {
  var tabName = 'Week ' + leagueDate;
  var weeklySheet = spreadsheet.getSheetByName(tabName);
  if (!weeklySheet) {
    return { error: 'Weekly tab not found: ' + tabName + '.' };
  }

  var weeklyData = weeklySheet.getDataRange().getValues();
  var headers = weeklyData[0] || [];
  if (headers.indexOf('team_position_raw') === -1 ||
      headers.indexOf('weekly_points') === -1) {
    return { error: 'Weekly tab is not a doubles points tab: ' + tabName + '.' };
  }

  var plan = buildDoublesPointsPlan(weeklyData, headers);
  return {
    tab_name: tabName,
    sheet: weeklySheet,
    headers: headers,
    rows: plan.rows,
    warnings: plan.warnings
  };
}

/** Validates the shared points request shape (points gate + league_date). */
function validateDoublesPointsRequest(data) {
  var rules = getLeagueRules(leagueSelectorFrom(data));
  if (!rules.usesPoints) {
    return { error: 'Points operations are not available for this league\'s scoring method.' };
  }
  var leagueDate = data.league_date;
  if (!leagueDate || !/^\d{4}-\d{2}-\d{2}$/.test(leagueDate)) {
    return { error: 'Invalid or missing league_date.' };
  }
  return { leagueDate: leagueDate };
}

/** Public shape of one row in the read-only points results view. */
function pointsRowResponse(row) {
  return {
    row_index: row.row_index,
    member_number: row.member_number,
    player_name: row.player_name,
    pair_key: row.pair_key,
    partner_member_number: row.partner_member_number,
    team_position: row.team_position,
    team_position_raw: row.team_position_raw,
    has_position: row.has_position,
    points: row.points,
    stored_points: row.stored_points,
    warning: row.warning ? row.warning.message : null
  };
}

function pointsSummary(rows) {
  var summary = { total_rows: rows.length, warnings: 0 };
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].warning) summary.warnings++;
  }
  return summary;
}

/**
 * Groups results rows by pair_key for the results table. A keyless (solo) row
 * is its own group. Each group carries the shared place and points so the
 * table reads Pair / Place / Points from one deterministic source.
 */
function groupDoublesPointsPairs(rows) {
  var order = [];
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    var key = row.pair_key ? row.pair_key : ('__solo__' + row.member_number);
    if (!map[key]) {
      map[key] = { pair_key: row.pair_key || '', members: [] };
      order.push(key);
    }
    map[key].members.push(row);
  }

  var pairs = [];
  for (var g = 0; g < order.length; g++) {
    var members = map[order[g]].members;
    var names = [];
    var hasPosition = false;
    var positionLabel = '';
    var positionRaw = '';
    var points = null;

    for (var m = 0; m < members.length; m++) {
      var member = members[m];
      names.push(member.player_name || ('#' + member.member_number));
      if (!hasPosition && member.has_position) {
        hasPosition = true;
        positionLabel = member.team_position !== '' ? member.team_position : String(member.team_position_raw);
        positionRaw = member.team_position_raw;
      }
      if (points === null) points = member.points;
    }

    pairs.push({
      pair_key: map[order[g]].pair_key,
      label: names.join(' / '),
      members: members.map(pointsRowResponse),
      place: hasPosition ? positionLabel : '',
      place_raw: positionRaw,
      has_position: hasPosition,
      points: points === null ? 0 : points
    });
  }
  return pairs;
}

/**
 * Admin action: read the committed doubles results for one week.
 *
 * Read-only: derives points from each committed placement with the same rule
 * the import commit uses, and returns the pair-grouped results table. No sheet
 * write, no confirm/finalize step, and no dependency on a points status.
 *
 * Inputs: league_date (required, YYYY-MM-DD format)
 */
function handleCalculatePoints(data) {
  var gate = validateDoublesPointsRequest(data);
  if (gate.error) return respond('error', gate.error);

  var spreadsheet = resolveSpreadsheet(leagueSelectorFrom(data));
  var tab = readDoublesPointsTab(spreadsheet, gate.leagueDate);
  if (tab.error) return respond('error', tab.error);

  return respond('ok', 'Points results loaded. No writes were made.', {
    format: LEAGUE_FORMAT_DOUBLES,
    league_date: gate.leagueDate,
    tab_name: tab.tab_name,
    writes: false,
    total_players: tab.rows.length,
    warnings: tab.warnings,
    players: tab.rows.map(pointsRowResponse),
    pairs: groupDoublesPointsPairs(tab.rows),
    summary: pointsSummary(tab.rows)
  });
}

/**
 * Sums each member's committed weekly points across every Week tab. This is
 * the single live aggregation every doubles total shares and the source of
 * truth: it reads the points persisted at import commit and never consults a
 * status column or a cached season total, so a total can never go stale. A row
 * with a blank or non-numeric weekly_points was never committed and
 * contributes nothing. Returns a plain object keyed by member_number; a member
 * with no committed rows is absent (callers default to 0).
 */
function sumSeasonPointsByMember(spreadsheet) {
  var totals = {};
  var weekSheets = getWeekSheets(spreadsheet);
  for (var s = 0; s < weekSheets.length; s++) {
    var data = weekSheets[s].getDataRange().getValues();
    var headers = data[0] || [];
    var hMember = headers.indexOf('member_number');
    var hPoints = headers.indexOf('weekly_points');
    if (hMember === -1 || hPoints === -1) continue;

    for (var i = 1; i < data.length; i++) {
      var memberNumber = data[i][hMember];
      if (memberNumber === '' || memberNumber === null || memberNumber === undefined) continue;
      var points = parseFloat(data[i][hPoints]);
      if (isNaN(points)) continue;
      totals[memberNumber] = (totals[memberNumber] || 0) + points;
    }
  }
  return totals;
}

/**
 * Ensures the doubles ClubMembers roster carries the `season_points` cache
 * column, appending the header after the last used column when an older roster
 * was provisioned with the bare 8-column schema. Idempotent. Returns the
 * 0-based column index, or -1 when there is no ClubMembers sheet.
 */
function ensureSeasonPointsColumn(clubSheet) {
  if (!clubSheet) return -1;

  var lastColumn = clubSheet.getLastColumn();
  var headers = lastColumn > 0
    ? clubSheet.getRange(1, 1, 1, lastColumn).getValues()[0]
    : [];
  var existing = headers.indexOf('season_points');
  if (existing !== -1) return existing;

  var nextColumn = lastColumn + 1;
  clubSheet.getRange(1, nextColumn).setValue('season_points');
  return nextColumn - 1;
}

/**
 * Recomputes the doubles ClubMembers `season_points` cache from the committed
 * weekly_points and persists it in one batch write for the whole roster.
 *
 * The live sum (`sumSeasonPointsByMember`) stays the source of truth and the
 * listings keep computing it; this column is only a denormalized copy so the
 * ClubMembers tab itself always holds current totals. Safe to call after every
 * points write: it recomputes from scratch, so a re-run can never accumulate,
 * and it creates the column in place for a roster that predates it.
 *
 * Returns { synced, members } where `members` maps member_number to the value
 * written and `synced` is the number of roster rows refreshed.
 */
function syncDoublesSeasonPoints(spreadsheet) {
  var result = { synced: 0, members: {} };
  var clubSheet = spreadsheet.getSheetByName('ClubMembers');
  if (!clubSheet || clubSheet.getLastRow() < 2) return result;

  var seasonCol = ensureSeasonPointsColumn(clubSheet);
  if (seasonCol === -1) return result;

  var clubData = clubSheet.getDataRange().getValues();
  var headers = clubData[0] || [];
  var memberCol = headers.indexOf('member_number');
  if (memberCol === -1) return result;

  var totals = sumSeasonPointsByMember(spreadsheet);
  var values = [];
  for (var i = 1; i < clubData.length; i++) {
    var memberNumber = clubData[i][memberCol];
    if (memberNumber === '' || memberNumber === null || memberNumber === undefined) {
      // Preserve a blank spacer row's existing cache value rather than
      // inventing a total for a row that is not a member.
      values.push([clubData[i][seasonCol]]);
      continue;
    }
    var total = totals[memberNumber] !== undefined ? totals[memberNumber] : 0;
    values.push([total]);
    result.members[memberNumber] = total;
    result.synced++;
  }
  clubSheet.getRange(2, seasonCol + 1, values.length, 1).setValues(values);
  return result;
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
