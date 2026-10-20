// PROVISIONAL thresholds — kept identical to checks/cloud/customFieldVolume.js by hand (no shared
// constants module yet). If these change, update both files.
const WARN_PER_USER = 2;
const CRITICAL_PER_USER = 5;

export default async function customFieldVolume({ db }) {
  const [cfRows, itRows, userRows] = await Promise.all([
    // The customfield table is custom-fields-only by nature on DC (unlike Cloud's /field REST
    // endpoint, which mixes system and custom fields) — no filtering needed here.
    db.query('SELECT count(*) as cnt FROM customfield'),
    db.query('SELECT count(*) as cnt FROM issuetype'),
    // cwd_user is the shared identity-store table already used elsewhere in this app (lead-name
    // and space-owner lookups). Caveat: an instance with multiple user directories (e.g. internal
    // + LDAP/AD) may have this over- or under-count actual licensed users.
    db.query('SELECT count(*) as cnt FROM cwd_user WHERE active = 1'),
  ]);

  const customFieldCount = Number(cfRows[0]?.cnt ?? 0);
  const issueTypeCount = Number(itRows[0]?.cnt ?? 0);
  const userCount = userRows[0]?.cnt != null ? Number(userRows[0].cnt) : null;

  const ratio = userCount && userCount > 0 ? +(customFieldCount / userCount).toFixed(1) : null;

  let severity = 'info';
  if (ratio !== null) {
    if (ratio >= CRITICAL_PER_USER) severity = 'critical';
    else if (ratio > WARN_PER_USER) severity = 'warning';
  }

  const summaryParts = [`${customFieldCount} custom fields`, `${issueTypeCount} issue types`];
  summaryParts.push(userCount !== null ? `~${userCount} active users (${ratio}/user)` : 'user count unavailable');

  return {
    id: 'custom-field-volume',
    category: 'Fields',
    title: 'Custom Field & Issue Type Volume',
    severity,
    value: { customFieldCount, issueTypeCount, userCount, ratio },
    summary: summaryParts.join(', '),
    explanation:
      "A high number of custom fields or issue types relative to the user base usually means years of one-off requests were never consolidated. Each one adds cost to every future migration, workflow change, and screen configuration. User count is read from cwd_user (active=1); an instance with multiple user directories may not match your licensed user count exactly. (Thresholds are provisional, matching the Cloud version — pending Alluvium's own confirmed guidance.)",
    recommendation:
      severity === 'info'
        ? null
        : 'Review custom fields for duplicates or fields no longer used by any workflow/screen, and consider consolidating before migrating.',
    error: null,
  };
}
