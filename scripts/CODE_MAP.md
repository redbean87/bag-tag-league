# scripts/Code.gs navigation map

An index of the top-level sections and functions in `scripts/Code.gs` with line ranges, so a reader can read only the slice they need instead of the whole file.

Line numbers refer to the committed `scripts/Code.gs` as of this revision.

The section ranges come from the `// --- Name ---` banner comments in `Code.gs` itself.
Each section range runs from its opening banner to its closing `End` banner, or to the next banner or end of file.

Regenerate with `node scripts/gen-code-map.js` after any edit to `scripts/Code.gs`.
`tests/code-map.test.js` fails when this map is stale.

## Sections

```
 422-1012  Spreadsheet routing
1014-1116  Sheet-position helpers
1118-2839  Doubles provisioning
1416-1673    Seed-only roster reload
2046-2384    Weekly column-order migration
2386-2628    Detag column-drop migration
2630-2837    Test-data reset
3964-4229  Admin check-in
4724-5249  Doubles import preview (read-only)
5250-6970  Commit helpers shared by the singles and doubles import commit paths
6971-7282  Doubles points: compute-at-commit + live results
7283-7994  Doubles tie resolution
7995-8190  Attendance: appearances maintained at finalize
```

## Contents

```
  11-245   constants: SPREADSHEET_ID ... WEEKLY_RECORD_HEADERS_LEGACY_DOUBLES (32 declarations)
 247-269   function orderWeeklyHeaders(columns, humanFirstGroups) - Reorders a column set so each human-first group leads, then every remaining column follows in...
 271-304   constants: WEEKLY_RECORD_HEADERS, WEEKLY_RECORD_HEADERS_DOUBLES, WEEKLY_RECORD_HEADERS_DOUBLES_TAGGED
 313-420   constants: DEFAULT_POINTS_BY_PLACE ... LEAGUE_SHEET_HEADERS_DOUBLES (14 declarations)
 424-464   constants: LEAGUE_ID_SINGLES ... TEST_SPREADSHEET_IDS (6 declarations)
 466-471   function isTestSpreadsheetId(spreadsheetId) - Whether a spreadsheet id is on the test-data reset allow-list.
 473-482   function leagueRecordById(leagueId) - Looks up the allow-listed league record for a canonical league id.
 484-495   function leagueRecordBySpreadsheetId(spreadsheetId) - Looks up the allow-listed league record for a spreadsheet id.
 497-509   function resolveLeagueId(selector) - Normalizes a requested routing selector to a canonical league id.
 511-519   function leagueSelectorFrom(data) - Picks the routing selector from a request body: the opaque `league` id when present, otherwis...
 521-528   function resolveSpreadsheetId(selector) - Maps a requested selector to a canonical spreadsheet ID through the server-side league allow-...
 530-536   function resolveSpreadsheet(selector) - Opens the spreadsheet selected by the caller.
 538-549   function normalizeFormat(format) - Normalizes a format value against the server allow-list.
 551-561   function normalizeScoring(scoring) - Normalizes a scoring value against the server allow-list.
 563-597   function parsePointsByPlace(raw) - Parses a compact points-by-place setting ("1:2,2:1.5,3:1") into a place-keyed map.
 599-607   function formatPointsByPlace(byPlace) - Serializes a place-keyed map to the compact "place:value,..." form.
 609-616   function clonePointsByPlace(byPlace) - Copies a place-keyed map so callers cannot mutate the shared default.
 618-637   function resolvePointsRules(leagueSettings) - Resolves the effective points table from League settings.
 639-649   function parseNonNegativeSetting(raw) - Parses a stored numeric setting.
 651-675   function resolvePayoutRules(leagueSettings) - Resolves the weekly payout pool rule from League settings.
 677-697   function migratedPayoutFields(legacyRaw) - Best-effort conversion of a legacy flat payout_by_place table into the weekly pool fields.
 699-725   function settingsWithMigratedPayout(settings) - Returns a copy of a header-keyed settings object with a legacy payout_by_place value carried...
 727-765   function migrateLeaguePayoutSettings(sheet) - Retires the legacy flat payout_by_place column in place, replacing it with the three weekly p...
 767-796   function parseEntryFeeBreakdown(raw) - Parses the compact ordered entry-fee breakdown ("label:amount,...") into an ordered [{ label,...
 798-805   function entryFeeBreakdownTotal(components) - Sums the component amounts, rounded to cents so float drift never warns.
 807-817   function resolveEntryFeeBreakdown(leagueSettings) - Resolves the entry-fee breakdown from League settings.
 819-833   function entryFeeBreakdownMismatch(entryFee, components) - Reports whether an itemised breakdown fails to sum to the configured entry fee.
 835-860   function resolveCheckInOptions(leagueSettings) - Resolves the money options a league offers at check-in from its settings.
 862-888   function getLeagueRules(selector, leagueSettings) - Resolves the capability rules for a requested selector.
 890-908   function readLeagueSettingsRow(sheet) - Reads the League settings row into a header-keyed object.
 910-917   function getLeagueRulesForSpreadsheet(selector, spreadsheet) - Capability rules for a league whose spreadsheet is already open: the League settings row is r...
 919-925   function resolveLeagueFormat(selector) - Resolves the league format for a requested selector through the league table.
 927-933   function defaultScoringForFormat(format) - The deploy-time default scoring for a format when no league record is in hand: singles settle...
 935-954   function rulesForEnums(format, scoring) - Builds capability rules from a (format, scoring) pair.
 956-968   function getWeeklyRecordHeaders(format, scoring) - Weekly record headers for a (format, scoring) pair.
 970-988   function weeklyRecordColumnPool(format, scoring) - Weekly column pool for a (format, scoring) pair, in historical relative order.
 990-997   function getLeagueSheetHeaders(format, scoring) - League sheet headers for a (format, scoring) pair.
 999-1010  function getClubMemberHeaders(format, scoring) - ClubMembers headers for a (format, scoring) pair: the base roster columns plus the season_poi...
1016-1036  function ensureCanonicalSheet(spreadsheet, name, headers) - Ensures a named sheet exists in the spreadsheet.
1038-1048  function moveSheetToPosition(spreadsheet, sheetName, targetIndex) - Moves a sheet to a specific 0-based index position in the spreadsheet.
1050-1062  function getWeekSheets(spreadsheet) - Returns all sheets whose names match the pattern "Week YYYY-MM-DD", sorted chronologically (e...
1064-1096  function organizeWeekSheetsChronologically(spreadsheet) - Organizes all Week YYYY-MM-DD sheets in chronological order after League (position 0) and Clu...
1098-1114  function removeDefaultBlankSheet(spreadsheet) - Removes the default blank sheet from a new spreadsheet if it is safe to do so.
1120-1157  function ensureLeagueSheetForFormat(spreadsheet, format, scoring) - Ensures the League sheet exists for the given (format, scoring) pair and records both metadat...
1159-1166  function ensureLeagueMetadataValues(sheet, format, scoring) - Ensures both League metadata columns exist and record the supplied enums.
1168-1188  function ensureLeagueSettingsColumns(sheet, headers) - Appends any missing League settings columns (format, scoring, the per-league points table, an...
1190-1242  function migrateOldLeagueSheet(spreadsheet) - Migrates the legacy 12-column singles League sheet to the 15 base-column schema (the metadata...
1244-1269  function ensureLeagueFormatValue(sheet, format) - Ensures the League sheet's settings row records league_format.
1271-1296  function ensureLeagueScoringValue(sheet, scoring) - Ensures the League sheet's settings row records scoring.
1298-1307  function ensureWeekTemplateSheet(spreadsheet, format, scoring) - Ensures the doubles weekly template tab exists with the format's weekly headers.
1309-1335  function ensureWeekSheet(spreadsheet, leagueDate, format, scoring) - Creates (or returns) a dated weekly tab for the doubles spreadsheet using the doubles headers.
1337-1414  function seedRosterFromSingles(singlesSpreadsheet, doublesSpreadsheet) - Seeds the doubles ClubMembers roster from the singles roster exactly once.
1418-1463  function normalizeRosterSeedMembers(members) - Validates an explicit roster-seed payload.
1465-1490  function mapRosterSeedRow(member, targetHeaders) - Maps one explicit member payload object onto the target ClubMembers header order.
1492-1504  function rosterSeedUpdateValue(mappedValue, existingValue) - The value a roster-seed update writes for one ClubMembers header.
1506-1598  function planRosterSeed(doublesSpreadsheet, members) - Pure planner for the seed-only roster reload.
1600-1613  function applyRosterSeedPlan(sheet, plan) - Applies a plan from planRosterSeed.
1615-1671  function seedRoster(doublesSpreadsheet, options) - Seed-only roster reload.
1675-1710  function provisionDoublesWorkbook(doublesSpreadsheet, singlesSpreadsheet) - Provisions the doubles workbook schema: League (league_format=doubles), ClubMembers, the Week...
1712-1746  function getDoublesProvisioningState(spreadsheet) - Authoritative doubles provisioning-state check.
1748-1762  function handleGetDoublesProvisioningState(data) - Admin action: reports the authoritative doubles provisioning state without writing anything.
1764-1791  function handleProvisionDoubles(data) - Admin action: provisions the configured doubles spreadsheet (League with league_format=double...
1793-1867  function handleSeedRoster(data) - Web-app action: preview or apply the seed-only roster reload.
1869-1875  function getSheetHeaders(sheet) - Reads the header row of a sheet.
1877-1886  function arraysEqual(a, b) - Returns true when two arrays have the same length and identical values.
1888-1898  function readLeagueFormat(sheet) - Reads the league_format stored on the League sheet, or null when absent.
1900-1910  function readLeagueScoring(sheet) - Reads the scoring stored on the League sheet, or null when absent.
1912-1941  function leagueHeadersMatch(headers, format, scoring) - Whether a League header row matches the expected metadata schema for a (format, scoring) pair.
1943-1966  function clubMemberHeadersMatch(headers, format, scoring) - Whether a ClubMembers header row matches a (format, scoring) pair.
1968-1979  function weeklyHeadersMatch(headers, format, scoring) - Whether a weekly header row matches a (format, scoring) pair.
1981-2013  function inspectSpreadsheetTopology(spreadsheet, format, scoring) - Inspects a spreadsheet against the expected topology/headers for a (format, scoring) pair.
2015-2044  function countRoster(spreadsheet) - Counts the roster rows on a spreadsheet's ClubMembers tab.
2048-2066  constants: WEEKLY_COLUMN_ORDER_MIGRATION_APPROVAL_PROPERTY, WEEKLY_COLUMN_ORDER_MIGRATION_APPROVAL_TOKEN, WEEKLY_RECORD_CORE_HEADERS
2068-2077  function isWeeklyRecordHeaderRow(headers) - Whether a header row describes a weekly PlayerRecords sheet.
2079-2094  function weeklyColumnsKnownForFormat(format, scoring) - The full known weekly column set for a (format, scoring) pair.
2096-2109  function weeklyHumanFirstGroups(format, scoring) - Human-first groups for a (format, scoring) pair, in promotion order.
2111-2123  function isWeeklyColumnOrderMigrationAuthorized() - Whether the live migration has been explicitly authorized by the captain.
2125-2198  function planWeeklyColumnReorder(headers, format, scoring) - Plans a human-first reorder of one weekly header row.
2200-2260  function applyWeeklyColumnReorder(sheet, plan) - Writes a reorder plan onto a sheet, preserving every cell value and formula.
2262-2338  function migrateWeeklyColumnOrder(spreadsheet, format, options) - Migrates every weekly PlayerRecords sheet in a spreadsheet to the human-first order.
2340-2382  function handleMigrateWeeklyColumnOrder(data) - Admin/operator handler: dry-run or apply the weekly column-order migration.
2392-2399  function detagDropHeadersForWeekly(format, scoring) - The weekly tag columns a (format, scoring) pair no longer uses.
2401-2407  function detagDropHeadersForClubMembers(format, scoring) - The ClubMembers tag columns a (format, scoring) pair no longer uses.
2409-2460  function planTagColumnDrops(headers, dropHeaders) - Plans the removal of the given tag columns from one header row.
2462-2497  function applyTagColumnDrops(sheet, plan) - Deletes the planned tag columns from a sheet.
2499-2585  function migrateDetagColumnDrops(spreadsheet, format, options) - Migrates a spreadsheet to the tag-free schema for its (format, scoring) pair.
2587-2626  function handleMigrateDetagColumnDrops(data) - Admin/operator handler: dry-run or apply the detag column-drop migration.
2632-2650  function assertTestSpreadsheet(spreadsheetId) - Guards a reset against the development-surface allow-list.
2652-2668  function assertSeedableSpreadsheet(spreadsheetId) - Guards the seed-only roster reload.
2670-2712  function planTestDataReset(spreadsheet, options) - Pure planner: lists every sheet a reset would clear and how many data rows each would lose.
2714-2725  function applyTestDataResetPlan(plans) - Applies a plan from planTestDataReset by deleting every data row below the header.
2727-2746  function summarizeTestDataReset(plan) - Summarizes a reset plan into the totals the preview and the apply report.
2748-2783  function resetTestData(spreadsheet, options) - Guarded test-data reset.
2785-2835  function handleResetTestData(data) - Web-app action: preview or apply the guarded test-data reset.
2841-2855  function doGet(e) - Handles GET requests.
2857-2984  function doPost(e) - Handles POST requests.
2986-2999  function handleGetClubMembersStatus(data) - Returns whether the ClubMembers sheet exists.
3001-3052  function handleCreateClubMembersTab(data) - Creates the ClubMembers tab if it does not already exist.
3054-3116  function handleCreateWeeklyTab(data) - Creates a new weekly tab in the spreadsheet for the given league date.
3118-3201  function handleSearchClubMembers(data) - Searches active club members by name, udisc_username, or pdga_number.
3203-3281  function handleListClubMembers(data) - Lists club members for the selected league.
3283-3531  function handleSubmitCheckIn(data) - Submits a player check-in.
3533-3572  function handleCreateLeagueSheet(data) - Creates the League sheet if it does not already exist.
3574-3629  function buildLeagueSettingsResponse(spreadsheet, selector) - Builds the read-only League settings result for a spreadsheet that is already open.
3631-3643  function handleGetLeagueSettings(data) - Reads the League settings from the League sheet.
3645-3671  function handleGetCheckInOptions(data) - Returns the money options a league offers at check-in plus its plain-language money explanation.
3673-3817  function handleSaveLeagueSettings(data) - Saves or updates League settings on the League sheet.
3819-3846  function buildWeeklyTabsResponse(spreadsheet) - Builds the weekly-tab list for a spreadsheet that is already open.
3848-3857  function handleGetWeeklyTabs(data) - Returns a list of existing weekly league tabs.
3859-3903  function handleGetBootState(data) - Admin boot action: the two reads the admin page performs on every load (the League settings r...
3905-3962  function handleGetWeekView(data) - Admin action: read-only dump of one week tab.
3971-3974  function isCheckedInCell(value) - True when a weekly cell holds a truthy checkbox value.
3976-4013  function resolveAdminCheckInContext(data) - Resolves the weekly sheet for an admin check-in call, or returns an error response.
4015-4022  function findWeeklyRowIndex(values, headers, memberNumber) - Finds the 0-based index in `values` of the weekly row for a member, or -1.
4024-4104  function handleGetAdminCheckInRoster(data) - Read-only check-in roster for one league date: every player already on the weekly sheet plus...
4106-4185  function handleAdminCheckIn(data) - Checks a player in from the admin page.
4187-4227  function handleAdminUndoCheckIn(data) - Undoes a check-in.
4231-4348  function handleGetPreRoundReview(data) - Loads pre-round review data for a specific league date.
4350-4473  function handleSavePreRoundReview(data) - Saves pre-round review overrides to the League sheet.
4475-4722  function handlePreviewUdiscImport(data) - Previews a UDisc import against the selected weekly sheet.
4732-4771  function parseDoublesHandles(rawValue) - Splits the UDisc doubles handle cell into individual handles.
4773-4810  function parseDoublesPairName(rawValue) - Splits a UDisc doubles `name` cell into partner display names.
4812-4866  function parseDoublesRow(udiscRow) - Parses one UDisc doubles row into independent partner identity objects.
4868-4880  function uniqueStrings(list) - Returns the input list with duplicates removed, preserving first-seen order.
4882-4897  function normalizeDoublesIdentityToken(partner) - Normalizes one doubles partner to a single canonical identity token for the pair key.
4899-4924  function computeDoublesPairKey(parsed, leagueDate) - Computes the ratified doubles pair key: a date-scoped, order-independent key built from the t...
4926-4938  function emptyDoublesMatch() - Builds the match-result skeleton shared by every matching path.
4940-4950  function weeklyDoublesMatch(entry, source, indexes)
4952-4963  function clubDoublesMatch(memberNumber, source, indexes)
4965-5036  function matchDoublesPartner(partner, indexes) - Matches a single doubles partner through the existing identity chain: weekly username -> week...
5038-5060  function computeDoublesPairVerdict(parsed, partners) - Computes the pair-level verdict from the parsed row plus each partner's independent match.
5062-5083  function buildDoublesRoster(clubData, headers) - Builds the active-roster override list returned to the admin UI.
5085-5248  function handlePreviewUdiscImportDoubles(data) - Previews a UDisc doubles export against the selected weekly sheet.
5252-5317  function buildWeeklyMatchIndexes(weeklyData, headers) - Builds the weekly identity indexes used to re-match imported rows at commit time.
5319-5376  function buildClubMatchIndexes(clubData, headers) - Builds the active ClubMembers indexes used to re-match imported identity (username then PDGA,...
5378-5408  function scopeWeeklyIndexes(indexes, pairKey, isSolo) - Restricts the weekly indexes to the rows a doubles partner may match: keyless (solo) rows plu...
5410-5427  function buildDoublesMatchIndexes(scoped, clubIndexes, weeklyIndexes) - Shapes the scoped weekly indexes plus the full club indexes into the object `matchDoublesPart...
5429-5438  function doublesSameScope(existingPairKey, pairKey, isSolo) - True when an existing weekly row belongs to this row's pair scope.
5440-5466  function verifyDoublesOverride(partner, matchIndexes, weeklyIndexes, pairKey, isSolo) - Verifies an admin-supplied partner override.
5468-5476  function doublesPartnerPath(match) - Maps a resolved partner match onto a commit path.
5478-5511  function buildCommitImportFields(udiscRow) - Builds the UDisc import fields for a weekly row exactly as the singles committer writes them...
5513-5531  function buildDoublesImportFields(udiscRow, partner, rules) - Builds the import fields for one doubles partner row.
5533-5569  function expectedWeeklyImportColumns(format, scoring) - Every weekly column the UDisc import mapping writes.
5571-5579  function missingWeeklyImportColumns(headers, format, scoring) - Returns the expected import columns missing from a weekly header row.
5581-5594  function weeklyImportColumnsGuard(headers, format, scoring) - Loud commit gate: every column the import mapping writes must exist on the target week tab.
5596-5602  function applyFieldsByName(target, headers, fields) - Writes a { header: value } map onto a row array by header index.
5604-5628  function buildNewWeeklyRecord(headers, identity, importFields, pairFields, now) - Builds a full new weekly row using the league's capability-derived weekly record schema with...
5630-5640  function updateWeeklyImportRow(sheet, rowIndex, headers, fields, now) - Updates an existing weekly row in place from the current row contents so protected fields (me...
5642-5690  function createClubMemberUnderLock(clubSheet, clubHeaders, identity, now) - Creates a ClubMembers row for a new identity.
5692-5714  function normalizeDoublesOverrides(overrides, rowIndex) - Normalizes the per-row admin override payload into { partner_index: member_number }.
5716-5747  function buildDoublesPairFields(headers, udiscRow, memberNumber, pairKey, isSolo, rules) - Builds the doubles-only columns written onto one partner's weekly row.
5749-5759  function findWeeklyIdentity(indexes, partner) - Finds the first weekly entry whose identity matches a partner's.
5761-5819  function detectDoublesConflict(plan, pairKey, isSolo, scopeKey, weeklyIndexes, memberToPairKey, includeIdentityChange) - Detects commit-only conflicts for a ready doubles row against authoritative server state.
5821-5847  function buildDoublesPartnerOutcomes(plan, parsed) - Partner outcomes for one doubles row, from either a resolved plan or matches.
5849-5861  function buildDoublesRowResult(rowIndex, parsed, pairKey, isSolo, status, reason, plan) - Builds one per-row doubles commit outcome.
5863-5872  function compensateAppendedWeeklyRows(appended) - Best-effort compensating delete of weekly rows appended for a failed pair.
5874-5885  function compensateAppendedMembers(clubSheet, appendedMembers) - Best-effort compensating delete of ClubMembers rows created for a failed pair.
5887-6033  function commitDoublesPairUnderLock(context) - Executes the member phase and weekly phase for one ready doubles row while the caller holds t...
6035-6275  function handleCommitUdiscImportDoubles(data) - Commits an approved UDisc doubles import to the selected weekly sheet.
6277-6516  function handleCommitUdiscImport(data) - Commits an approved UDisc import to the selected weekly sheet.
6518-6544  function buildFieldsToImport(udiscRow) - Builds the fields_to_import object from a UDisc row.
6546-6568  function buildMatchEntry(udiscRow, weeklyRow, matchMethod) - Builds a matched entry object for the preview response.
6570-6711  function handleCalculateTags(data) - Calculates tag assignments for a weekly league.
6713-6834  function handleConfirmTags(data) - Confirms and writes tag assignments for a weekly league.
6836-6969  function handleFinalizeRound(data) - Finalizes a round by propagating out_tag values from the weekly sheet to each matching ClubMe...
6985-7001  function doublesPointsForPosition(positionRaw, rules) - Pure scoring rule for a points league: a placement found in the league's points table earns i...
7003-7006  function roundCurrency(amount) - Rounds a dollar amount to cents so float drift never reaches the UI.
7008-7015  function isSecondPlacePaid(payout, playerCount) - Whether the fixed second-place share is paid for a field of `playerCount`: the league sets a...
7017-7100  function applyWeeklyPayout(pairs, playerCount, rules) - Applies the weekly pool rule to the grouped teams and returns the payout summary.
7102-7160  function buildDoublesPointsPlan(weeklyData, headers, rules) - Builds the read-only per-row results view for one doubles week tab.
7162-7188  function readDoublesPointsTab(spreadsheet, leagueDate, rules) - Opens and validates the doubles weekly results tab for a league date.
7190-7201  function validateDoublesPointsRequest(data) - Validates the shared points request shape (points gate + league_date).
7203-7218  function pointsRowResponse(row) - Public shape of one row in the read-only points results view.
7220-7226  function pointsSummary(rows)
7228-7281  function groupDoublesPointsPairs(rows) - Groups results rows by pair_key for the results table.
7302-7305  constants: TIE_BREAKS_SHEET_NAME ... TIE_STATUS_FINALIZED (4 declarations)
7307-7312  function doublesTeamKey(pair) - Stable identity of one team on a results view: its pair key, or the solo member.
7314-7322  function payingPlaceLimit(rules, playerCount) - The lowest place that is paid money this week: 0 when the league pays no weekly money, 1 when...
7324-7398  function resolveDoublesTies(pairs, picks, limit) - Pure tie detector and resolver.
7400-7443  function readTieBreaks(spreadsheet, leagueDate) - Reads the saved tie picks for one week.
7445-7459  function rewriteTieBreakRows(spreadsheet, leagueDate, onlyPlace, newRows) - Replaces the TieBreaks rows this week owns (only those at `onlyPlace` when given) with `newRo...
7461-7485  function buildTieView(spreadsheet, leagueDate, pairs, rules, playerCount) - Builds the tie view for a week: the picks applied over the imported placement (a draft until...
7487-7497  function applyTieMoneyPlaces(pairs, placements) - Sets `payout_place` on each team in a reported tie: the place the unchanged payout rule pays...
7499-7519  function tieViewResponse(view) - Public shape of the tie view in the results response.
7521-7534  function describeUnresolvedTies(unresolved, pairs) - Human description of the ties still waiting on a winner, for the refusal message.
7536-7577  function handleCalculatePoints(data, message) - Admin action: read the committed doubles results for one week.
7579-7642  function handleSaveTieBreaks(data) - Admin action: save the winner order for one tied place before the week is finalized.
7644-7692  function handleFinalizeDoublesWeek(data) - Admin action: finalize the week's tie resolution.
7694-7768  function handleSeasonStandings(data) - Admin action: the season standings — every member with positive live season points, plus thei...
7770-7803  function handleSyncSeasonCaches(data) - Maintenance action: recompute both doubles season caches (season_points and season_earnings)...
7805-7868  function sumSeasonTotalsByMember(spreadsheet, rules) - Aggregates every doubles season total in one traversal of the season's Week tabs.
7870-7877  function sumSeasonPointsByMember(spreadsheet) - Sums each member's committed weekly points across every Week tab.
7879-7886  function sumSeasonEarningsByMember(spreadsheet, rules) - Sums each member's season earnings across every Week tab.
7888-7907  function ensureClubSeasonColumn(clubSheet, header) - Ensures a doubles ClubMembers roster carries the given cache column, appending the header aft...
7909-7916  function ensureSeasonPointsColumn(clubSheet) - Ensures the doubles ClubMembers roster carries the `season_points` cache column.
7918-7925  function ensureSeasonEarningsColumn(clubSheet) - Ensures the doubles ClubMembers roster carries the `season_earnings` cache column.
7927-7970  function syncClubSeasonColumn(spreadsheet, header, totals) - Recomputes one doubles ClubMembers cache column from the committed weekly data and persists i...
7972-7981  function syncDoublesSeasonPoints(spreadsheet) - Recomputes the doubles ClubMembers `season_points` cache from the committed weekly_points.
7983-7993  function syncDoublesSeasonEarnings(spreadsheet, rules) - Recomputes the doubles ClubMembers `season_earnings` cache from the re-derived weekly payouts.
8007-8015  function readAppearances(row, appearancesCol) - A member's stored appearance count from a ClubMembers row; a missing column or blank/non-nume...
8017-8027  function compareByAppearances(a, b) - Check-in list order: most appearances first, then name (case-insensitive).
8029-8049  function readFinalizedWeekDates(spreadsheet) - The league dates listed on the FinalizedWeeks ledger, in ledger order.
8051-8061  function markWeekFinalized(spreadsheet, leagueDate, now) - Lists a week on the ledger.
8063-8089  function sumAppearancesByMember(spreadsheet, leagueDates) - Tallies checked-in rows per member across the given finalized weeks.
8091-8099  function syncAppearances(spreadsheet) - Recomputes the ClubMembers `appearances` column from the FinalizedWeeks ledger.
8101-8110  function finalizeWeekAttendance(spreadsheet, leagueDate) - Counts one week's attendance at finalize: lists the week on the ledger (once) and rewrites th...
8112-8126  function weekHasResults(sheet, rules) - Whether a Week tab already carries results, so the backfill can treat it as a finalized week:...
8128-8176  function handleBackfillAppearances(data) - Admin action: one-time, idempotent backfill of the appearances count for weeks that predate t...
8178-8191  function respond(status, message, extra) - Builds and returns a JSON response.
```
