---
name: plan-before-code
description: Use before making ANY code change in this repo, including new features, edits, refactors, bug fixes, dependency changes, and config changes (server.js, utils/, public/*.html, package.json, .replit). Requires writing a plan into the plan/ folder, showing it to the user, and getting explicit approval before touching code. Not needed for read-only work.
---

# Plan before code

Never change code without an approved plan. This applies to every code update, however small. A small change gets a short plan, not no plan.

## What counts as a code update

Any create, edit, rename, or delete of a file that affects behavior: `server.js`, `index.js`, `utils/`, `public/*.html`, `package.json`, `.replit`, and other config. Adding or removing a dependency counts too.

A plan is **not** needed for reading or searching the code, for running the app without changing files, or for writing prose docs (`README.md`, `CLAUDE.md`, `TASKS.md`) and the plan files themselves.

## Steps

1. **Investigate read-only.** Read the relevant code first so the plan is specific. Change nothing yet.
2. **Ensure the plan folder exists.** Run `mkdir -p claude-plans` at the repo root. Create it if it is missing.
3. **Write the plan** to `claude-plans/<YYYY-MM-DD>-<short-slug>.md`, taking the date from `date +%F`. If a plan for the same task already exists, update it instead of creating a duplicate. Use the template below, with `Status: Draft`.
4. **Show the plan.** Put the plan in your reply and give the file path. For a long plan, show the summary, files to change, steps, and risks in full, and point to the file for the rest.
5. **Get permission.** Ask with AskUserQuestion, offering "Approve, implement as planned" and "Revise the plan". Then stop and wait for the answer.
   - Silence, an unrelated reply, or approval of an earlier or narrower plan is not permission.
   - If the user asks for changes, update the plan file, show it again, and re-ask.
   - On approval, set `Status: Approved` in the plan file.
6. **Implement only what the plan says.** If the plan turns out to be wrong or the scope grows (another file, a different approach, a new dependency), stop, update the plan file, and ask again before continuing.
7. **Close out.** Set `Status: Implemented`, add a `Deviations` note if anything differed from the plan, and report the verification results honestly, including anything you could not verify.

## Plan template

```markdown
# <Title>

- **Date:** YYYY-MM-DD
- **Status:** Draft | Approved | Implemented | Abandoned
- **Trigger:** <one line: what was asked>

## Goal
What should be true when this is done.

## Context
What you read and what you found, with file and line references.

## Proposed changes
| File | Change |
|---|---|

## Steps
1. Ordered, concrete steps.

## Risks and impact
What could break. In this repo, consider:
- the Cloud and Data Center branches of each route
- `server.js` versus the legacy `index.js`
- frontend code that is copy-pasted across `public/*.html`
- the stored credential and encryption format

## Verification
There is no test suite. Say how to check by hand (`npm start`, which page or endpoint, what result to expect) and what cannot be verified here, for example Data Center without a database.

## Open questions
Anything needing the user's decision before implementation.
```
