import fetch from 'node-fetch';

// PROVISIONAL — 30% archived is not a confirmed Alluvium threshold, just a reasonable line to
// start flagging with pending real guidance.
const ARCHIVED_WARNING_RATIO = 0.3;

export default async function archivedPersonalSpaces({ headers, confluenceBaseUrl }) {
  const r = await fetch(`${confluenceBaseUrl}/space?limit=500`, { headers });
  if (!r.ok) throw new Error(`space ${r.status} ${r.statusText}`);
  const data = await r.json();
  const spaces = data.results || [];

  const total = spaces.length;
  const archived = spaces.filter((s) => s.status === 'archived').length;
  const personal = spaces.filter((s) => s.type === 'personal').length;

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
