import fetch from 'node-fetch';

// PROVISIONAL — 180 days is not a confirmed Alluvium threshold, just a reasonable line to
// start flagging with pending real guidance.
const INACTIVITY_DAYS = 180;

export default async function inactiveProjects({ headers, jiraBaseUrl }) {
  let startAt = 0;
  const maxResults = 50;
  const projects = [];

  while (true) {
    const r = await fetch(
      `${jiraBaseUrl}/project/search?expand=insight&startAt=${startAt}&maxResults=${maxResults}`,
      { headers }
    );
    if (!r.ok) throw new Error(`project/search ${r.status} ${r.statusText}`);
    const page = await r.json();
    const values = page.values || [];
    projects.push(...values);
    if (page.isLast || values.length < maxResults) break;
    startAt += maxResults;
  }

  const cutoff = Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000;
  const inactive = projects.filter((p) => {
    const last = p.insight?.lastIssueUpdateTime;
    if (!last) return true; // no activity data at all reads as inactive
    return new Date(last).getTime() < cutoff;
  });

  const severity = inactive.length > 0 ? 'warning' : 'info';

  return {
    id: 'inactive-projects',
    category: 'Projects',
    title: 'Inactive Projects',
    severity,
    value: {
      totalProjects: projects.length,
      inactiveProjects: inactive.length,
      thresholdDays: INACTIVITY_DAYS,
      projects: inactive.map((p) => p.key),
    },
    summary: `${inactive.length} of ${projects.length} projects with no issue activity in ${INACTIVITY_DAYS}+ days`,
    explanation:
      '180 days is a provisional line, not a confirmed Alluvium threshold. Projects with no recent activity are candidates to archive, exclude from migration scope, or confirm with the customer before spending migration effort on them.',
    recommendation:
      inactive.length > 0 ? 'Confirm with the customer which inactive projects still need to migrate.' : null,
    error: null,
  };
}
