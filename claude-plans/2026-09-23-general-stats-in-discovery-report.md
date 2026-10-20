# Add the Jira Stats table to the Discovery report

- **Date:** 2026-09-23
- **Status:** Implemented. Decisions: (a) a separate "General Stats" report section rather than a 6th check; both Cloud and DC; both Jira and Confluence tables.

## What was built

- `stats.js` (new, repo root) — `computeJiraStatsCloud`, `computeJiraStatsDc`, `computeConfluenceStatsCloud`, `computeConfluenceStatsDc`, extracted verbatim (not rewritten) from `/api/stats` and `/api/confluence/stats`'s route bodies. DC functions take an injected `query(sql, params)` function rather than a source config, so `/api/stats` (which has no shared connection) and `/api/discovery/run` (which shares one connection across a whole run, per Phase 5) can both use them without either changing how it connects.
- `server.js` — `/api/stats` and `/api/confluence/stats` now call the shared functions (pure refactor, behavior unchanged); `/api/discovery/run` now also computes `jiraStats`/`confluenceStats` alongside `findings`, each independently degrading to `{ error }` on failure rather than failing the whole run.
- `public/js/report.js` — a new `statsTable()` renderer plus the same metric labels `jira-stats.html`/`confluence-stats.html` already use, inserted into the report between "Key Areas of Concern" and "Detailed Findings".
- `public/discovery.html` — `.stats-table` CSS matching the existing table style, plus print pagination handling.
- Tests: `stats.test.js` (7 tests) and 4 new tests in `public/js/report.test.js`.

## Verification performed

- **Regression-tested the refactor itself**, not just the new code: hit the real `/api/stats` and `/api/confluence/stats` routes with an unreachable DC source before and after the refactor and confirmed byte-for-byte identical failure behavior — including a pre-existing asymmetry I deliberately preserved rather than "fixed": Jira stats degrades per-metric to `null` (already had per-count try/catch), Confluence stats fails as a whole row (never had that; not this task's scope to change).
- **Hit the real `/api/discovery/run`** against a nonexistent Cloud domain: confirmed `findings`, `jiraStats`, and `confluenceStats` all come back and degrade independently — `jiraStats` per-metric to `null` (matches its `safe`/`countOf` design), `confluenceStats` as a whole `{ error }` object (matches its single-call design) — proving the new integration didn't accidentally change or paper over either existing behavior.
- **Ran the real `render()` function** (not a mock) with realistic combined data — findings, `jiraStats`, `confluenceStats` together — and confirmed the generated HTML has the four sections in the right order (Concerns → Jira Stats → Confluence Stats → Detailed Findings) and the real numbers appear correctly.
- Full test suite: 51/51 passing (40 prior + 11 new).
- All 9 routes/pages confirmed still returning 200 after the refactor.
- **Trigger:** "The table presented on running jira stat http://localhost:3000/jira-stats analysis show be on discovery report as well"

## What's being asked

`jira-stats.html`'s table (Projects, Workflows, Workflow Schemes, Fields, Field Config Schemes, Issue Types, Issue Type Schemes, Priorities, Statuses, Screens, Screen Schemes, Issue Type Screen Schemes, Notification Schemes, Permission Schemes, Security Schemes — computed by `/api/stats`) doesn't appear anywhere in the Discovery report. Discovery's 5 checks (custom field volume, workflow custom fields, installed apps, archived/personal spaces, inactive projects) are a different, narrower set aimed at migration concerns — this table is the broader "general stats" inventory, and it's reasonable to want both together in one report.

## Design decision: a new report section, not a 6th check

Two ways to get this into the report:

**(a) A new "General Stats" section, separate from "findings"** — `/api/discovery/run`'s response gains a `stats` object alongside `findings`, computed by factoring the counting logic already in `/api/stats`'s route handler into a function both routes call (so nothing is duplicated or drifts out of sync). The report renders it as an actual `<table>` — Metric | Value — using the exact same labels `jira-stats.html` uses, positioned as its own section.

**(b) Fold it into the check registry as a 6th check** whose `value` holds all the counts, and special-case the report renderer to draw a table for this one check instead of a normal finding card.

**Recommending (a).** This data isn't a judged finding — there's no severity verdict for "here are 15 raw counts" the way there is for "5 custom fields per user." Forcing it into the finding shape (severity/summary/recommendation) would mean inventing a fake verdict for something that's just an inventory table, and (b) requires the renderer to special-case one specific check by ID, which is more awkward than just having two named things in the response ("findings" and "stats").

## Scope questions

1. **Data Center too?** Phase 5 gave every discovery check DC parity. I'd extend this the same way — reuse the shared `db` connection discovery's DC path already opens (Phase 5's `openDbConnection`), computing the same stats `/api/stats`'s existing DC branch already knows how to compute (it just currently only opens per-query connections via `queryDB`, not the shared connection).
2. **Confluence too?** You asked for the Jira table specifically, but Discovery reports already blend Jira and Confluence findings together (e.g. `archived-personal-spaces`), and `confluence-stats.html` has an equivalent, smaller table (Total/Active/Archived/Global/Personal Spaces). Want that included as a second table in the same report, or keep this to Jira only for now?

## Files

- `server.js` — extract the per-source stats computation (both Cloud and DC branches) out of `/api/stats`'s route body into reusable functions; call them from both `/api/stats` (unchanged behavior, multi-site loop stays) and `/api/discovery/run` (new, single-source).
- `public/js/report.js` — render the `stats` table as a new report section.
- `checks/*.test.js` unaffected; new tests for the extracted stats functions.

## Verification

No live Cloud/DC source available here (same gap as every phase touching real data). Will verify: the extracted functions produce identical output to the current inline logic (regression-checked against the existing `/api/stats` route's behavior), the new discovery response shape, and the table rendering — the same way every other phase's report/check logic was verified, against synthetic data and the real orchestration paths.
