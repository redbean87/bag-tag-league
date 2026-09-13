# Data Model

## Persistence

All data lives in Google Sheets. Each entity maps to a tab (worksheet) within a single Google Spreadsheet. Rows are records; columns are fields. Primary keys are UUIDs generated server-side.

## Entity Relationship Overview

```
MasterPlayers 1---* WeeklyPlayerRecords
WeeklyLeagues 1---* WeeklyPlayerRecords
WeeklyLeagues 1---* ImportHistory
```

## Tabs

### MasterPlayers Tab

One row per player. Updated only during league finalization or admin correction.

| Column | Type | Notes |
|--------|------|-------|
| id | string (UUID) | Primary key |
| name | string | Player's display name |
| udisc_username | string | UDisc username (nullable) |
| pdga_number | string | PDGA number (nullable) |
| current_tag | integer | Current bag tag number |
| is_active | boolean | Active/inactive status |
| created_at | string (ISO 8601) | Record creation |
| updated_at | string (ISO 8601) | Last modification |

### WeeklyLeagues Tab

One row per weekly event. Created before sign-in, finalized after results.

| Column | Type | Notes |
|--------|------|-------|
| id | string (UUID) | Primary key |
| league_date | string (YYYY-MM-DD) | Date of the league round |
| name | string | League name or identifier |
| status | string | draft, open, importing, calculating, reviewing, finalized |
| sign_in_code | string | Unique code for the sign-in URL |
| sign_in_url | string | Full sign-in URL |
| created_at | string (ISO 8601) | Record creation |
| finalized_at | string (ISO 8601) | When finalized (nullable) |

### WeeklyPlayerRecords Tab

One row per player per weekly league. Created during sign-in only.

| Column | Type | Notes |
|--------|------|-------|
| id | string (UUID) | Primary key |
| weekly_league_id | string (UUID) | FK to WeeklyLeagues |
| master_player_id | string (UUID) | FK to MasterPlayers |
| player_name_snapshot | string | Snapshot of name at sign-in |
| udisc_username_snapshot | string | Snapshot of UDisc username at sign-in |
| pdga_number_snapshot | string | Snapshot of PDGA number at sign-in |
| in_tag | integer | Player's starting bag tag for the weekly league, copied from MasterPlayers at sign-in |
| out_tag | integer | Player's ending bag tag, calculated by the app (nullable until calculation) |
| signed_in_at | string (ISO 8601) | When the player signed in |
| paid | boolean | Payment status |
| ctp | boolean | Closest-to-pin status |
| ace_pot | boolean | Ace pot status |
| starting_hole | integer | Starting hole (from UDisc import, nullable) |
| start_time | string (ISO 8601) | Start time (from UDisc import, nullable) |
| score | integer | Player's round score imported from UDisc. This is a score, not a bag tag. (nullable) |
| udisc_ending_tag | integer | Optional ending bag tag from UDisc or the current manual process. Retained for reference/transition purposes only. Must not be used to calculate out_tag. (nullable) |
| notes | string | Admin notes (nullable) |
| created_at | string (ISO 8601) | Record creation |
| updated_at | string (ISO 8601) | Last modification |

**Field groups:**

- **Snapshot fields:** player_name_snapshot, udisc_username_snapshot, pdga_number_snapshot (copied from MasterPlayers at sign-in, never changed)
- **Tag fields:** in_tag (player's starting bag tag), out_tag (player's ending bag tag, calculated by the app)
- **Sign-in fields:** signed_in_at, paid, ctp, ace_pot
- **UDisc-derived fields:** starting_hole, start_time, score (player's round score, not a bag tag), udisc_ending_tag (optional, reference only, not used in calculation)
- **Admin fields:** notes

### ImportHistory Tab

One row per UDisc CSV import.

| Column | Type | Notes |
|--------|------|-------|
| id | string (UUID) | Primary key |
| weekly_league_id | string (UUID) | FK to WeeklyLeagues |
| imported_at | string (ISO 8601) | When the import occurred |
| filename | string | Original CSV filename |
| total_rows | integer | Total rows in the CSV |
| matched | integer | Rows matched to existing signed-in players |
| unmatched | integer | Rows that could not be matched |
| missing_from_csv | integer | Signed-in players missing from CSV |
| status | string | completed, partial, failed |
| raw_csv_content | string | Full raw CSV content (nullable, may be large) |
| notes | string | Admin notes on the import (nullable) |

### Settings Tab

Application configuration. One row per setting.

| Column | Type | Notes |
|--------|------|-------|
| key | string | Setting name (primary key) |
| value | string | Setting value |
| description | string | What this setting controls |

Potential settings:

- `admin_password_hash` - Hashed admin password
- `default_league_name_template` - Template for auto-naming leagues
- `league_start_tag` - Starting bag tag number for new players

## Field Visibility by Role

### Player sees during sign-in:
- Their name (read-only confirmation)
- Their UDisc username (read-only confirmation)
- Their PDGA number (read-only confirmation)
- Their current tag (read-only)

### Admin sees on the weekly sheet:
- All fields listed above
- Paid, CTP, Ace pot toggles
- Score and UDisc data after import
- Calculated out_tag
- Notes

### Player does NOT see:
- Admin notes
- Other players' details

## Schema Notes

- All UUIDs are generated server-side
- Timestamps are stored in UTC as ISO 8601 strings
- Booleans are stored as `TRUE` / `FALSE` (Google Sheets format)
- Google Sheets row numbers are ephemeral and must not be used as identifiers; use UUIDs instead
- There is no admin override system, audit log, or correction record mechanism
- `score` is the player's round score imported from UDisc. It is a score, not a bag tag.
- `in_tag` is the player's starting bag tag for the weekly league.
- `out_tag` is the player's ending bag tag, calculated by the app using only: players who signed in, each participant's score, each participant's `in_tag` for tie-breaking, the participating players' starting-tag pool, and the agreed lowest-score / lower-`in_tag` tie-break / ascending-tag redistribution rules.
- `udisc_ending_tag` is optional and may contain a value from the current/manual process or UDisc data. It is retained for reference/transition purposes only and must not be used to calculate `out_tag`.
