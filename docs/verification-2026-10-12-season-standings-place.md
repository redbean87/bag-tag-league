# Run-and-verify: Place column on the Season Standings table

**Date:** 2026-10-12
**Feature PR:** https://github.com/redbean87/bag-tag-league/pull/47 (merged as `4b01ce7`)
**Verifying session:** separate from the implementation session, per the captain's
deploy policy (verify by running the app, not by code review).

## Deploy verified

The merge deployed through the project's normal path: the GitHub Actions
**Deploy** workflow triggered by the push to `main` (run `38191110233`,
conclusion `success`, the latest run for `main`; no later run exists for the
same commit), which deployed in order:

- Apps Script backend — **version 68**, deployment
  `AKfycbzJMNCZsQfTmrS0hmL0ePZCi2V9B_nvxx9rYA1yYOgmMvgGGtU7SY2Rl4l0TmcshfQ-nw`
  (web app URL `https://script.google.com/macros/s/AKfycbzJMNCZsQfTmrS0hmL0ePZCi2V9B_nvxx9rYA1yYOgmMvgGGtU7SY2Rl4l0TmcshfQ-nw/exec`)
- Production worker — `https://bag-tag-league.cortezashley87.workers.dev`
- Dev worker — `https://bag-tag-league-dev.cortezashley87.workers.dev`

The deployed prod admin page's `API_URL` points at exactly that Apps Script
deployment, so the frontend and backend under test are the merged commit.

## What was observed, running the app

All of the following was done in a browser against
`https://bag-tag-league.cortezashley87.workers.dev/admin/`, league
**Nightfliers Random Doubles 💥**, active league date **2026-10-05**, button
**Load Results** (evidence screenshot in the task's proof directory,
`season-standings-place-prod.png`).

### 1. Season Standings header — pass

The table is headed exactly "Season Standings" and its columns render in DOM
order **Member | Place | Season Points | Earned** — the Place column sits
immediately after Member.

### 2. Place values are correct competition ranking — pass, against live ties

The live league data contains **two tie groups**, so the tie rule was verified
directly against the real standings, no fixture needed:

| Member | Place | Season Points | Earned |
|---|---|---|---|
| Brad Stevenson (#2) | 1 | 2 | $10.50 |
| Damon Forsythe (#26) | 1 | 2 | $10.50 |
| Josh Moen (#1) | 3 | 1.5 | $0.00 |
| Cortez Ashley (#3) | 3 | 1.5 | $0.00 |
| Brian Corlew (#9) | 3 | 1.5 | $0.00 |
| David Opsahl (#46) | 3 | 1.5 | $0.00 |
| Robert Finch (#7) | 7 | 0.5 | $0.00 |

Checked against the displayed points: the two members on 2 points share place
1; the next distinct place skips to 3 for the four members on 1.5 points; the
next distinct place skips to 7 for the member on 0.5 points. That is standard
competition ranking (1, 1, 3, 3, 3, 3, 7), the same rule as the 1, 2, 2, 4, 5
example in the spec.

### 3. Nothing else about Season Standings changed — pass

Same 7 eligible members (exactly the roster members with positive season
points), same descending points order, same Season Points and Earned values as
the prior pass's table (2026-10-11 verification doc) — the only difference is
the added Place column.

### 4. Week Results table above it — untouched, pass

Still headed "Week Results", still the same 4 rows in the same order with the
same Place/Points/Payout values (Damon Forsythe / Brad Stevenson 1st 2pts
$21.00; Brian Corlew / Cortez Ashley T2 1.5 $0.00; Josh Moen / David Opsahl T2
1.5 $0.00; Robert Finch 4th 0.5 $0.00).

## Not claimed

Unit tests were not re-run in this pass: the implementation session already
ran them and CI Tests on the merge were green; this pass verified by running
the deployed app per the brief.

## Verdict

Green. The deployed prod admin page renders Member | Place | Season Points |
Earned with correct competition-ranking places, verified against real tied
data, with membership, order, points, earnings, and the Week Results table all
unchanged. No defects found; no behaviour changed (docs-only change, no
deploy needed for this PR).
