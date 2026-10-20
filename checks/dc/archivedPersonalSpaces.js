// PROVISIONAL — 30% archived is not a confirmed Alluvium threshold, matching the Cloud version.
const ARCHIVED_WARNING_RATIO = 0.3;

export default async function archivedPersonalSpaces({ db }) {
  // Reuses the exact query pattern already proven in /api/confluence/stats' DC branch
  // (server.js), not a new guess.
  const [currentRows, globalRows, personalRows, archivedRows] = await Promise.all([
    db.query("SELECT count(*) as cnt FROM spaces WHERE spacestatus = 'CURRENT' OR spacestatus IS NULL"),
    db.query("SELECT count(*) as cnt FROM spaces WHERE spacetype = 'global' AND (spacestatus = 'CURRENT' OR spacestatus IS NULL)"),
    db.query("SELECT count(*) as cnt FROM spaces WHERE spacetype = 'personal' AND (spacestatus = 'CURRENT' OR spacestatus IS NULL)"),
    db.query("SELECT count(*) as cnt FROM spaces WHERE spacestatus = 'ARCHIVED'"),
  ]);

  const current = Number(currentRows[0]?.cnt ?? 0);
  const personal = Number(personalRows[0]?.cnt ?? 0);
  const archived = Number(archivedRows[0]?.cnt ?? 0);
  // "total" here means all spaces (current + archived), to match the Cloud check's definition —
  // not /api/confluence/stats' DC "total", which deliberately excludes archived spaces.
  const total = current + archived;

  const severity = total > 0 && archived / total > ARCHIVED_WARNING_RATIO ? 'warning' : 'info';

  return {
    id: 'archived-personal-spaces',
    category: 'Confluence',
    title: 'Archived & Personal Spaces',
    severity,
    value: { total, archived, personal },
    summary: `${archived} archived and ${personal} personal spaces out of ${total} total`,
    explanation:
      "Archived spaces are usually safe to exclude from a migration or move last; a large personal-space count often means a lot of content nobody but its owner maintains. Both are common places to trim scope and cost from a migration. (30% archived is a provisional line for flagging this, not a confirmed Alluvium threshold.)",
    recommendation:
      severity === 'warning'
        ? 'Confirm with the customer whether archived spaces need to migrate at all, or can be exported and left behind.'
        : null,
    error: null,
  };
}
