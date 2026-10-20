#!/usr/bin/env node
// Standalone Data Center discovery runner. Prompts for DB connection details, runs the exact
// same checks/stats the web app runs for a Data Center source, and writes an HTML report —
// with nothing installed beforehand, nothing exposed over a network, and nothing sent anywhere
// except the one local database connection.
//
// __DC_RUNNER_VERSION__/__DC_RUNNER_COMMIT__ are substituted at build time via esbuild's
// --define (see scripts/build-dc-runner.sh); the typeof guards let this file also run directly
// with plain `node dc-runner/cli.js` during development, unbundled.
import { openDbConnection } from '../dbConnection.js';
import { buildReportHtml } from '../public/js/report.js';
import { runDiscoveryDc } from './runDiscovery.js';
import { promptAll } from './prompts.js';
import { explainConnectionError } from './connectionErrors.js';
import { wrapAsStandaloneHtml, writeReportFile } from './reportWriter.js';

const VERSION = typeof __DC_RUNNER_VERSION__ !== 'undefined' ? __DC_RUNNER_VERSION__ : 'dev';
const COMMIT = typeof __DC_RUNNER_COMMIT__ !== 'undefined' ? __DC_RUNNER_COMMIT__ : 'unknown';

function restoreTerminal() {
  if (process.stdin.isTTY) process.stdin.setRawMode(false);
}

function sanitizeForFilename(name) {
  return (name || 'report').replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 60) || 'report';
}

async function main() {
  if (process.argv.includes('--version') || process.argv.includes('-v')) {
    console.log(`dc-runner ${VERSION} (${COMMIT})`);
    return;
  }
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('dc-runner: runs Alluvium Discovery checks against a local Jira/Confluence Data Center database.');
    console.log('Usage: dc-runner            Run interactively (prompts for connection details).');
    console.log('       dc-runner --version   Print the version and build commit.');
    return;
  }

  console.log('Alluvium Discovery — Data Center runner');
  console.log(`v${VERSION} (${COMMIT})`);
  console.log('Runs entirely on this machine. Nothing is written to disk except the report file');
  console.log('below; nothing is sent anywhere except the database connection you provide.\n');

  const { source, preparedFor } = await promptAll();

  const startedAt = new Date().toISOString();
  let db;
  try {
    db = await openDbConnection(source);
  } catch (e) {
    console.error('\n✗ ' + explainConnectionError(e));
    process.exitCode = 1;
    return;
  }

  console.log('\nConnected. Running discovery checks...');
  let findings, jiraStats, confluenceStats;
  try {
    ({ findings, jiraStats, confluenceStats } = await runDiscoveryDc({ site: source, db }));
  } finally {
    await db.close();
  }

  const finishedAt = new Date().toISOString();
  const bodyHtml = buildReportHtml(findings, { site: source.name, startedAt, finishedAt, jiraStats, confluenceStats }, preparedFor);
  const fullHtml = wrapAsStandaloneHtml(bodyHtml, { title: `Discovery Report — ${source.name}` });

  const fileName = `discovery-report-${sanitizeForFilename(source.name)}-${finishedAt.slice(0, 10)}.html`;
  writeReportFile(fullHtml, fileName);

  const counts = findings.reduce((acc, f) => { acc[f.severity] = (acc[f.severity] || 0) + 1; return acc; }, {});
  console.log('\nDone.');
  console.log(`  critical: ${counts.critical || 0}  warning: ${counts.warning || 0}  unavailable: ${counts.unavailable || 0}  info: ${counts.info || 0}`);
  console.log(`\nReport written to: ${process.cwd()}/${fileName}`);
  console.log('Open it in any browser. Use your browser\'s Print → Save as PDF if you want a PDF.');
}

process.on('SIGINT', () => {
  restoreTerminal();
  console.log('\nCancelled.');
  process.exit(130);
});

main().catch((e) => {
  restoreTerminal();
  console.error('\nUnexpected error: ' + (e && e.message ? e.message : String(e)));
  process.exitCode = 1;
});
