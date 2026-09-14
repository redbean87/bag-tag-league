# Architecture

## Persistence Architecture

**Google Sheets is the sole persistent datastore.** There is no SQL database of any kind. No SQLite, PostgreSQL, MySQL, or any other relational database is used or proposed. No ORM is involved. No database migrations exist. All persistent application data is read from and written to Google Sheets exclusively.

### Why Google Sheets

- Familiar to league organizers who already use spreadsheets
- Built-in version history
- Easy to inspect and correct data directly if needed
- No database server to manage or pay for
- Accessible from any device with a browser

### Google Sheets Structure

Each logical entity maps to a tab (worksheet) within a single Google Spreadsheet:

| Tab Name | Contents |
|----------|----------|
| `MasterPlayers` | One row per player in the master list |
| `WeeklyLeagues` | One row per weekly league |
| `WeeklyPlayerRecords` | One row per player per weekly league (sign-in records only) |
| `ImportHistory` | One row per UDisc import |
| `Settings` | Application configuration |

### Server-Side Sheets Service

All Google Sheets access goes through a server-side service layer. The Google Service Account credentials are never exposed to the browser. The service layer handles:

- Reading rows from tabs
- Writing new rows
- Updating existing rows by primary key
- Querying by column value
- Error handling and retry logic

The browser never interacts with the Google Sheets API directly.

## System Architecture

```
                    +-----------------+
                    |   Admin Browser |
                    +--------+--------+
                             |
                    +--------v--------+
                    |  Static HTML    |
                    |  (Admin UI)     |
                    +--------+--------+
                             |
                    +--------v--------+
                    | Google Apps     |
                    | Script Web App  |
                    +--------+--------+
                             |
                    +--------v--------+
                    | Google Sheets   |
                    | (Sole Store)    |
                    +-----------------+

                    +-----------------+
                    |  Player Phone   |
                    |  (QR scan)      |
                    +--------+--------+
                             |
                    +--------v--------+
                    |  Sign-In Page   |
                    |  (Static HTML)  |
                    +--------+--------+
```

## Key Technical Decisions

### Sign-In Flow

The player sign-in page must:

- Load fast on mobile
- Handle slow connections gracefully
- Be accessible (WCAG 2.1 AA)

The sign-in URL format:

- `https://app.example.com/league/{id}/sign-in` (clean URL)
- `https://app.example.com/s/{code}` (short code, alternative)

### QR Code Generation

- Generate QR codes server-side
- Store the sign-in URL in the WeeklyLeagues tab
- Provide a downloadable/printable QR code for the admin
- QR code encodes the full sign-in URL

### UDisc Import

- Parse the UDisc Excel workbook on the server (not client-side)
- Validate the `Event results` sheet structure before processing
- Return import results (matched, unmatched, missing from import)
- Support re-import (merge, not replace)
- Store raw import content in ImportHistory for reference
- See `udisc-import-mapping.md` for the complete field mapping

### Authentication

**No player authentication required.** Players identify themselves by selecting from the master list.

**Admin authentication** uses a shared PIN or similarly simple mechanism suitable for three trusted league administrators.

### Tag Calculation

The tag calculation:

1. Collect all participating players (those who checked in)
2. Sort by score ascending, then by in_tag ascending for ties
3. Collect the in_tag values of all participating players into a pool
4. Sort the pool ascending
5. Assign tags in finishing order: 1st gets the lowest tag from the pool, 2nd gets the next lowest, etc.
6. Store results in out_tag on each participant's WeeklyPlayerRecords row
7. After finalization, update current_tag in MasterPlayers for participating players (last-known calculated value, not guaranteed to represent physical tag)

This is implemented as a server-side function.

## File Structure (Proposed)

```
bag-tag-league/
  docs/                    # Documentation (this folder)
  src/
    admin/                 # Admin interface (static HTML/CSS/JS)
      index.html           # Admin dashboard
      players/
        index.html         # Master player list
      leagues/
        index.html         # Weekly leagues list
    player/                # Player-facing pages (static HTML/CSS/JS)
      sign-in/
        index.html         # Player sign-in page
    css/                   # Shared stylesheets
    js/                    # Shared JavaScript modules
  scripts/                 # Google Apps Script code
    Code.gs                # Main Apps Script file
  public/                  # Static assets
  index.html               # Landing page
```

## Deployment

### Development

- Local static file server or open HTML files directly in browser
- Google Apps Script deployed as web app for API access
- No local database or file-based storage

### Production

- Static files hosted on Cloudflare Pages (current preference)
- Google Apps Script web app serves as the API layer
- Single Google Spreadsheet serves as the database

### Scaling

Google Sheets is sufficient for the expected data volume (tens to hundreds of players, weekly leagues). If scaling concerns arise in the future, the application layer can be migrated while preserving the same Google Sheets structure.
