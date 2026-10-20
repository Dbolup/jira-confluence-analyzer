import fetch from 'node-fetch';

// Uses the UPM (Universal Plugin Manager) REST API, confirmed working against a real site with a
// per-site API token — the Connect-app endpoint this originally tried (/rest/atlassian-connect/1/
// addons) 403s for a human token; it's meant to be called by an installed app about itself.
const SCRIPTING_APP_MARKERS = ['scriptrunner'];

export default async function installedApps({ jiraBaseUrl, headers }) {
  const siteBaseUrl = jiraBaseUrl.replace(/\/rest\/api\/3$/, '');
  // This endpoint 406s on the shared Accept: application/json used everywhere else — confirmed
  // against a real site that it only accepts Accept: */* (no Content-Type, no body on this GET).
  const upmHeaders = { Authorization: headers.Authorization, Accept: '*/*' };
  const r = await fetch(`${siteBaseUrl}/rest/plugins/1.0/`, { headers: upmHeaders });
  if (!r.ok) throw new Error(`rest/plugins/1.0 ${r.status} ${r.statusText}`);
  const data = await r.json();
  const allPlugins = data.plugins || [];

  // The UPM lists every plugin, including Atlassian's own bundled system modules (hundreds of
  // them, on every site — e.g. "jira.webfragments.admin", "com.atlassian.applinks.applinks-plugin").
  // userInstalled === true is what actually distinguishes an app the customer added (Marketplace
  // or otherwise) from Jira's own built-ins. Without this filter, every site would report a huge,
  // meaningless "apps installed" count.
  const apps = allPlugins.filter((p) => p.userInstalled === true);

  const appNames = apps.map((a) => a.name || a.key);
  const scriptingApps = apps.filter((a) => {
    const name = `${a.name || ''} ${a.key || ''}`.toLowerCase();
    return SCRIPTING_APP_MARKERS.some((marker) => name.includes(marker));
  });
  const scriptingAppNames = scriptingApps.map((a) => a.name || a.key);

  return {
    id: 'installed-apps',
    category: 'Apps',
    title: 'Installed Apps',
    severity: scriptingApps.length > 0 ? 'warning' : 'info',
    value: { totalApps: apps.length, apps: appNames, scriptingApps: scriptingAppNames },
    summary: appNames.length
      ? `${appNames.length} app(s) installed: ${appNames.join(', ')}`
      : 'No customer-installed apps found.',
    explanation:
      scriptingApps.length > 0
        ? `Scripting app(s) detected — ${scriptingAppNames.join(', ')}. These add logic outside Jira's native configuration, so migrating them needs a manual script inventory this tool can't automate. Every other installed app is still a dependency the target instance needs, or a feature to replace. (Atlassian's own bundled system plugins are excluded — only apps the customer installed are counted.)`
        : "Every installed app is a dependency the target instance needs too, or a feature to replace. (Atlassian's own bundled system plugins are excluded — only apps the customer installed are counted.)",
    recommendation:
      scriptingApps.length > 0
        ? `Inventory the scripts in ${scriptingAppNames.join(', ')} manually before migration — their logic isn't visible to this tool.`
        : null,
    error: null,
  };
}
