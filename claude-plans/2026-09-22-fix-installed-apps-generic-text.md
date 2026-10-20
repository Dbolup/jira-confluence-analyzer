# Fix: Installed Apps finding is generic and misleadingly mentions ScriptRunner

- **Date:** 2026-09-22
- **Status:** Implemented

## Verification performed

- `node --check` passes.
- Unit-verified all three cases against synthetic data: no scripting app detected (matches the real 4-app case reported), ScriptRunner detected, and zero apps. Confirmed the explanation only mentions ScriptRunner when one is actually found, and the summary always lists real app names instead of a bare count.
- Server restarts cleanly.
- **Trigger:** Real run shows "4 apps installed" with a static explanation that names ScriptRunner as an example even though it wasn't detected — reads as if ScriptRunner might be present when it isn't.

## Problem

Two issues in `checks/cloud/installedApps.js`:
1. `explanation` is a fixed string that always says "Apps that add scripting (like ScriptRunner)..." regardless of whether `scriptingApps.length > 0`. When no scripting app is found, naming ScriptRunner specifically is misleading.
2. The actual installed app names (already computed into `value.apps`) never reach the summary or explanation text — `discovery.html`'s `findingCard()` only renders `title`/`summary`/`explanation`/`recommendation`/`error`, not `value`. So the finding shows a bare count with no way to see which 4 apps they actually are, which is why it reads as generic.

## Change

In `checks/cloud/installedApps.js`:
- `summary`: include the actual app names, e.g. `"4 apps installed: AppA, AppB, AppC, AppD"` instead of just a count.
- `explanation`: branch on `scriptingApps.length > 0` — only mention ScriptRunner/scripting concerns when one was actually found; otherwise a shorter, generic-but-honest explanation with no scripting mention.

No change to `discovery.html` — putting the names in `summary` (already rendered) is enough, rather than adding a new UI element for `value`.

## Verification

Unit-check both branches (with and without a detected scripting app) against synthetic data, since no live site is available from here.
