// PROVISIONAL — 180 days is not a confirmed Alluvium threshold, matching the Cloud version.
const INACTIVITY_DAYS = 180;

export default async function inactiveProjects({ db }) {
  // LEFT JOIN so a project with zero issues still appears (with a null last_update), rather than
  // silently disappearing from the result set. Grouping by p.pkey (the only non-aggregate
  // selected column) is valid under MySQL's default ONLY_FULL_GROUP_BY mode and standard Postgres.
  // On a large instance (millions of issues) this can be slow — the registry's existing 30s
  // per-check timeout is the safety net, not a new mechanism built for this.
  const rows = await db.query(`
    SELECT p.pkey as pkey, MAX(i.updated) as last_update
    FROM project p
    LEFT JOIN jiraissue i ON i.project = p.id
    GROUP BY p.pkey
  `);

  const cutoff = Date.now() - INACTIVITY_DAYS * 24 * 60 * 60 * 1000;
  const inactive = rows.filter((r) => {
    if (!r.last_update) return true; // no issues at all reads as inactive
    return new Date(r.last_update).getTime() < cutoff;
  });

  const severity = inactive.length > 0 ? 'warning' : 'info';

  return {
    id: 'inactive-projects',
    category: 'Projects',
    title: 'Inactive Projects',
    severity,
    value: {
      totalProjects: rows.length,
      inactiveProjects: inactive.length,
      thresholdDays: INACTIVITY_DAYS,
      projects: inactive.map((r) => r.pkey),
    },
    summary: `${inactive.length} of ${rows.length} projects with no issue activity in ${INACTIVITY_DAYS}+ days`,
    explanation:
      '180 days is a provisional line, not a confirmed Alluvium threshold. Projects with no recent activity are candidates to archive, exclude from migration scope, or confirm with the customer before spending migration effort on them.',
    recommendation:
      inactive.length > 0 ? 'Confirm with the customer which inactive projects still need to migrate.' : null,
    error: null,
  };
}
