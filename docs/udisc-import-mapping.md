# UDisc Import Mapping

## Source File

UDisc export format: `.xlsx` (Excel workbook)

**Confirmed file:** `the-view-dgc-weekly-tags-the-big-finale-for-the-view-2026-08-31.xlsx`

**Relevant sheet:** `Event results`

## Confirmed Export Structure

The `Event results` sheet contains 34 columns. All fields below were confirmed by inspecting the actual workbook.

### Identity Fields

| UDisc Column | Data Type | Description | Required |
|---|---|---|---|
| `name` | string | Player display name as entered in UDisc | Yes |
| `pdga_number` | integer | PDGA membership number (may be empty) | No |
| `username` | string | UDisc username (may be empty) | No |

### Division and Position Fields

| UDisc Column | Data Type | Description | Required |
|---|---|---|---|
| `division` | string | Division name (e.g., "MPO", "FPO", "MA1") | Yes |
| `position` | integer | Finishing position within the division | Yes |
| `position_raw` | integer | Raw position before tie adjustments | Yes |

### Event-Level Score Fields

| UDisc Column | Data Type | Description | Required |
|---|---|---|---|
| `event_relative_score` | integer | Player's score relative to par for the event | Yes |
| `event_total_score` | integer | Player's total strokes for the event | Yes |

### Round-Level Score Fields

| UDisc Column | Data Type | Description | Required |
|---|---|---|---|
| `round_relative_score` | integer | Player's score relative to par for this round | Yes |
| `round_total_score` | integer | Player's total strokes for this round | Yes |
| `round_rating` | integer | UDisc computed round rating (may be empty) | No |

### Participation and Payment Fields

| UDisc Column | Data Type | Description | Required |
|---|---|---|---|
| `paid` | boolean | Whether the player paid for this round | Yes |
| `checked_in` | boolean | Whether the player checked in via UDisc | Yes |

### Round Logistics Fields

| UDisc Column | Data Type | Description | Required |
|---|---|---|---|
| `starting_hole` | integer | Starting hole number | Yes |
| `start_time` | string (time) | Round start time | Yes |

### Hole-by-Hole Score Fields

| UDisc Column | Data Type | Description | Required |
|---|---|---|---|
| `hole_1` through `hole_18` | integer | Score on each hole | Yes |

### Reference-Only Fields

| UDisc Column | Data Type | Description | Required |
|---|---|---|---|
| `bag_tag_at_end` | integer | Ending bag tag value as recorded by UDisc | No |

## Field Classification

Fields are classified into four categories based on their role in the application:

### 1. Imported Directly from UDisc

These fields are written directly into `WeeklyPlayerRecords` during import. They come from the UDisc export and are the authoritative source for their values.

| UDisc Field | App Field | Notes |
|---|---|---|
| `name` | `udisc_name_import` | Imported name for reference and matching |
| `pdga_number` | `udisc_pdga_number_import` | Imported PDGA number for matching |
| `username` | `udisc_username_import` | Imported UDisc username for matching |
| `round_total_score` | `score` | **Primary round score** used for tag calculation ranking |
| `round_relative_score` | `round_relative_score` | Optional relative-score reference |
| `round_rating` | `round_rating` | Optional round-rating reference |
| `checked_in` | `udisc_checked_in` | UDisc's participation status (separate from app check-in) |
| `paid` | `udisc_paid` | UDisc's payment status |
| `starting_hole` | `starting_hole` | Starting hole number |
| `start_time` | `start_time` | Round start time |
| `hole_1`–`hole_18` | `hole_1`–`hole_18` | Hole-by-hole score data |
| `bag_tag_at_end` | `udisc_ending_tag` | Reference-only; must not override calculated `out_tag` |
| `event_relative_score` | `event_relative_score` | Event-level relative score (reference) |
| `event_total_score` | `event_total_score` | Event-level total score (reference) |
| `division` | `division` | Player's division (reference) |
| `position` | `udisc_position` | UDisc finishing position (reference) |
| `position_raw` | `udisc_position_raw` | UDisc raw position (reference) |

