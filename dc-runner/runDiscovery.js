// Pure orchestration: {site, db} -> {findings, jiraStats, confluenceStats}. A direct port of
// server.js's /api/discovery/run DC branch, reusing checks/registry.js and stats.js unchanged.
// Does NOT call db.close() — the caller (cli.js) owns that lifecycle, exactly like server.js's
// own try/finally around the same call.
import { runChecks } from '../checks/registry.js';
import { computeJiraStatsDc, computeConfluenceStatsDc } from '../stats.js';

export async function runDiscoveryDc({ site, db }) {
  // Only { name, type } is passed into the checks' ctx — every checks/dc/*.js file only ever
  // destructures { db }, so nothing is lost, and this keeps a plaintext DB config from flowing
  // into an object that gets passed around beyond where it's strictly needed.
  const reducedSite = { name: site.name, type: site.type };

  const [findings, jiraStats, confluenceStats] = await Promise.all([
    runChecks('dc', { site: reducedSite, db }),
    computeJiraStatsDc({ name: site.name, query: db.query }).catch((e) => ({ error: e.message })),
    computeConfluenceStatsDc({ name: site.name, query: db.query }).catch((e) => ({ error: e.message })),
  ]);

  return { findings, jiraStats, confluenceStats };
}
