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
4410-4935  Doubles import preview (read-only)
4936-6642  Commit helpers shared by the singles and doubles import commit paths
6643-6953  Doubles points: compute-at-commit + live results
6954-7706  Doubles tie resolution
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
2837-2952  function doPost(e) - Handles POST requests.
2954-2967  function handleGetClubMembersStatus(data) - Returns whether the ClubMembers sheet exists.
2969-3020  function handleCreateClubMembersTab(data) - Creates the ClubMembers tab if it does not already exist.
3022-3084  function handleCreateWeeklyTab(data) - Creates a new weekly tab in the spreadsheet for the given league date.
3086-3163  function handleSearchClubMembers(data) - Searches active club members by name, udisc_username, or pdga_number.
3165-3234  function handleListClubMembers(data) - Lists club members for the selected league.
3236-3484  function handleSubmitCheckIn(data) - Submits a player check-in.
3486-3525  function handleCreateLeagueSheet(data) - Creates the League sheet if it does not already exist.
3527-3582  function buildLeagueSettingsResponse(spreadsheet, selector) - Builds the read-only League settings result for a spreadsheet that is already open.
3584-3596  function handleGetLeagueSettings(data) - Reads the League settings from the League sheet.
3598-3624  function handleGetCheckInOptions(data) - Returns the money options a league offers at check-in plus its plain-language money explanation.
3626-3770  function handleSaveLeagueSettings(data) - Saves or updates League settings on the League sheet.
3772-3799  function buildWeeklyTabsResponse(spreadsheet) - Builds the weekly-tab list for a spreadsheet that is already open.
3801-3810  function handleGetWeeklyTabs(data) - Returns a list of existing weekly league tabs.
3812-3856  function handleGetBootState(data) - Admin boot action: the two reads the admin page performs on every load (the League settings r...
3858-3915  function handleGetWeekView(data) - Admin action: read-only dump of one week tab.
3917-4034  function handleGetPreRoundReview(data) - Loads pre-round review data for a specific league date.
4036-4159  function handleSavePreRoundReview(data) - Saves pre-round review overrides to the League sheet.
4161-4408  function handlePreviewUdiscImport(data) - Previews a UDisc import against the selected weekly sheet.
4418-4457  function parseDoublesHandles(rawValue) - Splits the UDisc doubles handle cell into individual handles.
4459-4496  function parseDoublesPairName(rawValue) - Splits a UDisc doubles `name` cell into partner display names.
4498-4552  function parseDoublesRow(udiscRow) - Parses one UDisc doubles row into independent partner identity objects.
4554-4566  function uniqueStrings(list) - Returns the input list with duplicates removed, preserving first-seen order.
4568-4583  function normalizeDoublesIdentityToken(partner) - Normalizes one doubles partner to a single canonical identity token for the pair key.
4585-4610  function computeDoublesPairKey(parsed, leagueDate) - Computes the ratified doubles pair key: a date-scoped, order-independent key built from the t...
4612-4624  function emptyDoublesMatch() - Builds the match-result skeleton shared by every matching path.
4626-4636  function weeklyDoublesMatch(entry, source, indexes)
4638-4649  function clubDoublesMatch(memberNumber, source, indexes)
4651-4722  function matchDoublesPartner(partner, indexes) - Matches a single doubles partner through the existing identity chain: weekly username -> week...
4724-4746  function computeDoublesPairVerdict(parsed, partners) - Computes the pair-level verdict from the parsed row plus each partner's independent match.
4748-4769  function buildDoublesRoster(clubData, headers) - Builds the active-roster override list returned to the admin UI.
4771-4934  function handlePreviewUdiscImportDoubles(data) - Previews a UDisc doubles export against the selected weekly sheet.
4938-5003  function buildWeeklyMatchIndexes(weeklyData, headers) - Builds the weekly identity indexes used to re-match imported rows at commit time.
5005-5062  function buildClubMatchIndexes(clubData, headers) - Builds the active ClubMembers indexes used to re-match imported identity (username then PDGA,...
5064-5094  function scopeWeeklyIndexes(indexes, pairKey, isSolo) - Restricts the weekly indexes to the rows a doubles partner may match: keyless (solo) rows plu...
5096-5113  function buildDoublesMatchIndexes(scoped, clubIndexes, weeklyIndexes) - Shapes the scoped weekly indexes plus the full club indexes into the object `matchDoublesPart...
5115-5124  function doublesSameScope(existingPairKey, pairKey, isSolo) - True when an existing weekly row belongs to this row's pair scope.
5126-5152  function verifyDoublesOverride(partner, matchIndexes, weeklyIndexes, pairKey, isSolo) - Verifies an admin-supplied partner override.
5154-5162  function doublesPartnerPath(match) - Maps a resolved partner match onto a commit path.
5164-5197  function buildCommitImportFields(udiscRow) - Builds the UDisc import fields for a weekly row exactly as the singles committer writes them...
5199-5217  function buildDoublesImportFields(udiscRow, partner, rules) - Builds the import fields for one doubles partner row.
5219-5255  function expectedWeeklyImportColumns(format, scoring) - Every weekly column the UDisc import mapping writes.
5257-5265  function missingWeeklyImportColumns(headers, format, scoring) - Returns the expected import columns missing from a weekly header row.
5267-5280  function weeklyImportColumnsGuard(headers, format, scoring) - Loud commit gate: every column the import mapping writes must exist on the target week tab.
5282-5288  function applyFieldsByName(target, headers, fields) - Writes a { header: value } map onto a row array by header index.
5290-5314  function buildNewWeeklyRecord(headers, identity, importFields, pairFields, now) - Builds a full new weekly row using the league's capability-derived weekly record schema with...
5316-5326  function updateWeeklyImportRow(sheet, rowIndex, headers, fields, now) - Updates an existing weekly row in place from the current row contents so protected fields (me...
5328-5376  function createClubMemberUnderLock(clubSheet, clubHeaders, identity, now) - Creates a ClubMembers row for a new identity.
5378-5400  function normalizeDoublesOverrides(overrides, rowIndex) - Normalizes the per-row admin override payload into { partner_index: member_number }.
5402-5433  function buildDoublesPairFields(headers, udiscRow, memberNumber, pairKey, isSolo, rules) - Builds the doubles-only columns written onto one partner's weekly row.
5435-5445  function findWeeklyIdentity(indexes, partner) - Finds the first weekly entry whose identity matches a partner's.
5447-5505  function detectDoublesConflict(plan, pairKey, isSolo, scopeKey, weeklyIndexes, memberToPairKey, includeIdentityChange) - Detects commit-only conflicts for a ready doubles row against authoritative server state.
5507-5533  function buildDoublesPartnerOutcomes(plan, parsed) - Partner outcomes for one doubles row, from either a resolved plan or matches.
5535-5547  function buildDoublesRowResult(rowIndex, parsed, pairKey, isSolo, status, reason, plan) - Builds one per-row doubles commit outcome.
5549-5558  function compensateAppendedWeeklyRows(appended) - Best-effort compensating delete of weekly rows appended for a failed pair.
5560-5571  function compensateAppendedMembers(clubSheet, appendedMembers) - Best-effort compensating delete of ClubMembers rows created for a failed pair.
5573-5719  function commitDoublesPairUnderLock(context) - Executes the member phase and weekly phase for one ready doubles row while the caller holds t...
5721-5952  function handleCommitUdiscImportDoubles(data) - Commits an approved UDisc doubles import to the selected weekly sheet.
5954-6193  function handleCommitUdiscImport(data) - Commits an approved UDisc import to the selected weekly sheet.
6195-6221  function buildFieldsToImport(udiscRow) - Builds the fields_to_import object from a UDisc row.
6223-6245  function buildMatchEntry(udiscRow, weeklyRow, matchMethod) - Builds a matched entry object for the preview response.
6247-6388  function handleCalculateTags(data) - Calculates tag assignments for a weekly league.
6390-6511  function handleConfirmTags(data) - Confirms and writes tag assignments for a weekly league.
6513-6641  function handleFinalizeRound(data) - Finalizes a round by propagating out_tag values from the weekly sheet to each matching ClubMe...
6657-6673  function doublesPointsForPosition(positionRaw, rules) - Pure scoring rule for a points league: a placement found in the league's points table earns i...
6675-6678  function roundCurrency(amount) - Rounds a dollar amount to cents so float drift never reaches the UI.
6680-6687  function isSecondPlacePaid(payout, playerCount) - Whether the fixed second-place share is paid for a field of `playerCount`: the league sets a...
6689-6771  function applyWeeklyPayout(pairs, playerCount, rules) - Applies the weekly pool rule to the grouped teams and returns the payout summary.
6773-6831  function buildDoublesPointsPlan(weeklyData, headers, rules) - Builds the read-only per-row results view for one doubles week tab.
6833-6859  function readDoublesPointsTab(spreadsheet, leagueDate, rules) - Opens and validates the doubles weekly results tab for a league date.
6861-6872  function validateDoublesPointsRequest(data) - Validates the shared points request shape (points gate + league_date).
6874-6889  function pointsRowResponse(row) - Public shape of one row in the read-only points results view.
6891-6897  function pointsSummary(rows)
6899-6952  function groupDoublesPointsPairs(rows) - Groups results rows by pair_key for the results table.
6969-6972  constants: TIE_BREAKS_SHEET_NAME ... TIE_STATUS_FINALIZED (4 declarations)
6974-6979  function doublesTeamKey(pair) - Stable identity of one team on a results view: its pair key, or the solo member.
6981-6989  function payingPlaceLimit(rules, playerCount) - The lowest place that is paid money this week: 0 when the league pays no weekly money, 1 when...
6991-7064  function resolveDoublesTies(pairs, picks, limit) - Pure tie detector and resolver.
7066-7069  function tiePlaceLabel(placement) - The place label the week tab shows: "T2" while teams are level, "3" once alone.
7071-7114  function readTieBreaks(spreadsheet, leagueDate) - Reads the saved tie picks for one week.
7116-7130  function rewriteTieBreakRows(spreadsheet, leagueDate, onlyPlace, newRows) - Replaces the TieBreaks rows this week owns (only those at `onlyPlace` when given) with `newRo...
7132-7160  function buildTieView(spreadsheet, leagueDate, pairs, rules, playerCount) - Builds the tie view for a week: the picks applied over the imported placement (a draft until...
7162-7177  function applyTiePlacements(pairs, placements, rules) - Moves each picked team to its chosen place on the grouped results (response copies only).
7179-7199  function tieViewResponse(view) - Public shape of the tie view in the results response.
7201-7214  function describeUnresolvedTies(unresolved, pairs) - Human description of the ties still waiting on a winner, for the refusal message.
7216-7257  function handleCalculatePoints(data, message) - Admin action: read the committed doubles results for one week.
7259-7322  function handleSaveTieBreaks(data) - Admin action: save the winner order for one tied place before the week is finalized.
7324-7394  function handleFinalizeDoublesWeek(data) - Admin action: finalize the week's tie resolution.
7396-7470  function handleSeasonStandings(data) - Admin action: the season standings — every member with positive live season points, plus thei...
7472-7505  function handleSyncSeasonCaches(data) - Maintenance action: recompute both doubles season caches (season_points and season_earnings)...
7507-7567  function sumSeasonTotalsByMember(spreadsheet, rules) - Aggregates every doubles season total in one traversal of the season's Week tabs.
7569-7576  function sumSeasonPointsByMember(spreadsheet) - Sums each member's committed weekly points across every Week tab.
7578-7585  function sumSeasonEarningsByMember(spreadsheet, rules) - Sums each member's season earnings across every Week tab.
7587-7606  function ensureClubSeasonColumn(clubSheet, header) - Ensures a doubles ClubMembers roster carries the given cache column, appending the header aft...
7608-7615  function ensureSeasonPointsColumn(clubSheet) - Ensures the doubles ClubMembers roster carries the `season_points` cache column.
7617-7624  function ensureSeasonEarningsColumn(clubSheet) - Ensures the doubles ClubMembers roster carries the `season_earnings` cache column.
7626-7669  function syncClubSeasonColumn(spreadsheet, header, totals) - Recomputes one doubles ClubMembers cache column from the committed weekly data and persists i...
7671-7680  function syncDoublesSeasonPoints(spreadsheet) - Recomputes the doubles ClubMembers `season_points` cache from the committed weekly_points.
7682-7692  function syncDoublesSeasonEarnings(spreadsheet, rules) - Recomputes the doubles ClubMembers `season_earnings` cache from the re-derived weekly payouts.
7694-7707  function respond(status, message, extra) - Builds and returns a JSON response.
```
