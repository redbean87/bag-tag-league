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
 * Uses the documented WeeklyPlayerRecords schema (48 columns) as the template.
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

      return respond('ok', 'League sheet migrated to new schema.', {
        alreadyExisted: true,
        migrated: true,
        columns: LEAGUE_SHEET_HEADERS.length
      });
    }

    // Already correct schema
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
