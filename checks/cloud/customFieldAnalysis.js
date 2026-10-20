import fetch from 'node-fetch';
import { buildCustomFieldFinding, summarizeUsage } from '../customFieldGrouping.js';

const PAGE_SIZE = 100;
const MAX_PAGES = 100; // safety cap: 10,000 custom fields

// UNVERIFIED AGAINST A REAL SITE. GET /field/search with expand=screensCount,contextsCount,
// lastUsed is documented in Atlassian's "Get fields paginated" reference (a missing count means
// 0), but hasn't been run against a live site from here — a real first run may need a fix, the
// same way the installed-apps check did. Failure is contained: the duplicate/type results
// below don't depend on it, so a failure here only adds an `error` note to the finding.
async function fetchUsageSummary(jiraBaseUrl, headers) {
  const values = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const r = await fetch(
      `${jiraBaseUrl}/field/search?type=custom&expand=screensCount,contextsCount,lastUsed&maxResults=${PAGE_SIZE}&startAt=${page * PAGE_SIZE}`,
      { headers }
    );
    if (!r.ok) throw new Error(`field/search ${r.status} ${r.statusText}`);
    const data = await r.json();
    const batch = data.values || [];
    values.push(...batch);
    if (data.isLast || batch.length < PAGE_SIZE) break;
  }
  return summarizeUsage(values);
}

export default async function customFieldAnalysis({ headers, jiraBaseUrl }) {
  // Names and types come from the same /field call custom-field-volume already makes — no new
  // permission needed for the duplicate/type analysis itself.
  const r = await fetch(`${jiraBaseUrl}/field`, { headers });
  if (!r.ok) throw new Error(`field ${r.status} ${r.statusText}`);
  const all = await r.json();
  const fields = all
    .filter((f) => f.custom)
    .map((f) => ({ id: f.id, name: f.name, type: f.schema?.custom || f.schema?.type || null }));

  let usage = null;
  let error = null;
  try {
    usage = await fetchUsageSummary(jiraBaseUrl, headers);
  } catch (e) {
    error = `Usage metrics unavailable (${e.message}); duplicate and type results are unaffected.`;
  }

  return buildCustomFieldFinding({ fields, usage, error });
}
