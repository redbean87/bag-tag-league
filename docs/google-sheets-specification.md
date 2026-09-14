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
| 5 | `current_tag` | integer | Yes | Last-known calculated bag tag number. Updated only when the organizer finalizes a weekly league (written from `out_tag`). Not guaranteed to represent the player's current physical tag because players may trade tags between league days. |
| 6 | `is_active` | boolean | Yes | Whether the player is currently active in the league. Inactive players do not appear in sign-in selection. |
| 7 | `created_at` | string (ISO 8601 UTC) | Yes | Timestamp when this record was created. |
| 8 | `updated_at` | string (ISO 8601 UTC) | Yes | Timestamp of last modification to this record. |

### Notes

- A player who self-registers during sign-in gets a new row here with `is_active = TRUE`.
- `current_tag` is the last-known calculated bag tag value. It is updated only when the organizer finalizes a weekly league (written from `out_tag`). It is **not** guaranteed to represent the player's current physical tag because players may trade tags between league days. The next check-in must require the player's actual `in_tag`.
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
- **importing:** Transient state while UDisc import is being processed.
- **calculating:** Transient state while tag calculation runs.
- **reviewing:** Admin is reviewing results and tag assignments.
- **finalized:** League is locked. All records are read-only. Master player tags are updated.

Transient states (`importing`, `calculating`) are set and cleared within a single server request. They exist to prevent concurrent operations.

---

## Tab: WeeklyPlayerRecords

**Purpose:** One row per player per weekly league. A record is created only when a player signs in. The row preserves the player's state at sign-in time, receives UDisc data during import, and stores the final tag assignment.

### Field Categories

Fields in this tab fall into four categories based on their source and role:

1. **App check-in fields** — set by the player or admin during the check-in process
2. **Imported from UDisc** — written during UDisc import; UDisc is the authoritative source
3. **Calculated by the app** — computed during tag calculation/finalization
4. **Reference-only imported** — imported from UDisc for display/debugging; not used in calculations

### Columns

#### Identity and Relationships

| # | Column Name | Data Type | Required | Category | Description |
|---|-------------|-----------|----------|----------|-------------|
| 1 | `id` | string (UUID) | Yes | System | Primary key. Unique identifier for this record. |
| 2 | `weekly_league_id` | string (UUID) | Yes | System | Foreign key to `WeeklyLeagues.id`. |
| 3 | `master_player_id` | string (UUID) | Yes | System | Foreign key to `MasterPlayers.id`. |

#### Snapshot Fields (copied from MasterPlayers at sign-in, never changed after)

| # | Column Name | Data Type | Required | Category | Description |
|---|-------------|-----------|----------|----------|-------------|
| 4 | `player_name_snapshot` | string | Yes | System | Player's name at sign-in time. Preserved for historical accuracy. |
| 5 | `udisc_username_snapshot` | string | No | System | Player's UDisc username at sign-in time. |
| 6 | `pdga_number_snapshot` | string | No | System | Player's PDGA number at sign-in time. |

#### Tag Fields

| # | Column Name | Data Type | Required | Category | Description |
|---|-------------|-----------|----------|----------|-------------|
| 7 | `in_tag` | integer | Yes | App check-in | Player's actual starting bag tag for the weekly league, supplied by the player during check-in. Do not auto-derive from `MasterPlayers.current_tag`. Used as input to tag calculation. |
| 8 | `out_tag` | integer | No | Calculated | Calculated ending tag assigned after tag calculation. Written to `MasterPlayers.current_tag` during finalization. Null until calculation runs. |

#### App Check-In Fields

| # | Column Name | Data Type | Required | Category | Description |
|---|-------------|-----------|----------|----------|-------------|
| 9 | `checked_in` | boolean | Yes | App check-in | Explicit participation flag. Set `TRUE` when the player completes check-in through the app. This is the authoritative participation indicator for tag calculation. |
| 10 | `signed_in_at` | string (ISO 8601 UTC) | Yes | App check-in | Timestamp when the player signed in through the app. The presence of this timestamp historically defined participation; now superseded by `checked_in` for participation logic. |
| 11 | `paid` | boolean | Yes | App check-in | Payment status for this league, confirmed during check-in. Default: `FALSE`. |
| 12 | `ctp` | boolean | Yes | App check-in | Closest-to-pin status for this league. Default: `FALSE`. |
| 13 | `ace_pot` | boolean | Yes | App check-in | Ace pot status for this league. Default: `FALSE`. |

