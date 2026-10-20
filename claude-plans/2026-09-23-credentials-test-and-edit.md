# Add Test Connection (Cloud) and Edit to the Credentials page

- **Date:** 2026-09-23
- **Status:** Implemented. Decisions: (1) Test Connection removed from Discovery entirely, only on Credentials; (2) secrets left blank on Edit, keeping the existing encrypted value unless replaced.

## What was built

- `public/discovery.html` — removed Step 2 (Validate) entirely; the wizard is now 3 steps (Connect → Run → Review & Export). Connecting a source goes straight to Run. `/api/discovery/validate` is untouched server-side (still exists, just has a new caller).
- `public/js/report.js` — "Back to Run" button renumbered (was step 3, now step 2).
- `public/credentials.html` — Cloud form gets a "Test Connection" button (new, calling `/api/discovery/validate`), matching the DC form's existing one. Both forms gain "Edit" alongside "Remove". Editing pre-fills every non-secret field; secret fields (Cloud: token; DC: database, user, password — DC has no plaintext copy of any of these three, unlike Cloud where only the token is secret) start blank with a "leave blank to keep the current value" hint, and are only overwritten if something is typed.

## Verification performed

- **Executed the real Cloud and DC add/edit/test flows** (not just read them) against a DOM/fetch stub: confirmed a new Cloud site encrypts and saves correctly; editing pre-fills domain/email but leaves the token blank; saving an edit with a blank token preserves the exact previous encrypted token while still applying the domain change; a new site with no token is correctly rejected without being saved.
- **Same for Data Center**, which is more involved since host/database/user/password are *all* encrypted with no plaintext copies except host: confirmed editing preserves database/user/password independently when each is left blank, confirmed changing only the port doesn't disturb the other three, confirmed changing only the password doesn't disturb the database, and confirmed `testDC()` still resolves a valid payload during an edit with blank fields.
- **Executed the real Discovery wizard** end-to-end against a DOM/fetch stub: confirmed connecting a source now advances directly to Run (no Validate step), confirmed Run advances to Review & Export, and confirmed back-navigation from Run correctly returns to Connect.
- Full test suite: 51/51 still passing (this change didn't touch anything the existing suite covers, but confirmed nothing regressed).
- Confirmed `/api/discovery/validate` is still live on the server (now called from Credentials) and every page still returns 200.
- **Trigger:** "on discovery page, there is test connection - this should be moved to .../credentials page when user try to add a new site - and an added site should be editable"

## Current state (confirmed by reading `credentials.html`)

- The **Data Center** form already has "Test Connection" (`testDC()` → `/api/test-db`).
- The **Cloud** form has no equivalent — you can only Save, with no way to check the domain/email/token work before committing.
- Neither saved Cloud site nor saved DC connection can be edited — only Remove exists. Changing anything means deleting and re-adding from scratch.

## Two things to confirm before I build this

### 1. Does "Test Connection" leave Discovery, or get added to Credentials as well?

Discovery's Validate step (`/api/discovery/validate`) is a core part of the 4-step guided wizard (Connect → Validate → Run → Review & Export) built in Phase 4 — it's what lets a novice confirm credentials work before committing to a full run. Reading "should be moved to" literally would mean removing it from Discovery's wizard, which would break that flow's whole point.

**Assuming you mean:** add the same capability to the Cloud form on Credentials (matching the DC form's existing button) — not remove it from Discovery. Confirm this reading, or say if you actually want the Discovery step removed.

**Reuse, not duplicate:** `/api/discovery/validate` already handles Cloud (`GET /myself`) generically — nothing about its implementation is Discovery-specific, it just happens to live under that URL path. The Cloud form's new "Test Connection" button would call this same endpoint rather than building a second one.

### 2. Editing a saved site: the token/password can't be shown back

Credentials are encrypted one-way for display purposes — there's no `/api/decrypt` endpoint, by design (the server never has a reason to hand a decrypted secret back to the browser outside of using it for an outbound request). So "editable" needs one specific rule: **Edit shows the non-secret fields (domain, email, host, port, database, user, SSL, friendly name) pre-filled and editable; the token/password field is left blank with a "leave blank to keep the current one" hint** — save without typing a new one keeps the existing encrypted value, typing a new one replaces it. The alternative (building a decrypt endpoint so the real secret can be shown and re-saved) would be a real security-posture change I wouldn't make without asking separately — confirming the blank-by-default approach instead.

## What I'd build (pending the above)

- `credentials.html`: a "Test Connection" button on the Cloud form (parallel to the existing DC one), calling `/api/discovery/validate` with the currently-typed domain/email/token.
- `credentials.html`: an "Edit" button next to "Remove" for both saved Cloud sites and DC connections. Clicking it opens the respective form pre-filled (secrets blank, per above), and Save updates the existing entry in place (by index) instead of pushing a new one.

## Files

`public/credentials.html` only — no server changes needed beyond reusing the existing `/api/discovery/validate` and `/api/encrypt` endpoints.

## Verification

`credentials.html`'s script is inline (like every page except `discovery.html`, per Phase 6's scoping) — no test file, verified the same way every other non-discovery page has been throughout this project: DOM/fetch-stub execution of the real functions, plus a live server check.
