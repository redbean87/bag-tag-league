# Data Model

## Field Ownership

Each field has a single authoritative source. The app must not derive or overwrite a field from a source other than its designated owner.

| Field | Owner | Source | Notes |
|-------|-------|--------|-------|
| `in_tag` | Player | Supplied by the player during check-in | Represents the player's actual starting bag tag for that league day. Do not automatically derive it from `ClubMembers.current_tag`. |
| `checked_in` | App | Set when the player completes check-in through the app | Explicit participation boolean. Authoritative participation indicator for tag calculation. |
| `signed_in_at` | App | Set when the player completes check-in through the app | Timestamp of when check-in occurred. Retained for historical continuity. |
| `paid` | Player/Admin | Captured during check-in based on the player's selection/confirmation | Do not infer payment status from participation or UDisc data. |
| `starting_hole` | UDisc | Imported from UDisc | Players enter their starting hole in UDisc after the physical starting-hole draw. The app does not randomize starting holes. |
| `start_time` | UDisc | Imported from UDisc | |
| `score` | UDisc | Imported from UDisc (`round_total_score`) | Represents the player's round score, not a bag-tag value. This is the primary score used for tag calculation ranking. |
| `out_tag` | App | Calculated by the app during finalization | Do not import or accept it as the authoritative result from UDisc. |
| `udisc_ending_tag` | UDisc | Imported from UDisc (`bag_tag_at_end`) | Reference only. Must not be used to calculate `out_tag`. |
| `udisc_checked_in` | UDisc | Imported from UDisc | Reference only. UDisc's participation status. Separate from the app's `checked_in`. |
| `udisc_paid` | UDisc | Imported from UDisc | Reference only. UDisc's payment status. Separate from the app's `paid`. |
| `udisc_name_import` | UDisc | Imported from UDisc | Reference and matching. Player name as recorded in UDisc. |
| `udisc_username_import` | UDisc | Imported from UDisc | Reference and matching. Primary matching field. |
| `udisc_pdga_number_import` | UDisc | Imported from UDisc | Reference and matching. Secondary matching field. |
| `round_relative_score` | UDisc | Imported from UDisc | Reference only. Score relative to par for the round. |
| `round_rating` | UDisc | Imported from UDisc | Reference only. UDisc computed round rating. |
| `event_relative_score` | UDisc | Imported from UDisc | Reference only. Score relative to par for the event. |
| `event_total_score` | UDisc | Imported from UDisc | Reference only. Total strokes for the event. |
| `division` | UDisc | Imported from UDisc | Reference only. Player's division. |
| `udisc_position` | UDisc | Imported from UDisc | Reference only. Finishing position within division. |
| `udisc_position_raw` | UDisc | Imported from UDisc | Reference only. Raw position before tie adjustments. |
| `hole_1`–`hole_18` | UDisc | Imported from UDisc | Reference. Hole-by-hole score data. |

## Persistence

All data lives in Google Sheets. Each entity maps to a tab (worksheet) within a single Google Spreadsheet. Rows are records; columns are fields. Primary keys are UUIDs generated server-side (for `WeeklyLeagues` and `ImportHistory`), except for `member_number` which is a sequential integer. `WeeklyPlayerRecords` uses a logical composite identity of `weekly_league_id` + `member_number` — no per-row UUID.

## Entity Relationship Overview

```
ClubMembers 1---* WeeklyPlayerRecords (via member_number)
WeeklyLeagues 1---* WeeklyPlayerRecords
WeeklyLeagues 1---* ImportHistory
```

## Tabs

### ClubMembers Tab

One row per player. Updated only during league finalization or admin correction.

