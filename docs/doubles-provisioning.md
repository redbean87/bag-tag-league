# Doubles Provisioning and Operations

Increment 1 of the doubles league adds a second spreadsheet and the tooling to
provision and inspect it. The Singles spreadsheet and its schema are never
modified.

- Singles spreadsheet (default): `SPREADSHEET_ID` in `scripts/Code.gs`
- Doubles spreadsheet: `SPREADSHEET_ID_DOUBLES` in `scripts/Code.gs`
  (`1c8QGftl2bKcLZeqwE2IyzAh5x4I22WRjSSgc7nGgeG8`)

## What provisioning creates

`provisionDoublesWorkbook` ensures the doubles spreadsheet has the canonical
topology. It is deterministic and safe to run repeatedly:

| Tab | Headers | Notes |
|-----|---------|-------|
| `League` | 15 base columns + `league_format` + `scoring` | Settings row records `league_format=doubles` and `scoring=points` |
| `ClubMembers` | The 8 tag-free roster columns | One row per member, `member_number` preserved; `season_points` caches the live season total |
| `Week template` | The 51 human-first weekly columns | Non-dated template; ignored by the `Week YYYY-MM-DD` logic |
| `Week YYYY-MM-DD` | The 51 human-first weekly columns | Created on demand for a league date |

The doubles weekly schema is the tag-free singles base plus six doubles-only
columns: `pair_key`, `partner_member_number`, `team_position`,
`team_position_raw`, `weekly_points`, and `weekly_points_status` (48 singles
columns minus the three tag columns `in_tag`, `out_tag`, and `udisc_ending_tag`,
plus six = **51 columns**). The doubles `ClubMembers` roster is the singles
roster minus `current_tag` plus the `season_points` cache (**8 columns**). Both
schemas derive from the `format x scoring` capability model: the doubles league
is `doubles x points`, so it carries no tag columns. `weekly_points`
is computed from each committed placement when the UDisc import is committed;
`weekly_points_status` is a retired column kept only for schema compatibility
and is no longer read or written. Season totals are the live sum of the
committed `weekly_points` values; the sum is mirrored into each `ClubMembers`
row's `season_points` column at the end of every import commit, so the roster
tab itself always holds current totals while the live sum stays the source of
truth. There is no confirm/finalize step. Both the singles and doubles weekly
headers are ordered human-first: names, then pair linkage and score/points
where they apply, then the remaining columns in their historical relative
order. The singles header names and counts are unchanged; the doubles schema
drops the singles tag columns entirely. Every reader resolves a column by name,
so only the physical layout changed. The 15 base `LEAGUE_SHEET_HEADERS`
columns are unchanged; both leagues append the same two metadata columns
(`league_format` and `scoring`), so a League sheet is 17 columns. The registry
is authoritative for routing and the sheet records the same values as
per-spreadsheet confirmation; a mismatch is reported, never auto-corrected.

## Roster seeding

`seedRosterFromSingles` copies every Singles `ClubMembers` row into the Doubles
`ClubMembers` tab, preserving each `member_number` exactly (members are never
renumbered). Values are copied **by header name**, not by position, and
`current_tag` is never copied: the doubles roster is tag-free, so a positional
copy would shift every column after `pdga_number`. `season_points` has no
singles source, so it lands blank until the first points write. Members already
present in the doubles roster are skipped, so the seed can run more than once
without duplicating rows.

## Operator scripts (`scripts/ProvisionDoubles.gs`)

These functions are written for the Apps Script editor (Run menu) or a bound
menu, not the public web app. Run them with the operator's existing Apps Script
authorization. No credentials or secrets are stored in the repository.