#### UDisc Import Fields — Identity (for matching)

| # | Column Name | Data Type | Required | Category | Description |
|---|-------------|-----------|----------|----------|-------------|
| 14 | `udisc_name_import` | string | No | Imported | Player name as imported from UDisc. Used for matching and reference. |
| 15 | `udisc_username_import` | string | No | Imported | UDisc username as imported from UDisc. Primary matching field. |
| 16 | `udisc_pdga_number_import` | string | No | Imported | PDGA number as imported from UDisc. Secondary matching field. |

#### UDisc Import Fields — Score and Performance

| # | Column Name | Data Type | Required | Category | Description |
|---|-------------|-----------|----------|----------|-------------|
| 17 | `score` | integer | No | Imported | Player's round score imported from UDisc (`round_total_score`). This is the primary score used for tag calculation ranking. Lower is better. This is a score, not a bag tag. |
| 18 | `round_relative_score` | integer | No | Reference-only | Player's score relative to par for this round. Displayed for reference; not used in tag calculation. |
| 19 | `round_rating` | integer | No | Reference-only | UDisc computed round rating. Displayed for reference; not used in tag calculation. |
| 20 | `event_relative_score` | integer | No | Reference-only | Player's score relative to par for the entire event. Reference only. |
| 21 | `event_total_score` | integer | No | Reference-only | Player's total strokes for the entire event. Reference only. |

#### UDisc Import Fields — Participation and Logistics

| # | Column Name | Data Type | Required | Category | Description |
|---|-------------|-----------|----------|----------|-------------|
| 22 | `udisc_checked_in` | boolean | No | Imported | UDisc's participation status. Separate from the app's `checked_in` field. Imported as reference. |
| 23 | `udisc_paid` | boolean | No | Imported | UDisc's payment status. Separate from the app's `paid` field. Imported as reference. |
| 24 | `starting_hole` | integer | No | Imported | Starting hole number from UDisc data. |
| 25 | `start_time` | string (ISO 8601 UTC) | No | Imported | Start time from UDisc data. |
| 26 | `division` | string | No | Reference-only | Player's division as recorded in UDisc (e.g., "MPO", "FPO", "MA1"). |
| 27 | `udisc_position` | integer | No | Reference-only | Finishing position within the division as recorded by UDisc. |
| 28 | `udisc_position_raw` | integer | No | Reference-only | Raw position before tie adjustments as recorded by UDisc. |

#### UDisc Import Fields — Hole-by-Hole Scores

| # | Column Name | Data Type | Required | Category | Description |
|---|-------------|-----------|----------|----------|-------------|
| 29 | `hole_1` | integer | No | Imported | Score on hole 1. |
| 30 | `hole_2` | integer | No | Imported | Score on hole 2. |
| 31 | `hole_3` | integer | No | Imported | Score on hole 3. |
| 32 | `hole_4` | integer | No | Imported | Score on hole 4. |
| 33 | `hole_5` | integer | No | Imported | Score on hole 5. |
| 34 | `hole_6` | integer | No | Imported | Score on hole 6. |
| 35 | `hole_7` | integer | No | Imported | Score on hole 7. |
| 36 | `hole_8` | integer | No | Imported | Score on hole 8. |
| 37 | `hole_9` | integer | No | Imported | Score on hole 9. |
| 38 | `hole_10` | integer | No | Imported | Score on hole 10. |
| 39 | `hole_11` | integer | No | Imported | Score on hole 11. |
| 40 | `hole_12` | integer | No | Imported | Score on hole 12. |
| 41 | `hole_13` | integer | No | Imported | Score on hole 13. |
| 42 | `hole_14` | integer | No | Imported | Score on hole 14. |
| 43 | `hole_15` | integer | No | Imported | Score on hole 15. |
| 44 | `hole_16` | integer | No | Imported | Score on hole 16. |
| 45 | `hole_17` | integer | No | Imported | Score on hole 17. |
| 46 | `hole_18` | integer | No | Imported | Score on hole 18. |

#### UDisc Import Fields — Reference Only

