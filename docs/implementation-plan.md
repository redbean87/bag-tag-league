# Implementation Plan

## Phase 0: Project Setup

**Goal:** Establish the project scaffold and development environment.

- Initialize project structure with static HTML, CSS, and JavaScript/TypeScript
- Set up Google Apps Script project for server-side integration
- Configure Google Service Account credentials for Apps Script
- Set up version control
- Create basic folder structure

**Deliverable:** Empty but runnable static site connected to Google Apps Script web app.

## Phase 1: Google Sheets Setup

**Goal:** Establish the spreadsheet structure and service layer.

- Create the Google Spreadsheet with all tabs (MasterPlayers, WeeklyLeagues, WeeklyPlayerRecords, ImportHistory, Settings)
- Implement the server-side Google Sheets service layer
- Implement CRUD operations for each tab
- Test read/write operations
- Document the tab structure and column conventions

**Deliverable:** Working Sheets service layer with all CRUD operations.

## Phase 2: Master Player List

**Goal:** Admin can manage the master player list.

- Admin UI for CRUD operations
- List players with search/filter
- Add new player form
- Edit player details
- Toggle active/inactive status
- Assign initial bag tags

**Deliverable:** Admin can create, view, edit, and manage players.

## Phase 3: Weekly League Creation

**Goal:** Admin can create weekly leagues.

- Admin UI for creating leagues
- League list view
- League status management (draft, open, finalized)
- Generate unique sign-in URL and QR code
- Display/download QR code for sharing

**Deliverable:** Admin can create a league, get a QR code, and open it for sign-in.

## Phase 4: Player Sign-In

**Goal:** Players can sign in via QR code.

- Public sign-in page (mobile-optimized)
- Player search/selection from master list
- Identity confirmation step
- Sign-in submission
- WeeklyPlayerRecord creation in the WeeklyPlayerRecords tab
- Success confirmation display

**Deliverable:** Player can scan QR, select self, confirm, and be signed in.

## Phase 5: UDisc CSV Import

**Goal:** Admin can import UDisc results.

- CSV upload interface
- CSV parsing and validation
- Player matching logic (UDisc username -> PDGA -> name)
- Merge logic (update existing, flag unmatched/missing)
- Import results display
- Manual matching for unmatched records
- Write import history to ImportHistory tab

**Deliverable:** Admin can upload CSV, see results, and resolve mismatches.

## Phase 6: Tag Calculation

**Goal:** System calculates tag assignments.

- Finishing order calculation (score, tie-break by in_tag)
- Tag assignment algorithm (pool-based: participating players' in_tag values redistributed in finishing order)
- Results display with comparison table
- Admin can correct data before finalization

**Deliverable:** System calculates tags, admin can review.

## Phase 7: Finalization

**Goal:** Admin can finalize a league.

- Finalization workflow
- Master player list update (participating players only)
- Historical record locking (status set to finalized, UI prevents edits)
- Read-only historical view

**Deliverable:** Admin can finalize, master list updates, history preserved.

## Phase 8: Polish and Testing

**Goal:** Application is production-ready.

- Input validation and error handling
- Loading states and feedback
- Mobile responsiveness
- Accessibility testing
- Edge case handling
- Documentation updates

**Deliverable:** Stable, tested application ready for use.

## Dependencies Between Phases

```
Phase 0 (Setup)
    |
Phase 1 (Sheets Setup)
    |
Phase 2 (Players)
    |
Phase 3 (Leagues)
    |
Phase 4 (Sign-In)
    |
Phase 5 (Import)
    |
Phase 6 (Calculation)
    |
Phase 7 (Finalization)
    |
Phase 8 (Polish)
```

Each phase depends on the previous one. Phase 8 can begin partial work during earlier phases.

## Estimated Effort

| Phase | Complexity | Estimated Time |
|-------|------------|----------------|
| Phase 0 | Low | 1-2 hours |
| Phase 1 | Medium | 3-4 hours |
| Phase 2 | Medium | 3-4 hours |
| Phase 3 | Medium | 2-3 hours |
| Phase 4 | High | 4-6 hours |
| Phase 5 | High | 4-6 hours |
| Phase 6 | Medium | 3-4 hours |
| Phase 7 | Medium | 2-3 hours |
| Phase 8 | Variable | 4-8 hours |

**Total estimate:** 26-40 hours of focused development.

## First Steps

Before beginning Phase 0:

1. Confirm Google Sheets as the sole persistence layer (confirmed)
2. Confirm the tag calculation formula (confirmed: pool-based redistribution)
3. Set up Google Apps Script project and deploy web app
4. Provide a sample UDisc CSV if available
5. Review and approve this implementation plan
