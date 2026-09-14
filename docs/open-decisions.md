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

### 2. Master Player List Population

**Status:** Needs input

How should the master player list be initially populated?

- Manual entry (admin adds players one at a time)
- Player self-registration (players create their own records through the sign-in flow)
- Hybrid (admin seeds, players confirm/update)

### 3. Player Sign-In Fields

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
9. **Field ownership is explicit.** Each field has a single authoritative source: `in_tag` from the player, `score`/`starting_hole`/`start_time` from UDisc, `out_tag` from the app. See ADR-002.
10. **Tag redistribution is pool-based.** Only checked-in players participate. Lowest score first, lower `in_tag` breaks ties, tags redistribute ascending from the participating pool. See ADR-003.
11. **`MasterPlayers.current_tag` is a last-known calculated value.** It is not guaranteed to represent the player's physical tag. Players may trade tags between league days. The next check-in must require the player's actual `in_tag`.
12. **UDisc export format is confirmed.** The `Event results` sheet contains 34 columns: `division`, `position`, `position_raw`, `name`, `event_relative_score`, `event_total_score`, `pdga_number`, `username`, `round_relative_score`, `round_total_score`, `round_rating`, `paid`, `checked_in`, `starting_hole`, `start_time`, `hole_1`–`hole_18`, `bag_tag_at_end`. See `udisc-import-mapping.md` for the full mapping. The Google Sheets tab structure has been updated to accommodate all fields.
13. **`checked_in` and `signed_in_at` are both present.** `checked_in` (boolean) is the explicit participation flag set when the player completes check-in through the app. `signed_in_at` (timestamp) records when check-in occurred. These serve distinct purposes and should not be conflated. UDisc's `checked_in` is imported as a separate reference field (`udisc_checked_in`) and is not used for app participation logic.
