# Google Sheets Specification

## Overview

Google Sheets is the sole persistent datastore. One Google Spreadsheet contains five tabs. All application state lives in these tabs. There is no SQL database, no SQLite file, no hosted database, and no secondary persistence layer.

The application reads from and writes to Google Sheets through a server-side service layer only. The browser never interacts with the Google Sheets API directly.

## Conventions

### Identifiers

- **Primary keys:** UUID v4 strings, generated server-side (e.g., `"a1b2c3d4-e5f6-7890-abcd-ef1234567890"`)
- **Foreign keys:** UUID strings matching the referenced primary key
- **Google Sheets row numbers are ephemeral.** Never use row numbers as identifiers. All lookups and joins use UUIDs.

### Dates and Timestamps

- **Date-only fields:** ISO 8601 date string, `YYYY-MM-DD` (e.g., `"2026-09-12"`)
- **Timestamp fields:** ISO 8601 UTC string with time, `YYYY-MM-DDTHH:MM:SSZ` (e.g., `"2026-09-12T18:30:00Z"`)
- All timestamps stored in UTC. Display conversion happens in the UI layer.

### Booleans

- Stored as Google Sheets `TRUE` / `FALSE` values (not strings `"TRUE"` / `"FALSE"`)

### Empty Values

- Empty cells represent null/unknown. Do not use placeholder strings like `"N/A"` or `"null"`.
- Optional string fields: leave cell empty when not provided.
- Optional integer fields: leave cell empty when not applicable.
- Boolean fields always have a value (`TRUE` or `FALSE`); they are never empty.

---

## Tab: MasterPlayers

**Purpose:** One row per player in the master list. Source of truth for player identity and current tag.

### Columns

| # | Column Name | Data Type | Required | Description |
|---|-------------|-----------|----------|-------------|
| 1 | `id` | string (UUID) | Yes | Primary key. Unique identifier for this player. |
| 2 | `name` | string | Yes | Player's display name. |
| 3 | `udisc_username` | string | No | UDisc username for matching during import. |
| 4 | `pdga_number` | string | No | PDGA membership number for matching during import. Stored as string to preserve leading zeros. |
| 5 | `current_tag` | integer | Yes | The player's current bag tag number. Updated only when the organizer finalizes a weekly league. |
| 6 | `is_active` | boolean | Yes | Whether the player is currently active in the league. Inactive players do not appear in sign-in selection. |
| 7 | `created_at` | string (ISO 8601 UTC) | Yes | Timestamp when this record was created. |
| 8 | `updated_at` | string (ISO 8601 UTC) | Yes | Timestamp of last modification to this record. |

### Notes

- A player who self-registers during sign-in gets a new row here with `is_active = TRUE`.
- `current_tag` is the single source of truth for the player's tag between leagues. It is only updated when the organizer finalizes a weekly league.
- If a player is missing from a weekly league's UDisc import, their `current_tag` is unchanged (they did not participate).

---

## Tab: WeeklyLeagues

**Purpose:** One row per weekly league event. Created before players sign in, finalized after results are confirmed.

### Columns

| # | Column Name | Data Type | Required | Description |
|---|-------------|-----------|----------|-------------|
| 1 | `id` | string (UUID) | Yes | Primary key. Unique identifier for this league. |
| 2 | `league_date` | string (YYYY-MM-DD) | Yes | Date of the weekly round. |
| 3 | `name` | string | Yes | Human-readable league name or identifier (e.g., "Week 1", "Sept 12 Round"). |
| 4 | `status` | string (enum) | Yes | Current lifecycle state. Allowed values: `draft`, `open`, `importing`, `calculating`, `reviewing`, `finalized`. |
| 5 | `sign_in_code` | string | Yes | Short unique code used in the sign-in URL. Generated once at league creation. |
| 6 | `sign_in_url` | string | Yes | Full sign-in URL for this league. Generated from `sign_in_code`. |
| 7 | `created_at` | string (ISO 8601 UTC) | Yes | Timestamp when this league was created. |
| 8 | `finalized_at` | string (ISO 8601 UTC) | No | Timestamp when the league was finalized. Null until finalization. |

### Status Lifecycle

```
draft --> open --> importing --> calculating --> reviewing --> finalized
```

