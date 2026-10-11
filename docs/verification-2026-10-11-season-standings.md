# Run-and-verify: Week Results label, season earnings, Season Standings

**Date:** 2026-10-11
**Feature PR:** https://github.com/redbean87/bag-tag-league/pull/45 (merged as `fb07373`)
**Verifying session:** separate from the implementation session, per the captain's
deploy policy (verify by running the app, not by code review).

## Deploy verified

The merge deployed through the project's normal path: the GitHub Actions
**Deploy** workflow triggered by the push to `main` (run `38173231133`,
conclusion `success`), which deployed in order:

- Apps Script backend — version 67, deployment `AKfycbzJMNCZsQfTmrS0hmL0ePZCi2V9B_nvxx9rYA1yYOgmMvgGGtU7SY2Rl4l0TmcshfQ-nw`
  (web app URL `https://script.google.com/macros/s/AKfycbzJMNCZsQfTmrS0hmL0ePZCi2V9B_nvxx9rYA1yYOgmMvgGGtU7SY2Rl4l0TmcshfQ-nw/exec`)
- Production worker — `https://bag-tag-league.cortezashley87.workers.dev`
- Dev worker — `https://bag-tag-league-dev.cortezashley87.workers.dev`

The deployed admin page's `API_URL` points at exactly that Apps Script
deployment, so the frontend and backend under test are the merged commit.

## What was observed, running the app

All of the following was done in a browser against
`https://bag-tag-league.cortezashley87.workers.dev/admin/`, league
**Nightfliers Random Doubles 💥**, active league date **2026-10-05**, button
**Load Results** (evidence screenshot in the task's proof directory,
`season-standings-prod.png`).

### 1. Week Results heading and contents — pass

The Points Results card renders the sections in this DOM order: Summary →
Weekly Payouts → Week Roster (grouped by pair) → **Week Results** →
**Season Standings**. The table is headed exactly "Week Results" and its
contents match the live backend response row for row:

| Pair | Place | Points | Payout |
|---|---|---|---|
| Damon Forsythe / Brad Stevenson | 1 | 2 | $21.00 |
| Brian Corlew / Cortez Ashley | T2 | 1.5 | $0.00 |
| Josh Moen / David Opsahl | T2 | 1.5 | $0.00 |
| Robert Finch | 4 | 0.5 | $0.00 |

Summary shown: weekly tab `Week 2026-10-05`, participants 7, blank-position
warnings 0. Weekly Payouts shown: pool $21.00 ($3.00 per player × 7 players),
second place not paid (10 players needed, 7 showed), winning team $21.00.

"Contents unchanged": the merged diff changes only the `<h3>` text in that
region ("Results" → "Week Results"); the row-building code for the table is
untouched, and the rendered rows above match what the server returns today.

### 2. Season Standings table — pass

Renders directly below Week Results, listing every member with positive
season points, best first:

| Member | Season Points | Earned |
|---|---|---|
| Brad Stevenson (#2) | 2 | $10.50 |
| Damon Forsythe (#26) | 2 | $10.50 |
| Josh Moen (#1) | 1.5 | $0.00 |
| Cortez Ashley (#3) | 1.5 | $0.00 |
| Brian Corlew (#9) | 1.5 | $0.00 |
| David Opsahl (#46) | 1.5 | $0.00 |
| Robert Finch (#7) | 0.5 | $0.00 |

Completeness cross-check: `listClubMembers` returns 62 roster members; exactly
7 have positive season points (#1, #2, #3, #7, #9, #26, #46) and exactly those
7 appear in the standings, in descending points order. The Members view's
Season Total column shows the same numbers (1.5, 2, 1.5, 0, 0, 0, 0.5, …), and
the player sign-in search shows `Brad Stevenson … Season Total: 2`.

### 3. Season earnings arithmetic — verified for every week that has data

League settings: entry fee $5 = $3 weekly payout pool + $1 season payout +
$1 ace pot; payout contribution $3/player; second place $10 at ≥10 players.

Only one week of real data exists (Week 2026-10-05; the 2026-10-12 tab is
empty). For that week:

- Pool = $3.00 × 7 players = **$21.00** — the $1 ace-pot share and the $1
  season share of the $5 entry are **not** in the pool, so the ace pot is
  excluded from earnings.
- Second not paid (7 < 10 players), so the winning pair takes the whole pool.
- Even split for the pair: $21.00 / 2 = **$10.50 each** for Brad Stevenson
  and Damon Forsythe — exactly the season earnings shown, and every other
  member's earnings are $0.00. Sum of all earnings ($10.50 + $10.50) equals
  the total distributed that week ($21.00).

**Not verifiable with current real data, stated plainly:**

- **Solo full share:** no solo player has ever won a payout week in any
  league (prod's only payout week was won by a pair; the dev test league has
  payout unconfigured, all earnings $0). The solo-takes-full-share rule could
  not be observed against real league data in this pass.
- **Accumulation across multiple weeks:** the production league has only one
  committed week with data, so the "sum over weeks" reduces to a single week
  here. Multi-week accumulation was exercised by the implementation session's
  tests (484 green) but not observable with live data today.

### 4. Members view and player sign-in page — unaffected

- Members view: opened the Members card and clicked Refresh Members; the
  table rendered 62 rows (columns Member #, Name, UDisc, PDGA, Member since,
  Season Total) with no status errors.
- Player sign-in (`/player/sign-in/`): page renders with league image and
  search box; searching "Brad" returned `Brad Stevenson — UDisc: donjoses ·
  PDGA: 85170 · Season Total: 2` and `Brad Patrick — UDisc: brad27 · Season
  Total: 0`, plus the Register as New Member button. The only console 404s
  are the pre-existing league-image fallback probes (.png/.jpg before the
  .jpeg that loads), present before this feature.

### 5. On-demand cache refresh works and is idempotent — pass

`syncSeasonCaches` (the maintenance action; it has no UI button, so it was
driven through the deployed API endpoint) was called twice in a row:

- Run 1: `status ok`, "Season caches recomputed from committed weeks.",
  `season_points_synced: 62`, `season_earnings_synced: 62`, earnings map:
  member 2 → 10.5, member 26 → 10.5, all other 60 members → 0.
- Run 2: identical status, message, synced counts, and earnings map — byte
  for byte the same result, no double-counting.
- After both runs, `seasonStandings` returned the same 7 rows as before the
  refresh, confirming the refresh does not disturb the live standings.

### 6. Tests

`npm test` in this session: **484 passed, 0 failed** (matches the CI run on
https://github.com/redbean87/bag-tag-league/pull/45).

## Verdict

Green. The deployed app shows the Week Results heading with unchanged
contents, the Season Standings table below it with correct membership, order,
points and earnings, ace pot excluded from earnings, the Members view and
player sign-in page working as before, and an idempotent on-demand cache
refresh. The two items that need future real league data (a solo winner's
full share, and multi-week accumulation) are listed above as not observed
rather than claimed as passed. No defects found; no behaviour changed.
