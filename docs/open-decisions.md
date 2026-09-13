# Open Decisions

## Unresolved Questions

### 1. Season Concept

**Status:** Needs input

Should weekly leagues be grouped into seasons?

- If yes: a season has a start date, end date, and associated leagues
- If no: each weekly league is standalone

**Questions:**
- Does the league have seasons?
- If yes, should season-long statistics be tracked?
- Should bag tags reset at the start of a new season?

### 3. UDisc CSV Format

**Status:** Needs sample data

The system needs to parse UDisc CSV exports. The exact format is not yet confirmed.

**Questions:**
- Can a sample UDisc CSV be provided?
- Are there different export formats?

### 4. Master Player List Population

**Status:** Needs input

How should the master player list be initially populated?

- Manual entry (admin adds players one at a time)
- Player self-registration (players create their own records through the sign-in flow)
- Hybrid (admin seeds, players confirm/update)

### 5. Player Sign-In Fields

**Status:** Needs confirmation

During sign-in, the player sees their name, UDisc username, PDGA number, and current tag for confirmation. Are there any other fields they should see?

## Resolved Decisions

The following decisions have been made and should not be revisited:

1. **Google Sheets is the sole persistent datastore.** No SQL database of any kind.
2. **Offline/PWA support is out of scope** for the initial version.
3. **The first-place player receives the lowest tag from the participating players' starting-tag pool**, not necessarily tag 1.
4. **Three admins.** The application supports three league members with administrative access.
5. **No player authentication.** Players identify themselves by selecting from the master list.
6. **No admin override system.** Normal admin corrections to the sheet or through the app are acceptable. No audit logs, correction records, or immutable event history.
7. **Tag fields are in_tag and out_tag.** No calculated, final, official, override, or finalized tag fields.
8. **Weekly records exist only for signed-in players.** No rows are created for absent players.
