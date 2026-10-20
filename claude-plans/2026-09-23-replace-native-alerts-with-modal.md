# Replace native alert()/confirm() with a shared modal

- **Date:** 2026-09-23
- **Status:** Implemented
- **Trigger:** "all alert being show in the app is a default browser alert - we need a modern modal alert"

## What was built

`public/js/modal.js` — a plain (non-module) shared script, unlike `public/js/report.js` (which is a module for testability). Its top-level `window.showAlert`/`window.showConfirm` assignments make them ordinary globals the moment the script loads, so every page just adds `<script src="/js/modal.js"></script>` and calls them directly — including from `onclick="..."` attributes — with none of the `window.x = x` bootstrap `report.js` needed.

- `showAlert(message)` → Promise, resolves on dismiss (OK, outside-click, or Escape).
- `showConfirm(message)` → Promise<boolean>, true for OK, false for Cancel/outside-click/Escape.

Styled to match the app's existing monochrome "DRFT" look (hard-edged offset shadow, sharp corners, matching `index.html`'s card-hover style) rather than adapting per page — including on `insights.html`, whose surrounding page uses a different, older purple-gradient theme; a consistent modern modal is still strictly better there than a native dialog.

Every `alert(...)` call site across all 7 pages that used one (`discovery.html`, `credentials.html`, `compare.html`, `confluence-compare.html`, `jira-stats.html`, `confluence-stats.html`, `insights.html`) became `showAlert(...)`. The one `confirm(...)` call (`credentials.html`'s `remove()`) became `async function remove(...) { if (!(await showConfirm(...))) return; ... }`, since its result gates whether the deletion proceeds — a real control-flow change, not just a rename.

## Verification performed

- Syntax-checked every touched page's inline script(s) after the change.
- **Executed the real `modal.js` functions** (not a description of them) against a DOM stub built to match real DOM semantics precisely — including catching and fixing my own stub bug along the way (a fake `innerHTML = ''` setter that didn't actually clear child nodes, unlike a real DOM, which produced a false failure until fixed). Confirmed: exactly one button for an alert vs. two for a confirm, correct button ordering and labels, clicking OK/Cancel resolves the promise with the right value, outside-click and Escape both dismiss via the "safe" (first) button, and the overlay correctly closes after resolution.
- Final sweep across every `.html`/`.js` file in the app confirmed zero remaining native `alert(`/`confirm(` calls.
- Restarted the server: all 10 routes/static files (8 pages + `report.js` + `modal.js`) return 200, `modal.js` is served with a script-compatible `Content-Type`, and the full test suite (51 tests) still passes unaffected.
