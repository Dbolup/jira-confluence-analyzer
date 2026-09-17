# Jira Analyzer

A tool for inspecting and comparing Jira/Confluence Cloud sites and Jira/Confluence Data Center instances — project counts, schemes, fields, workflows, spaces, and more.

## Requirements

- Node.js 18+ (uses native `fetch` polyfill via `node-fetch`, ES modules)
- npm

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

   If `ENCRYPTION_KEY` is not set, a default development key is used — fine for local use, but you should set your own if you plan to keep this running anywhere persistent.

3. Start the server:

   ```bash
   npm start
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Connecting to Jira/Confluence

From the **Credentials** page in the app you can configure two kinds of sources:

- **Cloud sites** — add your Atlassian domain, email, and an [API token](https://id.atlassian.com/manage-profile/security/api-tokens). Credentials are encrypted client-side via the server's `/api/encrypt` endpoint and stored in your browser's `localStorage`; they are never persisted server-side.
- **Data Center connections** — connect directly to your Jira/Confluence Data Center's PostgreSQL or MySQL database (read-only queries).

### Reaching a local Data Center database

This app runs locally, so if your Data Center database is also local, you can connect to it directly (`localhost`) without a tunnel.

If instead you're running the app elsewhere (e.g. a hosted deployment) and need to reach a database on your local machine, expose it with a free tunnel via [Pinggy](https://pinggy.io):

```bash
ssh -p 443 -R0:localhost:5432 tcp@a.pinggy.io   # PostgreSQL
ssh -p 443 -R0:localhost:3306 tcp@a.pinggy.io   # MySQL
```

Pinggy will print a TCP link like `tcp://tcp.free.pinggy.link:43215`. Use `tcp.free.pinggy.link` as the Host and `43215` as the Port in the Data Center connection form.

## Available pages

| Route | Description |
|---|---|
| `/` | Home |
| `/jira-stats` | Jira site stats |
| `/compare` | Jira project comparison |
| `/insights` | Insights |
| `/confluence-stats` | Confluence site stats |
| `/confluence-compare` | Confluence space comparison |
| `/credentials` | Manage Cloud/Data Center credentials |
