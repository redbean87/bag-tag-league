# scripts/Code.gs navigation map

An index of the top-level sections and functions in `scripts/Code.gs` with line ranges, so a reader can read only the slice they need instead of the whole file.

Line numbers refer to the committed `scripts/Code.gs` as of this revision.

The section ranges come from the `// --- Name ---` banner comments in `Code.gs` itself.
Each section range runs from its opening banner to its closing `End` banner, or to the next banner or end of file.

Regenerate with `node scripts/gen-code-map.js` after any edit to `scripts/Code.gs`.
`tests/code-map.test.js` fails when this map is stale.

## Sections

```
 408-998   Spreadsheet routing
1000-1102  Sheet-position helpers
1104-2819  Doubles provisioning
1402-1659    Seed-only roster reload
2026-2364    Weekly column-order migration
2366-2608    Detag column-drop migration
2610-2817    Test-data reset
4404-4929  Doubles import preview (read-only)
4930-6636  Commit helpers shared by the singles and doubles import commit paths
6637-7287  Doubles points: compute-at-commit + live results
```

## Contents

```
  11-231   constants: SPREADSHEET_ID ... WEEKLY_RECORD_HEADERS_LEGACY_DOUBLES (29 declarations)
 233-255   function orderWeeklyHeaders(columns, humanFirstGroups) - Reorders a column set so each human-first group leads, then every remaining column follows in...
 257-290   constants: WEEKLY_RECORD_HEADERS, WEEKLY_RECORD_HEADERS_DOUBLES, WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED
 299-406   constants: DEFAULT_POINTS_BY_PLACE ... LEAGUE_SHEET_HEADERS_DOUBLES (14 declarations)
 410-450   constants: LEAGUE_ID_SINGLES ... TEST_SPREADSHEET_IDS (6 declarations)
 452-457   function isTestSpreadsheetId(spreadsheetId) - Whether a spreadsheet id is on the test-data reset allow-list.
 459-468   function leagueRecordById(leagueId) - Looks up the allow-listed league record for a canonical league id.
 470-481   function leagueRecordBySpreadsheetId(spreadsheetId) - Looks up the allow-listed league record for a spreadsheet id.
 483-495   function resolveLeagueId(selector) - Normalizes a requested routing selector to a canonical league id.
 497-505   function leagueSelectorFrom(data) - Picks the routing selector from a request body: the opaque `league` id when present, otherwis...
 507-514   function resolveSpreadsheetId(selector) - Maps a requested selector to a canonical spreadsheet ID through the server-side league allow-...
 516-522   function resolveSpreadsheet(selector) - Opens the spreadsheet selected by the caller.
 524-535   function normalizeFormat(format) - Normalizes a format value against the server allow-list.
 537-547   function normalizeScoring(scoring) - Normalizes a scoring value against the server allow-list.
 549-583   function parsePointsByPlace(raw) - Parses a compact points-by-place setting ("1:2,2:1.5,3:1") into a place-keyed map.
 585-593   function formatPointsByPlace(byPlace) - Serializes a place-keyed map to the compact "place:value,..." form.
 595-602   function clonePointsByPlace(byPlace) - Copies a place-keyed map so callers cannot mutate the shared default.
 604-623   function resolvePointsRules(leagueSettings) - Resolves the effective points table from League settings.
 625-635   function parseNonNegativeSetting(raw) - Parses a stored numeric setting.
 637-661   function resolvePayoutRules(leagueSettings) - Resolves the weekly payout pool rule from League settings.
 663-683   function migratedPayoutFields(legacyRaw) - Best-effort conversion of a legacy flat payout_by_place table into the weekly pool fields.
 685-711   function settingsWithMigratedPayout(settings) - Returns a copy of a header-keyed settings object with a legacy payout_by_place value carried...
 713-751   function migrateLeaguePayoutSettings(sheet) - Retires the legacy flat payout_by_place column in place, replacing it with the three weekly p...
 753-782   function parseEntryFeeBreakdown(raw) - Parses the compact ordered entry-fee breakdown ("label:amount,...") into an ordered [{ label,...
 784-791   function entryFeeBreakdownTotal(components) - Sums the component amounts, rounded to cents so float drift never warns.
 793-803   function resolveEntryFeeBreakdown(leagueSettings) - Resolves the entry-fee breakdown from League settings.
 805-819   function entryFeeBreakdownMismatch(entryFee, components) - Reports whether an itemised breakdown fails to sum to the configured entry fee.
 821-846   function resolveCheckInOptions(leagueSettings) - Resolves the money options a league offers at check-in from its settings.
 848-874   function getLeagueRules(selector, leagueSettings) - Resolves the capability rules for a requested selector.
 876-894   function readLeagueSettingsRow(sheet) - Reads the League settings row into a header-keyed object.
 896-903   function getLeagueRulesForSpreadsheet(selector, spreadsheet) - Capability rules for a league whose spreadsheet is already open: the League settings row is r...
 905-911   function resolveLeagueFormat(selector) - Resolves the league format for a requested selector through the league table.
 913-919   function defaultScoringForFormat(format) - The deploy-time default scoring for a format when no league record is in hand: singles settle...
 921-940   function rulesForEnums(format, scoring) - Builds capability rules from a (format, scoring) pair.
 942-954   function getWeeklyRecordHeaders(format, scoring) - Weekly record headers for a (format, scoring) pair.
 956-974   function weeklyRecordColumnPool(format, scoring) - Weekly column pool for a (format, scoring) pair, in historical relative order.
 976-983   function getLeagueSheetHeaders(format, scoring) - League sheet headers for a (format, scoring) pair.
 985-996   function getClubMemberHeaders(format, scoring) - ClubMembers headers for a (format, scoring) pair: the base roster columns plus the season_poi...
1002-1022  function ensureCanonicalSheet(spreadsheet, name, headers) - Ensures a named sheet exists in the spreadsheet.
1024-1034  function moveSheetToPosition(spreadsheet, sheetName, targetIndex) - Moves a sheet to a specific 0-based index position in the spreadsheet.
1036-1048  function getWeekSheets(spreadsheet) - Returns all sheets whose names match the pattern "Week YYYY-MM-DD", sorted chronologically (e...
1050-1082  function organizeWeekSheetsChronologically(spreadsheet) - Organizes all Week YYYY-MM-DD sheets in chronological order after League (position 0) and Clu...
1084-1100  function removeDefaultBlankSheet(spreadsheet) - Removes the default blank sheet from a new spreadsheet if it is safe to do so.
1106-1143  function ensureLeagueSheetForFormat(spreadsheet, format, scoring) - Ensures the League sheet exists for the given (format, scoring) pair and records both metadat...
1145-1152  function ensureLeagueMetadataValues(sheet, format, scoring) - Ensures both League metadata columns exist and record the supplied enums.
1154-1174  function ensureLeagueSettingsColumns(sheet, headers) - Appends any missing League settings columns (format, scoring, the per-league points table, an...
1176-1228  function migrateOldLeagueSheet(spreadsheet) - Migrates the legacy 12-column singles League sheet to the 15 base-column schema (the metadata...
1230-1255  function ensureLeagueFormatValue(sheet, format) - Ensures the League sheet's settings row records league_format.
1257-1282  function ensureLeagueScoringValue(sheet, scoring) - Ensures the League sheet's settings row records scoring.
1284-1293  function ensureWeekTemplateSheet(spreadsheet, format, scoring) - Ensures the doubles weekly template tab exists with the format's weekly headers.
1295-1321  function ensureWeekSheet(spreadsheet, leagueDate, format, scoring) - Creates (or returns) a dated weekly tab for the doubles spreadsheet using the doubles headers.
1323-1400  function seedRosterFromSingles(singlesSpreadsheet, doublesSpreadsheet) - Seeds the doubles ClubMembers roster from the singles roster exactly once.
1404-1449  function normalizeRosterSeedMembers(members) - Validates an explicit roster-seed payload.
1451-1476  function mapRosterSeedRow(member, targetHeaders) - Maps one explicit member payload object onto the target ClubMembers header order.
1478-1490  function rosterSeedUpdateValue(mappedValue, existingValue) - The value a roster-seed update writes for one ClubMembers header.
1492-1584  function planRosterSeed(doublesSpreadsheet, members) - Pure planner for the seed-only roster reload.
1586-1599  function applyRosterSeedPlan(sheet, plan) - Applies a plan from planRosterSeed.
1601-1657  function seedRoster(doublesSpreadsheet, options) - Seed-only roster reload.
1661-1696  function provisionDoublesWorkbook(doublesSpreadsheet, singlesSpreadsheet) - Provisions the doubles workbook schema: League (league_format=doubles), ClubMembers, the Week...
1698-1732  function getDoublesProvisioningState(spreadsheet) - Authoritative doubles provisioning-state check.
1734-1748  function handleGetDoublesProvisioningState(data) - Admin action: reports the authoritative doubles provisioning state without writing anything.
1750-1777  function handleProvisionDoubles(data) - Admin action: provisions the configured doubles spreadsheet (League with league_format=double...
1779-1853  function handleSeedRoster(data) - Web-app action: preview or apply the seed-only roster reload.
1855-1861  function getSheetHeaders(sheet) - Reads the header row of a sheet.
1863-1872  function arraysEqual(a, b) - Returns true when two arrays have the same length and identical values.
1874-1884  function readLeagueFormat(sheet) - Reads the league_format stored on the League sheet, or null when absent.
1886-1896  function readLeagueScoring(sheet) - Reads the scoring stored on the League sheet, or null when absent.
1898-1927  function leagueHeadersMatch(headers, format, scoring) - Whether a League header row matches the expected metadata schema for a (format, scoring) pair.
1929-1946  function clubMemberHeadersMatch(headers, format, scoring) - Whether a ClubMembers header row matches a (format, scoring) pair.
1948-1959  function weeklyHeadersMatch(headers, format, scoring) - Whether a weekly header row matches a (format, scoring) pair.
1961-1993  function inspectSpreadsheetTopology(spreadsheet, format, scoring) - Inspects a spreadsheet against the expected topology/headers for a (format, scoring) pair.
1995-2024  function countRoster(spreadsheet) - Counts the roster rows on a spreadsheet's ClubMembers tab.
2028-2046  constants: WEEKLY_COLUMN_ORDER_MIGRATION_APPROVAL_PROPERTY, WEEKLY_COLUMN_ORDER_MIGRATION_APPROVAL_TOKEN, WEEKLY_RECORD_CORE_HEADERS
2048-2057  function isWeeklyRecordHeaderRow(headers) - Whether a header row describes a weekly PlayerRecords sheet.
2059-2074  function weeklyColumnsKnownForFormat(format, scoring) - The full known weekly column set for a (format, scoring) pair.
2076-2089  function weeklyHumanFirstGroups(format, scoring) - Human-first groups for a (format, scoring) pair, in promotion order.
2091-2103  function isWeeklyColumnOrderMigrationAuthorized() - Whether the live migration has been explicitly authorized by the captain.
2105-2178  function planWeeklyColumnReorder(headers, format, scoring) - Plans a human-first reorder of one weekly header row.
2180-2240  function applyWeeklyColumnReorder(sheet, plan) - Writes a reorder plan onto a sheet, preserving every cell value and formula.
2242-2318  function migrateWeeklyColumnOrder(spreadsheet, format, options) - Migrates every weekly PlayerRecords sheet in a spreadsheet to the human-first order.
2320-2362  function handleMigrateWeeklyColumnOrder(data) - Admin/operator handler: dry-run or apply the weekly column-order migration.
2372-2379  function detagDropHeadersForWeekly(format, scoring) - The weekly tag columns a (format, scoring) pair no longer uses.
2381-2387  function detagDropHeadersForClubMembers(format, scoring) - The ClubMembers tag columns a (format, scoring) pair no longer uses.
2389-2440  function planTagColumnDrops(headers, dropHeaders) - Plans the removal of the given tag columns from one header row.
2442-2477  function applyTagColumnDrops(sheet, plan) - Deletes the planned tag columns from a sheet.
2479-2565  function migrateDetagColumnDrops(spreadsheet, format, options) - Migrates a spreadsheet to the tag-free schema for its (format, scoring) pair.
2567-2606  function handleMigrateDetagColumnDrops(data) - Admin/operator handler: dry-run or apply the detag column-drop migration.
2612-2630  function assertTestSpreadsheet(spreadsheetId) - Guards a reset against the development-surface allow-list.
2632-2648  function assertSeedableSpreadsheet(spreadsheetId) - Guards the seed-only roster reload.
2650-2692  function planTestDataReset(spreadsheet, options) - Pure planner: lists every sheet a reset would clear and how many data rows each would lose.
2694-2705  function applyTestDataResetPlan(plans) - Applies a plan from planTestDataReset by deleting every data row below the header.
2707-2726  function summarizeTestDataReset(plan) - Summarizes a reset plan into the totals the preview and the apply report.
2728-2763  function resetTestData(spreadsheet, options) - Guarded test-data reset.
2765-2815  function handleResetTestData(data) - Web-app action: preview or apply the guarded test-data reset.
2821-2835  function doGet(e) - Handles GET requests.
2837-2946  function doPost(e) - Handles POST requests.
2948-2961  function handleGetClubMembersStatus(data) - Returns whether the ClubMembers sheet exists.
2963-3014  function handleCreateClubMembersTab(data) - Creates the ClubMembers tab if it does not already exist.
3016-3078  function handleCreateWeeklyTab(data) - Creates a new weekly tab in the spreadsheet for the given league date.
3080-3157  function handleSearchClubMembers(data) - Searches active club members by name, udisc_username, or pdga_number.
3159-3228  function handleListClubMembers(data) - Lists club members for the selected league.
3230-3478  function handleSubmitCheckIn(data) - Submits a player check-in.
3480-3519  function handleCreateLeagueSheet(data) - Creates the League sheet if it does not already exist.
3521-3576  function buildLeagueSettingsResponse(spreadsheet, selector) - Builds the read-only League settings result for a spreadsheet that is already open.
3578-3590  function handleGetLeagueSettings(data) - Reads the League settings from the League sheet.
3592-3618  function handleGetCheckInOptions(data) - Returns the money options a league offers at check-in plus its plain-language money explanation.
3620-3764  function handleSaveLeagueSettings(data) - Saves or updates League settings on the League sheet.
3766-3793  function buildWeeklyTabsResponse(spreadsheet) - Builds the weekly-tab list for a spreadsheet that is already open.
3795-3804  function handleGetWeeklyTabs(data) - Returns a list of existing weekly league tabs.
3806-3850  function handleGetBootState(data) - Admin boot action: the two reads the admin page performs on every load (the League settings r...
3852-3909  function handleGetWeekView(data) - Admin action: read-only dump of one week tab.
3911-4028  function handleGetPreRoundReview(data) - Loads pre-round review data for a specific league date.
4030-4153  function handleSavePreRoundReview(data) - Saves pre-round review overrides to the League sheet.
4155-4402  function handlePreviewUdiscImport(data) - Previews a UDisc import against the selected weekly sheet.
4412-4451  function parseDoublesHandles(rawValue) - Splits the UDisc doubles handle cell into individual handles.
4453-4490  function parseDoublesPairName(rawValue) - Splits a UDisc doubles `name` cell into partner display names.
4492-4546  function parseDoublesRow(udiscRow) - Parses one UDisc doubles row into independent partner identity objects.
4548-4560  function uniqueStrings(list) - Returns the input list with duplicates removed, preserving first-seen order.
4562-4577  function normalizeDoublesIdentityToken(partner) - Normalizes one doubles partner to a single canonical identity token for the pair key.
4579-4604  function computeDoublesPairKey(parsed, leagueDate) - Computes the ratified doubles pair key: a date-scoped, order-independent key built from the t...
4606-4618  function emptyDoublesMatch() - Builds the match-result skeleton shared by every matching path.
4620-4630  function weeklyDoublesMatch(entry, source, indexes)
4632-4643  function clubDoublesMatch(memberNumber, source, indexes)
4645-4716  function matchDoublesPartner(partner, indexes) - Matches a single doubles partner through the existing identity chain: weekly username -> week...
4718-4740  function computeDoublesPairVerdict(parsed, partners) - Computes the pair-level verdict from the parsed row plus each partner's independent match.
4742-4763  function buildDoublesRoster(clubData, headers) - Builds the active-roster override list returned to the admin UI.
4765-4928  function handlePreviewUdiscImportDoubles(data) - Previews a UDisc doubles export against the selected weekly sheet.
4932-4997  function buildWeeklyMatchIndexes(weeklyData, headers) - Builds the weekly identity indexes used to re-match imported rows at commit time.
4999-5056  function buildClubMatchIndexes(clubData, headers) - Builds the active ClubMembers indexes used to re-match imported identity (username then PDGA,...
5058-5088  function scopeWeeklyIndexes(indexes, pairKey, isSolo) - Restricts the weekly indexes to the rows a doubles partner may match: keyless (solo) rows plu...
5090-5107  function buildDoublesMatchIndexes(scoped, clubIndexes, weeklyIndexes) - Shapes the scoped weekly indexes plus the full club indexes into the object `matchDoublesPart...
5109-5118  function doublesSameScope(existingPairKey, pairKey, isSolo) - True when an existing weekly row belongs to this row's pair scope.
5120-5146  function verifyDoublesOverride(partner, matchIndexes, weeklyIndexes, pairKey, isSolo) - Verifies an admin-supplied partner override.
5148-5156  function doublesPartnerPath(match) - Maps a resolved partner match onto a commit path.
5158-5191  function buildCommitImportFields(udiscRow) - Builds the UDisc import fields for a weekly row exactly as the singles committer writes them...
5193-5211  function buildDoublesImportFields(udiscRow, partner, rules) - Builds the import fields for one doubles partner row.
5213-5249  function expectedWeeklyImportColumns(format, scoring) - Every weekly column the UDisc import mapping writes.
5251-5259  function missingWeeklyImportColumns(headers, format, scoring) - Returns the expected import columns missing from a weekly header row.
5261-5274  function weeklyImportColumnsGuard(headers, format, scoring) - Loud commit gate: every column the import mapping writes must exist on the target week tab.
5276-5282  function applyFieldsByName(target, headers, fields) - Writes a { header: value } map onto a row array by header index.
5284-5308  function buildNewWeeklyRecord(headers, identity, importFields, pairFields, now) - Builds a full new weekly row using the league's capability-derived weekly record schema with...
5310-5320  function updateWeeklyImportRow(sheet, rowIndex, headers, fields, now) - Updates an existing weekly row in place from the current row contents so protected fields (me...
5322-5370  function createClubMemberUnderLock(clubSheet, clubHeaders, identity, now) - Creates a ClubMembers row for a new identity.
5372-5394  function normalizeDoublesOverrides(overrides, rowIndex) - Normalizes the per-row admin override payload into { partner_index: member_number }.
5396-5427  function buildDoublesPairFields(headers, udiscRow, memberNumber, pairKey, isSolo, rules) - Builds the doubles-only columns written onto one partner's weekly row.
5429-5439  function findWeeklyIdentity(indexes, partner) - Finds the first weekly entry whose identity matches a partner's.
5441-5499  function detectDoublesConflict(plan, pairKey, isSolo, scopeKey, weeklyIndexes, memberToPairKey, includeIdentityChange) - Detects commit-only conflicts for a ready doubles row against authoritative server state.
5501-5527  function buildDoublesPartnerOutcomes(plan, parsed) - Partner outcomes for one doubles row, from either a resolved plan or matches.
5529-5541  function buildDoublesRowResult(rowIndex, parsed, pairKey, isSolo, status, reason, plan) - Builds one per-row doubles commit outcome.
5543-5552  function compensateAppendedWeeklyRows(appended) - Best-effort compensating delete of weekly rows appended for a failed pair.
5554-5565  function compensateAppendedMembers(clubSheet, appendedMembers) - Best-effort compensating delete of ClubMembers rows created for a failed pair.
5567-5713  function commitDoublesPairUnderLock(context) - Executes the member phase and weekly phase for one ready doubles row while the caller holds t...
5715-5946  function handleCommitUdiscImportDoubles(data) - Commits an approved UDisc doubles import to the selected weekly sheet.
5948-6187  function handleCommitUdiscImport(data) - Commits an approved UDisc import to the selected weekly sheet.
6189-6215  function buildFieldsToImport(udiscRow) - Builds the fields_to_import object from a UDisc row.
6217-6239  function buildMatchEntry(udiscRow, weeklyRow, matchMethod) - Builds a matched entry object for the preview response.
6241-6382  function handleCalculateTags(data) - Calculates tag assignments for a weekly league.
6384-6505  function handleConfirmTags(data) - Confirms and writes tag assignments for a weekly league.
6507-6635  function handleFinalizeRound(data) - Finalizes a round by propagating out_tag values from the weekly sheet to each matching ClubMe...
6651-6667  function doublesPointsForPosition(positionRaw, rules) - Pure scoring rule for a points league: a placement found in the league's points table earns i...
6669-6672  function roundCurrency(amount) - Rounds a dollar amount to cents so float drift never reaches the UI.
6674-6756  function applyWeeklyPayout(pairs, playerCount, rules) - Applies the weekly pool rule to the grouped teams and returns the payout summary.
6758-6816  function buildDoublesPointsPlan(weeklyData, headers, rules) - Builds the read-only per-row results view for one doubles week tab.
6818-6844  function readDoublesPointsTab(spreadsheet, leagueDate, rules) - Opens and validates the doubles weekly results tab for a league date.
6846-6857  function validateDoublesPointsRequest(data) - Validates the shared points request shape (points gate + league_date).
6859-6874  function pointsRowResponse(row) - Public shape of one row in the read-only points results view.
6876-6882  function pointsSummary(rows)
6884-6937  function groupDoublesPointsPairs(rows) - Groups results rows by pair_key for the results table.
6939-6975  function handleCalculatePoints(data) - Admin action: read the committed doubles results for one week.
6977-7051  function handleSeasonStandings(data) - Admin action: the season standings — every member with positive live season points, plus thei...
7053-7086  function handleSyncSeasonCaches(data) - Maintenance action: recompute both doubles season caches (season_points and season_earnings)...
7088-7148  function sumSeasonTotalsByMember(spreadsheet, rules) - Aggregates every doubles season total in one traversal of the season's Week tabs.
7150-7157  function sumSeasonPointsByMember(spreadsheet) - Sums each member's committed weekly points across every Week tab.
7159-7166  function sumSeasonEarningsByMember(spreadsheet, rules) - Sums each member's season earnings across every Week tab.
7168-7187  function ensureClubSeasonColumn(clubSheet, header) - Ensures a doubles ClubMembers roster carries the given cache column, appending the header aft...
7189-7196  function ensureSeasonPointsColumn(clubSheet) - Ensures the doubles ClubMembers roster carries the `season_points` cache column.
7198-7205  function ensureSeasonEarningsColumn(clubSheet) - Ensures the doubles ClubMembers roster carries the `season_earnings` cache column.
7207-7250  function syncClubSeasonColumn(spreadsheet, header, totals) - Recomputes one doubles ClubMembers cache column from the committed weekly data and persists i...
7252-7261  function syncDoublesSeasonPoints(spreadsheet) - Recomputes the doubles ClubMembers `season_points` cache from the committed weekly_points.
7263-7273  function syncDoublesSeasonEarnings(spreadsheet, rules) - Recomputes the doubles ClubMembers `season_earnings` cache from the re-derived weekly payouts.
7275-7288  function respond(status, message, extra) - Builds and returns a JSON response.
```
