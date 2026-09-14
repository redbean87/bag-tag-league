# Workflows

## Workflow 1: Season Setup (Admin)

1. Admin opens the application
2. Admin populates the master player list:
   - Manually add players one at a time, OR
   - Players self-register through the sign-in flow
3. Admin assigns initial bag tags to players
4. Master player list is ready for weekly leagues

## Workflow 2: Weekly League Creation (Admin)

1. Admin creates a new weekly league
   - Sets the league date
   - Sets the league name/identifier
   - League status is set to "draft" or "open"
2. System generates a unique sign-in URL and QR code
3. System stores the league row in the WeeklyLeagues tab
4. Admin shares the QR code with players (print, text, email, etc.)
5. Weekly league is now open for player sign-in

## Workflow 3: Player Sign-In (Player)

1. Player scans the QR code with their phone camera
2. Browser opens the sign-in page
3. Player sees a search/selection interface to find themselves
4. Player selects their name from the master list
   - If player is not found, they can self-register (add themselves to MasterPlayers tab)
5. Player confirms their identity (name, UDisc username, PDGA number displayed)
6. Player supplies their `in_tag` (actual starting bag tag for this league day)
   - The app does NOT auto-fill this from `MasterPlayers.current_tag`
   - Players may have traded tags since the last league day
7. Player confirms payment status (`paid`)
8. Player submits the check-in
9. System creates a new row in the WeeklyPlayerRecords tab with:
   - `in_tag` supplied by the player
   - `checked_in = TRUE` and `signed_in_at` timestamp recorded
   - All other UDisc fields left blank (to be filled by import)
10. System confirms check-in with a success message

**Experience target:** Scan -> select -> confirm -> done. Under 30 seconds.

## Workflow 4: UDisc Import (Admin)

1. Admin receives the UDisc export (xlsx) after the round
2. Admin opens the active weekly league
3. Admin uploads the UDisc xlsx file
4. System processes the import:
   a. Attempts to match each UDisc record to a signed-in player (by UDisc username, PDGA number, or name)
   b. Updates matched rows in the WeeklyPlayerRecords tab with UDisc data (score, starting hole, start time, udisc_ending_tag)
   - Note: `udisc_ending_tag` is optional and retained for reference/transition purposes only; it must not be used to calculate `out_tag`.
   c. Adds unmatched UDisc players as new WeeklyPlayerRecords rows
   d. Flags signed-in players missing from UDisc data
5. System writes a row to the ImportHistory tab recording the import details and raw content
6. Admin reviews the import results:
   - Sees matched records with updated data
   - Sees unmatched UDisc records that were added as new rows
   - Sees count of signed-in players missing from import
7. Admin resolves any issues (corrects player associations, adjusts data)
8. Admin confirms the import

**System must not replace the weekly sheet.** It merges only.

## Workflow 5: Tag Calculation (System/Admin)

1. After UDisc import is confirmed, system calculates finishing order
2. Consider only checked-in/participating players (those with `checked_in = TRUE`)
3. Finishing order: lowest score first (score is a round score from UDisc, not a bag tag), ties broken by lower in_tag (starting bag tag)
4. System collects the in_tag values of all participating players into a pool
5. System sorts the pool ascending
6. System assigns new tags (out_tag) based on finishing position: 1st gets lowest tag from pool, 2nd gets next lowest, etc.
7. System writes out_tag values to the WeeklyPlayerRecords tab
8. System displays a comparison table:
   - Finishing position
   - Player
   - Score (round score from UDisc)
   - in_tag (starting bag tag, supplied by the player)
   - out_tag (ending bag tag, calculated by the app)
   - udisc_ending_tag (if available, for reference only; not used in calculation)
9. Admin reviews the tag assignments
10. Admin can correct any data before finalization (edit fields directly in the sheet or through the app)

## Workflow 6: League Finalization (Admin)

1. Admin has completed all reviews and corrections
2. Admin finalizes the weekly league (status updated to "finalized" in WeeklyLeagues tab)
3. System updates the MasterPlayers tab:
   - Only participating/checked-in players' tags are updated (out_tag written to current_tag)
   - Players who did not check in keep their current tags
   - `current_tag` is a last-known calculated value, not guaranteed to represent the player's physical tag (players may trade tags between league days)
4. Historical weekly record is locked (status = finalized, UI prevents edits)

## Workflow 7: Admin Corrections (Admin)

Admin can perform corrections at any point before finalization:

- **Add a missed player:** Manually add a row to the WeeklyPlayerRecords tab
- **Remove an accidental sign-in:** Remove the row from the WeeklyPlayerRecords tab
- **Correct a field:** Edit any field on a weekly player record row
- **Re-import UDisc data:** Upload a new file to re-process (merge behavior)
- **Resolve unmatched:** Match a UDisc record to an existing player or add a new player to MasterPlayers tab

Normal admin corrections to the sheet or through the app are acceptable.

## Workflow 8: Historical Review (Admin)

1. Admin navigates to historical leagues
2. Admin selects a past weekly league
3. System displays the finalized weekly sheet (read-only)
4. Admin can view but not edit historical records (status = finalized)
5. Admin can see the tag assignments and results for that week
