# League images

Drop one image per league in this folder. The sign-in page shows it in the
header when a player scans a league's QR code.

## Naming rule

Name the file after the league's id from `src/shared/league-format.js`, keeping
the id exactly as written there.

Examples:

- `nightfliers-random-dubs.png`
- `b-rads-league.png`
- `nightfliers-random-dubs-test.png`

## Accepted file types

Use one of these extensions. If more than one exists for a league, the page
tries them in this order and shows the first that loads:

1. `.png`
2. `.jpg`
3. `.jpeg`
4. `.webp`

If no matching file exists, the page simply shows the league name as text.
