# Phase 5: Data Center support

- **Date:** 2026-09-22
- **Status:** Implemented. Decisions: (1) attempt Installed Apps for DC anyway, with maximal honesty about the schema uncertainty; (2) build the shared-connection improvement now, scoped to the discovery-run path only; (3) Data Center goes through the same wizard as Cloud, replacing Phase 4's written-only guide — except the Pinggy tunnel instructions stay; (4) Oracle/MSSQL, the local runner, and the NDA clause are all out of this pass.

## What was built

- `checks/dc/*.js` (5 files) — DC implementations of every Cloud check, reusing already-proven table/query patterns from elsewhere in `server.js` where possible (`archivedPersonalSpaces` is a direct copy of `/api/confluence/stats`'s existing DC query). `installedApps` is the explicit exception — see below.
- `checks/registry.js` — all 5 `dc` slots now wired in.
- `server.js` — new `openDbConnection()` (one shared connection/pool per discovery run, handed to every DC check instead of each opening its own); `/api/discovery/run` and `/api/discovery/validate` both now branch Cloud vs. Postgres/MySQL (Oracle/MSSQL explicitly rejected with a clear 400, not silently mishandled).
- `public/discovery.html` — Connect step's Data Center path now has a live form (saved connection or new one, mirroring Cloud's UX), wired through the same Validate → Run → Review & Export steps Cloud uses. The Pinggy tunnel instructions from Phase 4's guide were kept (still genuinely needed), the "go use these other pages manually" instructions were dropped (superseded by the new live path).
- `public/credentials.html` — added the read-only-user hint to the DC connection form (guidance only, not enforced in code, per the plan).

## Bug caught during verification, fixed in the same pass

Discovered empirically, not anticipated in the plan: `pg`'s `Pool` is lazy — it doesn't actually open a connection until the first query. This meant a genuinely unreachable Postgres DC source would pass `openDbConnection()` silently and only fail once each of the 5 checks tried its first query, producing **5 redundant "unavailable, ECONNREFUSED" findings** instead of one clear error — and `mysql2`'s `createConnection` is eager, so the identical failure mode for MySQL correctly produced one clean error instead. Fixed by adding an eager `SELECT 1` to the Postgres branch of `openDbConnection`, so both engines now fail identically: one clear connection error before any checks run, not five vague ones after.

## Verification performed

No live Data Center database available here (same gap as every DC phase). What I could and did verify for real:
- `node --check` on every new/edited file.
- **Executed the real `runChecks('dc', ...)` orchestrator** against a synthetic `db.query()` mock shaped exactly like real Jira/Confluence DC schema responses — confirmed all 5 checks compute correctly, including the exact critical-threshold boundary case (4000/800 = 5 → `critical`, matching the same bug-fixed logic from the Cloud check), the XML regex scan for workflow custom fields, and the `com.atlassian.*` exclusion heuristic for installed apps.
- **Hit the real running server** for both `/api/discovery/run` and `/api/discovery/validate` with unreachable Postgres and MySQL sources — confirmed graceful, now-consistent degradation, confirmed unsupported types (Oracle) are cleanly rejected with 400, and confirmed the `finally` block correctly skips `close()` when connection setup itself fails.
- **Executed the actual new Connect-step JS** (not just read it) against a DOM/fetch stub covering the full DC path: choosing Data Center, saving a new connection (confirmed it calls `/api/encrypt` and writes to the same `savedDCConnections` key `credentials.html` uses), auto-advancing to Validate, and the Validate step correctly falling back to `.name` for DC sources (which have no `.domain`).
- Confirmed every existing page (including all the untouched ones) still returns 200 after every change in this phase.

## Known limitations, stated plainly