| # | Column Name | Data Type | Required | Category | Description |
|---|-------------|-----------|----------|----------|-------------|
| 47 | `udisc_ending_tag` | integer | No | Reference-only | Optional ending bag tag value from UDisc (`bag_tag_at_end`). Retained for reference and transition purposes only. Must not be used to calculate `out_tag`. |

#### Admin Fields

| # | Column Name | Data Type | Required | Category | Description |
|---|-------------|-----------|----------|----------|-------------|
| 48 | `notes` | string | No | System | Admin notes about this player's participation. |

#### Timestamps

| # | Column Name | Data Type | Required | Category | Description |
|---|-------------|-----------|----------|----------|-------------|
| 49 | `created_at` | string (ISO 8601 UTC) | Yes | System | Timestamp when this record was created (at sign-in). |
| 50 | `updated_at` | string (ISO 8601 UTC) | Yes | System | Timestamp of last modification to this record. |

### Notes

- Weekly records exist only for players who signed in. No rows are created for absent players.
- `score` is the player's round score imported from UDisc (`round_total_score`). It is a score, not a bag tag. This is the primary score used for tag calculation ranking.
- `in_tag` is the player's actual starting bag tag for the weekly league, supplied by the player during check-in. It must not be auto-derived from `MasterPlayers.current_tag`. It is the starting point for tag calculation.
- `out_tag` is the player's ending bag tag calculated by the app. It is the result of tag calculation.
- `udisc_ending_tag` is optional and may contain a value from the current/manual process or UDisc data (`bag_tag_at_end`). It is retained for reference/transition purposes only and must not be used to calculate `out_tag`.
- `checked_in` is the explicit participation boolean. It supersedes the historical participation check based on `signed_in_at` being non-null.
- `udisc_checked_in` is UDisc's separate participation flag. It is imported as reference only and is not used for app participation logic.
- `udisc_paid` is UDisc's separate payment flag. It is imported as reference only; the app's `paid` field is the authoritative payment status.
- The app calculates `out_tag` using only: players who checked in (`checked_in = TRUE`), each participant's score, each participant's `in_tag` for tie-breaking, the participating players' starting-tag pool, and the agreed lowest-score / lower-`in_tag` tie-break / ascending-tag redistribution rules.
- Once the league is `finalized`, all fields in this tab become read-only.
- See `udisc-import-mapping.md` for the complete UDisc field mapping and identity matching strategy.

---

## Tab: ImportHistory

**Purpose:** One row per UDisc import. Tracks which weekly league was imported, when, the source filename, counts, status, and the raw content.

### Columns

| # | Column Name | Data Type | Required | Description |
|---|-------------|-----------|----------|-------------|
| 1 | `id` | string (UUID) | Yes | Primary key. Unique identifier for this import batch. |
| 2 | `weekly_league_id` | string (UUID) | Yes | Foreign key to `WeeklyLeagues.id`. The league this import is for. |
| 3 | `imported_at` | string (ISO 8601 UTC) | Yes | Timestamp when the import was processed. |
| 4 | `filename` | string | Yes | Original filename as uploaded by the admin. |
| 5 | `total_rows` | integer | Yes | Total number of data rows in the import (excluding header). |
| 6 | `matched` | integer | Yes | Number of import rows successfully matched to an existing signed-in player's `WeeklyPlayerRecords` row. |
| 7 | `unmatched` | integer | Yes | Number of import rows that could not be matched to any signed-in player. |
| 8 | `missing_from_csv` | integer | Yes | Number of signed-in players that were not found in the import. |
| 9 | `status` | string (enum) | Yes | Import status. Allowed values: `completed`, `partial`, `failed`. |
| 10 | `raw_csv_content` | string | No | The full raw import content as a text blob. Preserved for reference. May be large. |
| 11 | `notes` | string | No | Admin notes on this import. |

### Import Status Values

- **completed:** All rows were processed. May still have unmatched rows or missing players.
- **partial:** Some rows failed to process (e.g., malformed data). Admin should review.
- **failed:** The import could not be completed (e.g., invalid file structure).

### Import Behavior

