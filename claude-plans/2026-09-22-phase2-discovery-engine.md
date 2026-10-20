# Phase 2: Discovery engine, Cloud first

- **Date:** 2026-09-22
- **Status:** Implemented. Decisions: (1) placeholder thresholds now, clearly labeled provisional; (2) custom scripts folded into the installed-apps check as a "scripting app detected" flag; (3) attempt the installed-apps endpoint now rather than waiting on Phase 0 — untestable from here without a real site/credentials, so the parsing is a best guess to be corrected on first real run; (4) build the scaffold `discovery.html` now, including adding a nav link across the other pages so it's actually reachable; (5) include both optional extra checks (archived/personal Confluence spaces, inactive projects).

## What was built

- `checks/registry.js` — the finding contract, the check registry, and `runChecks(type, ctx)` (parallel execution, 30s per-check timeout, failures become `unavailable` findings).
- `checks/cloud/customFieldVolume.js`, `workflowCustomFields.js`, `installedApps.js`, `archivedPersonalSpaces.js`, `inactiveProjects.js` — the five checks.
- `server.js` — new `POST /api/discovery/run` (Cloud-only, rejects other source types with 400) and `GET /discovery`.
- `public/discovery.html` — scaffold page (source picker, run button, findings grouped by category).
- Added a `DISCOVERY` nav link to `index.html`, `credentials.html`, `compare.html`, `confluence-compare.html`, `jira-stats.html`, `confluence-stats.html`. Not added to `insights.html`, which already uses a different, older sidebar (a pre-existing inconsistency from before Phase 1, not something to fold into this change).

## Deviation from the plan's stated finding contract

The plan said `error` is set only together with `severity: 'unavailable'`. In practice, `customFieldVolume` needed a **partial-degrade** case: if `license/approximateLicenseCount` fails but `field`/`issuetype` succeed, discarding the whole finding would throw away real, useful data over one sub-call failing. So `error` can now be set on a finding with a real severity, to flag "this part didn't work," while `unavailable` stays reserved for total failures. Flagging this as a deliberate refinement, not an oversight.

## Bug caught during verification (fixed before finalizing)

The critical-severity threshold used `ratio > CRITICAL_PER_USER`, so Wale's own anecdote from the call (4,000 fields / 800 users = exactly 5) landed as `warning`, not `critical` — the one real data point we have would have been under-flagged. Changed to `ratio >= CRITICAL_PER_USER`.

## Verification performed

