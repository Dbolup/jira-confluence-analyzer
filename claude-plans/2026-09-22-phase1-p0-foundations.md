# Phase 1 (P0): Fix the foundations

- **Date:** 2026-09-22
- **Status:** Implemented — all 7 items. Decisions: item 4 = fix `.replit` **and** delete `index.js`/`utils/`; item 6 = **fix** `insights.html` (not remove); item 7 = migrate the project count now.

## Deviations / implementation notes

- **Items 1 and 7 landed as one edit.** Both touch the exact same `results.push({...})` block in `/api/stats`'s Cloud branch, so the `countOf` refactor (item 1) and the `project` → `project/search` endpoint swap (item 7) were made together rather than as two separate passes over the same lines.
- **Item 7's status filter:** migrating to `/project/search` changes Atlassian's default from "all projects" to "live projects only" unless a `status` param is passed. Used `project/search?maxResults=0&status=live,archived&` (`maxResults=0` to fetch just the `total`, skipping the values payload) to preserve the old endpoint's behavior of counting archived projects too.
- **Item 3 placeholder style:** call sites now write queries with MySQL-style `?` placeholders; `queryDB` translates `?` → `$1, $2, ...` internally for the Postgres branch, so only one SQL string is needed per call site instead of one per engine. Only true data values (`pKey`, `key`) were parameterized — the hardcoded table/column/entity names in `getScheme`/`getConfigScheme`/`count(cType)` stay as template literals, since they're developer constants, not user input, and SQL placeholders can't parameterize identifiers anyway.
- **Item 1 "unavailable" display:** shows `—` (title="Unavailable") for a `null` metric and a red "Error" cell (with the message in a tooltip) for a whole-row failure, in both `jira-stats.html` and `confluence-stats.html`. `insights.html` already used `?? '-'` so it needed no equivalent change (confirmed while implementing item 6).
- **Item 6 scope held to what was approved:** fixed the credential-source key and the metrics list only. Did not restyle the page to match the other pages' sidebar theme, and did not add it back into any page's navigation — it isn't linked from any other page today. Flagging this as a follow-up decision, not doing it silently.

## Verification performed

