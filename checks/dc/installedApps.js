// SIGNIFICANTLY LESS CERTAIN than every other check in this project. Unlike Cloud, Data Center
// has no clean, documented database table listing installed apps with names/vendors/versions —
// installed plugins are mostly .jar files on disk; the database only holds partial, internal
// plugin-framework bookkeeping. This attempts the `pluginstate` table, which is where Jira/
// Confluence DC persist plugin enabled/disabled state, but:
//   - this table's exact name and column names can differ across Jira DC versions and have NOT
//     been verified against a live instance — if wrong, this check safely throws and reports
//     'unavailable' (the registry's own error handling), rather than a wrong number;
//   - there is no equivalent to Cloud's `userInstalled` flag. "Customer-installed vs. Atlassian-
//     bundled" is approximated by excluding plugin keys in Atlassian's own namespace
//     (com.atlassian.*) — a heuristic, not a guarantee. It shows raw plugin keys, not display
//     names, since those live in each plugin's own descriptor file, not the database.
// Expect this check, more than any other in this project, to need a real correction round once
// it's actually run against a live DC database — the same way the Cloud version needed two.
const SCRIPTING_APP_MARKERS = ['scriptrunner', 'groovyrunner'];

export default async function installedApps({ db }) {
  const rows = await db.query('SELECT plugin_key AS plugin_key FROM pluginstate');

  const apps = rows.map((r) => r.plugin_key).filter((key) => key && !key.toLowerCase().startsWith('com.atlassian.'));

  const scriptingApps = apps.filter((key) => SCRIPTING_APP_MARKERS.some((marker) => key.toLowerCase().includes(marker)));

  return {
    id: 'installed-apps',
    category: 'Apps',
    title: 'Installed Apps',
    severity: scriptingApps.length > 0 ? 'warning' : 'info',
    value: { totalApps: apps.length, apps, scriptingApps },
    summary: apps.length
      ? `${apps.length} app(s) detected by plugin key: ${apps.join(', ')}`
      : 'No non-Atlassian plugin keys found.',
    explanation:
      "Data Center has no equivalent to Cloud's installed-apps API. This counts plugin keys that don't start with Atlassian's own com.atlassian.* namespace, as a rough heuristic for 'customer-installed' — it can miss or wrongly include apps, and shows raw plugin keys, not display names." +
      (scriptingApps.length > 0
        ? ` Scripting app(s) detected by key pattern: ${scriptingApps.join(', ')} — these need a manual script inventory before migration.`
        : ''),
    recommendation:
      "Confirm the actual installed apps list from the instance's Manage Apps (UPM) screen directly — this check is a rough approximation, unlike its Cloud counterpart.",
    error: null,
  };
}
