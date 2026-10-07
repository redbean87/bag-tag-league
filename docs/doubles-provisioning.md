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
| `League` | 15 singles columns + `league_format` | Settings row records `league_format=doubles` |
| `ClubMembers` | The standard 8 columns | One row per member, `member_number` preserved |
| `Week template` | The 48 singles columns + 6 doubles columns | Non-dated template; ignored by the `Week YYYY-MM-DD` logic |
| `Week YYYY-MM-DD` | The 48 + 6 doubles columns | Created on demand for a league date |

The six doubles columns are `pair_key`, `partner_member_number`,
`team_position`, `team_position_raw`, `weekly_points`, and
`weekly_points_status`. The singles `WEEKLY_RECORD_HEADERS` (48) and
`LEAGUE_SHEET_HEADERS` (15) are unchanged.

## Roster seeding

`seedRosterFromSingles` copies every Singles `ClubMembers` row into the Doubles
`ClubMembers` tab, preserving each `member_number` exactly (members are never
renumbered). Members already present in the doubles roster are skipped, so the
seed can run more than once without duplicating rows.

## Operator scripts (`scripts/ProvisionDoubles.gs`)

These functions are written for the Apps Script editor (Run menu) or a bound
menu, not the public web app. Run them with the operator's existing Apps Script
authorization. No credentials or secrets are stored in the repository.

| Function | Purpose |
|----------|---------|
| `provisionDoublesSpreadsheet()` | Provision tabs + seed roster, then log the summary |
| `createDoublesWeekTab('YYYY-MM-DD')` | Create/return a doubles week tab |
| `verifySpreadsheetTopology()` | Verify tabs and headers for both spreadsheets |
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

## Tests

`npm test` runs the unit suite with Node's built-in test runner. The suite uses
an in-memory SpreadsheetApp fake, so it needs no Google credentials and performs
no live sheet writes. It covers spreadsheet routing/defaults, `league_format`
gating, header constants, doubles provisioning, and roster-seed
`member_number` preservation.
