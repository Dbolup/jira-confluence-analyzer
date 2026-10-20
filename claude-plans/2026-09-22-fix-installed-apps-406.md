# Fix: Installed Apps check gets 406 Not Acceptable

- **Date:** 2026-09-22
- **Status:** Implemented

## Verification performed

- `node --check` passes.
- Confirmed the header override is scoped to `upmHeaders`, a new local object built from just `headers.Authorization` — it doesn't touch or mutate the shared `headers` object other routes/checks use.
- Server restarts cleanly.
- **Not verified:** the actual live call — needs your next run against alluvium.atlassian.net.
- **Trigger:** Real run against alluvium.atlassian.net: `rest/plugins/1.0 406 Not Acceptable` from the app, but the identical URL returns 200 in Postman.

## Diagnosis — confirmed, not guessed

User checked Postman's actual request headers. Postman's successful call sends `Accept: */*` and no `Content-Type` (no body on a GET). Our shared `getAuthHeaders()` in `server.js` (used by every check and every other route) sends `Accept: application/json` and `Content-Type: application/json` on every request. `/rest/plugins/1.0/` (Atlassian's older UPM REST API) apparently doesn't produce a representation matching `application/json` specifically — `*/*` accepts anything, so it passes.

## Change

In `checks/cloud/installedApps.js` only (not the shared `getAuthHeaders`, to avoid risking the other checks/routes that already work against the real Jira/Confluence REST APIs): build a request-specific headers object for this one call with `Accept: '*/*'`, no `Content-Type`, matching what Postman actually sent.

**Not adding `?userInstalled=true` to the URL** — user confirmed it's a no-op on this endpoint (Postman's response with that param still shows `userInstalled: false` entries same as without it). The existing client-side filter in this file is the only thing actually doing this filtering, and stays as-is.

## Verification

Can't hit the real endpoint from here. Confirmed the header object only changes this one call, not the shared helper other routes depend on. Real confirmation needs the user's next run.
