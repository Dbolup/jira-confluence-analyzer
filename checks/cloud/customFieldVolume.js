import fetch from 'node-fetch';

// PROVISIONAL — no confirmed threshold exists yet (Phase 0 of TASKS.md is still waiting on
// real guidance from Wale/Babs). These numbers only encode the one data point from the call:
// ~5 custom fields per user was called out as clearly too many.
const WARN_PER_USER = 2;
const CRITICAL_PER_USER = 5;

export default async function customFieldVolume({ headers, jiraBaseUrl }) {
  const [fieldsRes, issueTypesRes, licenseRes] = await Promise.all([
    fetch(`${jiraBaseUrl}/field`, { headers }),
    fetch(`${jiraBaseUrl}/issuetype`, { headers }),
    fetch(`${jiraBaseUrl}/license/approximateLicenseCount`, { headers }),
  ]);

  if (!fieldsRes.ok) throw new Error(`field ${fieldsRes.status} ${fieldsRes.statusText}`);
  if (!issueTypesRes.ok) throw new Error(`issuetype ${issueTypesRes.status} ${issueTypesRes.statusText}`);

  const fields = await fieldsRes.json();
  const issueTypes = await issueTypesRes.json();
  const customFieldCount = fields.filter((f) => f.custom).length;
  const issueTypeCount = issueTypes.length;

  // license/approximateLicenseCount may not be reachable with a plain per-site API token
  // (untested from here against a real site) — degrade gracefully rather than fail the check.
  let userCount = null;
  let userCountError = null;
  if (licenseRes.ok) {
    const license = await licenseRes.json();
    userCount = license.value ?? null;
  } else {
    userCountError = `User count endpoint (license/approximateLicenseCount) returned ${licenseRes.status} ${licenseRes.statusText}; ratio could not be computed.`;
  }

  const ratio = userCount && userCount > 0 ? +(customFieldCount / userCount).toFixed(1) : null;

  let severity = 'info';
  if (ratio !== null) {
    if (ratio >= CRITICAL_PER_USER) severity = 'critical';
    else if (ratio > WARN_PER_USER) severity = 'warning';
  }

  const summaryParts = [`${customFieldCount} custom fields`, `${issueTypeCount} issue types`];
  summaryParts.push(userCount !== null ? `~${userCount} users (${ratio}/user)` : 'user count unavailable');

  return {
    id: 'custom-field-volume',
    category: 'Fields',
    title: 'Custom Field & Issue Type Volume',
    severity,
    value: { customFieldCount, issueTypeCount, userCount, ratio },
    summary: summaryParts.join(', '),
    explanation:
      "A high number of custom fields or issue types relative to the user base usually means years of one-off requests were never consolidated. Each one adds cost to every future migration, workflow change, and screen configuration. (Thresholds here are provisional — 2 fields/user is flagged as a caution, 5+/user as a concern — pending Alluvium's own confirmed guidance.)",
    recommendation:
      severity === 'info'
        ? null
        : 'Review custom fields for duplicates or fields no longer used by any workflow/screen, and consider consolidating before migrating.',
    error: userCountError,
  };
}
