// Discovery check registry.
//
// Every check returns a "finding":
//   {
//     id, category, title,
//     severity: 'info' | 'warning' | 'critical' | 'unavailable',
//     value,              // raw numbers/data behind the finding
//     summary,            // one-line human summary
//     explanation,        // why this matters
//     recommendation,     // what to do about it, or null
//     error               // set when something didn't fully work; paired with severity
//                         // 'unavailable' when NOTHING useful came out of the check,
//                         // but can also be set alongside a real severity when a check
//                         // partially degraded (e.g. got counts but not a ratio).
//   }
//
// A check is { id, category, title, cloud: runFn, dc: runFn|null }.
//
// Cloud checks receive { site, headers, jiraBaseUrl, confluenceBaseUrl }.
// DC checks receive { site, db } — db.query(sql, params) / db.close() is a connection shared
// across every DC check in one discovery run (see server.js's /api/discovery/run), not a fresh
// connection per query the way the rest of this app's DC routes work.

import customFieldVolume from './cloud/customFieldVolume.js';
import customFieldAnalysis from './cloud/customFieldAnalysis.js';
import workflowCustomFields from './cloud/workflowCustomFields.js';
import installedApps from './cloud/installedApps.js';
import archivedPersonalSpaces from './cloud/archivedPersonalSpaces.js';
import inactiveProjects from './cloud/inactiveProjects.js';

import customFieldVolumeDc from './dc/customFieldVolume.js';
import customFieldAnalysisDc from './dc/customFieldAnalysis.js';
import workflowCustomFieldsDc from './dc/workflowCustomFields.js';
import installedAppsDc from './dc/installedApps.js';
import archivedPersonalSpacesDc from './dc/archivedPersonalSpaces.js';
import inactiveProjectsDc from './dc/inactiveProjects.js';

const CHECK_TIMEOUT_MS = 30000;

export const registry = [
  { id: 'custom-field-volume', category: 'Fields', title: 'Custom Field & Issue Type Volume', cloud: customFieldVolume, dc: customFieldVolumeDc },
  { id: 'custom-field-analysis', category: 'Fields', title: 'Custom Field Duplicates & Metrics', cloud: customFieldAnalysis, dc: customFieldAnalysisDc },
  { id: 'workflow-custom-fields', category: 'Workflows', title: 'Workflows Referencing Custom Fields', cloud: workflowCustomFields, dc: workflowCustomFieldsDc },
  { id: 'installed-apps', category: 'Apps', title: 'Installed Apps', cloud: installedApps, dc: installedAppsDc },
  { id: 'archived-personal-spaces', category: 'Confluence', title: 'Archived & Personal Spaces', cloud: archivedPersonalSpaces, dc: archivedPersonalSpacesDc },
  { id: 'inactive-projects', category: 'Projects', title: 'Inactive Projects', cloud: inactiveProjects, dc: inactiveProjectsDc },
];

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function unavailableFinding(check, error) {
  return {
    id: check.id,
    category: check.category,
    title: check.title,
    severity: 'unavailable',
    value: null,
    summary: 'Could not be determined.',
    explanation: '',
    recommendation: null,
    error: error?.message || String(error),
  };
}

// Runs every check registered for `type` ('cloud' or 'dc') against the same context,
// in parallel. A check that throws or times out becomes an 'unavailable' finding rather
// than failing the whole run.
export async function runChecks(type, ctx) {
  const applicable = registry.filter((c) => c[type]);
  const settled = await Promise.allSettled(
    applicable.map((c) => withTimeout(c[type](ctx), CHECK_TIMEOUT_MS, c.id))
  );
  return settled.map((result, i) => {
    const check = applicable[i];
    return result.status === 'fulfilled' ? result.value : unavailableFinding(check, result.reason);
  });
}
