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
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
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
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Ensure League exists first — prerequisite for canonical order
  ensureCanonicalSheet(spreadsheet, 'League', LEAGUE_SHEET_HEADERS);
  if (spreadsheet.getSheetByName('League').getIndex() !== 1) {
    moveSheetToPosition(spreadsheet, 'League', 0);
  }

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

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);

  // Ensure canonical prerequisite sheets exist in correct order
  ensureCanonicalSheet(spreadsheet, 'League', LEAGUE_SHEET_HEADERS);
  if (spreadsheet.getSheetByName('League').getIndex() !== 1) {
    moveSheetToPosition(spreadsheet, 'League', 0);
  }

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
  sheet.appendRow(WEEKLY_RECORD_HEADERS);

  // Format headers: bold, freeze row 1
  const headerRange = sheet.getRange(1, 1, 1, WEEKLY_RECORD_HEADERS.length);
  headerRange.setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Organize all Week sheets chronologically after canonical sheets
  organizeWeekSheetsChronologically(spreadsheet);

  // Clean up default blank sheet if present
  removeDefaultBlankSheet(spreadsheet);

  return respond('ok', 'Tab "' + tabName + '" created successfully.', {
    tabName: tabName,
    columns: WEEKLY_RECORD_HEADERS.length
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

  if (query.length < 2) {
    return respond('ok', 'Query too short.', { results: [] });
  }

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const playersSheet = spreadsheet.getSheetByName('ClubMembers');

  if (!playersSheet) {
    return respond('ok', 'No members found.', { results: [] });
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

  return respond('ok', 'Search complete.', { results: results });
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

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);

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
    weekly_tab: mostRecentTabName
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
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const existing = spreadsheet.getSheetByName('League');

  if (existing) {
    // Check if migration is needed (old 12-column schema)
    const currentHeaders = existing.getRange(1, 1, 1, existing.getLastColumn()).getValues()[0];
    const OLD_LEAGUE_HEADERS = [
      'league_name', 'description', 'location', 'schedule', 'contact_information',
      'entry_fee', 'ace_pot_contribution', 'ace_pot_total',
      'ctp_contribution', 'ctp_prize',
      'created_at', 'updated_at'
    ];

    const isOldSchema = currentHeaders.length === OLD_LEAGUE_HEADERS.length &&
      currentHeaders.every(function(h, i) { return h === OLD_LEAGUE_HEADERS[i]; });

    if (isOldSchema) {
      // Migrate: read existing data, build new row, write back
      const allData = existing.getDataRange().getValues();
      const oldRow = allData.length >= 2 ? allData[1] : [];

      const newRow = [];
      for (let i = 0; i < LEAGUE_SHEET_HEADERS.length; i++) {
        const header = LEAGUE_SHEET_HEADERS[i];
        if (header === 'ace_pot_current_total') {
          // Old ace_pot_total value becomes ace_pot_current_total
          const oldIdx = OLD_LEAGUE_HEADERS.indexOf('ace_pot_total');
          newRow.push(oldIdx !== -1 && oldRow[oldIdx] ? oldRow[oldIdx] : '');
        } else if (header === 'ace_pot_calculated_total' || header === 'ace_pot_total' ||
                   header === 'ctp_calculated_total' || header === 'ctp_total') {
          // New fields: no old data to map
          newRow.push('');
        } else if (header === 'ctp_prize') {
          // Removed field: skip
          continue;
        } else {
          // Map directly from old schema
          const oldIdx = OLD_LEAGUE_HEADERS.indexOf(header);
          newRow.push(oldIdx !== -1 && oldRow[oldIdx] ? oldRow[oldIdx] : '');
        }
      }

      // Clear and rewrite
      existing.clear();
      existing.appendRow(LEAGUE_SHEET_HEADERS);
      if (newRow.some(function(v) { return v !== ''; })) {
        existing.appendRow(newRow);
      }

      const headerRange = existing.getRange(1, 1, 1, LEAGUE_SHEET_HEADERS.length);
      headerRange.setFontWeight('bold');
      existing.setFrozenRows(1);

      // Ensure League is at position 1 (first tab)
      if (existing.getIndex() !== 1) {
        moveSheetToPosition(spreadsheet, 'League', 0);
      }

      // Clean up default blank sheet if present
      removeDefaultBlankSheet(spreadsheet);

      return respond('ok', 'League sheet migrated to new schema.', {
        alreadyExisted: true,
        migrated: true,
        columns: LEAGUE_SHEET_HEADERS.length
      });
    }

    // Already correct schema — ensure position
    if (existing.getIndex() !== 1) {
      moveSheetToPosition(spreadsheet, 'League', 0);
    }

    // Clean up default blank sheet if present
    removeDefaultBlankSheet(spreadsheet);

    return respond('ok', 'League sheet already exists.', {
      alreadyExisted: true,
      migrated: false
    });
  }

  const sheet = spreadsheet.insertSheet('League');
  sheet.appendRow(LEAGUE_SHEET_HEADERS);

  const headerRange = sheet.getRange(1, 1, 1, LEAGUE_SHEET_HEADERS.length);
  headerRange.setFontWeight('bold');
  sheet.setFrozenRows(1);

  // Ensure League is at position 1 (first tab)
  moveSheetToPosition(spreadsheet, 'League', 0);

  // Clean up default blank sheet if present
  removeDefaultBlankSheet(spreadsheet);

  return respond('ok', 'League sheet created successfully.', {
    alreadyExisted: false,
    columns: LEAGUE_SHEET_HEADERS.length
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
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
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

  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
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
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
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
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);

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
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);

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
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);

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
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);

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
  var leagueDate = data.league_date;

  if (!leagueDate || !/^\d{4}-\d{2}-\d{2}$/.test(leagueDate)) {
    return respond('error', 'Invalid or missing league_date.');
  }

  var tabName = 'Week ' + leagueDate;
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
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
  var leagueDate = data.league_date;

  if (!leagueDate || !/^\d{4}-\d{2}-\d{2}$/.test(leagueDate)) {
    return respond('error', 'Invalid or missing league_date.');
  }

  var tabName = 'Week ' + leagueDate;
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
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
  var leagueDate = data.league_date;

  if (!leagueDate || !/^\d{4}-\d{2}-\d{2}$/.test(leagueDate)) {
    return respond('error', 'Invalid or missing league_date.');
  }

  var tabName = 'Week ' + leagueDate;
  var spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
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
