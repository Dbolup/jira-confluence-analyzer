 HEAD
# Jira Analyzer

A tool for inspecting, comparing, and running automated discovery against Jira/Confluence Cloud sites and Jira/Confluence Data Center instances — project counts, schemes, fields, workflows, spaces, installed apps, and more.

## Requirements

- Node.js 18+ (uses native `fetch` polyfill via `node-fetch`, ES modules)
- npm
- Running the test suite needs a Node version with `node:test` module-mocking support (verified working on Node 24; the flag is `--experimental-test-module-mocks`)

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. (Optional) Set an encryption key used to encrypt credentials before they're stored in the browser's `localStorage`:

   Create a `.env` file in the project root:

   ```
   ENCRYPTION_KEY=some-32-character-secret-key-here
   PORT=3000
   ```

   If `ENCRYPTION_KEY` is not set, a default development key is used and the server logs a warning on startup — fine for local use, but set your own before running this anywhere persistent.

3. Start the server:

   ```bash
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Running the tests

```bash
npm test
```

Runs Node's built-in test runner (`node --test`) over every `*.test.js` file — no new dependency added for this. Covers the discovery check logic (`checks/cloud/*.js`, `checks/dc/*.js`), the check registry/orchestrator (`checks/registry.js`), and report generation (`public/js/report.js`). There's no test coverage for the older stats/compare pages' inline scripts.

## Connecting to Jira/Confluence

From the **Credentials** page in the app you can configure two kinds of sources:

- **Cloud sites** — add your Atlassian domain, email, and an [API token](https://id.atlassian.com/manage-profile/security/api-tokens). Credentials are encrypted client-side via the server's `/api/encrypt` endpoint and stored in your browser's `localStorage`; they are never persisted server-side.
- **Data Center connections** — connect directly to your Jira/Confluence Data Center's PostgreSQL or MySQL database (read-only queries). Use a read-only database user if your database supports it. Oracle and MSSQL are not supported yet.

### Reaching a local Data Center database

This app runs locally, so if your Data Center database is also local, you can connect to it directly (`localhost`) without a tunnel.

If instead you're running the app elsewhere (e.g. a hosted deployment) and need to reach a database on your local machine, expose it with a free tunnel via [Pinggy](https://pinggy.io):

```bash
ssh -p 443 -R0:localhost:5432 tcp@a.pinggy.io   # PostgreSQL
ssh -p 443 -R0:localhost:3306 tcp@a.pinggy.io   # MySQL
```

Pinggy will print a TCP link like `tcp://tcp.free.pinggy.link:43215`. Use `tcp.free.pinggy.link` as the Host and `43215` as the Port in the Data Center connection form.

## Discovery

The **Discovery** page runs an automated set of checks against a Cloud or Data Center source and produces a report: a summary of key areas of concern, then a detailed finding per check. It walks through four steps — Connect, Validate, Run, and Review & Export — and can save the result as a PDF (generated entirely in the browser).

Cloud discovery covers 6 checks: custom field & issue type volume vs. user count, custom field duplicates & metrics (duplicate names, how many fields are redundant, a by-type breakdown, and — on Cloud only, best-effort — fields on no screen / in no context / unchanged for a year), workflows referencing custom fields, installed apps (flagging scripting apps like ScriptRunner), archived/personal Confluence spaces, and inactive projects. Data Center supports the same 6 checks on Postgres and MySQL (without the Cloud-only usage metrics), with one caveat: the **Installed Apps** check on Data Center is a best-effort approximation (there's no equivalent to Cloud's installed-apps API), so treat its result as a starting point, not a confirmed list — every other check's severity thresholds are provisional placeholders pending real guidance, not confirmed methodology.

Nothing from a discovery run is persisted server-side — findings exist only in that one HTTP response, then in the browser (memory, and the PDF you choose to save).

## Available pages

| Route | Description |
|---|---|
| `/` | Home |
| `/jira-stats` | Jira site stats |
| `/compare` | Jira project comparison |
| `/insights` | Insights (legacy; superseded by Discovery for Cloud) |
| `/confluence-stats` | Confluence site stats |
| `/confluence-compare` | Confluence space comparison |
| `/credentials` | Manage Cloud/Data Center credentials |
| `/discovery` | Automated discovery: Connect → Validate → Run → Review & Export |
=======
# jira-confluence-analyzer
Standalone Jira and Confluence discovery app
 4e71907a3930986cf4ea9cf8dc567b3d7b2000a4