- **draft:** League created. Not yet open for sign-in. Admin can edit all fields.
- **open:** Sign-in is active. Players can scan QR and sign in.
- **importing:** Transient state while UDisc CSV is being processed.
- **calculating:** Transient state while tag calculation runs.
- **reviewing:** Admin is reviewing results and tag assignments.
- **finalized:** League is locked. All records are read-only. Master player tags are updated.

Transient states (`importing`, `calculating`) are set and cleared within a single server request. They exist to prevent concurrent operations.

---

## Tab: WeeklyPlayerRecords

**Purpose:** One row per player per weekly league. A record is created only when a player signs in. The row preserves the player's state at sign-in time, receives UDisc data during import, and stores the final tag assignment.

### Columns

#### Identity and Relationships

| # | Column Name | Data Type | Required | Description |
|---|-------------|-----------|----------|-------------|
| 1 | `id` | string (UUID) | Yes | Primary key. Unique identifier for this record. |
| 2 | `weekly_league_id` | string (UUID) | Yes | Foreign key to `WeeklyLeagues.id`. |
| 3 | `master_player_id` | string (UUID) | Yes | Foreign key to `MasterPlayers.id`. |

#### Snapshot Fields (copied from MasterPlayers at sign-in, never changed after)

| # | Column Name | Data Type | Required | Description |
|---|-------------|-----------|----------|-------------|
| 4 | `player_name_snapshot` | string | Yes | Player's name at sign-in time. Preserved for historical accuracy. |
| 5 | `udisc_username_snapshot` | string | No | Player's UDisc username at sign-in time. |
| 6 | `pdga_number_snapshot` | string | No | Player's PDGA number at sign-in time. |

#### Tag Fields

| # | Column Name | Data Type | Required | Description |
|---|-------------|-----------|----------|-------------|
| 7 | `in_tag` | integer | Yes | Player's tag at sign-in time. Copied from `MasterPlayers.current_tag`. Used as input to tag calculation. |
| 8 | `out_tag` | integer | No | Calculated ending tag assigned after tag calculation. Written to `MasterPlayers.current_tag` during finalization. Null until calculation runs. |

#### Sign-In Fields

| # | Column Name | Data Type | Required | Description |
|---|-------------|-----------|----------|-------------|
| 9 | `signed_in_at` | string (ISO 8601 UTC) | Yes | Timestamp when the player signed in. The presence of this timestamp is what defines participation. |
| 10 | `paid` | boolean | Yes | Payment status for this league. Default: `FALSE`. |
| 11 | `ctp` | boolean | Yes | Closest-to-pin status for this league. Default: `FALSE`. |
| 12 | `ace_pot` | boolean | Yes | Ace pot status for this league. Default: `FALSE`. |

#### UDisc-Derived Fields (populated during import)

| # | Column Name | Data Type | Required | Description |
|---|-------------|-----------|----------|-------------|
| 13 | `starting_hole` | integer | No | Starting hole number from UDisc data. |
| 14 | `start_time` | string (ISO 8601 UTC) | No | Start time from UDisc data. |
| 15 | `score` | integer | No | Player's round score imported from UDisc. Lower is better. This is a score, not a bag tag. |
| 16 | `udisc_ending_tag` | integer | No | Optional ending bag tag value from UDisc or the current manual process. Retained for reference and transition purposes only. Must not be used to calculate `out_tag`. |

#### Admin Fields

| # | Column Name | Data Type | Required | Description |
|---|-------------|-----------|----------|-------------|
| 17 | `notes` | string | No | Admin notes about this player's participation. |

#### Timestamps

| # | Column Name | Data Type | Required | Description |
|---|-------------|-----------|----------|-------------|
| 18 | `created_at` | string (ISO 8601 UTC) | Yes | Timestamp when this record was created (at sign-in). |
| 19 | `updated_at` | string (ISO 8601 UTC) | Yes | Timestamp of last modification to this record. |

### Notes

