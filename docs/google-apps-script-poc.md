# Google Apps Script Proof of Concept

## Goal

Verify that a static webpage can communicate with Google Apps Script and that Google Apps Script can read from and write to Google Sheets. This is a feasibility test before building any application features.

## What Was Tested

1. **GET request:** A static webpage sends a GET request to a Google Apps Script web app. The script returns a JSON response confirming it is running.
2. **POST request:** The webpage sends a POST request with a JSON payload. The script writes the payload to a designated tab (`TestLog`) in a Google Sheet.
3. **CORS behavior:** Google Apps Script web apps deployed with `access: ANYONE` return proper CORS headers, allowing cross-origin `fetch()` calls from any static page.

## Live Verification

On September 12, 2026, both GET and POST requests were manually verified against a deployed Apps Script web app.

### GET Request

- **Request:** `fetch(GET_URL)` from a static page.
- **Response:** Received a 302 redirect followed by a 200 OK.
- **Body:**
  ```json
  { "status": "ok", "message": "Apps Script web app is running", "method": "GET" }
  ```

### POST Request

- **Request:** `fetch(POST_URL, { method: "POST", body: JSON.stringify({ message, source }) })` from a static page.
- **Response:** Received a 302 redirect followed by a 200 OK.
- **Body:**
  ```json
  { "status": "ok", "method": "POST", "message": "..." }
  ```
- **Sheet verification:** The POST payload was confirmed in the Google Sheet's `TestLog` tab as a new row.

### Redirect Behavior

The 302 redirect is expected behavior for Apps Script web apps. The browser follows the redirect automatically and receives the final response from the deployed endpoint. Both requests succeeded end-to-end.

## Files Created

| File | Purpose |
|------|---------|
| `scripts/Code.gs` | Google Apps Script source — `doGet` and `doPost` handlers |
| `scripts/appsscript.json` | Apps Script project manifest (V8 runtime, web app config) |
| `src/poc/index.html` | Static frontend test page (plain HTML/CSS/JS) |

## Google Sheet Prerequisites

1. Create a new Google Spreadsheet (or use an existing one).
2. Note the spreadsheet ID from the URL: `https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/edit`
3. No tab setup is needed — the script creates a `TestLog` tab automatically on the first POST request.
4. The `TestLog` tab will contain these columns: `Timestamp`, `Message`, `Source`.

## Google Apps Script Setup

### Option A: Copy from repository (recommended)

