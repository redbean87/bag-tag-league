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
