# Workflows

## Workflow 1: Season Setup (Admin)

1. Admin opens the application
2. Admin populates the club member list:
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

## Workflow 2.5: Pre-Round Review (Admin)

1. Admin opens the Pre-Round Review section on the admin page
2. System loads the list of existing weekly tabs and displays them in a dropdown
3. Admin selects a league date from the dropdown
4. System loads the weekly sheet and League settings
5. System calculates:
   - Participating count (players with `checked_in = TRUE`)
   - Ace pot participant count (checked-in players with `ace_pot = TRUE`)
   - CTP participant count (checked-in players with `ctp = TRUE`)
   - Ace pot calculated total: `ace_pot_current_total + (ace_pot_contribution × ace_pot_participant_count)`
   - CTP calculated total: `ctp_contribution × ctp_participant_count`
6. Admin reviews the calculated totals
7. Admin can override the final totals if needed
8. Admin saves the review
9. System recalculates values server-side and saves to League sheet
10. System refreshes the display with saved values

## Workflow 3: Player Sign-In (Player)

1. Player scans the QR code with their phone camera
2. Browser opens the sign-in page
3. Player sees a search/selection interface to find themselves
4. Player selects their name from the club member list
   - If player is not found, they can self-register (add themselves to ClubMembers tab; the next sequential member_number is assigned automatically)
5. Player confirms their identity (name, UDisc username, PDGA number displayed)
6. Player supplies their `in_tag` (actual starting bag tag for this league day)
   - The app does NOT auto-fill this from `ClubMembers.current_tag`
   - Players may have traded tags since the last league day
7. Player confirms payment status (`paid`)
8. Player submits the check-in
9. System creates a new row in the WeeklyPlayerRecords tab with:
   - `member_number` linking to the ClubMembers record
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
   a. Attempts to match each UDisc record to a signed-in player (by UDisc username, PDGA number, or name; matched records are linked via `member_number`)
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

1. After UDisc import is confirmed, admin selects the league date in the Tag Calculation section
2. Admin clicks "Calculate Tags"
3. System reads all player records from the selected `Week YYYY-MM-DD` sheet
4. System builds the tag pool from valid `in_tag` values (positive integers) found in the sheet, sorted ascending
5. System ranks all players by lowest score first; players without a valid score are appended at the end
6. System assigns tags from the pool in rank order: 1st gets lowest tag, 2nd gets next lowest, etc.
7. If the pool has fewer tags than players, remaining players receive no out_tag (left blank)
8. System displays a preview table:
   - Finishing position
   - Player
   - Score
   - in_tag
   - out_tag
9. Admin reviews the tag assignments
10. Admin clicks "Confirm & Write" to write out_tag values to the sheet
11. Admin can correct data and recalculate before finalization

## Workflow 6: League Finalization (Admin)

1. Admin has completed all reviews and corrections
2. Admin finalizes the weekly league (status updated to "finalized" in WeeklyLeagues tab)
3. System updates the ClubMembers tab:
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
- **Resolve unmatched:** Match a UDisc record to an existing player or add a new player to ClubMembers tab

Normal admin corrections to the sheet or through the app are acceptable.

## Workflow 8: Historical Review (Admin)

1. Admin navigates to historical leagues
2. Admin selects a past weekly league
3. System displays the finalized weekly sheet (read-only)
4. Admin can view but not edit historical records (status = finalized)
5. Admin can see the tag assignments and results for that week
