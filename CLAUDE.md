# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Jira Analyzer: an Express app (ES modules, no build step) that inspects, compares, and runs automated discovery against Jira/Confluence **Cloud** sites and **Data Center** instances. Cloud sources are read through the Atlassian REST APIs; Data Center sources are read by querying the product's own PostgreSQL/MySQL database directly.

Note: `../CLAUDE.md` (the parent `alluvium/` directory) describes an unrelated TypeScript/SQLite e-commerce project. Its rules (e.g. `src/queries/`) do not apply here.

## Commands

```bash
npm install     # node_modules is not checked in
npm start       # node server.js, serves on $PORT (default 3000)
npm test        # node --experimental-test-module-mocks --test, runs every *.test.js file
```

No linter or build step. `npm start` loads `.env` via `dotenv/config` (the first import in `server.js`), so `ENCRYPTION_KEY`/`PORT` in a `.env` file work as documented in the README.

## Architecture

### `server.js` is the only server

`index.js` and `utils/` (a legacy, Cloud-only, plaintext-credential server incompatible with the current frontend) were deleted; everything routes through `server.js`, which is self-contained: routes, AES encryption, Cloud REST calls, and Data Center SQL are all in this one file except the `checks/` discovery engine (below).

### Credential flow (server is stateless)

1. `public/credentials.html` posts secrets to `POST /api/encrypt`, which returns AES-256-CBC ciphertext as `ENC:<iv-hex>:<data-hex>`.
2. The browser stores the ciphertext in `localStorage` under `defaultCloudCreds`, `savedCloudSites`, and `savedDCConnections`. Nothing is persisted server-side.
3. Every analysis page sends the stored (still-encrypted) source objects in the request body, and `server.js` calls `decrypt()` on each use (`getAuthHeaders` for Cloud, `queryDB`/`openDbConnection` for Data Center).

`decrypt()` returns its input unchanged if the value lacks the `ENC:` prefix or decryption fails — this is also why manually-entered ("Manual Cloud Domain...", inline Discovery wizard entries) credentials work transparently alongside saved/encrypted ones without any special-casing. If `ENCRYPTION_KEY` changes, previously saved credentials fail as Atlassian/DB auth errors, not as decryption errors. The key must be exactly 32 bytes for `aes-256-cbc`; if `ENCRYPTION_KEY` isn't set, a fallback dev key is used and the server logs a startup warning.

### Request shape and Cloud/DC branching

Each `/api/*` route takes a source (or list of sources) and branches on `source.type`: `'cloud'` uses `fetch` against `https://<domain>/rest/api/3` (Jira) or `/wiki/rest/api` (Confluence); `'postgres'`/`'mysql'` goes through Data Center SQL. Oracle and MSSQL are not supported — routes that accept a DB type reject anything else with a clear error rather than mishandling it.

Two DB-querying patterns coexist for different needs:
- `queryDB(config, query, params)` — opens a connection, runs one query, closes it. Used by every route except discovery.
- `openDbConnection(config)` — opens one connection/pool and returns `{ query, close }`, reused across several queries. Used only by `/api/discovery/run`'s Data Center path, since one discovery run touches up to 6 checks (plus 2 stats functions) that together issue many queries; every other DC route's simpler "connect once per query" behavior is untouched.

Both translate the same MySQL-style `?` placeholders into Postgres's `$1, $2, ...` internally, so call sites write one query string regardless of engine.

Data Center queries target the Jira/Confluence schemas directly (`project`, `jiraissue`, `nodeassociation`, `customfield`, `cwd_user`, `spaces`, `content`, `jiraworkflows`, ...), so column and table names must match Atlassian's DC schema.

### Discovery engine (`checks/`)

`POST /api/discovery/run` and `POST /api/discovery/validate` run a registry of checks (`checks/registry.js`) against a single source — Cloud, or DC on Postgres/MySQL. Each check lives in its own file under `checks/cloud/` or `checks/dc/` and returns a "finding":

```js
{ id, category, title, severity: 'info'|'warning'|'critical'|'unavailable', value, summary, explanation, recommendation, error, details? }
```

`details` is optional — `{ tables: [{ title, columns, rows, note? }] }` — and `findingCard` (`public/js/report.js`) renders each table with HTML-escaped cells, since these can hold customer-defined strings (e.g. custom field names). The `custom-field-analysis` check is the first user; its duplicate-detection/metrics logic is shared between `checks/cloud/` and `checks/dc/` via the pure `checks/customFieldGrouping.js` rather than duplicated. Note the rest of `report.js` (titles, summaries, explanations) still interpolates text unescaped.

`error` is set when something didn't fully work — paired with `severity: 'unavailable'` when nothing useful came out of the check at all, but can also sit alongside a real severity when a check partially degraded (e.g. got real counts but a sub-call for the ratio failed). `runChecks(type, ctx)` runs every check matching `type` in parallel with a 30s per-check timeout; a thrown error or timeout becomes an `unavailable` finding rather than failing the whole batch. Cloud checks receive `{ site, headers, jiraBaseUrl, confluenceBaseUrl }`; DC checks receive `{ site, db }`.

**Known limitation:** `checks/dc/installedApps.js` is the least certain check in the project — Data Center has no documented database table listing installed apps the way Cloud's UPM REST API does, so it guesses at an internal `pluginstate` table and approximates "customer-installed" by excluding `com.atlassian.*` plugin keys. Treat its output as a rough approximation, and expect it may need correcting against a real instance (the Cloud version needed two rounds of real-world correction before it worked: the endpoint itself, then the userInstalled filter).

**Severity thresholds are provisional placeholders** (e.g. custom fields per user, days of inactivity, % archived spaces) — they're not confirmed Alluvium methodology, just enough to produce a real signal. Each is marked as such in its check's own `explanation` text.

### Frontend

`public/*.html` are static pages with inline `<script>` blocks — no framework. The sidebar menu and the localStorage-loading code are copy-pasted into each page, so a change to either must be repeated in every page (except `insights.html`, which predates the current sidebar and uses its own older layout/nav — it isn't linked from any other page's sidebar). Routes for the pages are declared explicitly in `server.js`.

**One exception:** `public/js/report.js` is the first shared frontend module in the codebase, extracted from `discovery.html`'s inline script so report-generation logic is unit-testable. `discovery.html` loads it via a `<script type="module">` bootstrap that assigns `render`/`downloadPDF` onto `window`, because the rest of that page's script is a classic (non-module) script whose inline `onclick="..."` handlers can only resolve functions on the global object — a module's own top-level bindings aren't global by default.

`discovery.html` itself is a 4-step wizard (Connect → Validate → Run → Review & Export), reusing the show/hide-by-class pattern `insights.html` established for its own two-step flow. PDF export uses `html2pdf.js` (loaded from cdnjs) targeting just the `#report-content` element, not `window.print()` — the older pages (`compare.html`, `confluence-compare.html`, `insights.html`) still use `window.print()` with `@media print` CSS.

## Tests

`node:test` (built-in, no new dependency). Cloud checks import `node-fetch` directly rather than using the global `fetch`, so their tests use Node's experimental module mocking (`mock.module()`, requires `--experimental-test-module-mocks`, set in `package.json`'s `test` script) to intercept that import — DC checks need no such mocking since they already receive `db` via dependency injection. `render()`/`downloadPDF()` tests use a minimal hand-rolled `document` stub, not a full DOM library.
