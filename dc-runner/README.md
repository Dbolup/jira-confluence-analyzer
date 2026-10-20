# Alluvium Discovery — Data Center Runner

A single, self-contained program that runs the same discovery checks Alluvium's hosted tool runs for Jira/Confluence Data Center — but entirely on your own server, against your own database, with nothing exposed to the internet.

## What it does

1. Asks you for your database connection details (host, port, database name, user, password).
2. Connects to your database directly — this connection never leaves your machine/network.
3. Runs a set of read-only checks (custom field counts, workflow references, installed apps, Confluence space counts, project activity).
4. Writes a report as a single HTML file you can open in any browser.

## What it does *not* do

- It does not install anything, or need anything pre-installed. You don't need Node.js, npm, or any other software on this machine — the program is fully self-contained.
- It does not write anything to disk except the one report file it tells you about at the end.
- It does not send anything anywhere except the one database connection you provide. It makes no other network calls of any kind.
- It does not need internet access. It only needs to reach the database you point it at.

## How to run it

1. Copy `dc-runner-linux-x64` (and, if you'd like to review the source first — see below) to the server that can reach your Jira/Confluence Data Center database.
2. Make it executable and run it:
   ```bash
   chmod +x dc-runner-linux-x64
   ./dc-runner-linux-x64
   ```
3. Answer the prompts. We recommend using a **read-only database user** if your database supports creating one.
4. When it finishes, it prints the path to the report file it created (e.g. `discovery-report-yourcompany-2026-09-24.html`). Copy that file wherever you'd like and open it in any browser.

Run `./dc-runner-linux-x64 --version` to see the exact build version, or `--help` for a summary of the above.

## Reviewing the source first

Alongside the binary, we provide `dc-runner-source.tar.gz` — the plain, unminified source code that was compiled into the binary you're running, and a `SHA256SUMS` file so you can verify both files haven't been altered. Your security team is welcome (and encouraged) to review this before running the binary against your production database. The `--version` output includes the exact commit the binary was built from, so you can confirm it matches the source you reviewed.

## Questions

If anything here doesn't match what actually happens when you run it, please tell us — that's a bug in this tool, not something to just work around.
