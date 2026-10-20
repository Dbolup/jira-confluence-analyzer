# Custom field duplicates & metrics summary in the Discovery report

- **Date:** 2026-09-24
- **Status:** Implemented 2026-09-24 (see "Outcome" at the bottom). Approved decisions: (1) duplicates = same name after trim/lowercase/whitespace-collapse, no fuzzy matching; (2) best-effort usage metrics (not on any screen / no contexts / not changed in 12+ months) on **Cloud only** — Data Center gets counts, duplicates, and by-type only; (3) a new finding with embedded tables, not a separate report section.
- **Trigger:** "On http://localhost:3000/discovery, there should be summary of custom fields duplicates and metrics"

## Goal

The Discovery report should show, for custom fields specifically: how many there are, which ones are duplicates of each other, and a few metrics that make the problem legible (by type, how much is redundant, and — where the platform can tell us — how many are unused). This is the "4,000 custom fields on 800 users" conversation from the original call (Wale's ITME example): today the report only says *how many* (`custom-field-volume`), not *which are redundant*.

## Where it fits (recommended)

**A new check in the existing registry** — `custom-field-analysis`, category `Fields`, on both Cloud and Data Center. Because it lives in the registry it automatically gets everything checks already have: parallel run, 30s timeout, graceful `unavailable`, appearing in "Key Areas of Concern" when it's a warning, and — since `dc-runner/` imports the same registry — it flows into the standalone DC executable with no extra plumbing (after a rebuild).

Needs one small, backward-compatible extension to the finding shape: an optional `details` field holding small tables (`{ title, columns, rows }[]`), rendered by `findingCard` (`public/js/report.js`) using the `.stats-table` styling already in both the web page and `dc-runner/reportWriter.js`. A finding without `details` renders exactly as today.

## What the summary contains

**Metrics table**
- Total custom fields
- Distinct field names
- Duplicate groups (names shared by 2+ fields)
- Fields inside duplicate groups
- **Redundant fields** = fields in duplicate groups minus one survivor per group (what merging would remove) and its % of all custom fields
- Count by field type (top 10, rest grouped as "other")
- Usage metrics where the platform can tell us (see open question 2)

**Duplicates table** — one row per duplicate group, worst first, capped at 25 rows with a "+N more groups" line so the PDF stays readable: field name, how many copies, distinct types, and whether the copies are the *same type* (safe merge candidates) or *mixed types* (conflict — needs a human decision).

**Duplicate definition (recommended):** same name after trim + lowercase + whitespace-collapse. High-confidence, no false positives from fuzzy matching. Near-duplicates ("Story Point" vs "Story Points") are deliberately out of v1.

**Severity (provisional, labeled as such in the finding text, like every other threshold here):** `info` if no duplicates; `warning` if any redundant fields; `critical` if redundant fields are ≥10% of all custom fields.

## Data sources

- **Cloud:** `GET /field` (already used by `custom-field-volume`) gives `id`, `name`, `custom`, `schema.custom` (the type key). Unlike a name-only approach this needs no new permission. Usage metrics (optional): `GET /field/search?type=custom&expand=screensCount,contextsCount,lastUsed` (paginated; confirmed in Atlassian's docs, where a missing count means 0). **Not verifiable from here against a real site** — same first-run-may-need-a-fix caveat as the installed-apps check had. If that call fails, the check keeps the duplicate + type results and sets an `error` note (partial degrade, same pattern as `custom-field-volume`'s user-count fallback).
- **Data Center:** `SELECT id, cfname, customfieldtypekey FROM customfield`. `customfield`/`id`/`cfname` are already proven in this codebase; `customfieldtypekey` is standard Jira schema but new to this codebase — if that query throws, fall back to `SELECT id, cfname` and drop the by-type metric with an `error` note rather than failing the whole check. Usage on DC (screens via `fieldscreenlayoutitem`, values via `customfieldvalue`) is unverified and potentially heavy on large instances — see open question 2.

## Files

- `checks/customFieldGrouping.js` (new, pure, no I/O) — name normalization, grouping, by-type counts, severity, and building the finding (including its `details` tables), so Cloud and DC share one implementation instead of two hand-synced copies.
- `checks/cloud/customFieldAnalysis.js`, `checks/dc/customFieldAnalysis.js` (new) — fetch/query, map to `{ id, name, type }`, call the shared helper.
- `checks/registry.js` — register the new check.
- `public/js/report.js` — render `details` tables inside `findingCard`.
- `public/discovery.html` and `dc-runner/reportWriter.js` — a couple of CSS lines for the details block (the report CSS is duplicated in both, so both get the same edit).
- Tests: `checks/customFieldGrouping.test.js`, cloud + DC check tests (mocked `fetch`/`db`, same patterns as the existing check tests), and a `report.test.js` case for `details` rendering.
- **Existing tests that hard-code "5 checks" must change to 6:** `checks/registry.test.js` and `dc-runner/runDiscovery.test.js`. `README.md`/`CLAUDE.md` mention "5 checks" and need the count and check list updated.

## Verification

- Unit tests as above (synthetic fields covering: no duplicates, same-type duplicates, mixed-type duplicates, case/whitespace variants, the 25-row cap, severity boundaries, partial-degrade paths).
- Run the real registry orchestrator against synthetic data, and the real `buildReportHtml` output, to confirm the tables land in the right place.
- **Real DC end-to-end:** rebuild the Linux binary and run it against a disposable Postgres seeded with deliberately duplicated `customfield` rows (I've done this loop before for the DC runner), confirming the duplicates table in the generated HTML.
- **Not verifiable here:** Cloud `field/search` behavior against a real site, and the visual look of the tables in a browser — you'll see both on your next real run of `/discovery`.

## Open questions

1. **Duplicate definition** — exact normalized-name match only (recommended), or also flag near-duplicates by fuzzy name matching?
2. **Usage metrics** ("metrics" is ambiguous — does it mean just counts, or also *unused* fields?) — include best-effort unused/not-on-any-screen metrics on Cloud (and DC)? Riskiest part of this work since it depends on endpoints/tables I can't verify from here.
3. **Placement** — a finding card with embedded tables in Detailed Findings (recommended, flows to the DC runner for free), or its own dedicated "Custom Fields" report section like General Stats (more plumbing: response shape, server route, runner wiring)?

## Outcome (implemented 2026-09-24)

Built as planned, with the three approved decisions. `npm test`: **97 tests, 97 pass, 0 fail** (was 67 before this work).

**What was verified**
- Unit tests: grouping/normalization, severity boundaries, the 25-row cap, Cloud (mocked `node-fetch`, incl. `/field/search` pagination and 403 partial-degrade), DC (mocked `db`, incl. missing-`customfieldtypekey` fallback), and `report.js` details rendering + HTML-escaping.
- Real registry + real `buildReportHtml` against a fake DC `db`: the three tables render inside Detailed Findings; hostile names (`<b>Evil</b>`) are escaped.
- **Real DC end-to-end:** rebuilt the Linux binary in Docker and ran it in a container with no Node installed against a disposable Postgres — (a) a `customfield` table *with* `customfieldtypekey`: duplicates grouped case/whitespace-insensitively (`<img …>` vs `<IMG …>` merged and escaped), same/mixed type classified, by-type table correct; (b) a table *without* that column: duplicates kept, types shown as "unknown", the "type column could not be read" note rendered. The DB password does not appear in either report. Disposable container/network removed afterwards.
- All 8 pages + `/js/*.js` return 200 on a restarted server.

**Deviations from the plan:** none functionally. Small additions: `escapeHtml` is exported from `report.js`; docs (`README.md`, `CLAUDE.md`, `dbConnection.js` comment) updated to 6 checks and the optional `details` field.

**Not verified (needs your first real run)**
- Cloud `GET /field/search?type=custom&expand=screensCount,contextsCount,lastUsed` against a live site — implemented from Atlassian's docs. If it misbehaves, the check degrades to duplicates + types with an error note rather than failing; the fix would be small.
- Visual look of the new tables in a browser / in the PDF.
- Usage metrics on Data Center are intentionally omitted (decision 2).

**Known, pre-existing, untouched:** other report text (summaries, explanations, app names) is still interpolated unescaped in `report.js`; only the new `details` tables escape their content.