- Weekly records exist only for players who signed in. No rows are created for absent players.
- `score` is the player's round score imported from UDisc. It is a score, not a bag tag.
- `in_tag` is the player's starting bag tag for the weekly league. It is the starting point for tag calculation.
- `out_tag` is the player's ending bag tag calculated by the app. It is the result of tag calculation.
- `udisc_ending_tag` is optional and may contain a value from the current/manual process or UDisc data. It is retained for reference/transition purposes only and must not be used to calculate `out_tag`.
- The app calculates `out_tag` using only: players who signed in, each participant's score, each participant's `in_tag` for tie-breaking, the participating players' starting-tag pool, and the agreed lowest-score / lower-`in_tag` tie-break / ascending-tag redistribution rules.
- Once the league is `finalized`, all fields in this tab become read-only.

---

## Tab: ImportHistory

**Purpose:** One row per UDisc CSV import. Tracks which weekly league was imported, when, the source filename, counts, status, and the raw CSV.

### Columns

| # | Column Name | Data Type | Required | Description |
|---|-------------|-----------|----------|-------------|
| 1 | `id` | string (UUID) | Yes | Primary key. Unique identifier for this import batch. |
| 2 | `weekly_league_id` | string (UUID) | Yes | Foreign key to `WeeklyLeagues.id`. The league this import is for. |
| 3 | `imported_at` | string (ISO 8601 UTC) | Yes | Timestamp when the import was processed. |
| 4 | `filename` | string | Yes | Original CSV filename as uploaded by the admin. |
| 5 | `total_rows` | integer | Yes | Total number of data rows in the CSV (excluding header). |
| 6 | `matched` | integer | Yes | Number of CSV rows successfully matched to an existing signed-in player's `WeeklyPlayerRecords` row. |
| 7 | `unmatched` | integer | Yes | Number of CSV rows that could not be matched to any signed-in player. |
| 8 | `missing_from_csv` | integer | Yes | Number of signed-in players that were not found in the CSV. |
| 9 | `status` | string (enum) | Yes | Import status. Allowed values: `completed`, `partial`, `failed`. |
| 10 | `raw_csv_content` | string | No | The full raw CSV content as a text blob. Preserved for reference. May be large. |
| 11 | `notes` | string | No | Admin notes on this import. |

### Import Status Values

- **completed:** All CSV rows were processed. May still have unmatched rows or missing players.
- **partial:** Some rows failed to process (e.g., malformed data). Admin should review.
- **failed:** The import could not be completed (e.g., invalid CSV structure).

### Import Behavior

- The system parses the CSV and writes the relevant imported values into the appropriate `WeeklyPlayerRecords` columns for matched players.
- Unmatched UDisc players are added as new `WeeklyPlayerRecords` rows (with `in_tag` left blank or set appropriately), and the organizer can fix or associate them afterward.
- A signed-in player missing from the CSV is flagged in the import results (`missing_from_csv` count) so the admin can review.
- Each import attempt creates a new `ImportHistory` row, even if re-importing the same CSV.

---

## Tab: Settings

**Purpose:** Application configuration. One row per setting. Simple key-value store.

### Columns

| # | Column Name | Data Type | Required | Description |
|---|-------------|-----------|----------|-------------|
| 1 | `key` | string | Yes | Setting name. Primary key. Lowercase, snake_case. |
| 2 | `value` | string | Yes | Setting value. Always stored as a string; type interpretation depends on the key. |
| 3 | `description` | string | No | Human-readable description of what this setting controls. |

### Defined Settings

| Key | Value Type | Description | Default |
|-----|-----------|-------------|---------|
| `admin_password_hash` | string (bcrypt hash) | Hashed password for admin authentication. | (none) |
| `default_league_name_template` | string | Template for auto-naming leagues. Supports `{date}` placeholder. | `"Week {date}"` |
| `league_start_tag` | integer | The starting bag tag number for new players. | `1` |

---

## Relationships

```
MasterPlayers (1) ---< (many) WeeklyPlayerRecords >--- (1) WeeklyLeagues
WeeklyLeagues (1) ---< (many) ImportHistory
```

### Foreign Key Constraints (Application-Enforced)

- `WeeklyPlayerRecords.master_player_id` must reference a valid `MasterPlayers.id`
- `WeeklyPlayerRecords.weekly_league_id` must reference a valid `WeeklyLeagues.id`
- `ImportHistory.weekly_league_id` must reference a valid `WeeklyLeagues.id`

