# Fix: Installed Apps check uses the wrong endpoint

- **Date:** 2026-09-22
- **Status:** Implemented

## Verification performed

- `node --check checks/cloud/installedApps.js` — passes.
- Unit-verified the filter against a synthetic payload shaped exactly like the user's real sample (3 bundled system plugins with `userInstalled: false` + 2 fabricated real apps with `userInstalled: true`, one named "ScriptRunner for Jira"): system plugins correctly excluded, count comes out to 2 (not 5), and ScriptRunner is correctly flagged as a scripting app.
- Server restarts cleanly.
- **Not verified:** the actual live call against alluvium.atlassian.net — that needs your next run of `/discovery` to confirm the real numbers look sane.
- **Trigger:** Real run against alluvium.atlassian.net returned `403 Forbidden` from `/rest/atlassian-connect/1/addons` — confirms the risk flagged in Phase 2's plan. User supplied the correct endpoint and a real response sample.

## Goal

`checks/cloud/installedApps.js` returns real installed-app data instead of `unavailable`, and counts only apps the customer actually installed — not Atlassian's own bundled system plugins.

## Change

- Endpoint: `{siteBaseUrl}/rest/atlassian-connect/1/addons` → `{siteBaseUrl}/rest/plugins/1.0/` (the UPM REST API, per the sample response — shape is `{ plugins: [...] }`, which the existing defensive parsing already handles).
- **Filter to `p.userInstalled === true`.** The sample shows entries like `com.atlassian.jira.plugins.cmdb` and `jira.webfragments.admin` — all `userInstalled: false`, `static: true` — these are bundled Jira modules present on every site. A real Jira Cloud site commonly has several hundred of these. Without this filter, the finding would report a huge, meaningless number instead of what a migration actually cares about: the marketplace apps the customer added.
- Scripting-app detection (folded in per Phase 2's decision) runs against the filtered list only.

## Files

`checks/cloud/installedApps.js` only.

## Verification

- Unit-check the `userInstalled` filter against a synthetic list built from your actual sample shape (system plugins + a fabricated user-installed one) to confirm the count and scripting-detection are both correct.
- Can't verify against the real site directly (no credentials here) — you'll see the real result on your next run.
