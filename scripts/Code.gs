/**
 * Google Apps Script Web App - Proof of Concept
 *
 * This script exposes a simple web app that can:
 * 1. Return a test response (GET)
 * 2. Write a test value to Google Sheets (POST)
 *
 * Deploy as: Web App -> Execute as: Me -> Who has access: Anyone
 */

// Replace with your actual spreadsheet ID
const SPREADSHEET_ID = '1kgTRXIiyyXAzWdLf0q_dY-1U3tpKvPVTwYDl8Ok7lik';
const TEST_TAB_NAME = 'TestLog';

// WeeklyPlayerRecords column headers (19 columns from the data model spec)
const WEEKLY_RECORD_HEADERS = [
  'id',
  'weekly_league_id',
  'master_player_id',
  'player_name_snapshot',
  'udisc_username_snapshot',
  'pdga_number_snapshot',
  'in_tag',
  'out_tag',
  'signed_in_at',
  'paid',
  'ctp',
  'ace_pot',
  'starting_hole',
  'start_time',
  'score',
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

    if (data.action === 'createWeeklyTab') {
      return handleCreateWeeklyTab(data);
    }

    // Default: POC test write
    return handlePocPost(data);

  } catch (error) {
    const response = {
      status: 'error',
      message: error.message,
      method: 'POST'
    };

    return ContentService
      .createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Handles the POC test write to TestLog tab.
 */
function handlePocPost(data) {
  const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = spreadsheet.getSheetByName(TEST_TAB_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(TEST_TAB_NAME);
    sheet.appendRow(['Timestamp', 'Message', 'Source']);
  }

  const timestamp = new Date().toISOString();
  const message = data.message || 'No message provided';
  const source = data.source || 'unknown';

  sheet.appendRow([timestamp, message, source]);

  const response = {
    status: 'ok',
    message: 'Data written to sheet',
    timestamp: timestamp,
    method: 'POST',
    written: { timestamp, message, source }
  };

  return ContentService
    .createTextOutput(JSON.stringify(response))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Creates a new weekly tab in the spreadsheet for the given league date.
 * Uses the documented WeeklyPlayerRecords schema (19 columns) as the template.
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