- `node --check server.js` — passes.
- Restarted `npm start`; server boots, `/` and `/insights` return 200.
- `/api/encrypt` round-trips a test payload.
- Reproduced the pre-fix bug and confirmed the fix against the **real running server** (not just code review): a `/api/compare-projects` request shaped like the old frontend output (`type:'dc', typeDB:'postgres'`) returns `"Unsupported DB Type"`; the same request shaped like the new frontend output (`type:'postgres'`) gets past dispatch and attempts a real Postgres connection instead.
- Unit-checked `countOf()`'s three cases in isolation (paginated total, real empty array, failed fetch) — returns `5`, `0`, and `null` respectively, as intended.
- All touched `public/*.html` files still parse/read cleanly; `.replit` now points at `server.js`.
- **Not verified (no test environment available):** an actual end-to-end DC comparison against a real Postgres/MySQL Jira or Confluence database, and the Cloud branch against a real Atlassian site (so the `/project/search` total and the paginated `.total` fields haven't been checked against real data).

**Unrelated finding surfaced during testing, not in scope for this pass:** hitting `/api/test-db` against a closed local port returned `error: ""` (empty string) instead of a connection-refused message. This looks like a Node `AggregateError` (from trying both the IPv6 and IPv4 addresses for `localhost`) whose top-level `.message` is empty, with details only in `.errors`. Pre-existing behavior, unrelated to any of the 7 items above — worth a follow-up ticket if empty DB error messages show up in practice.
- **Trigger:** "Now let start with phase1 - P0" — the P0 items in [TASKS.md](../TASKS.md#phase-1-fix-the-foundations-p0)

## Goal

Make the existing counts/compare features trustworthy and the deployment config correct, before any new discovery checks are built on top of them. Seven items, each independent — approve all, some, or none.

## Items

### 1. Replace silent zeros with an explicit "unavailable" state

**Problem:** In `server.js`, both failure wrappers collapse an error into `0`, which is indistinguishable from a real zero count.
- Cloud: `safe = (p) => p.catch(e => ({ error: e.message }))` (line 121), then consumed as `p.length || p.total || 0` (lines 133–140) — the captured `error` message is discarded and the UI shows `0`.
- Data Center: `count = async (table) => { try {...} catch(e) { return 0; } }` (line 143, and inline variants at lines 152 and 155).

**Change:** Introduce a sentinel (e.g. `null`) for "the query/fetch failed" and keep `0` meaning an actual zero. Have `safe()` and `count()` return the sentinel on failure instead of `0`, and update the two frontend render functions (`jira-stats.html`, `confluence-stats.html`) to show something like `—` (with the error message in a `title` tooltip) instead of `0` when a metric is the sentinel.

**Files:** `server.js`, `public/jira-stats.html`, `public/confluence-stats.html`.

**Risk:** Low. Purely additive — real zero counts are unaffected; only the failure path's display changes. Must check both stats pages' render loops handle `null` without crashing (e.g. `val > 0` comparisons already guard with `?? '-'` in one place).

### 2. Fix the DC `type` vs `typeDB` mismatch on the compare pages

**Problem:** `compare.html:110` and `confluence-compare.html:109` build the DC source as `{ type: 'dc', ..., typeDB: dcConns[idx].type }`. But `queryDB()` in `server.js` branches on `config.type === 'postgres' | 'mysql'` (lines 82, 91). Since `type` is literally the string `'dc'`, every DC comparison hits `throw new Error('Unsupported DB Type')`. The stats pages don't have this bug — they spread the saved connection directly (`{ type:'dc', ...dcConns[idx] }`), so `type` ends up `postgres`/`mysql`.

**Change:** In both files, stop overwriting `type` with the literal `'dc'`; spread the saved connection the same way the stats pages do, or explicitly set `type: dcConns[idx].type` and drop `typeDB`.

**Files:** `public/compare.html`, `public/confluence-compare.html`.

**Risk:** Low, isolated to two lines each. Needs a real DC Postgres or MySQL connection to verify end-to-end (see Verification).

### 3. Parameterize the interpolated SQL in the DC compare routes

**Problem:** `server.js`'s DC branches build SQL by interpolating `pKey`/`key` (both come from a dropdown built off the app's own `/api/projects` and `/api/confluence/spaces` responses, not free user text — but still unsafe practice and one accidental route change away from being exploitable):
- `/api/compare-projects` DC branch: lines 272, 273, 278, 285, 293 (all use `'${pKey}'` / `'${fieldId}'` / `'${entity}'` inline).
- `/api/confluence/compare-spaces` DC branch: lines 430, 438 (`'${key}'`), plus `'${cType}'` at line 430.

**Change:** Convert each to a parameterized query using `queryDB(config, sql, params)`, which already accepts a `params` array (used nowhere today). Use `$1`/`$2` placeholders for Postgres and `?` for MySQL — `queryDB` currently passes `params` straight through to both drivers, so this needs the SQL written per-call, not shared between engines as-is (worth double-checking `mysql2`/`pg` both accept the same placeholder style, or branch the placeholder syntax inside `queryDB`).

**Files:** `server.js`.

**Risk:** Medium — touches the querying logic itself, not just wiring. `getScheme`/`getConfigScheme` interpolate `table`/`entity`/`fieldId`, which are hardcoded call-site constants (not user input), so those stay as template literals; only the actual data values (`pKey`, `key`, `cType`) get parameterized.

### 4. Point `.replit` at `server.js`

**Problem:** `.replit` has `entrypoint = "index.js"` (line 1) and `[deployment] run = ["node", "index.js"]` (line 12). `index.js` is the legacy Cloud-only server, incompatible with the current frontend (plaintext credentials, no `/api/encrypt`, no DC support). A Replit deploy today would run the broken server.

**Change:** Update both to `server.js`.

**Files:** `.replit`.

**Open question:** delete `index.js` and `utils/` (`atlassian.js`, `confluence.js`, `env.js`) now that nothing should reference them, or keep them around for reference a while longer? I'd default to deleting them in this same change, since keeping a second, subtly-incompatible server around invites exactly this bug recurring — but this is your call.

**Risk:** Low for the `.replit` edit. Deleting `index.js`/`utils/` is low-risk too (confirmed earlier that only `index.js` imports `utils/`), but is a one-way door on this repo's history unless you want it done via git so it's revertible.

### 5. Make `.env` actually load

**Problem:** `server.js` has no `dotenv` import, so `ENCRYPTION_KEY`/`PORT` in a `.env` file are silently ignored, contradicting the README's setup instructions. `dotenv` is already a dependency (`package.json`).

**Change:** Add `import 'dotenv/config';` as the first import in `server.js`.

**Files:** `server.js`.

**Risk:** Low. One line. Confirms `process.env.PORT` (line 14) and `process.env.ENCRYPTION_KEY` (line 23) start picking up `.env` values.

### 6. Fix or remove `insights.html`

**Problem:** `insights.html` reads `localStorage.getItem('atlassianGlobalCreds')` (line 46), a key nothing in the current credentials flow writes (current pages use `defaultCloudCreds`/`savedCloudSites`/`savedDCConnections`). It also renders metrics `/api/stats` never returns: `projectsActive`, `projectsArchived`, `fieldsDuplicated`, `workflowSchemesInactive`, `issueTypeSchemesInactive` (line 59). The page is reachable at `/insights` and linked from the app, but cannot function today.

**Options:**
- **(a) Remove it now:** delete `public/insights.html`, its route in `server.js`, and its nav link(s); revisit a real insights view later (Phase 2/4 discovery work covers similar ground).
- **(b) Fix it now:** switch it to the current credential keys and trim the metrics list down to what `/api/stats` actually returns.

**My recommendation:** (a) — it's currently dead code presented as a working feature, and the discovery work in later phases will likely replace it with something more capable anyway. But this is a product call, not a technical one.

**Files:** `public/insights.html`, `server.js` (route), any nav partials that link to it.

### 7. Review Cloud endpoints for pagination limits and deprecation — findings, no code change proposed yet

I reviewed every Cloud endpoint called in `server.js` and `utils/atlassian.js`:

- **`/api/stats`'s `fetchAPI('project')` (line ~124, via the classic `GET /rest/api/3/project`):** this endpoint is deprecated by Atlassian in favor of the paginated `GET /rest/api/3/project/search` (which `utils/atlassian.js`'s `getProjects()` already implements correctly, looping on `startAt`/`isLast`, but that file is legacy/unused by `server.js`). Atlassian could remove the classic endpoint; it's the one concrete risk here.
- **Everything else `/api/stats` calls** (`field`, `workflow`, `issuetype`, `priority`, `status`, `resolution` — plain arrays; `workflowscheme`, `issuetypescheme`, `notificationscheme`, `screens`, `screenscheme`, `issuetypescreenscheme`, `fieldconfiguration`, `fieldconfigurationscheme`, `filter/search`, `permissionscheme` — paginated, but their `.total` field already reflects the full match count without needing to page through, so the current single-request-per-endpoint approach is correct for a *count*) looks fine as a "get a count" strategy.
- **`/api/compare-projects`'s Cloud branch** already uses current, non-deprecated endpoints (`project/{key}`, `search/approximate-count`, `workflowscheme/project`, etc.).

