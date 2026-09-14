# Product Requirements

## Persistence Requirement

**Google Sheets is the sole persistent datastore.** There is no SQL database, no SQLite file, no hosted database, and no secondary persistence layer. All application data lives in Google Sheets. The application reads from and writes to Google Sheets exclusively through a server-side service layer. Google Sheets credentials are never exposed to the browser.

## Confirmed Requirements

### Club Member List

The club member list is persistent and separate from each weekly league. It is stored in the ClubMembers tab of the Google Spreadsheet. It stores one record per player with:

- Member number (sequential integer starting at 1, app-generated, unique, immutable after assignment, never reused)
- Player name
- UDisc username
- PDGA number (optional)
- Current bag tag
- Active/inactive status

The club member list is the source for identifying returning players and populating weekly records.

### Weekly League Creation

The admin creates a weekly league before players sign in. Each league is a row in the WeeklyLeagues tab. Creating a weekly league establishes:

- League date
- League name or identifier
- League status (e.g., draft, open, finalized)
- Weekly sign-in QR code/link
- Empty weekly player roster (no rows in WeeklyPlayerRecords for this league yet)

The weekly sheet exists before players sign in but initially contains no player records.

### Player Self-Sign-In

The organizer does not manually sign players in. Players scan the weekly league's QR code and:

1. Find/select themselves from the club member list
2. Confirm they are the correct player
3. Submit their sign-in

The flow is: Scan QR code -> select yourself -> confirm -> signed in.

The app should not require players to complete a long form.

If a player is not found in the club member list, they should be able to self-register (add themselves to the club member list) before completing sign-in.

Players do not authenticate. Only administrative functions require authentication.

### Weekly Player Records

Each weekly player record is a row in the WeeklyPlayerRecords tab, created only when a player signs in. It preserves snapshots for historical accuracy and stores tag assignments:

- Weekly league ID
- Member number (links to ClubMembers)
- Player name snapshot
- UDisc username snapshot
- PDGA number snapshot
- in_tag (player's actual starting bag tag, supplied by the player during check-in)
- out_tag (player's ending bag tag, calculated by the app after tag calculation)
- checked_in (boolean participation flag, set TRUE when player completes check-in)
- signed_in_at (timestamp of when check-in occurred)
- Paid, CTP, Ace pot status
- UDisc data (score, starting hole, start time, round/event scores, division, position, hole-by-hole scores, udisc_ending_tag)
- Admin notes

`score` is the player's round score imported from UDisc (`round_total_score`). It is a score, not a bag tag. This is the primary score used for tag calculation ranking. `in_tag` and `out_tag` are bag tags. `in_tag` must be supplied by the player during check-in; it must not be auto-derived from `ClubMembers.current_tag`. `udisc_ending_tag` is optional and retained for reference/transition purposes only; it must not be used to calculate `out_tag`.

Not every field needs to be visible to players during sign-in.

See `udisc-import-mapping.md` for the complete UDisc field mapping and export structure.

### UDisc Import

After the round, the admin exports from UDisc and imports the xlsx into the active weekly league. The confirmed export format is an Excel workbook with an `Event results` sheet containing 34 columns. The full mapping is documented in `udisc-import-mapping.md`.

The import parses the workbook and writes the relevant imported values into the appropriate WeeklyPlayerRecords columns for matched players. It must not replace the weekly sheet wholesale.

For an existing weekly player:

- Match the UDisc record to the weekly record
- Update UDisc-imported fields (score, starting hole, start time, hole-by-hole scores, round/event scores, division, position, udisc_checked_in, udisc_paid, udisc_ending_tag)
- Preserve app check-in fields (in_tag, checked_in, signed_in_at, paid, CTP, ace pot, notes)

Player matching priority:

1. UDisc username (`udisc_username_import`)
2. PDGA number (`udisc_pdga_number_import`)
3. Player name (`udisc_name_import`)
4. Admin-assisted manual matching for uncertain cases

Unmatched UDisc players are added as new WeeklyPlayerRecords rows, and the organizer can fix or associate them afterward. A signed-in player missing from the CSV is flagged in the import results.

Import history is recorded in the ImportHistory tab, including the raw CSV content for reference.

### Bag-Tag Calculation

Only players who checked in for that weekly league participate in tag redistribution. Players who did not check in are not included in the tag pool, and their club member tags remain unchanged.

The app calculates `out_tag` using only the following inputs:

- Players who checked in (`checked_in = TRUE`)
- Each participant's `score` (for ranking)
- Each participant's `in_tag` (for tie-breaking, supplied by the player during check-in)
- The participating players' starting-tag pool (all `in_tag` values)
- The agreed rules: lowest score wins, lower `in_tag` breaks ties, tags redistribute ascending

`udisc_ending_tag` must not be used as input to tag calculation.

The confirmed algorithm:

1. Rank participating players by lowest score first
2. Ties are resolved by lower in_tag (the player with the lower starting tag finishes first)
3. Collect the in_tag values of all participating players into a pool
4. Sort the pool ascending
5. Assign tags in finishing order: 1st gets the lowest tag from the pool, 2nd gets the next lowest, and so on
6. Store the result in out_tag on each participant's WeeklyPlayerRecords row

The first-place finisher does not necessarily receive tag 1 -- they receive the lowest tag that was brought into the pool by participating players.

The calculation should be transparent and display:

- Finishing position
- Player
- Score
- in_tag
- out_tag
- Imported UDisc ending tag (if available, for reference only; not used in calculation)

### Finalization

Importing UDisc data should not immediately update the club member list. The process is:

1. Import UDisc results
2. Merge results into weekly records
3. Calculate rankings and tag assignments
4. Allow admin to review and correct records
5. Finalize the weekly league
6. Update the club member list with the out_tag for participating players only

`ClubMembers.current_tag` is a last-known calculated value. It is not guaranteed to represent the player's current physical tag because players may trade tags between league days. The next check-in must require the player's actual `in_tag`.

Historical weekly records must remain available and should not change when a player's club member record changes later.

### Admin Capabilities

The application supports three league members with administrative access. Admin should be able to:

- Create a weekly league
- View and manage the weekly roster
- Add a player manually
- Remove or correct an accidental sign-in
- Edit weekly fields
- Correct player matching
- Import or re-import UDisc data
- Resolve unmatched records
- Review tag assignments
- Finalize a league
- Update or correct the club member list
- View historical leagues

Normal admin corrections to the sheet or through the app are acceptable. The application should favor warnings and review states over excessive hard enforcement. Admin is the final authority.

## Assumptions

- There are three admins (league members) who manage weekly leagues
- Players do not need accounts or authentication beyond identifying themselves
- The application runs as a web app (no native mobile app required)
- UDisc export format is confirmed: Excel workbook with `Event results` sheet containing 34 columns
- Google Sheets is the sole persistent datastore (no SQL database of any kind)
- The Google Sheets tab structure accommodates all UDisc export fields