### 2. Supplied During App Check-In

These fields are set by the player or admin during the check-in process, before UDisc import.

| App Field | Source | Notes |
|---|---|---|
| `in_tag` | Player | Player's actual starting bag tag |
| `checked_in` | App | Explicit participation boolean (set when player completes check-in) |
| `signed_in_at` | App | Timestamp of when app check-in occurred |
| `paid` | Player/Admin | Payment status confirmed during check-in |
| `ctp` | Player/Admin | Closest-to-pin status |
| `ace_pot` | Player/Admin | Ace pot status |

### 3. Calculated by the App During Finalization

| App Field | Source | Notes |
|---|---|---|
| `out_tag` | App calculation | Ending tag calculated from score ranking and tag pool |

### 4. Reference-Only Imported Fields

These fields are imported from UDisc for reference and display only. They must not be used as input to any calculation.

| App Field | Source | Notes |
|---|---|---|
| `udisc_ending_tag` | UDisc `bag_tag_at_end` | Retained for reference/transition purposes only |
| `round_rating` | UDisc `round_rating` | Displayed for reference; not used in tag calculation |
| `event_relative_score` | UDisc `event_relative_score` | Reference; round score is used for ranking |
| `event_total_score` | UDisc `event_total_score` | Reference; round score is used for ranking |
| `division` | UDisc `division` | Reference for display |
| `udisc_position` | UDisc `position` | Reference; tag calculation computes its own ranking |
| `udisc_position_raw` | UDisc `position_raw` | Reference |

## Mapping Table: UDisc to Application

| UDisc Field | Application Field | Field Category | Notes |
|---|---|---|---|
| `division` | `division` | Imported reference | Division name |
| `position` | `udisc_position` | Imported reference | Finishing position |
| `position_raw` | `udisc_position_raw` | Imported reference | Raw position |
| `name` | `udisc_name_import` | Imported identity | For matching and reference |
| `event_relative_score` | `event_relative_score` | Imported reference | Event-level relative score |
| `event_total_score` | `event_total_score` | Imported reference | Event-level total score |
| `pdga_number` | `udisc_pdga_number_import` | Imported identity | For matching |
| `username` | `udisc_username_import` | Imported identity | For matching |
| `round_relative_score` | `round_relative_score` | Imported reference | Round relative score |
| `round_total_score` | `score` | Imported primary | **Primary round score for tag calculation** |
| `round_rating` | `round_rating` | Imported reference | Round rating |
| `paid` | `udisc_paid` | Imported reference | UDisc payment status |
| `checked_in` | `udisc_checked_in` | Imported reference | UDisc participation status |
| `starting_hole` | `starting_hole` | Imported | Starting hole |
| `start_time` | `start_time` | Imported | Start time |
| `hole_1` | `hole_1` | Imported | Hole 1 score |
| `hole_2` | `hole_2` | Imported | Hole 2 score |
| `hole_3` | `hole_3` | Imported | Hole 3 score |
| `hole_4` | `hole_4` | Imported | Hole 4 score |
| `hole_5` | `hole_5` | Imported | Hole 5 score |
| `hole_6` | `hole_6` | Imported | Hole 6 score |
| `hole_7` | `hole_7` | Imported | Hole 7 score |
| `hole_8` | `hole_8` | Imported | Hole 8 score |
| `hole_9` | `hole_9` | Imported | Hole 9 score |
| `hole_10` | `hole_10` | Imported | Hole 10 score |
| `hole_11` | `hole_11` | Imported | Hole 11 score |
| `hole_12` | `hole_12` | Imported | Hole 12 score |
| `hole_13` | `hole_13` | Imported | Hole 13 score |
| `hole_14` | `hole_14` | Imported | Hole 14 score |
| `hole_15` | `hole_15` | Imported | Hole 15 score |
| `hole_16` | `hole_16` | Imported | Hole 16 score |
| `hole_17` | `hole_17` | Imported | Hole 17 score |
| `hole_18` | `hole_18` | Imported | Hole 18 score |
| `bag_tag_at_end` | `udisc_ending_tag` | Imported reference | Must not override `out_tag` |

