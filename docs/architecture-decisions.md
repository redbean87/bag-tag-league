# Architecture Decision Records

This document records significant architectural decisions for the bag-tag league project.

---

## ADR-001: Google Sheets Integration and Application Architecture

**Status:** Accepted

### Decision

- Google Sheets is the sole persistent datastore.
- The frontend will communicate with Google Sheets through a Google Apps Script web app.
- Google Apps Script serves as the server-side integration layer between the webpage and Google Sheets.
- We will not build or separately host a conventional backend such as Node.js, Fastify, or Hono.
- The frontend will be hosted as a static website using a free hosting provider. Cloudflare Pages is the current preferred option because an existing Cloudflare account is available. Expo hosting remains an alternative but is not selected at this time.
- The frontend will initially use standard HTML, CSS, and JavaScript/TypeScript without React, Vue, Angular, or another frontend framework.
- Admin access will use a shared PIN or similarly simple mechanism suitable for three trusted league administrators.
- Players will not need accounts or authentication.

### Constraints

- Google Sheets is the only persistent datastore.
- Do not introduce SQL, SQLite, PostgreSQL, MySQL, an ORM, a database server, or another persistent storage system.
- Do not expose private Google credentials or service-account credentials in frontend code.
- Do not have the browser directly access Google Sheets using private credentials.
- Do not introduce a separately developed or separately hosted backend unless this architecture is explicitly reconsidered later.
- Do not introduce a frontend framework unless a concrete requirement is identified and approved.
- Do not add unrelated infrastructure, features, or dependencies.

### Reasoning

This is a small league-management application intended to simplify weekly administration. A static frontend combined with Google Apps Script provides the required read/write access to Google Sheets without requiring us to build and maintain a conventional backend.

---

## ADR-002: Field Ownership and Data Sources

**Status:** Accepted

### Decision

Each field in the data model has a single authoritative source. The app must not derive or overwrite a field from a source other than its designated owner.

| Field | Owner | Source |
|-------|-------|--------|
| `in_tag` | Player | Supplied by the player during check-in |
| `checked_in` | Player | Set when the player completes check-in |
| `paid` | Player | Captured during check-in based on player selection |
| `starting_hole` | UDisc | Imported from UDisc |
| `start_time` | UDisc | Imported from UDisc |
| `score` | UDisc | Imported from UDisc |
| `out_tag` | App | Calculated by the app during finalization |

### Constraints

- `in_tag` must not be auto-derived from `ClubMembers.current_tag`. Players may have traded tags since the last league day.
- `paid` must not be inferred from participation or UDisc data.
- `starting_hole` is entered by the player in UDisc after the physical starting-hole draw. The app does not randomize starting holes.
- `out_tag` must not be imported from UDisc or accepted as an authoritative external result.

### Reasoning

Clear field ownership prevents silent data corruption and ensures each value comes from the authoritative source. Players are the only authority on their physical tag and payment status. UDisc is the authority on round data. The app is the only authority on calculated tag assignments.

---

## ADR-003: Tag Redistribution Rules

**Status:** Accepted

### Decision

At finalization:

1. Consider only checked-in/participating players.
2. Rank players by lowest round score first, then by lower `in_tag` to break ties.
3. Build the available tag pool from participating players' `in_tag` values, sorted ascending.
4. Assign the sorted available tags to the ranked players.
5. The highest-ranked player receives the lowest available participating tag.
6. Persist the assigned result as each player's `out_tag`.
7. Update `ClubMembers.current_tag` with the finalized `out_tag` as the player's last known calculated tag (linked via `member_number`).

### Constraints

- `ClubMembers.current_tag` is only a last-known calculated value. It is not guaranteed to represent the player's current physical tag because players may trade tags between league days.
- The next check-in must require the player's actual `in_tag`.
- `udisc_ending_tag` must not be used as input to tag calculation.

### Reasoning

The pool-based redistribution ensures tags stay within the participating group. The lowest-score-first ranking with `in_tag` tie-breaking is simple and deterministic. Updating `current_tag` provides a reasonable default for display purposes, but the check-in flow must always ask the player for their actual tag to avoid silent mismatches.