1. Open [script.google.com](https://script.google.com) and create a new project.
2. Replace the contents of `Code.gs` with the code from `scripts/Code.gs`.
3. In the project settings (gear icon), set the time zone to your preference.
4. Replace `YOUR_SPREADSHEET_ID_HERE` on line 12 of `Code.gs` with your actual spreadsheet ID.
5. Copy `scripts/appsscript.json` content into the project manifest (Project Settings > Show "appsscript.json" manifest file).

### Option B: Manual creation

1. Open [script.google.com](https://script.google.com) and create a new project.
2. Create a `doGet(e)` function that returns a JSON response with `status: 'ok'`.
3. Create a `doPost(e)` function that parses `e.postData.contents`, opens the spreadsheet by ID, and appends a row to the `TestLog` tab.
4. Set `SPREADSHEET_ID` constant to your spreadsheet ID.

## Apps Script Deployment Steps

1. In the Apps Script editor, click **Deploy** > **New deployment**.
2. Select **Web app** as the deployment type.
3. Configure:
   - **Description:** `Bag Tag League POC`
   - **Execute as:** `Me` (your Google account)
   - **Who has access:** `Anyone` (required for the static frontend to call it)
4. Click **Deploy**.
5. Copy the **Web app URL** — it looks like: `https://script.google.com/macros/s/AKfycbx.../exec`
6. Click **Done**.

### Updating the deployment

After editing `Code.gs`:

1. Click **Deploy** > **Manage deployments**.
2. Click the **Edit** (pencil) icon next to your deployment.
3. Select **New version** from the Version dropdown.
4. Click **Deploy**.
5. The URL stays the same.

## Frontend Configuration

1. Open `src/poc/index.html` in a browser (or serve it via any static file server).
2. Paste the Apps Script web app URL into the **Configuration** input field.
3. The URL is saved to `localStorage` so it persists across page reloads.

### Serving locally

Any static file server works:

```bash
# Python
python3 -m http.server 8000 --directory src/poc

# Node.js (if npx is available)
npx serve src/poc

# Or simply open the file directly in the browser
open src/poc/index.html
```

## How to Test

### Test 1: GET Request

1. Enter your Apps Script URL in the configuration field.
2. Click **Send GET Request**.
3. Expected result: A green status box showing `{ status: "ok", message: "Apps Script web app is running", timestamp: "...", method: "GET" }`.
4. If the status box is red, check the URL and deployment settings.

### Test 2: POST Request (Write to Sheet)

1. Enter a message and source in the test form.
2. Click **Send POST Request**.
3. Expected result: A green status box showing the data that was written.
4. Open the Google Sheet — a `TestLog` tab should exist with a new row containing the timestamp, message, and source.
5. If the sheet tab doesn't exist, the script creates it automatically on the first write.

### Test Log

All test results appear in the **Test Log** section at the bottom of the page for reference.

## CORS, Authorization, and Deployment Limitations

### CORS

- Google Apps Script web apps deployed with `access: ANYONE` return proper `Access-Control-Allow-Origin: *` headers.
- Both GET and POST `fetch()` calls work from any origin (local file, localhost, or any domain).
- Preflight `OPTIONS` requests are handled automatically by Apps Script.

### Authorization

- With `access: ANYONE`, no Google sign-in is required to call the web app.
- The script executes under the **deployer's** Google account — it has full access to the spreadsheet.
- This means anyone with the URL can read/write. For this POC with test data, that is acceptable.
- For production, consider PIN-based validation inside `doPost` (planned for Phase 2+).

### Rate Limits

- Google Apps Script has execution time limits: 6 minutes per execution for consumer accounts, 30 minutes for Workspace.
- Google Sheets API has quota limits (varies by plan).
- For this small league app (tens to hundreds of rows), rate limits are not a concern.

### Deployment Gotchas

- **New version required:** Code changes do not take effect until you create a new deployment version.
- **Propagation delay:** After creating a new version, it can take 1-2 minutes for the new code to be active.
- **execute as "Me":** The script runs with the deployer's permissions. The spreadsheet must be accessible to the deployer's account.
- **"Anyone" access:** This is required for the POC to work from a static page without authentication. For production, you may want to add a shared PIN check.

## Expected Test Behavior

| Test | Action | Expected Result |
|------|--------|-----------------|
| GET | Click "Send GET Request" | Green status with `{ status: "ok", method: "GET" }` |
| POST | Click "Send POST Request" | Green status with `{ status: "ok", method: "POST" }` and row written to `TestLog` tab |
| Sheet | Open the Google Spreadsheet | `TestLog` tab exists with columns: Timestamp, Message, Source |
| Persistence | Reload the page, send another POST | New row appended to the same `TestLog` tab |

## Known Limitations

1. **No authentication.** The web app URL is public. Anyone with it can write to the sheet. This is acceptable for the POC with test data only.
2. **No input validation.** The POC accepts any JSON payload. Production code will need validation.
3. **No error retry.** Network failures are displayed but not retried automatically.
4. **Single spreadsheet.** The `SPREADSHEET_ID` is hardcoded. A production version may need dynamic configuration.
5. **No real league data.** This POC uses only test messages, not player or league data.

## Viability Assessment

**The integration is live-tested and working.** The POC confirms:

- Static HTML/JS can call Google Apps Script web apps without CORS issues.
- Google Apps Script can read from and write to Google Sheets.
- The architecture described in ADR-001 (static frontend -> Apps Script -> Google Sheets) works as designed.
- No conventional backend is needed.
- The response format (JSON) is suitable for the application.
- Both GET and POST requests succeed end-to-end with a deployed web app.

**Next steps:** ADR-001's architecture is validated. The next phase can proceed to application design and implementation — setting up the full spreadsheet structure (ClubMembers, WeeklyLeagues, etc.) and building the server-side CRUD operations in Apps Script.

## Manual Testing Prerequisites

The following steps were used during the manual verification described above and are retained for reference if you want to reproduce the test:

1. Create a Google Spreadsheet and note its ID.
2. Create a Google Apps Script project (or copy from `scripts/Code.gs`).
3. Replace `YOUR_SPREADSHEET_ID_HERE` in `Code.gs` with your spreadsheet ID.
4. Deploy the script as a web app with `access: ANYONE`.
5. Copy the deployment URL into the POC page.

Live verification was performed on September 12, 2026 using this setup.