- **`checks/dc/installedApps.js` is the least trustworthy check in this entire project.** The `pluginstate` table name/columns are unverified against any live instance, and the `com.atlassian.*` exclusion is a heuristic, not a real flag (DC has nothing equivalent to Cloud's `userInstalled`). It will very likely need a real correction round against an actual DC database, the same way Cloud's version needed two.
- `workflowCustomFields` (DC) and `inactiveProjects` (DC) rely on column names (`jiraworkflows.descriptor`, `jiraworkflows.workflowname`, `jiraissue.updated`) that, while standard, well-known Jira schema, have not been used elsewhere in this codebase before this phase and so are unverified from here.
- Oracle, MSSQL, the self-contained local runner, and the NDA clause remain entirely out of scope, per the plan.
- **Trigger:** "now to phase 5" — the P2 items in [TASKS.md](../TASKS.md#phase-5-data-center-support-p2)

## This phase bundles at least three separate decisions — splitting them apart

TASKS.md's Phase 5 lists five bullets, but they're not one job:
1. DC implementations of the 5 existing discovery checks — a natural continuation of Phase 2's registry (the `dc: null` slots already exist for exactly this).
2. Oracle/MSSQL support — a materially bigger lift (new drivers, `oracledb` in particular needs native Oracle Instant Client binaries on the host, not just an npm install; `queryDB` currently only branches on `postgres`/`mysql` at all).
3. A self-contained local runner (Yusuf's suggestion) — a completely different distribution model (something downloaded and run on the client's machine, not a hosted web app). This isn't an extension of the current architecture; it's a new one.
4. Read-only DB user + tightened connection handling — partly code, partly guidance.
5. The NDA clause — not code at all; Wale's action item, not something I can build.

**Proposing this pass covers only #1 and part of #4** (DC checks on Postgres/MySQL, the two engines `queryDB` already supports, plus a connection-reuse improvement). Oracle/MSSQL and the local runner are big enough to deserve their own dedicated planning conversation rather than being squeezed into this one — flagging both as separate, not attempting either here. #5 isn't something I act on beyond noting it's still open.

## The 5 checks, DC versions — what I can build with confidence, and the one I can't

Using the same table/column names already proven working elsewhere in `server.js`'s existing DC code (`server.js:155,282,288,362-365,448`), not guessed:

| Check | DC feasible? | Approach |
|---|---|---|
| Custom Field & Issue Type Volume | Yes | `customfield` table is custom-fields-only by nature (unlike Cloud's `field` endpoint, which mixes system+custom) — no filtering needed. Issue types from `issuetype`. User count from `cwd_user` (`WHERE active = 1`) — same caveat as everywhere else in this app: DC's user directory can span multiple directories (internal + LDAP/AD), so this may over- or under-count depending on setup. Same provisional thresholds as Cloud. |
| Workflows Referencing Custom Fields | Yes | DC stores workflows as XML in `jiraworkflows.descriptor` (not JSON) — same best-effort regex scan for `customfield_\d+` works directly on the XML text, no XML parsing needed. Field names resolved via `customfield.id` → `customfield.cfname`. |
| Archived & Personal Spaces | Yes | Directly reuses the exact query pattern `/api/confluence/stats`'s DC branch already runs (`server.js:362-365`) — this one's already proven correct in production use. |
| Inactive Projects | Yes, with a performance caveat | Needs `MAX(jiraissue.updated)` grouped per project, `LEFT JOIN`ed so projects with zero issues still show up as inactive. On a DC instance with millions of issues this could be slow — the registry's existing 30s per-check timeout (already built in Phase 2) is the safety net, not a new mechanism. |
| Installed Apps | **No — proposing to skip** | Jira DC's installed-plugin state isn't a clean, documented database table the way projects/fields/spaces are — it's mostly files on disk plus internal OSGi/plugin-framework bookkeeping tables that are undocumented and version-dependent. Guessing at one of those tables risks exactly the kind of silently-wrong result Phase 1 was built to prevent. Proposing this check's `dc` slot stays `null` (the registry already treats that as "not implemented for this type" and simply skips it) rather than shipping something fragile. |

## Connection handling — the one architecture change worth making now

`queryDB()` currently opens a brand-new Postgres `Pool` or MySQL connection **per query call**, then immediately tears it down (`server.js:84-100`) — even Postgres's `Pool`, designed for connection reuse, is used as "connect once, query once, disconnect," not actually pooled. A single DC discovery run touches 4 checks, several of which run multiple queries each (custom-field-volume alone needs 3) — that's a lot of redundant connect/disconnect overhead per run.

**Proposing:** for a DC discovery run specifically, open one shared connection/pool up front, hand it to every check, and close it once at the end — rather than changing `queryDB`'s existing per-call behavior everywhere else in the app (which the stats/compare pages already rely on and which isn't broken, just not optimal). This is scoped narrowly to the new discovery-run code path.

## Read-only DB user

Not something I can enforce in code without inspecting database-level grants, which is vendor-specific and easy to get subtly wrong. Proposing this stays documentation/guidance — a hint on the Data Center connection form in `credentials.html` ("use a read-only user for this connection") — rather than a runtime check.

## Files

- `checks/registry.js` — no structural change needed; `dc` slots already exist.
- `checks/dc/*.js` — four new files (customFieldVolume, workflowCustomFields, archivedPersonalSpaces, inactiveProjects), mirroring the `checks/cloud/*.js` shape but querying the DB instead of the REST API.
- `server.js` — the shared-connection helper for a DC discovery run; wiring `/api/discovery/run` to accept a DC source and route to `runChecks('dc', ...)`.
- `public/discovery.html` — the Connect step's Data Center fork currently shows a written-only manual runbook (built in Phase 4) with no live execution; this would add a real "Run Discovery" path for DC sources alongside it. Need to decide: replace the written guide, or offer both (guide for the pages that still don't have DC checks — none, after this phase — or just switch DC over to the same wizard Cloud uses)?
- `public/credentials.html` — read-only-user hint text on the DC connection form.

## Open questions

1. **Skip "Installed Apps" for DC** (leave `dc: null`), per the reasoning above — agree, or do you want me to attempt one of the undocumented plugin-state tables anyway with a clear "unverified" caveat?
2. **Shared connection per discovery run** — build this now (moderate `queryDB`/discovery-route change), or keep the existing per-query connect/disconnect for simplicity and revisit only if it proves slow in practice?
3. **`discovery.html`'s DC path** — once DC checks exist, should Data Center go through the same wizard as Cloud (Connect → Validate → Run → Review & Export), replacing Phase 4's written-only guide? I'd say yes, but flagging since Phase 4 explicitly built that guide as the DC experience.
4. **Confirm out of scope for this pass:** Oracle/MSSQL support, the self-contained local runner, and the NDA clause — all deferred to their own separate conversations, not attempted here.

## Verification

No Data Center Postgres/MySQL database available here (same gap as every DC-touching phase since Phase 1). I can unit-verify each check's SQL-adjacent logic (regex scans, ratio math, date-cutoff filtering) against synthetic rows, and verify the queries are syntactically valid, but not that they return correct results against a real DC schema.