Google Sheets does not enforce foreign keys. The application layer must validate referential integrity on write operations.

---

## Admin Access

Three league members require administrative access. Admin authentication uses a shared PIN or similarly simple mechanism suitable for three trusted league administrators. Player-facing sign-in flows do not require authentication.

---

## Player Access

Players do not authenticate. The public flow is registration and check-in through the weekly QR code or link. Players select an existing master player or self-register if they are not found. Only administrative functions require authentication.

---

## Tag Calculation

The app calculates `out_tag` using only the following inputs:

- Players who signed in (have a `WeeklyPlayerRecords` row with `signed_in_at`)
- Each participant's `score` (for ranking)
- Each participant's `in_tag` (for tie-breaking)
- The participating players' starting-tag pool (all `in_tag` values)
- The agreed rules: lowest score wins, lower `in_tag` breaks ties, tags redistribute ascending

`udisc_ending_tag` must not be used as input to tag calculation.

The confirmed algorithm:

1. **Only signed-in players participate.** A player is a participant if they have a `WeeklyPlayerRecords` row with a `signed_in_at` timestamp for that league. Players who did not sign in are excluded and retain their existing `MasterPlayers.current_tag`.
2. **Rank by lowest score first.** Ties are resolved by lower `in_tag` (the player with the lower starting tag finishes first).
3. **Build the tag pool.** Collect the `in_tag` values from all participating players.
4. **Sort the pool ascending.** The lowest tag is first.
5. **Assign tags in finishing order.** The first-place finisher receives the lowest tag from the pool, second place receives the next lowest, and so on.
6. **Store the result in `out_tag`** on each participant's `WeeklyPlayerRecords` row.
7. **After the organizer finalizes the weekly league,** update each participating player's `current_tag` in `MasterPlayers` with their `out_tag` value.

### Example

Participating players and their `in_tag` values:

| Player | in_tag |
|--------|--------|
| A      | 22     |
| B      | 8      |
| C      | 15     |
| D      | 12     |

Finishing order (by score, then by `in_tag`): B, D, C, A

Tag pool sorted ascending: 8, 12, 15, 22

| Player | in_tag | out_tag |
|--------|--------|---------|
| B      | 8      | 8       |
| D      | 12     | 12      |
| C      | 15     | 15      |
| A      | 22     | 22      |

In this example the tags did not change because the strongest tag holder won. In a different finishing order, tags would shuffle among participants. Non-signers are unaffected.

---

## Admin Corrections

Normal admin corrections to the sheet or through the app are acceptable. Before finalization, an admin can:

1. **Add a missed player:** Insert a new row into `WeeklyPlayerRecords` with all required fields manually set.
2. **Remove an accidental sign-in:** Delete the row from `WeeklyPlayerRecords`.
3. **Correct any field:** Edit any field on a `WeeklyPlayerRecords` row.
4. **Re-import UDisc data:** Upload a new CSV. Existing rows are merged (updated), not duplicated.
5. **Resolve unmatched records:** Manually match an unmatched UDisc record to an existing signed-in player, or add a new player to `MasterPlayers` and then match.
6. **Correct player data:** Edit `MasterPlayers` fields (name, UDisc username, PDGA number) at any time.
7. **Adjust payment/CTP/ace pot:** Toggle `paid`, `ctp`, `ace_pot` on any `WeeklyPlayerRecords` row.

There is no separate admin override system, audit log, correction record, or immutable event history. The app is simply intended to help the organizer run the league.

---

## Remaining Decisions

1. **Season concept.** Whether weekly leagues should be grouped into seasons is unresolved. The current design treats each weekly league as standalone. If seasons are introduced later, a `Seasons` tab would be added and `WeeklyLeagues` would gain a `season_id` foreign key.

2. **UDisc CSV format.** The exact column names and structure of UDisc CSV exports are not yet confirmed with sample data. The import logic assumes standard UDisc columns but must be validated against a real export.

3. **Master player list initial population.** Whether the admin manually enters all players, imports from a CSV, or relies on player self-registration during sign-in. The data model supports all three approaches.

4. **Player sign-in field confirmation.** The sign-in flow shows the player their name, UDisc username, PDGA number, and current tag for confirmation. Whether any additional fields should be displayed is unresolved.
