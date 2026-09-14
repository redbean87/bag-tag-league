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

// WeeklyPlayerRecords column headers (49 columns from the data model spec)
const WEEKLY_RECORD_HEADERS = [
  'weekly_league_id',
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

    if (data.action === 'createClubMembersTab') {
      return handleCreateClubMembersTab(data);
    }
    if (data.action === 'submitCheckIn') {
      return handleSubmitCheckIn(data);
    }
    if (data.action === 'createWeeklyTab') {
      return handleCreateWeeklyTab(data);
    }

    return respond('error', 'Unknown action: ' + data.action);

  } catch (error) {
    return respond('error', error.message);
  }
}

/**
 * Creates the ClubMembers tab if it does not already exist.
 * One-time admin setup action.
 */
function handleCreateClubMembersTab(data) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const existing = spreadsheet.getSheetByName('ClubMembers');

  if (existing) {
    return respond('ok', 'ClubMembers tab already exists.', {
      alreadyExisted: true
    });
  }

  const sheet = spreadsheet.insertSheet('ClubMembers');
  sheet.appendRow(CLUB_MEMBER_HEADERS);

  const headerRange = sheet.getRange(1, 1, 1, CLUB_MEMBER_HEADERS.length);
  headerRange.setFontWeight('bold');
  sheet.setFrozenRows(1);

  return respond('ok', 'ClubMembers tab created successfully.', {
    alreadyExisted: false,
    columns: CLUB_MEMBER_HEADERS.length
  });
}

/**
 * Creates a new weekly tab in the spreadsheet for the given league date.
 * Uses the documented WeeklyPlayerRecords schema (49 columns) as the template.
 * Prevents duplicate tabs for the same date.
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

  return respond('ok', 'Tab "' + tabName + '" created successfully.', {
    tabName: tabName,
    columns: WEEKLY_RECORD_HEADERS.length
  });
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
 */
function handleSubmitCheckIn(data) {
  const { name, udisc_username, pdga_number, in_tag, paid, ctp, ace_pot } = data;

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
  const playerCreatedAtCol = playersHeaders.indexOf('created_at');

  let memberId = null;
  let memberRow = null;
  let isNewMember = false;

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
    const memberRowIndex = playersData.indexOf(memberRow) + 1;
    playersSheet.getRange(memberRowIndex, playerCurrentTagCol + 1).setValue(inTagNum);
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

  // weekly_league_id: use the tab name as a simple identifier
  const weeklyLeagueId = mostRecentTabName;

  const newRecord = new Array(WEEKLY_RECORD_HEADERS.length).fill('');
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('weekly_league_id')] = weeklyLeagueId;
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