## Identity Matching Strategy

### Matching Priority

When importing UDisc data, records are matched to existing `WeeklyPlayerRecords` rows using:

1. **UDisc username** (`username` field) — most reliable unique identifier
2. **PDGA number** (`pdga_number` field) — reliable unique identifier
3. **Player name** (`name` field) — fallback; prone to inconsistencies

### Identity Risks

| Risk | Description | Mitigation |
|---|---|---|
| **Name inconsistencies** | UDisc names may differ from master list (e.g., "John Smith" vs "Jon Smith", nickname vs full name, middle initial differences) | Use username or PDGA number as primary match; name is last resort |
| **Missing PDGA numbers** | `pdga_number` may be empty for some players | Do not rely on PDGA number alone; use username as primary |
| **Missing usernames** | `username` may be empty for some players | Fall back to PDGA number, then name |
| **Multiple players with same name** | Two players named "Mike Johnson" | Require PDGA number or username disambiguation; flag for admin review |
| **Name changes** | Player may have changed their UDisc name since last import | Match on username or PDGA number; update name on match |

### Recommendation

The importer should attempt matching in priority order (username → PDGA number → name) and flag any ambiguous or unmatched records for admin review. Never silently create a new player record when a name match is ambiguous.

## Score Field Selection

The UDisc export contains two score fields:

- `event_total_score` / `event_relative_score`: Event-level aggregates
- `round_total_score` / `round_relative_score`: Round-level scores

**Decision:** Use `round_total_score` as the primary `score` for tag calculation ranking. This is the score for the specific round being imported, which is what the tag calculation requires.

`event_total_score` and `event_relative_score` are retained as reference fields but are not used in tag calculation.

## Notes on UDisc `checked_in` vs App Check-In

UDisc has a `checked_in` field that indicates whether the player checked in via the UDisc system. This is separate from the app's check-in mechanism:

- **UDisc `checked_in`** (`udisc_checked_in`): Indicates UDisc-side participation. Imported as reference data.
- **App `checked_in`**: Set when the player completes check-in through the app. This is the authoritative participation flag.
- **App `signed_in_at`**: Timestamp of when app check-in occurred.

These should not be conflated. A player may have checked in via UDisc but not through the app, or vice versa. The app's `checked_in` field is the source of truth for participation in tag calculation.

## Recommendation: Google Sheet Storage Structure

### Option A: Full 34-Column Import (Recommended)

Store all 34 UDisc columns in the `WeeklyPlayerRecords` tab. This preserves the complete import data for reference and debugging.

**Pros:**
- Complete data preservation
- Simple import logic (direct column mapping)
- No data loss during import
- Full audit trail

**Cons:**
- Many columns in the sheet (potentially overwhelming for manual editing)
- Some columns are reference-only and may never be used

### Option B: Normalized Subset + Optional Hole Scores

Store only the essential fields in `WeeklyPlayerRecords` and put hole-by-hole scores in a separate tab or as a JSON blob.

**Pros:**
- Cleaner main sheet
- Fewer columns to manage

**Cons:**
- More complex import logic
- Hole scores harder to inspect/edit
- Loses direct UDisc data correspondence

### Recommendation

**Adopt Option A** (full 34-column import). The existing architecture uses Google Sheets as the sole datastore with one row per player per league. Adding UDisc columns directly aligns with this pattern. The extra columns are cheap to store and provide complete traceability. Admins who find the columns overwhelming can hide them in the Google Sheets UI.

The hole-by-hole columns (`hole_1`–`hole_18`) should be stored as individual columns, not as a JSON blob, because Google Sheets cannot efficiently parse JSON and the app may need to display or aggregate hole scores.
