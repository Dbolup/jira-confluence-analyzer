# Phase 4: Guided experience

- **Date:** 2026-09-22
- **Status:** Implemented. Decisions: (1) inline credential entry in Connect; (2) validate via `GET /myself`; (3) Data Center gets a written-only runbook, no fake automated wizard.

## What was built

- `server.js` — new `POST /api/discovery/validate`, mirroring `/api/test-db`'s success/error shape.
- `public/discovery.html` — rebuilt as a 4-labeled-step wizard (Connect → Validate → Run → Review & Export): a step indicator, a Cloud/Data-Center fork, inline "connect a new site" form (encrypts via the existing `/api/encrypt` and writes to the same `savedCloudSites` localStorage key `credentials.html` uses, so a site saved here shows up there too), a validate screen with pass/fail feedback, the existing Run/report/PDF flow from Phases 2–3 now sitting inside the wizard, and a written Data Center runbook pointing at the already-working DC-compatible pages.
- No changes to `jira-stats.html`, `confluence-stats.html`, `compare.html`, `confluence-compare.html`, `credentials.html`, `index.html` — confirmed still loading, untouched.

## Verification performed

This page has far more DOM interaction than anything built in earlier phases, so verification went further than a syntax check:
- `node --check` on `server.js` and the extracted inline script.
- Server restart; all 8 routes (including every pre-existing page) return 200.
- **Hit the real `/api/discovery/validate` route**: rejects non-Cloud sources with 400, and a nonexistent domain returns a clean, handled `404 Not Found` (Atlassian's own `*.atlassian.net` wildcard DNS resolves it and returns 404 at the edge — a genuinely useful real-world result, not a guess).
- **Executed the actual wizard logic** (not just read it) against a DOM/fetch stub covering every interactive path: choosing Cloud reveals the connect form and populates the saved-site dropdown from real `localStorage` data; selecting a saved site sets the source and advances to Validate with the right domain shown; the step indicator correctly marks the active step and prior steps as done; back-navigation works; `saveAndContinue()` calls `/api/encrypt`, writes the encrypted payload to `localStorage`, and auto-advances; `validateConnection()` renders both its success path (name + enabled Continue button) and failure path (error message + hidden Continue button) correctly; `render()` (reused from Phase 3) still produces a correct report.
- **Not verified:** the actual visual layout/CSS in a real browser, and the whole flow against a real Cloud site — both need a browser and live credentials, neither available here.

## Implementation note: Review and Export merge into one screen

`html2pdf`/`html2canvas` (Phase 3's export mechanism) can't capture an element that's `display:none` — which is how this app's existing step-toggle pattern (from `insights.html`) hides inactive steps. If Review and Export were separate steps, moving to Export would hide the report content Export needs to re-capture, producing a blank or broken PDF. So they render as one continuous screen (report content + Download PDF button together) instead of two separately-hidden ones. The step indicator still labels the wizard as 4 stops: Connect → Validate → Run → Review & Export. This is a direct technical consequence of the already-approved PDF mechanism, not a new design preference, so I'm implementing it this way rather than re-asking.
- **Trigger:** "Now to phase 4" — the P2 items in [TASKS.md](../TASKS.md#phase-4-guided-experience-p2)

## Goal

Turn `discovery.html` from "pick a saved source, click Run" into the novice-proof, step-by-step flow Wale described: connect, validate, run, review, export — with instructions at each step, not a page that assumes you already know what an API token is.

## Why this needs decisions, not just code

This phase is mostly UX/content judgment calls, not technical ones. Three real forks:

### 1. Should credentials be enterable inline in the wizard, or does Step 1 send you to `/credentials` first?

Right now `discovery.html` only works if you've already saved a Cloud site elsewhere — a first-time user lands on an empty dropdown with no path forward. A truly novice-proof "connect" step should let you enter a domain/email/token right there, with a link to create an API token (id.atlassian.com/manage-profile/security/api-tokens) and save it using the same encrypted `localStorage` flow `credentials.html` already uses — not a separate credential store.

**Recommendation:** inline. It's more page-building work (duplicating `credentials.html`'s save-cloud-site logic into `discovery.html`) but it's what "guided" actually means — sending someone away to another page mid-flow isn't guided.

### 2. What does "validate" check, concretely?

Nothing today validates Cloud credentials before use — only Data Center has `/api/test-db` (see `credentials.html`'s "Test Connection" button). I'd add the Cloud equivalent: a new `POST /api/discovery/validate` that calls `GET {baseUrl}/myself` (Jira's own "who am I" endpoint — lightweight, no special scope needed) and reports success (with the authenticated display name) or failure, before the user commits to a full discovery run. Mirrors the existing DC pattern exactly.

### 3. Data Center: build a fake "runbook" for checks that don't exist, or write an honest one for what already works?

Phase 5 (Data Center checks) hasn't been built — there's no automated DC discovery to run yet. But Wale explicitly asked for **both** a Cloud→Cloud and a DC→Cloud runbook on the call. I don't want to fake a DC wizard that silently does nothing useful.

**Recommendation:** Step 1 asks "Cloud or Data Center?" Cloud goes into the full 5-step wizard below. Data Center shows a written, accurate runbook for what this tool can actually do today: expose the DB via Pinggy (already documented on the home page and in the README), add the connection in `/credentials`, then run the existing `/jira-stats`, `/confluence-stats`, `/compare`, `/confluence-compare` pages against it (all DC-compatible since Phase 1's fixes). No pretense of automated DC "discovery checks" until Phase 5 actually exists.

## Proposed wizard (pending the answers above)

Reusing `insights.html`'s existing `.step`/`.step.active` show/hide pattern (a precedent already in this codebase), restyled to match `discovery.html`'s existing monochrome look — not copying insights.html's different purple-gradient theme, just its step-toggle mechanism.

1. **Connect** — Cloud or Data Center fork. Cloud: pick a saved site, or enter domain/email/token inline with a "create a token" link and save it (writes to `savedCloudSites`, same as `credentials.html`). Data Center: shows the written runbook, no further wizard steps.
2. **Validate** — "Test Connection" against `/api/discovery/validate`; must pass before continuing (with a way to go back and fix credentials).
3. **Run** — "Prepared For" field (moved from the current flat control row) + "Run Discovery", calling the existing `/api/discovery/run`.
4. **Review** — the report (already built in Phase 3: Key Areas of Concern + Detailed Findings).
5. **Export** — the existing "Download PDF" button.

## Explicitly not changing

`jira-stats.html`, `confluence-stats.html`, `compare.html`, `confluence-compare.html`, `credentials.html`, `index.html` — TASKS.md is explicit these keep working as-is for migration testing. Only `discovery.html` gets rebuilt as a wizard, plus one new small server route (`/api/discovery/validate`).

## Files

- `public/discovery.html` — rebuilt as the 5-step wizard (Cloud) + written DC guide.
- `server.js` — new `POST /api/discovery/validate` route.

## Verification

No live Cloud site available here (same gap as every phase since Phase 2). I can verify: the step-transition logic in isolation, the validate endpoint's request/response shape, that the existing pages are untouched and still load, and that credentials entered inline actually land in the same `localStorage` keys `credentials.html` reads — so a site saved from the wizard shows up back on the Credentials page too.

## Open questions

1. Confirm the inline-credentials approach (question 1 above) — or keep Step 1 as a link out to `/credentials`?
2. Confirm `/myself` as the validate check, or something else?
3. Confirm the Cloud/Data-Center fork with a written-only DC guide (question 3), or hold DC out of this phase entirely until Phase 5 exists?