- `node --check` on every new/edited `.js` file.
- Server restarts cleanly; `/` and `/discovery` return 200.
- **Ran the real `runChecks('cloud', ctx)` orchestrator** (not a mock) against unreachable URLs — all 5 checks degraded to `unavailable` with a real, specific error message instead of crashing the batch.
- **Hit the real `/api/discovery/run` route end-to-end** with a non-existent domain — same graceful-degradation result — and confirmed a non-Cloud source is rejected with 400.
- Unit-verified each check's core computation logic (severity thresholds including the boundary bug above, the custom-field-ID regex scan, the archived-space ratio, the inactivity date cutoff, and the scripting-app name match) against synthetic data.
- **Not verified (no real Cloud site or credentials available):** whether `license/approximateLicenseCount` and `/rest/atlassian-connect/1/addons` actually return data — or the exact response shape — for a real site with a real per-site API token. Both are explicitly called out in each check's own code comments and in this plan; the first real run against an actual Cloud site will likely need a follow-up fix to `installedApps.js`'s response parsing in particular.
- **Trigger:** "go on with phase 2" — the P1 items in [TASKS.md](../TASKS.md#phase-2-discovery-engine-cloud-first-p1)

## Goal

Add a "discovery" capability that runs a set of checks against a Cloud site and produces structured findings (not yet a PDF — that's Phase 3). Unlike Phase 1, this is new feature work with real open questions, not bug fixes on existing behavior, so this plan is more provisional and asks for scope decisions rather than presenting a finished design.

## Why this needs more than one round of "approve and go"

Two of the four checks named on the call — **custom scripts** and **installed apps / Cloud readiness** — don't map cleanly onto a documented Jira Cloud REST API I can verify from here, and Phase 0 already flagged "confirm what app assessments covers" as unresolved. Building either one without clarity risks producing exactly what Phase 1 just fixed: a check that looks authoritative but is silently wrong or empty. I'd rather flag that now than ship it quietly.

## Proposed architecture (low ambiguity — this part I'm confident in)

**Finding shape** (used by every check, and later by the PDF):
```js
{
  id: 'custom-field-volume',              // stable, kebab-case
  category: 'Fields',                     // groups findings in the report
  title: 'Custom Field Volume',
  severity: 'info' | 'warning' | 'critical' | 'unavailable',
  value: { customFields: 4000, users: 800, ratio: 5 },  // raw numbers behind the finding
  summary: '4,000 custom fields for ~800 users (5 per user)',
  explanation: 'Why this matters, in plain language.',
  recommendation: 'What to do about it, or null if severity is info.',
  error: null                              // set + severity 'unavailable' if the check itself failed
}
```
`error`/`unavailable` here is the same "don't silently show 0/success" principle from Phase 1's item 1 — a check that couldn't run says so, rather than reporting a misleadingly clean result.

**Check registry:** each check is `{ id, category, title, cloud: runFn, dc: runFn | null }`. A `runChecks({ type, headers, baseUrl, site })` orchestrator in a new `checks/` directory runs every check whose `[type]` implementation exists, in parallel (`Promise.allSettled`), wraps each in a per-check try/catch **and** a timeout (proposing 30s), and turns a failure/timeout into an `unavailable` finding rather than failing the whole run. This gives every future check (Phase 2's later additions, Phase 5's DC versions) one consistent home instead of growing `server.js` further, and DC slots stay `null` until Phase 5.

**New route:** `POST /api/discovery/run` — one source at a time (not the multi-site batch pattern the other routes use, since a full discovery run is heavier than a count). Response: `{ site, startedAt, finishedAt, findings: [...] }`.

**Minimal scaffold page:** a plain `discovery.html` (source picker like `compare.html`, run button, findings listed grouped by category) — not styled or "guided" (that's Phase 4), not a PDF (Phase 3) — just enough surface to see real output while building. Files: new `checks/registry.js`, `checks/cloud/*.js`, `server.js` (new route, exports `getAuthHeaders`/`getBaseUrl` for the checks to use), `public/discovery.html`, plus a nav link.

## The four checks named on the call

### 1. Custom field & issue type volume vs. user count — ready to build, with one placeholder

- Custom field count: `GET {baseUrl}/field`, filtered to `.custom === true` (the existing `/api/stats` `fieldCount` counts *all* fields, system included — this check needs the custom-only subset, computed separately).
- Issue type count: `GET {baseUrl}/issuetype`, length.
- User count: `GET {baseUrl}/license/approximateLicenseCount` → `.value`. **Assumption I can't verify from here:** whether this endpoint is reachable with a plain per-site API token, or whether it needs org-admin-level access. If it 403s, the check reports `unavailable` (safe failure, not a crash) — but worth knowing before we rely on it in a customer-facing report.
- Severity thresholds: **nothing from the call beyond two anecdotes** (2,000 fields/200 users, 4,000/800 — both "5 per user" flagged as too high). Phase 0 already listed getting real thresholds as an open item nobody's answered yet. I can ship with a clearly-labeled placeholder (e.g. warning above 2/user, critical above 5/user) so the check produces a real signal today, or leave severity as always `info` until real numbers arrive — your call.

### 2. Workflows that reference custom fields — buildable, with a stated accuracy limit

- `GET {baseUrl}/workflow/search?expand=transitions` (paginated), then regex-scan each workflow's stringified transition rules for `customfield_\d+` and cross-reference against the real custom fields from check 1 for human-readable names.
- **Limitation to state in the finding's own explanation text, not just bury in code comments:** this catches post-functions/validators/conditions that reference a field by its numeric ID in a way that shows up in the JSON — not every possible way a workflow or an app could reference a field. It's a best-effort scan, not a guarantee.

### 3. Custom scripts — blocked on a decision, not a technical fix

There's no generic "custom script" object in the Jira Cloud REST API. This is almost certainly about **ScriptRunner** (a third-party app with its own separate API this tool has no access to) or possibly **Automation for Jira** rules with script-like actions (reachable only through an internal, undocumented endpoint that could change without notice). Three ways to handle it — see the question below.

### 4. Installed apps and their Cloud readiness — blocked on a decision, not a technical fix

The standard "list installed apps" endpoint (`/rest/atlassian-connect/1/addons`) is built for an installed Connect app to call about itself via JWT, not for a human's API token — I'm not confident a plain email+token request succeeds here, and I have no live site to test it against. A true admin-level app inventory likely needs Atlassian's organization-level Admin API, which needs an OAuth token this tool doesn't currently collect (a different credential type from what `credentials.html` gathers today). This is exactly what Phase 0 flagged as needing Babs/Wale's input ("confirm what app assessments covers... where does the data come from") — that hasn't come back yet, so I don't want to guess at a possibly-broken implementation.

## Two optional, well-defined additions (not on the call, but cheap given data we already fetch)

- **Archived / personal Confluence spaces** — already counted in the existing Confluence stats logic; wrapping it as a finding is close to free.
- **Inactive projects** — `/project/search?expand=insight` includes `lastIssueUpdateTime` per project; flag projects with no activity in N days (again, N is a placeholder pending real guidance).

## Verification

No live Cloud site or credentials available here. I can:
- Confirm the code is syntactically correct and the registry/orchestrator logic behaves as designed with mocked check functions.
- Confirm each check's HTTP calls are built correctly (URL, method, headers) by inspection.

I **cannot** confirm from here whether `/license/approximateLicenseCount` or `/rest/atlassian-connect/1/addons` actually return data for a real site with a real API token — that needs a test run against an actual Atlassian Cloud site, which I'd want you (or a sandbox site) to do once this is built.

## Open questions (need your answer before I implement the corresponding piece)

1. **Thresholds:** ship the volume/inactivity checks with clearly-labeled placeholder severity thresholds now, or leave them informational (no warning/critical judgment) until real numbers come from Wale/Babs?
2. **Custom scripts:** which of the three options — skip and note it as a manual step in the report, best-effort proxy via Automation for Jira's internal API (fragile), or fold it into the apps check as "ScriptRunner detected, manual inventory needed"?
3. **Installed apps:** attempt the Connect-app endpoint now (and find out empirically whether it works), or hold this check entirely until Phase 0's question to Babs/Wale comes back?
4. **Scaffold page:** build the plain `discovery.html` now so there's something to look at while iterating, or wait until Phase 3/4 produce the real UI?
5. **Optional additions:** include the two extra checks (archived/personal spaces, inactive projects) in this pass, or keep this phase strictly to the four named on the call?
