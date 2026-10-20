# Phase 3: PDF report

- **Date:** 2026-09-22
- **Status:** Implemented. Decisions: (1) client-side PDF library (`html2pdf.js` via CDN) for a true one-click download on `discovery.html`; (2) plain text wordmark branding ("ALLUVIUM"); (3) also fix the missing print CSS on the three existing `window.print()` pages (`compare.html`, `confluence-compare.html`, `insights.html`) — those keep `window.print()`, only `discovery.html` switches to the library.

## What was built

- `public/discovery.html` — added a "Prepared For" field; `render()` now builds a `#report-content` block (branding header, "Key Areas of Concern" sorted worst-first, "Detailed Findings" grouped by category) instead of a flat list; added `downloadPDF()` using `html2pdf.js` (loaded from cdnjs) targeting just `#report-content`, so the controls/button aren't captured in the PDF; added `@media print` CSS as a fallback for accidental Ctrl+P.
- `public/compare.html`, `public/confluence-compare.html` — added `@media print` CSS and `no-print` classes on the sidebar/input controls, so the existing "Print / PDF" button now prints only the results table.
- `public/insights.html` — same treatment, adapted to its step1/step2 structure (its own `.step`/`.active` toggle already hides step1 on screen; `no-print` additionally keeps the two step2 action buttons out of the printed/PDF output).

## Deviation from the plan

Also fixed a latent, unrelated fragility while touching this code: `runDiscovery()` found its button via `document.querySelector('.btn')`, which was fine when there was only one `.btn` on the page — but the new "Download PDF" button also uses that class, so the selector would have silently grabbed the wrong element if the DOM order ever changed. Gave the Run button an explicit `id="run-btn"` instead. Small, in the same file already being edited, not a scope change.

## Verification performed

- `node --check` on `server.js` (untouched by this phase, confirmed still fine) and on the extracted inline `<script>` from `discovery.html`.
- Confirmed the `html2pdf.js` CDN URL actually resolves (200, correct `application/javascript` content-type) rather than assuming the version pin is valid.
- Server restart; `/`, `/discovery`, `/compare`, `/confluence-compare`, `/insights` all return 200.
- **Executed the real `render()` function** (not just read it) against synthetic findings covering all four severities, using a minimal DOM stub — confirmed: the report wrapper, brand, and "Prepared for" value all appear; exactly the critical/warning/unavailable findings land in the concerns section; all findings appear in the detail section; the download button is present; and every `<div>` has a matching `</div>` (no broken nesting).
- **Not verified:** the actual PDF output (font rendering, page breaks, image quality) — that needs a real browser, which isn't available here. Also not verified: real report content, since it depends on Phase 2's checks running against a live Cloud site, which hasn't happened yet.
- **Trigger:** "now to phase 3" — the P1 items in [TASKS.md](../TASKS.md#phase-3-pdf-report-p1)

## Goal

Turn Phase 2's raw findings into the report Wale described on the call: a summary of key areas of concern, then a detail section per item covering what it contains, why it matters, and the specifics — exportable as a PDF.

## What's missing that Phase 1/2 didn't have to deal with

Phase 3's own TASKS.md line says to design the template "from the Presidio sample" — that PDF was never provided to me (Phase 0 already flagged getting it as an open item, and it's still open). So the layout below is my best reconstruction from Wale's description on the call, not a copy of a reference I've actually seen. Worth getting the real sample before this goes anywhere near a customer.

## Proposed approach

**Build on `discovery.html`, don't fork a new page.** It already has the source picker, the run flow, and per-finding rendering (title, severity, summary, explanation, recommendation) from Phase 2. Phase 3 upgrades its `render()` output into an actual report rather than a flat debug list, and adds print/export on top. A separate `report.html` would just duplicate the source-picker/run logic Phase 2 already built.

**Report structure** (my reconstruction of what Wale described, not a copy of the Presidio sample):
1. **Header** — plain-text branding (see open question below), a "Prepared for" field (new input on the page), the site domain, and the run date.
2. **Key Areas of Concern** — every finding with severity `critical`, `warning`, or `unavailable` (an unavailable check is itself a concern — "we couldn't determine this"), sorted worst-first. Condensed: title, severity, one-line summary, recommendation.
3. **Detailed Findings** — every finding, grouped by category, in the fuller format `discovery.html` already renders (title, severity, summary, explanation, recommendation, error if any). This is "what each item contains, why it matters, the detail" from the call.

**Getting it out as a PDF — this is the real decision, two options:**

| | Browser print (`window.print()` + `@media print` CSS) | Client-side PDF library (e.g. `html2pdf.js` via CDN) |
|---|---|---|
| Matches existing pattern | Yes — `compare.html`/`confluence-compare.html`/`insights.html` all already have a "Print / PDF" button doing exactly this | No — new pattern |
| New dependencies | None | One CDN script tag, no npm package |
| Result | User picks "Save as PDF" in their OS print dialog — one extra click, not fully automatic | True one-click download of an actual `.pdf` file |
| Rendering fidelity | Exact — it's the real browser rendering the real page | A second rendering engine (html2canvas-based) can render fonts/spacing slightly differently than the live page |
| Effort | Small — `@media print` rules to hide the sidebar/controls, matching what's already there | Slightly more — load the library, call it, handle multi-page pagination |

None of the three existing "Print / PDF" buttons have any `@media print` CSS behind them (confirmed — there's zero print CSS anywhere in this codebase today), so right now they'd print the sidebar and controls along with the content. I'd fix that as part of this work regardless of which option is chosen.

**My recommendation:** browser print. It matches the codebase's existing convention exactly, needs no new dependency, and TASKS.md's "download button" wording is satisfied well enough by "click Print, choose Save as PDF" for a v1 — but this is a real trade-off (one extra click vs. a true one-click file), so I'm asking rather than assuming.

## Open questions

1. **PDF method:** browser print (recommended) or a client-side PDF library for a true one-click download?
2. **Branding:** there's no Alluvium logo or color palette anywhere in this codebase (the current UI's "DRFT" wordmark looks like a placeholder/codename, not real branding). I'd use plain text — e.g. "ALLUVIUM — Instance Discovery Report" — unless you can point me at real brand assets to use instead.
3. **Should the existing three "Print / PDF" buttons** (`compare.html`, `confluence-compare.html`, `insights.html`) get the same print-CSS fix while I'm touching this pattern, or leave them as-is since they weren't asked for?

## Files

- `public/discovery.html` — add a "Prepared for" input, restructure `render()` into the three-section report layout above, add print-specific CSS, add the export button.
- `public/compare.html`, `public/confluence-compare.html`, `public/insights.html` — only if question 3 says yes.

## Verification

No real discovery findings available (Phase 2's checks are unverified against a live site — see that phase's plan). I can verify the report layout renders correctly using the same synthetic-finding technique from Phase 2's unit checks, and verify the print CSS by inspecting the print preview. I can't verify against real, customer-shaped data until Phase 2's checks are run against an actual Cloud site.