**Proposed change (separate from the plan items above, flagging for a decision):** migrate the `project` count in `/api/stats` to loop `/project/search` the way `utils/atlassian.js` already does, so it survives the classic endpoint's eventual removal. I'd rather not bundle this into item 4's cleanup of `utils/`/`index.js` without your go-ahead, since it means porting logic out of a file we're otherwise deleting.

**Files (if approved):** `server.js`.

## Verification

No test suite exists. Manual checks after `npm start`, using the background server already running (task `bnl5bgpsi` — I'll restart it after changes):

1. **Item 1:** Temporarily point a Cloud site at a bad token or a DC connection at unreachable credentials, run `/jira-stats`, confirm the failed metric shows the "unavailable" indicator, not `0`; confirm a real `0` (e.g. zero dashboards) still renders as `0`.
2. **Item 2 + 3:** Needs an actual reachable Postgres or MySQL Jira/Confluence DC database to exercise `/compare` and `/confluence-compare` end-to-end. **I don't have one available** — this needs you (or a test DB) to verify; I'll confirm the code paths compile/run correctly and that the query text is valid SQL, but can't confirm real query results.
3. **Item 4:** Not verifiable locally (`.replit` only affects Replit's own environment) — visual diff of the file plus confirming `server.js` still starts locally is all I can check here. If `index.js`/`utils/` are deleted, run `npm start` afterward to confirm nothing else imports them (already confirmed: nothing else does).
4. **Item 5:** Set `ENCRYPTION_KEY=test-key-exactly-32-bytes-long!` and a custom `PORT` in `.env`, run `npm start`, confirm it boots on that port and that credentials encrypted under that key round-trip through `/api/encrypt`.
5. **Item 6:** If removed — confirm `/insights` 404s (or the link disappears) and nothing else links to it. If fixed — confirm the page loads and renders only fields `/api/stats` returns, using a real Cloud site.
6. **Item 7:** If the `/project/search` migration is approved, compare its returned `total` against the classic endpoint's array length on a real Cloud site before/after.

## Open questions

1. Item 4: delete `index.js` and `utils/` now, or leave them?
2. Item 6: remove `insights.html` (my recommendation) or fix it to match current data?
3. Item 7: is migrating the `project` count to `/project/search` in scope for this pass, or defer it?
4. Items 2/3 need a real DC database to fully verify — do you have one to point me at, or should I verify code-only and let you test the DB path?