| Function | Purpose |
|----------|---------|
| `provisionDoublesSpreadsheet()` | Provision tabs + seed roster, then log the summary |
| `createDoublesWeekTab('YYYY-MM-DD')` | Create/return a doubles week tab |
| `verifySpreadsheetTopology()` | Verify tabs and headers for both spreadsheets |
| `previewWeeklyColumnOrderMigration()` | Dry-run the human-first weekly column migration for both spreadsheets |
| `applyWeeklyColumnOrderMigration()` | Apply the weekly column migration; refused unless the captain sets the approval Script Property |
| `previewDetagColumnDrops()` | Dry-run the destructive detag column-drop migration for the doubles spreadsheet (writes nothing) |
| `applyDetagColumnDrops()` | Drop `in_tag`/`out_tag`/`udisc_ending_tag` from doubles weeks and `current_tag` from the doubles roster; refused unless the captain sets the approval Script Property |
| `reportRosterCounts()` | Report Singles and Doubles roster counts |

Each returns a plain report object and logs it with `Logger.log`, so the result
is visible in the Apps Script execution log.

### Configuration via Script Properties

Spreadsheet IDs can be overridden without editing code by setting Script
Properties:

```js
PropertiesService.getScriptProperties().setProperty('DOUBLES_SPREADSHEET_ID', '<id>');
PropertiesService.getScriptProperties().setProperty('SINGLES_SPREADSHEET_ID', '<id>');
```

When a property is unset the constant in `scripts/Code.gs` is used.

### Deploying

```bash
bash scripts/deploy.sh "doubles increment 1"
```

`clasp push` includes `scripts/ProvisionDoubles.gs` automatically because it
sits beside `Code.gs` in the Apps Script project root.

## Admin UI

The admin page has a **League** picker populated from the shared league
registry (`src/shared/league-format.js`). Each league carries its own format as
data, and the selected league id is persisted in `localStorage`
(`bagTagLeague.leagueId`); the first league (Singles) remains the default. Every
action request carries the derived `spreadsheetId`. When a league whose format
is `doubles` is selected, the **Doubles Provisioning** card calls the
`provisionDoubles` web-app action, and the singles-only tag tooling is hidden.

## Detag column-drop migration

The doubles league no longer collects, stores, or renders tag data, so the
remaining physical tag columns are removed by a gated, destructive migration.
`migrateDetagColumnDrops` discovers weekly sheets by header name (so the
`Week template` and every dated `Week YYYY-MM-DD` tab are covered) and also
plans the `ClubMembers` roster. It is a dry run by default; applying it deletes
`in_tag`/`out_tag`/`udisc_ending_tag` from each weekly sheet and `current_tag`
from the roster, taking the stored values with them. A tag-scoring league (the
singles spreadsheet) has an empty drop set, so running it there is a no-op and
can never delete tag data.

The apply path is refused unless the Apps Script project has
`DETAG_COLUMN_DROPS_APPROVAL = bag-detag-drops-c1`; nothing in deployment,
startup, tests, or ordinary sheet operations sets it. During the transition the
code accepts the pre-detag layouts as known-but-un-migrated, so the column-order
dry run and the topology check keep working on a sheet that still carries the
tag columns.

## Re-provisioning guard

Once a doubles spreadsheet is fully provisioned, the provision action is no
longer actionable. Doubles are considered **provisioned** only when all of the
following are true, as reported by the single backend helper
`getDoublesProvisioningState`:

- the `ClubMembers` sheet is present;
- the `League` sheet is present;
- the `League` sheet records `league_format=doubles`;
- the `League` sheet records `scoring=points`;
- the `Week template` sheet is present.

When provisioned, the admin card disables the button and shows **"Doubles
provisioned."**. The `provisionDoubles` action runs the same check before any
write: if it reports provisioned, the request returns the `already_provisioned`
status and creates no tabs, rows, or templates. This closes the race where a
second admin clicks provision after another admin has already provisioned the
spreadsheet. The UI and the mutation read the same check, so they can never
disagree. Singles provisioning is unchanged; the doubles action targets the
doubles spreadsheet only.

## Tests

`npm test` runs the unit suite with Node's built-in test runner. The suite uses
an in-memory SpreadsheetApp fake, so it needs no Google credentials and performs
no live sheet writes. It covers spreadsheet routing/defaults, `league_format`
and `scoring` gating, header constants, doubles provisioning, roster-seed
`member_number` preservation, the doubles provisioning-state guard, and the
disabled re-provisioning UI.