| Column | Type | Notes |
|--------|------|-------|
| member_number | integer | Primary key. Sequential league member number starting at 1. App-generated, unique, immutable after assignment. Assigned when a player first registers. Never reused from deleted or inactive players. |
| name | string | Player's display name |
| udisc_username | string | UDisc username (nullable) |
| pdga_number | string | PDGA number (nullable) |
| current_tag | integer | Last-known calculated bag tag number. Only updated during league finalization with the player's `out_tag`. Not guaranteed to represent the player's current physical tag because players may trade tags between league days. The next check-in must require the player's actual `in_tag`. |
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
| weekly_league_id | string (UUID) | FK to WeeklyLeagues |
| member_number | integer | FK to ClubMembers.member_number |
| player_name_snapshot | string | Snapshot of name at sign-in |
| udisc_username_snapshot | string | Snapshot of UDisc username at sign-in |
| pdga_number_snapshot | string | Snapshot of PDGA number at sign-in |
| in_tag | integer | Player's actual starting bag tag for the weekly league, supplied by the player during check-in. Do not auto-derive from `ClubMembers.current_tag`. |
| out_tag | integer | Player's ending bag tag, calculated by the app (nullable until calculation) |
| checked_in | boolean | Explicit participation flag. Set TRUE when player completes check-in through the app. Authoritative participation indicator. |
| signed_in_at | string (ISO 8601) | Timestamp when the player signed in through the app |
| paid | boolean | Payment status (confirmed during check-in) |
| ctp | boolean | Closest-to-pin status |
| ace_pot | boolean | Ace pot status |
| udisc_name_import | string | Player name as imported from UDisc (nullable) |
| udisc_username_import | string | UDisc username as imported from UDisc (nullable) |
| udisc_pdga_number_import | string | PDGA number as imported from UDisc (nullable) |
| score | integer | Player's round score imported from UDisc (`round_total_score`). This is the primary score used for tag calculation ranking. Lower is better. This is a score, not a bag tag. (nullable) |
| round_relative_score | integer | Player's score relative to par for this round (nullable) |
| round_rating | integer | UDisc computed round rating (nullable) |
| event_relative_score | integer | Player's score relative to par for the event (nullable) |
| event_total_score | integer | Player's total strokes for the event (nullable) |
| udisc_checked_in | boolean | UDisc's participation status. Reference only. Separate from app's `checked_in`. (nullable) |
| udisc_paid | boolean | UDisc's payment status. Reference only. Separate from app's `paid`. (nullable) |
| starting_hole | integer | Starting hole (from UDisc import, nullable) |
| start_time | string (ISO 8601) | Start time (from UDisc import, nullable) |
| division | string | Player's division as recorded in UDisc (nullable) |
| udisc_position | integer | Finishing position within division as recorded by UDisc (nullable) |
| udisc_position_raw | integer | Raw position before tie adjustments as recorded by UDisc (nullable) |
| hole_1 | integer | Score on hole 1 (nullable) |
| hole_2 | integer | Score on hole 2 (nullable) |
| hole_3 | integer | Score on hole 3 (nullable) |
| hole_4 | integer | Score on hole 4 (nullable) |
| hole_5 | integer | Score on hole 5 (nullable) |
| hole_6 | integer | Score on hole 6 (nullable) |
| hole_7 | integer | Score on hole 7 (nullable) |
| hole_8 | integer | Score on hole 8 (nullable) |
| hole_9 | integer | Score on hole 9 (nullable) |
| hole_10 | integer | Score on hole 10 (nullable) |
| hole_11 | integer | Score on hole 11 (nullable) |
| hole_12 | integer | Score on hole 12 (nullable) |
| hole_13 | integer | Score on hole 13 (nullable) |
| hole_14 | integer | Score on hole 14 (nullable) |
| hole_15 | integer | Score on hole 15 (nullable) |
| hole_16 | integer | Score on hole 16 (nullable) |
| hole_17 | integer | Score on hole 17 (nullable) |
| hole_18 | integer | Score on hole 18 (nullable) |
| udisc_ending_tag | integer | Optional ending bag tag from UDisc (`bag_tag_at_end`). Retained for reference/transition purposes only. Must not be used to calculate out_tag. (nullable) |
| notes | string | Admin notes (nullable) |
| created_at | string (ISO 8601) | Record creation |
| updated_at | string (ISO 8601) | Last modification |

**Field groups:**

- **Snapshot fields:** player_name_snapshot, udisc_username_snapshot, pdga_number_snapshot (copied from ClubMembers at sign-in, never changed)
- **Identity fields:** member_number — sequential integer (1, 2, 3, …) linking weekly records to ClubMembers, immutable after assignment
- **Tag fields:** in_tag (player's actual starting bag tag, supplied by the player during check-in), out_tag (player's ending bag tag, calculated by the app)
- **App check-in fields:** checked_in, signed_in_at, paid, ctp, ace_pot
- **UDisc identity import fields:** udisc_name_import, udisc_username_import, udisc_pdga_number_import (for matching and reference)
- **UDisc score import fields:** score, round_relative_score, round_rating, event_relative_score, event_total_score
- **UDisc logistics import fields:** starting_hole, start_time, udisc_checked_in, udisc_paid, division, udisc_position, udisc_position_raw
- **UDisc hole-by-hole import fields:** hole_1–hole_18
- **UDisc reference-only fields:** udisc_ending_tag
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
- Google Sheets row numbers are ephemeral and must not be used as identifiers; use UUIDs instead (except `member_number`, which is a sequential integer, and `WeeklyPlayerRecords` which uses the composite of `weekly_league_id` + `member_number`)
- There is no admin override system, audit log, or correction record mechanism
- `score` is the player's round score imported from UDisc (`round_total_score`). It is a score, not a bag tag. This is the primary score used for tag calculation ranking.
- `in_tag` is the player's actual starting bag tag for the weekly league, supplied by the player during check-in. It must not be auto-derived from `ClubMembers.current_tag`.
- `out_tag` is the player's ending bag tag, calculated by the app using only: players who checked in (`checked_in = TRUE`), each participant's score, each participant's `in_tag` for tie-breaking, the participating players' starting-tag pool, and the agreed lowest-score / lower-`in_tag` tie-break / ascending-tag redistribution rules.
- `udisc_ending_tag` is optional and may contain a value from the current/manual process or UDisc data (`bag_tag_at_end`). It is retained for reference/transition purposes only and must not be used to calculate `out_tag`.
- `ClubMembers.current_tag` is only a last-known calculated value. It is not guaranteed to represent the player's current physical tag because players may trade tags between league days. The next check-in must require the player's actual `in_tag`.
- `checked_in` (boolean) is the explicit participation flag. It supersedes the historical participation check based on `signed_in_at` being non-null.
- `udisc_checked_in` is UDisc's separate participation flag. It is imported as reference only and is not used for app participation logic.
- `udisc_paid` is UDisc's separate payment flag. It is imported as reference only; the app's `paid` field is the authoritative payment status.
- UDisc identity fields (`udisc_name_import`, `udisc_username_import`, `udisc_pdga_number_import`) are used for matching during import. See `udisc-import-mapping.md` for the complete matching strategy.
- See `udisc-import-mapping.md` for the full UDisc field mapping and export structure documentation.