- The system parses the UDisc xlsx and writes the relevant imported values into the appropriate `WeeklyPlayerRecords` columns for matched players.
- Unmatched UDisc players are added as new `WeeklyPlayerRecords` rows (with `in_tag` left blank or set appropriately), and the organizer can fix or associate them afterward.
- A signed-in player missing from the import is flagged in the import results (`missing_from_csv` count) so the admin can review.
- Each import attempt creates a new `ImportHistory` row, even if re-importing the same file.

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

- Players who checked in (`checked_in = TRUE`)
- Each participant's `score` (for ranking)
- Each participant's `in_tag` (for tie-breaking)
- The participating players' starting-tag pool (all `in_tag` values)
- The agreed rules: lowest score wins, lower `in_tag` breaks ties, tags redistribute ascending

`udisc_ending_tag` must not be used as input to tag calculation.

### Finalization Rules

At finalization:

1. Consider only checked-in/participating players.
2. Rank players by lowest round score first, then by lower `in_tag` to break ties.
3. Build the available tag pool from participating players' `in_tag` values, sorted ascending.
4. Assign the sorted available tags to the ranked players.
5. The highest-ranked player receives the lowest available participating tag.
6. Persist the assigned result as each player's `out_tag`.
7. Update `MasterPlayers.current_tag` with the finalized `out_tag` as the player's last known calculated tag.

### Algorithm

1. **Only checked-in players participate.** A player is a participant if they have a `WeeklyPlayerRecords` row with `checked_in = TRUE` for that league. Players who did not check in are excluded and retain their existing `MasterPlayers.current_tag`.
2. **Rank by lowest score first.** Ties are resolved by lower `in_tag` (the player with the lower starting tag finishes first).
3. **Build the tag pool.** Collect the `in_tag` values from all participating players.
4. **Sort the pool ascending.** The lowest tag is first.
5. **Assign tags in finishing order.** The first-place finisher receives the lowest tag from the pool, second place receives the next lowest, and so on.
6. **Store the result in `out_tag`** on each participant's `WeeklyPlayerRecords` row.
7. **After the organizer finalizes the weekly league,** update each participating player's `current_tag` in `MasterPlayers` with their `out_tag` value. This is a last-known calculated value; it is not guaranteed to represent the player's physical tag because players may trade tags between league days.

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
4. **Re-import UDisc data:** Upload a new file. Existing rows are merged (updated), not duplicated.
5. **Resolve unmatched records:** Manually match an unmatched UDisc record to an existing signed-in player, or add a new player to `MasterPlayers` and then match.
6. **Correct player data:** Edit `MasterPlayers` fields (name, UDisc username, PDGA number) at any time.
7. **Adjust payment/CTP/ace pot:** Toggle `paid`, `ctp`, `ace_pot` on any `WeeklyPlayerRecords` row.

There is no separate admin override system, audit log, correction record, or immutable event history. The app is simply intended to help the organizer run the league.

---

## Remaining Decisions

1. **Season concept.** Whether weekly leagues should be grouped into seasons is unresolved. The current design treats each weekly league as standalone. If seasons are introduced later, a `Seasons` tab would be added and `WeeklyLeagues` would gain a `season_id` foreign key.

2. **Master player list initial population.** Whether the admin manually enters all players, imports from a CSV, or relies on player self-registration during sign-in. The data model supports all three approaches.

3. **Player sign-in field confirmation.** The sign-in flow shows the player their name, UDisc username, PDGA number, and current tag for confirmation. Whether any additional fields should be displayed is unresolved.

### Resolved: UDisc CSV/XLSX Format

The UDisc export format has been confirmed by inspecting a real workbook (`the-view-dgc-weekly-tags-the-big-finale-for-the-view-2026-08-31.xlsx`). The `Event results` sheet contains 34 columns. The full mapping is documented in `udisc-import-mapping.md`. The Google Sheets tab structure has been updated to accommodate all UDisc fields.

### Resolved: `checked_in` vs `signed_in_at`

Both fields are now present in the schema:

- **`checked_in`** (boolean): The explicit participation flag. Set `TRUE` when the player completes check-in through the app. This is the authoritative participation indicator for tag calculation.
- **`signed_in_at`** (ISO 8601 UTC timestamp): The timestamp of when app check-in occurred. Retained for historical continuity and audit purposes.

These two fields serve distinct purposes and should not be conflated. See `open-decisions.md` for the full resolution.
