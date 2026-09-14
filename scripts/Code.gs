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

// MasterPlayers tab column headers
const MASTER_PLAYER_HEADERS = [
  'id',
  'name',
  'udisc_username',
  'pdga_number',
  'current_tag',
  'is_active',
  'created_at',
  'updated_at'
];

// WeeklyPlayerRecords column headers (50 columns from the data model spec)
const WEEKLY_RECORD_HEADERS = [
  'id',
  'weekly_league_id',
  'master_player_id',
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

    if (data.action === 'createMasterPlayersTab') {
      return handleCreateMasterPlayersTab(data);
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
 * Creates the MasterPlayers tab if it does not already exist.
 * One-time admin setup action.
 */
function handleCreateMasterPlayersTab(data) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  const existing = spreadsheet.getSheetByName('MasterPlayers');

  if (existing) {
    return respond('ok', 'MasterPlayers tab already exists.', {
      alreadyExisted: true
    });
  }

  const sheet = spreadsheet.insertSheet('MasterPlayers');
  sheet.appendRow(MASTER_PLAYER_HEADERS);

  const headerRange = sheet.getRange(1, 1, 1, MASTER_PLAYER_HEADERS.length);
  headerRange.setFontWeight('bold');
  sheet.setFrozenRows(1);

  return respond('ok', 'MasterPlayers tab created successfully.', {
    alreadyExisted: false,
    columns: MASTER_PLAYER_HEADERS.length
  });
}

/**
 * Creates a new weekly tab in the spreadsheet for the given league date.
 * Uses the documented WeeklyPlayerRecords schema (50 columns) as the template.
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
 * 1. Finds or creates the master player record
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

  // --- Step 1: Find or create master player ---
  const playersSheet = spreadsheet.getSheetByName('MasterPlayers');
  if (!playersSheet) {
    return respond('error', 'MasterPlayers tab not found. Admin must create it first.');
  }

  const playersData = playersSheet.getDataRange().getValues();
  const playersHeaders = playersData[0];

  const playerIdCol = playersHeaders.indexOf('id');
  const playerNameCol = playersHeaders.indexOf('name');
  const playerUdiscCol = playersHeaders.indexOf('udisc_username');
  const playerPdgaCol = playersHeaders.indexOf('pdga_number');
  const playerCurrentTagCol = playersHeaders.indexOf('current_tag');
  const playerIsActiveCol = playersHeaders.indexOf('is_active');
  const playerCreatedAtCol = playersHeaders.indexOf('created_at');

  let masterPlayerId = null;
  let masterPlayerRow = null;

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
      masterPlayerId = row[playerIdCol];
      masterPlayerRow = row;
      break;
    }
  }

  // If no match, create new master player
  if (!masterPlayerId) {
    const now = new Date().toISOString();
    const newId = Utilities.getUuid();

    const newPlayer = new Array(MASTER_PLAYER_HEADERS.length).fill('');
    newPlayer[MASTER_PLAYER_HEADERS.indexOf('id')] = newId;
    newPlayer[MASTER_PLAYER_HEADERS.indexOf('name')] = trimmedName;
    newPlayer[MASTER_PLAYER_HEADERS.indexOf('udisc_username')] = trimmedUdisc;
    newPlayer[MASTER_PLAYER_HEADERS.indexOf('pdga_number')] = trimmedPdga;
    newPlayer[MASTER_PLAYER_HEADERS.indexOf('current_tag')] = '';
    newPlayer[MASTER_PLAYER_HEADERS.indexOf('is_active')] = true;
    newPlayer[MASTER_PLAYER_HEADERS.indexOf('created_at')] = now;
    newPlayer[MASTER_PLAYER_HEADERS.indexOf('updated_at')] = now;

    playersSheet.appendRow(newPlayer);

    masterPlayerId = newId;
    masterPlayerRow = newPlayer;
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

  const recordPlayerIdCol = recordsHeaders.indexOf('master_player_id');

  for (let i = 1; i < recordsData.length; i++) {
    if (recordsData[i][recordPlayerIdCol] === masterPlayerId) {
      return respond('error', 'You are already checked in for this league.');
    }
  }

  // --- Step 4: Write the check-in record ---
  const uuid = Utilities.getUuid();
  const now = new Date().toISOString();

  // weekly_league_id: use the tab name as a simple identifier
  const weeklyLeagueId = mostRecentTabName;

  const newRecord = new Array(WEEKLY_RECORD_HEADERS.length).fill('');
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('id')] = uuid;
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('weekly_league_id')] = weeklyLeagueId;
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('master_player_id')] = masterPlayerId;
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('player_name_snapshot')] = masterPlayerRow[playerNameCol] || trimmedName;
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('udisc_username_snapshot')] = masterPlayerRow[playerUdiscCol] || trimmedUdisc;
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('pdga_number_snapshot')] = masterPlayerRow[playerPdgaCol] || trimmedPdga;
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('in_tag')] = inTagNum;
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('checked_in')] = true;
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('signed_in_at')] = now;
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('paid')] = paid === true || paid === 'TRUE';
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('ctp')] = ctp === true || ctp === 'TRUE';
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('ace_pot')] = ace_pot === true || ace_pot === 'TRUE';
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('created_at')] = now;
  newRecord[WEEKLY_RECORD_HEADERS.indexOf('updated_at')] = now;

  recordsSheet.appendRow(newRecord);

  return respond('ok', 'Check-in successful.', {
    record_id: uuid,
    master_player_id: masterPlayerId,
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
