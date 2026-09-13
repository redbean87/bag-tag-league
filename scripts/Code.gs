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
const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE';
const TEST_TAB_NAME = 'TestLog';

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
 * Handles POST requests. Writes a test value to Google Sheets.
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    // Ensure the test tab exists
    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = spreadsheet.getSheetByName(TEST_TAB_NAME);

    if (!sheet) {
      sheet = spreadsheet.insertSheet(TEST_TAB_NAME);
      sheet.appendRow(['Timestamp', 'Message', 'Source']);
    }

    // Write the test data
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
