# Discovery App: Task List

## Context

Goal: extend this app from resource counts and migration testing into a **pre-sales discovery / health-check tool**. It should connect to a prospect's Jira/Confluence (Cloud or Data Center), run the checks a migration engineer would normally do over several weeks, and produce a **PDF report**: a summary of key concerns, then a section per scheme/item examined (what it contains, why it matters, the detail).

Source: the call in `App update call.txt`. Wale Olojo made the request and wants a first version **next week**. Azeez Aremu's team takes ownership, and Babs Adewole (author of the current app) supports.

Tags: **[call]** was requested or agreed on the call. **[proposed]** comes from reading the code or is a suggestion, so confirm it before committing.

Suggested v1 scope **[proposed]**: Cloud first. The Cloud path needs no database exposure, NDA change, or per-dialect SQL, so it is the realistic path to a demo-able PDF next week. Wale said both Cloud and DC are needed, so get their agreement on this cut.

## Phase 0: Inputs and decisions (P0, start now)

- [ ] Get Babs's repo link, written guide, and the queries/scripts behind the existing checks. Confirm this repo is the latest version. **[call]**
- [ ] Get Wale's shared Assess-phase runbook link and the Presidio/Expedia sample PDF. These define the check list and the report layout. **[call]**
- [ ] Confirm what "app assessments" covers. Babs said it is where most of the discovery work goes; it likely means installed third-party apps and their Cloud readiness. Also confirm where that data comes from on Cloud and on DC. **[call]**
- [ ] Get sign-off on the Cloud-first v1 cut. **[proposed]**
- [ ] Get thresholds for what counts as unhealthy. The call only gave examples (about 2,000 custom fields for 200 users; about 4,000 for 800). **[call]**

## Phase 1: Fix the foundations (P0)

A customer-facing report can't rest on these.

- [ ] Replace silent zeros. The DC `count()` helper in `server.js` and the Cloud `safe()` wrapper turn query/API failures into `0`. A report would show "0 workflows" when the query actually failed. Add an explicit "unavailable" state. **[proposed]**
- [ ] Fix the DC source `type` vs `typeDB` mismatch on `compare.html` and `confluence-compare.html`. The compare features must keep working because they are used for migration testing. **[call]**
- [ ] Parameterize the SQL in the DC compare routes that interpolate project and space keys. **[proposed]**
- [ ] Point `.replit` (entrypoint and deployment `run`) at `server.js`, and decide whether to delete the legacy `index.js` and `utils/`. **[proposed]**
- [ ] Load `.env` in `server.js`, or correct the README. It is currently not read by `npm start`. **[proposed]**
- [ ] Fix or remove `insights.html`, which reads a legacy `atlassianGlobalCreds` key that nothing writes. **[proposed]**
- [ ] Review the Cloud endpoints used for pagination limits and deprecation, since discovery will hit large instances. **[proposed]**

## Phase 2: Discovery engine, Cloud first (P1)

- [ ] Define one shared "finding" shape (category, title, value, severity, explanation, recommendation) used by both the UI and the PDF. **[proposed]**
- [ ] Add a registry of checks so new ones don't keep growing `server.js`, with a slot for a DC implementation of each. **[proposed]**
- [ ] Implement the checks named on the call. **[call]**
  - [ ] Custom scripts
  - [ ] Workflows that use custom fields
  - [ ] Custom field and issue type volume against user count
  - [ ] Installed apps and their Cloud readiness
- [ ] Add further checks after validating them against Wale's runbook. **[proposed]**
  - [ ] Unused or duplicate schemes, fields, and workflows
  - [ ] Inactive users and projects
  - [ ] Archived and personal Confluence spaces
  - [ ] Large attachments
  - [ ] Unsupported macros
- [ ] Write recommendation text per finding, such as consolidating custom fields or reducing issue types. **[call]**
- [ ] Handle long runs with progress, timeouts, and partial results. Discovery will take much longer than the current count endpoints. **[proposed]**

## Phase 3: PDF report (P1)

- [ ] Design the template from the Presidio sample: key-concerns summary, then a per-item section covering what it contains, why it matters, and the detail. **[call]**
- [ ] Decide where the PDF is generated (server or browser), then add the library. **[proposed]**
- [ ] Add a report preview page and a download button. **[proposed]**
- [ ] Add branding and a "prepared for <prospect>" header. **[proposed]**

## Phase 4: Guided experience (P2)

- [ ] Build a step-by-step flow: connect, validate, run, review, export. **[call]**
- [ ] Add per-step instructions for novices, such as creating an API token and a read-only DB user. The home page already has DB connection instructions to reuse. **[call]**
- [ ] Write the Cloud→Cloud and DC→Cloud runbooks at the copy-and-paste level Wale described. **[call]**
- [ ] Keep the existing counts, compare, and stats pages working. They serve migration testing. **[call]**

## Phase 5: Data Center support (P2)

- [ ] Implement each check for DC on Postgres and MySQL. **[call]**
- [ ] Add Oracle and MSSQL support, which needs dialect handling and drivers. Babs already plans this. **[call]**
- [ ] Tighten DB handling: connection reuse and cleanup, timeouts, and a read-only user requirement. **[proposed]**
- [ ] Build a self-contained runner (Yusuf's suggestion) that executes on the client's machine, so the DB is never exposed to the internet. Decide on packaging, such as an executable or Docker. **[call]**
- [ ] Ask Wale to add the NDA clause covering network-sensitive tooling. This isn't code, but it gates hosted DC use. **[call]**

## Phase 6: Housekeeping (P3)

- [ ] Add tests for the check logic and report generation, since none exist. **[proposed]**
- [ ] Update `README.md` and `CLAUDE.md` to match the new structure. **[proposed]**
- [ ] Use a per-deployment `ENCRYPTION_KEY`, and review what a report exposes about a prospect's instance. **[proposed]**

## Open questions

- What is the full check list? The call gave only examples.
- Does "guide" mean in-app step-by-step UX, documentation, or both?
- The transcript is garbled in places and needs checking with the attendees: "Azure team" (which team takes the handover), "Adela" (who joins the follow-up session), "Taiwan and Mark" (presumably marketing the offer), and "next year" (likely "next week").
- At 16:30–16:50, the ownership is stated ambiguously. Wale's later ask is that Azeez's team owns it, with Babs helping.
