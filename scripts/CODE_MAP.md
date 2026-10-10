# scripts/Code.gs navigation map

An index of the top-level sections and functions in `scripts/Code.gs` with line ranges, so a reader can read only the slice they need instead of the whole file.

Line numbers refer to the committed `scripts/Code.gs` as of this revision.

The section ranges come from the `// --- Name ---` banner comments in `Code.gs` itself.
Each section range runs from its opening banner to its closing `End` banner, or to the next banner or end of file.

Regenerate with `node scripts/gen-code-map.js` after any edit to `scripts/Code.gs`.
`tests/code-map.test.js` fails when this map is stale.

## Sections

```
 407-997   Spreadsheet routing
 999-1101  Sheet-position helpers
1103-2814  Doubles provisioning
1401-1658    Seed-only roster reload
2021-2359    Weekly column-order migration
2361-2603    Detag column-drop migration
2605-2812    Test-data reset
4320-4845  Doubles import preview (read-only)
4846-6547  Commit helpers shared by the singles and doubles import commit paths
6548-6996  Doubles points: compute-at-commit + live results
```

## Contents

```
  11-230   constants: SPREADSHEET_ID ... WEEKLY_RECORD_HEADERS_LEGACY_DOUBLES (29 declarations)
 232-254   function orderWeeklyHeaders(columns, humanFirstGroups) - Reorders a column set so each human-first group leads, then every remaining column follows in...
 256-289   constants: WEEKLY_RECORD_HEADERS, WEEKLY_RECORD_HEADERS_DOUBLES, WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED
 298-405   constants: DEFAULT_POINTS_BY_PLACE ... LEAGUE_SHEET_HEADERS_DOUBLES (14 declarations)
 409-449   constants: LEAGUE_ID_SINGLES ... TEST_SPREADSHEET_IDS (6 declarations)
 451-456   function isTestSpreadsheetId(spreadsheetId) - Whether a spreadsheet id is on the test-data reset allow-list.
 458-467   function leagueRecordById(leagueId) - Looks up the allow-listed league record for a canonical league id.
 469-480   function leagueRecordBySpreadsheetId(spreadsheetId) - Looks up the allow-listed league record for a spreadsheet id.
 482-494   function resolveLeagueId(selector) - Normalizes a requested routing selector to a canonical league id.
 496-504   function leagueSelectorFrom(data) - Picks the routing selector from a request body: the opaque `league` id when present, otherwis...
 506-513   function resolveSpreadsheetId(selector) - Maps a requested selector to a canonical spreadsheet ID through the server-side league allow-...
 515-521   function resolveSpreadsheet(selector) - Opens the spreadsheet selected by the caller.
 523-534   function normalizeFormat(format) - Normalizes a format value against the server allow-list.
 536-546   function normalizeScoring(scoring) - Normalizes a scoring value against the server allow-list.
 548-582   function parsePointsByPlace(raw) - Parses a compact points-by-place setting ("1:2,2:1.5,3:1") into a place-keyed map.
 584-592   function formatPointsByPlace(byPlace) - Serializes a place-keyed map to the compact "place:value,..." form.
 594-601   function clonePointsByPlace(byPlace) - Copies a place-keyed map so callers cannot mutate the shared default.
 603-622   function resolvePointsRules(leagueSettings) - Resolves the effective points table from League settings.
 624-634   function parseNonNegativeSetting(raw) - Parses a stored numeric setting.
 636-660   function resolvePayoutRules(leagueSettings) - Resolves the weekly payout pool rule from League settings.
 662-682   function migratedPayoutFields(legacyRaw) - Best-effort conversion of a legacy flat payout_by_place table into the weekly pool fields.
 684-710   function settingsWithMigratedPayout(settings) - Returns a copy of a header-keyed settings object with a legacy payout_by_place value carried...
 712-750   function migrateLeaguePayoutSettings(sheet) - Retires the legacy flat payout_by_place column in place, replacing it with the three weekly p...
 752-781   function parseEntryFeeBreakdown(raw) - Parses the compact ordered entry-fee breakdown ("label:amount,...") into an ordered [{ label,...
 783-790   function entryFeeBreakdownTotal(components) - Sums the component amounts, rounded to cents so float drift never warns.
 792-802   function resolveEntryFeeBreakdown(leagueSettings) - Resolves the entry-fee breakdown from League settings.
 804-818   function entryFeeBreakdownMismatch(entryFee, components) - Reports whether an itemised breakdown fails to sum to the configured entry fee.
 820-845   function resolveCheckInOptions(leagueSettings) - Resolves the money options a league offers at check-in from its settings.
 847-873   function getLeagueRules(selector, leagueSettings) - Resolves the capability rules for a requested selector.
 875-893   function readLeagueSettingsRow(sheet) - Reads the League settings row into a header-keyed object.
 895-902   function getLeagueRulesForSpreadsheet(selector, spreadsheet) - Capability rules for a league whose spreadsheet is already open: the League settings row is r...
 904-910   function resolveLeagueFormat(selector) - Resolves the league format for a requested selector through the league table.
 912-918   function defaultScoringForFormat(format) - The deploy-time default scoring for a format when no league record is in hand: singles settle...
 920-939   function rulesForEnums(format, scoring) - Builds capability rules from a (format, scoring) pair.
 941-953   function getWeeklyRecordHeaders(format, scoring) - Weekly record headers for a (format, scoring) pair.
 955-973   function weeklyRecordColumnPool(format, scoring) - Weekly column pool for a (format, scoring) pair, in historical relative order.
 975-982   function getLeagueSheetHeaders(format, scoring) - League sheet headers for a (format, scoring) pair.
 984-995   function getClubMemberHeaders(format, scoring) - ClubMembers headers for a (format, scoring) pair: the base roster columns plus the season_poi...
1001-1021  function ensureCanonicalSheet(spreadsheet, name, headers) - Ensures a named sheet exists in the spreadsheet.
1023-1033  function moveSheetToPosition(spreadsheet, sheetName, targetIndex) - Moves a sheet to a specific 0-based index position in the spreadsheet.
1035-1047  function getWeekSheets(spreadsheet) - Returns all sheets whose names match the pattern "Week YYYY-MM-DD", sorted chronologically (e...
1049-1081  function organizeWeekSheetsChronologically(spreadsheet) - Organizes all Week YYYY-MM-DD sheets in chronological order after League (position 0) and Clu...
1083-1099  function removeDefaultBlankSheet(spreadsheet) - Removes the default blank sheet from a new spreadsheet if it is safe to do so.
1105-1142  function ensureLeagueSheetForFormat(spreadsheet, format, scoring) - Ensures the League sheet exists for the given (format, scoring) pair and records both metadat...
1144-1151  function ensureLeagueMetadataValues(sheet, format, scoring) - Ensures both League metadata columns exist and record the supplied enums.
1153-1173  function ensureLeagueSettingsColumns(sheet, headers) - Appends any missing League settings columns (format, scoring, the per-league points table, an...
1175-1227  function migrateOldLeagueSheet(spreadsheet) - Migrates the legacy 12-column singles League sheet to the 15 base-column schema (the metadata...
1229-1254  function ensureLeagueFormatValue(sheet, format) - Ensures the League sheet's settings row records league_format.
1256-1281  function ensureLeagueScoringValue(sheet, scoring) - Ensures the League sheet's settings row records scoring.
1283-1292  function ensureWeekTemplateSheet(spreadsheet, format, scoring) - Ensures the doubles weekly template tab exists with the format's weekly headers.
1294-1320  function ensureWeekSheet(spreadsheet, leagueDate, format, scoring) - Creates (or returns) a dated weekly tab for the doubles spreadsheet using the doubles headers.
1322-1399  function seedRosterFromSingles(singlesSpreadsheet, doublesSpreadsheet) - Seeds the doubles ClubMembers roster from the singles roster exactly once.
1403-1448  function normalizeRosterSeedMembers(members) - Validates an explicit roster-seed payload.
1450-1475  function mapRosterSeedRow(member, targetHeaders) - Maps one explicit member payload object onto the target ClubMembers header order.
1477-1489  function rosterSeedUpdateValue(mappedValue, existingValue) - The value a roster-seed update writes for one ClubMembers header.
1491-1583  function planRosterSeed(doublesSpreadsheet, members) - Pure planner for the seed-only roster reload.
1585-1598  function applyRosterSeedPlan(sheet, plan) - Applies a plan from planRosterSeed.
1600-1656  function seedRoster(doublesSpreadsheet, options) - Seed-only roster reload.
1660-1695  function provisionDoublesWorkbook(doublesSpreadsheet, singlesSpreadsheet) - Provisions the doubles workbook schema: League (league_format=doubles), ClubMembers, the Week...
1697-1731  function getDoublesProvisioningState(spreadsheet) - Authoritative doubles provisioning-state check.
1733-1747  function handleGetDoublesProvisioningState(data) - Admin action: reports the authoritative doubles provisioning state without writing anything.
1749-1776  function handleProvisionDoubles(data) - Admin action: provisions the configured doubles spreadsheet (League with league_format=double...
1778-1852  function handleSeedRoster(data) - Web-app action: preview or apply the seed-only roster reload.
1854-1860  function getSheetHeaders(sheet) - Reads the header row of a sheet.
1862-1871  function arraysEqual(a, b) - Returns true when two arrays have the same length and identical values.
1873-1883  function readLeagueFormat(sheet) - Reads the league_format stored on the League sheet, or null when absent.
1885-1895  function readLeagueScoring(sheet) - Reads the scoring stored on the League sheet, or null when absent.
1897-1926  function leagueHeadersMatch(headers, format, scoring) - Whether a League header row matches the expected metadata schema for a (format, scoring) pair.
1928-1941  function clubMemberHeadersMatch(headers, format, scoring) - Whether a ClubMembers header row matches a (format, scoring) pair.
1943-1954  function weeklyHeadersMatch(headers, format, scoring) - Whether a weekly header row matches a (format, scoring) pair.
1956-1988  function inspectSpreadsheetTopology(spreadsheet, format, scoring) - Inspects a spreadsheet against the expected topology/headers for a (format, scoring) pair.
1990-2019  function countRoster(spreadsheet) - Counts the roster rows on a spreadsheet's ClubMembers tab.
2023-2041  constants: WEEKLY_COLUMN_ORDER_MIGRATION_APPROVAL_PROPERTY, WEEKLY_COLUMN_ORDER_MIGRATION_APPROVAL_TOKEN, WEEKLY_RECORD_CORE_HEADERS
2043-2052  function isWeeklyRecordHeaderRow(headers) - Whether a header row describes a weekly PlayerRecords sheet.
2054-2069  function weeklyColumnsKnownForFormat(format, scoring) - The full known weekly column set for a (format, scoring) pair.
2071-2084  function weeklyHumanFirstGroups(format, scoring) - Human-first groups for a (format, scoring) pair, in promotion order.
2086-2098  function isWeeklyColumnOrderMigrationAuthorized() - Whether the live migration has been explicitly authorized by the captain.
2100-2173  function planWeeklyColumnReorder(headers, format, scoring) - Plans a human-first reorder of one weekly header row.
2175-2235  function applyWeeklyColumnReorder(sheet, plan) - Writes a reorder plan onto a sheet, preserving every cell value and formula.
2237-2313  function migrateWeeklyColumnOrder(spreadsheet, format, options) - Migrates every weekly PlayerRecords sheet in a spreadsheet to the human-first order.
2315-2357  function handleMigrateWeeklyColumnOrder(data) - Admin/operator handler: dry-run or apply the weekly column-order migration.
2367-2374  function detagDropHeadersForWeekly(format, scoring) - The weekly tag columns a (format, scoring) pair no longer uses.
2376-2382  function detagDropHeadersForClubMembers(format, scoring) - The ClubMembers tag columns a (format, scoring) pair no longer uses.
2384-2435  function planTagColumnDrops(headers, dropHeaders) - Plans the removal of the given tag columns from one header row.
2437-2472  function applyTagColumnDrops(sheet, plan) - Deletes the planned tag columns from a sheet.
2474-2560  function migrateDetagColumnDrops(spreadsheet, format, options) - Migrates a spreadsheet to the tag-free schema for its (format, scoring) pair.
2562-2601  function handleMigrateDetagColumnDrops(data) - Admin/operator handler: dry-run or apply the detag column-drop migration.
2607-2625  function assertTestSpreadsheet(spreadsheetId) - Guards a reset against the development-surface allow-list.
2627-2643  function assertSeedableSpreadsheet(spreadsheetId) - Guards the seed-only roster reload.
2645-2687  function planTestDataReset(spreadsheet, options) - Pure planner: lists every sheet a reset would clear and how many data rows each would lose.
2689-2700  function applyTestDataResetPlan(plans) - Applies a plan from planTestDataReset by deleting every data row below the header.
2702-2721  function summarizeTestDataReset(plan) - Summarizes a reset plan into the totals the preview and the apply report.
2723-2758  function resetTestData(spreadsheet, options) - Guarded test-data reset.
2760-2810  function handleResetTestData(data) - Web-app action: preview or apply the guarded test-data reset.
2816-2830  function doGet(e) - Handles GET requests.
2832-2932  function doPost(e) - Handles POST requests.
2934-2947  function handleGetClubMembersStatus(data) - Returns whether the ClubMembers sheet exists.
2949-3000  function handleCreateClubMembersTab(data) - Creates the ClubMembers tab if it does not already exist.
3002-3064  function handleCreateWeeklyTab(data) - Creates a new weekly tab in the spreadsheet for the given league date.
3066-3143  function handleSearchClubMembers(data) - Searches active club members by name, udisc_username, or pdga_number.
3145-3214  function handleListClubMembers(data) - Lists club members for the selected league.
3216-3464  function handleSubmitCheckIn(data) - Submits a player check-in.
3466-3505  function handleCreateLeagueSheet(data) - Creates the League sheet if it does not already exist.
3507-3561  function handleGetLeagueSettings(data) - Reads the League settings from the League sheet.
3563-3589  function handleGetCheckInOptions(data) - Returns the money options a league offers at check-in plus its plain-language money explanation.
3591-3735  function handleSaveLeagueSettings(data) - Saves or updates League settings on the League sheet.
3737-3766  function handleGetWeeklyTabs(data) - Returns a list of existing weekly league tabs.
3768-3825  function handleGetWeekView(data) - Admin action: read-only dump of one week tab.
3827-3944  function handleGetPreRoundReview(data) - Loads pre-round review data for a specific league date.
3946-4069  function handleSavePreRoundReview(data) - Saves pre-round review overrides to the League sheet.
4071-4318  function handlePreviewUdiscImport(data) - Previews a UDisc import against the selected weekly sheet.
4328-4367  function parseDoublesHandles(rawValue) - Splits the UDisc doubles handle cell into individual handles.
4369-4406  function parseDoublesPairName(rawValue) - Splits a UDisc doubles `name` cell into partner display names.
4408-4462  function parseDoublesRow(udiscRow) - Parses one UDisc doubles row into independent partner identity objects.
4464-4476  function uniqueStrings(list) - Returns the input list with duplicates removed, preserving first-seen order.
4478-4493  function normalizeDoublesIdentityToken(partner) - Normalizes one doubles partner to a single canonical identity token for the pair key.
4495-4520  function computeDoublesPairKey(parsed, leagueDate) - Computes the ratified doubles pair key: a date-scoped, order-independent key built from the t...
4522-4534  function emptyDoublesMatch() - Builds the match-result skeleton shared by every matching path.
4536-4546  function weeklyDoublesMatch(entry, source, indexes)
4548-4559  function clubDoublesMatch(memberNumber, source, indexes)
4561-4632  function matchDoublesPartner(partner, indexes) - Matches a single doubles partner through the existing identity chain: weekly username -> week...
4634-4656  function computeDoublesPairVerdict(parsed, partners) - Computes the pair-level verdict from the parsed row plus each partner's independent match.
4658-4679  function buildDoublesRoster(clubData, headers) - Builds the active-roster override list returned to the admin UI.
4681-4844  function handlePreviewUdiscImportDoubles(data) - Previews a UDisc doubles export against the selected weekly sheet.
4848-4913  function buildWeeklyMatchIndexes(weeklyData, headers) - Builds the weekly identity indexes used to re-match imported rows at commit time.
4915-4972  function buildClubMatchIndexes(clubData, headers) - Builds the active ClubMembers indexes used to re-match imported identity (username then PDGA,...
4974-5004  function scopeWeeklyIndexes(indexes, pairKey, isSolo) - Restricts the weekly indexes to the rows a doubles partner may match: keyless (solo) rows plu...
5006-5023  function buildDoublesMatchIndexes(scoped, clubIndexes, weeklyIndexes) - Shapes the scoped weekly indexes plus the full club indexes into the object `matchDoublesPart...
5025-5034  function doublesSameScope(existingPairKey, pairKey, isSolo) - True when an existing weekly row belongs to this row's pair scope.
5036-5062  function verifyDoublesOverride(partner, matchIndexes, weeklyIndexes, pairKey, isSolo) - Verifies an admin-supplied partner override.
5064-5072  function doublesPartnerPath(match) - Maps a resolved partner match onto a commit path.
5074-5107  function buildCommitImportFields(udiscRow) - Builds the UDisc import fields for a weekly row exactly as the singles committer writes them...
5109-5127  function buildDoublesImportFields(udiscRow, partner, rules) - Builds the import fields for one doubles partner row.
5129-5165  function expectedWeeklyImportColumns(format, scoring) - Every weekly column the UDisc import mapping writes.
5167-5175  function missingWeeklyImportColumns(headers, format, scoring) - Returns the expected import columns missing from a weekly header row.
5177-5190  function weeklyImportColumnsGuard(headers, format, scoring) - Loud commit gate: every column the import mapping writes must exist on the target week tab.
5192-5198  function applyFieldsByName(target, headers, fields) - Writes a { header: value } map onto a row array by header index.
5200-5224  function buildNewWeeklyRecord(headers, identity, importFields, pairFields, now) - Builds a full new weekly row using the league's capability-derived weekly record schema with...
5226-5236  function updateWeeklyImportRow(sheet, rowIndex, headers, fields, now) - Updates an existing weekly row in place from the current row contents so protected fields (me...
5238-5286  function createClubMemberUnderLock(clubSheet, clubHeaders, identity, now) - Creates a ClubMembers row for a new identity.
5288-5310  function normalizeDoublesOverrides(overrides, rowIndex) - Normalizes the per-row admin override payload into { partner_index: member_number }.
5312-5343  function buildDoublesPairFields(headers, udiscRow, memberNumber, pairKey, isSolo, rules) - Builds the doubles-only columns written onto one partner's weekly row.
5345-5355  function findWeeklyIdentity(indexes, partner) - Finds the first weekly entry whose identity matches a partner's.
5357-5415  function detectDoublesConflict(plan, pairKey, isSolo, scopeKey, weeklyIndexes, memberToPairKey, includeIdentityChange) - Detects commit-only conflicts for a ready doubles row against authoritative server state.
5417-5443  function buildDoublesPartnerOutcomes(plan, parsed) - Partner outcomes for one doubles row, from either a resolved plan or matches.
5445-5457  function buildDoublesRowResult(rowIndex, parsed, pairKey, isSolo, status, reason, plan) - Builds one per-row doubles commit outcome.
5459-5468  function compensateAppendedWeeklyRows(appended) - Best-effort compensating delete of weekly rows appended for a failed pair.
5470-5481  function compensateAppendedMembers(clubSheet, appendedMembers) - Best-effort compensating delete of ClubMembers rows created for a failed pair.
5483-5629  function commitDoublesPairUnderLock(context) - Executes the member phase and weekly phase for one ready doubles row while the caller holds t...
5631-5857  function handleCommitUdiscImportDoubles(data) - Commits an approved UDisc doubles import to the selected weekly sheet.
5859-6098  function handleCommitUdiscImport(data) - Commits an approved UDisc import to the selected weekly sheet.
6100-6126  function buildFieldsToImport(udiscRow) - Builds the fields_to_import object from a UDisc row.
6128-6150  function buildMatchEntry(udiscRow, weeklyRow, matchMethod) - Builds a matched entry object for the preview response.
6152-6293  function handleCalculateTags(data) - Calculates tag assignments for a weekly league.
6295-6416  function handleConfirmTags(data) - Confirms and writes tag assignments for a weekly league.
6418-6546  function handleFinalizeRound(data) - Finalizes a round by propagating out_tag values from the weekly sheet to each matching ClubMe...
6562-6578  function doublesPointsForPosition(positionRaw, rules) - Pure scoring rule for a points league: a placement found in the league's points table earns i...
6580-6583  function roundCurrency(amount) - Rounds a dollar amount to cents so float drift never reaches the UI.
6585-6667  function applyWeeklyPayout(pairs, playerCount, rules) - Applies the weekly pool rule to the grouped teams and returns the payout summary.
6669-6727  function buildDoublesPointsPlan(weeklyData, headers, rules) - Builds the read-only per-row results view for one doubles week tab.
6729-6755  function readDoublesPointsTab(spreadsheet, leagueDate, rules) - Opens and validates the doubles weekly results tab for a league date.
6757-6768  function validateDoublesPointsRequest(data) - Validates the shared points request shape (points gate + league_date).
6770-6785  function pointsRowResponse(row) - Public shape of one row in the read-only points results view.
6787-6793  function pointsSummary(rows)
6795-6848  function groupDoublesPointsPairs(rows) - Groups results rows by pair_key for the results table.
6850-6886  function handleCalculatePoints(data) - Admin action: read the committed doubles results for one week.
6888-6916  function sumSeasonPointsByMember(spreadsheet) - Sums each member's committed weekly points across every Week tab.
6918-6937  function ensureSeasonPointsColumn(clubSheet) - Ensures the doubles ClubMembers roster carries the `season_points` cache column, appending th...
6939-6982  function syncDoublesSeasonPoints(spreadsheet) - Recomputes the doubles ClubMembers `season_points` cache from the committed weekly_points and...
6984-6997  function respond(status, message, extra) - Builds and returns a JSON response.
```
