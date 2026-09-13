# Bag Tag League

A web application for managing a weekly disc-golf bag-tag league.

## Overview

This application handles:

- Master player list management
- Weekly league creation and sign-in via QR codes
- Player self-sign-in (scan QR -> select self -> confirm -> done)
- UDisc CSV import and data merging
- Bag-tag calculation and redistribution
- Admin review, override, and finalization workflows

## Persistence

**Google Sheets is the sole persistent datastore.** All application data lives in Google Sheets. There is no SQL database, no SQLite file, no hosted database, and no secondary persistence layer. The application reads from and writes to Google Sheets exclusively through a server-side service layer.

## Project Status

**Phase:** Phase 0 — Proof of Concept

The initial proof of concept verifying that a static webpage can communicate with Google Apps Script and that Google Apps Script can read from and write to Google Sheets is complete. See [Google Apps Script POC](docs/google-apps-script-poc.md) for details and manual testing steps.

## Documentation

All product and technical documentation lives in `docs/`:

| Document | Purpose |
|----------|---------|
| [Product Requirements](docs/product-requirements.md) | Confirmed features and behavior |
| [Workflows](docs/workflows.md) | End-to-end user workflows |
| [Data Model](docs/data-model.md) | Data structure in Google Sheets |
| [Architecture](docs/architecture.md) | Technical stack and system design |
| [Architecture Decisions](docs/architecture-decisions.md) | Accepted architectural decisions (ADRs) |
| [Implementation Plan](docs/implementation-plan.md) | Phased build order |
| [Google Apps Script POC](docs/google-apps-script-poc.md) | POC test results and setup instructions |
| [Open Decisions](docs/open-decisions.md) | Unresolved questions needing input |

## Technology

- **Frontend:** Standard HTML, CSS, and JavaScript/TypeScript (no framework)
- **Server-Side Layer:** Google Apps Script web app
- **Persistence:** Google Sheets (sole datastore)
- **Hosting:** Cloudflare Pages (static hosting)

See [Architecture](docs/architecture.md) and [Architecture Decisions](docs/architecture-decisions.md) for details.

## Getting Started

To test the proof of concept:

1. Create a Google Spreadsheet and note its ID.
2. Create a Google Apps Script project using the code in `scripts/Code.gs`.
3. Replace `YOUR_SPREADSHEET_ID_HERE` with your spreadsheet ID.
4. Deploy as a web app with `access: ANYONE`.
5. Open `src/poc/index.html` in a browser and paste the deployment URL.

See [Google Apps Script POC](docs/google-apps-script-poc.md) for detailed instructions.

## License

*To be determined.*
