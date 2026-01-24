import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch'; 
import * as jiraUtils from './utils/atlassian.js';
import * as confluenceUtils from './utils/confluence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- HTML Routes ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/jira-stats', (req, res) => res.sendFile(path.join(__dirname, 'public/jira-stats.html')));
app.get('/compare', (req, res) => res.sendFile(path.join(__dirname, 'public/compare.html')));
app.get('/insights', (req, res) => res.sendFile(path.join(__dirname, 'public/insights.html')));
app.get('/credentials', (req, res) => res.sendFile(path.join(__dirname, 'public/credentials.html')));
app.get('/confluence-stats', (req, res) => res.sendFile(path.join(__dirname, 'public/confluence-stats.html')));
app.get('/confluence-compare', (req, res) => res.sendFile(path.join(__dirname, 'public/confluence-compare.html')));

const getAuthHeaders = (email, token) => ({ 'Authorization': `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`, 'Accept': 'application/json' });
const getBaseUrl = (domain, type = 'jira') => {
    const d = domain.replace(/https?:\/\//, '').split('.')[0];
    return type === 'confluence' ? `https://${d}.atlassian.net/wiki/rest/api` : `https://${d}.atlassian.net/rest/api/3`;
};

// 1. Jira Stats
app.post('/api/stats', async (req, res, next) => {
  try {
    const { sites } = req.body;
    if (!sites) throw new Error("No sites provided");
    const results = [];
    for (const site of sites) {
      try {
        const headers = getAuthHeaders(site.email, site.token);
        const baseUrl = getBaseUrl(site.domain);
        const agileUrl = baseUrl.replace('/api/3', '/agile/1.0');
        const safe = (fn, ...args) => fn(...args).catch(e => ({ error: e.message }));

        const [p, f, d, b, w, ws, it, its, pr, prs, st, ns, iss, sc, scs, itss, fc, fcs, r, fl] = await Promise.all([
            safe(jiraUtils.getProjects, { headers, baseUrl }), safe(jiraUtils.getCustomFields, { headers, baseUrl }),
            safe(jiraUtils.getDashboards, { headers, baseUrl }), safe(jiraUtils.getBoards, { headers, agileBaseUrl: agileUrl }),
            safe(jiraUtils.getWorkflows, { headers, baseUrl }), safe(jiraUtils.getWorkflowSchemes, { headers, baseUrl }),
            safe(jiraUtils.getIssueTypes, { headers, baseUrl }), safe(jiraUtils.getIssueTypeSchemes, { headers, baseUrl }),
            safe(jiraUtils.getPriorities, { headers, baseUrl }), safe(jiraUtils.getPrioritySchemes, { headers, baseUrl }),
            safe(jiraUtils.getStatuses, { headers, baseUrl }), safe(jiraUtils.getNotificationSchemes, { headers, baseUrl }),
            safe(jiraUtils.getIssueSecuritySchemes, { headers, baseUrl }), safe(jiraUtils.getScreens, { headers, baseUrl }),
            safe(jiraUtils.getScreenSchemes, { headers, baseUrl }), safe(jiraUtils.getIssueTypeScreenSchemes, { headers, baseUrl }),
            safe(jiraUtils.getFieldConfigurations, { headers, baseUrl }), safe(jiraUtils.getFieldConfigurationSchemes, { headers, baseUrl }),
            safe(jiraUtils.getResolutions, { headers, baseUrl }), safe(jiraUtils.getFilters, { headers, baseUrl })
        ]);

        results.push({
          domain: site.domain,
          projectCount: p.total??p, projectsActive: p.active??0, projectsArchived: p.archived??0,
          fieldCount: f.total??f, fieldsDuplicated: f.duplicates??0,
          workflowSchemeCount: ws.total??ws, workflowSchemesInactive: ws.inactive??0,
          issueTypeSchemeCount: its.total??its, issueTypeSchemesInactive: its.inactive??0,
          boardCount: b, dashboardCount: d, workflowCount: w, issueTypeCount: it,
          priorityCount: pr, prioritySchemeCount: prs, statusCount: st, notificationSchemeCount: ns,
          issueSecuritySchemeCount: iss, screenCount: sc, screenSchemeCount: scs,
          issueTypeScreenSchemeCount: itss, fieldConfigurationCount: fc,
          fieldConfigurationSchemeCount: fcs, resolutionCount: r, filterCount: fl,
          permissionSchemeCount: (await safe(jiraUtils.getPermissionSchemes, { headers, baseUrl })) || 0
        });
      } catch (e) { results.push({ domain: site.domain, error: e.message }); }
    }
    res.json({ results });
  } catch (e) { next(e); }
});

// 2. Jira Projects
app.post('/api/projects', async (req, res, next) => {
  try {
    const { sites } = req.body;
    const results = [];
    for (const site of sites) {
      try {
        const headers = getAuthHeaders(site.email, site.token);
        const baseUrl = getBaseUrl(site.domain);
        const data = await jiraUtils.getProjects({ headers, baseUrl });
        results.push({ domain: site.domain, projects: data.projects });
      } catch (e) { results.push({ domain: site.domain, error: e.message }); }
    }
    res.json({ results });
  } catch(e) { next(e); }
});

// 3. Jira Deep Compare
app.post('/api/compare-projects', async (req, res, next) => {
    try {
        const { projects } = req.body;
        const detailed = await Promise.all(projects.map(async (p) => {
            try {
                const headers = getAuthHeaders(p.site.email, p.site.token);
                const baseUrl = getBaseUrl(p.domain);
                const key = p.project.key;
                const id = p.project.id;

                const [proj, perm, notif, issueTypeSchemeData, workflowSchemeData, screenSchemeData, allPrioritySchemes, fieldConfigData, stats] = await Promise.all([
                    fetch(`${baseUrl}/project/${key}?expand=components`, { headers }).then(r=>r.json()),
                    fetch(`${baseUrl}/project/${key}/permissionscheme`, { headers }).then(r=>r.ok?r.json():{name:'Default'}),
                    fetch(`${baseUrl}/project/${key}/notificationscheme`, { headers }).then(r=>r.ok?r.json():{name:'Default'}),
                    fetch(`${baseUrl}/issuetypescheme/project?projectId=${id}`, { headers }).then(r=>r.ok?r.json():{values:[]}),
                    fetch(`${baseUrl}/workflowscheme/project?projectId=${id}`, { headers }).then(r=>r.ok?r.json():{values:[]}),
                    fetch(`${baseUrl}/issuetypescreenscheme/project?projectId=${id}`, { headers }).then(r=>r.ok?r.json():{values:[]}),
                    fetch(`${baseUrl}/priorityscheme`, { headers }).then(r=>r.ok?r.json():{values:[]}),
                    fetch(`${baseUrl}/fieldconfigurationscheme/project?projectId=${id}`, { headers }).then(r=>r.ok?r.json():{values:[]}),
                    fetch(`${baseUrl}/project/${key}/statuses`, { headers }).then(r=>r.ok?r.json():[])
                ]);

                let priorityName = "Default Priority Scheme";
                if (allPrioritySchemes.values) {
                    const found = allPrioritySchemes.values.find(scheme => 
                        scheme.projects && scheme.projects.values && 
                        scheme.projects.values.some(projRef => projRef.id === id)
                    );
                    if (found) priorityName = found.name;
                }

                const workflowName = workflowSchemeData.values?.[0]?.workflowScheme?.name || "Default";
                const issueTypeName = issueTypeSchemeData.values?.[0]?.issueTypeScheme?.name || "Default";
                const screenSchemeName = screenSchemeData.values?.[0]?.issueTypeScreenScheme?.name || "Default";
                const fieldConfigName = fieldConfigData.values?.[0]?.fieldConfigurationScheme?.name || "Default Field Configuration";

                const allStats = new Set();
                if(Array.isArray(stats)) stats.forEach(t => t.statuses.forEach(s => allStats.add(s.name)));

                const isTeamManaged = proj.style === 'next-gen';
                const label = isTeamManaged ? 'Team-Managed' : '';

                return {
                    domain: p.domain, name: proj.name, key: proj.key, lead: proj.lead?.displayName, issueCount: p.project.issueCount,
                    workflowScheme: isTeamManaged ? label : workflowName,
                    issueTypeScheme: isTeamManaged ? label : issueTypeName,
                    priorityScheme: isTeamManaged ? label : priorityName,
                    fieldConfiguration: isTeamManaged ? label : fieldConfigName,
                    permissionScheme: isTeamManaged ? label : (perm.name||'Default'),
                    notificationScheme: isTeamManaged ? label : (notif.name||'Default'),
                    issueTypeScreenScheme: isTeamManaged ? label : screenSchemeName,
                    componentCount: (proj.components||[]).length,
                    statuses: Array.from(allStats).sort().join(', ')
                };
            } catch (e) { return { domain: p.domain, error: "Fetch Error" }; }
        }));
        res.json({ results: detailed });
    } catch(e) { next(e); }
});

// 4. Confluence Stats
app.post('/api/confluence/stats', async (req, res, next) => {
  try {
    const { sites } = req.body;
    const results = [];
    for (const site of sites) {
      const headers = getAuthHeaders(site.email, site.token);
      const baseUrl = getBaseUrl(site.domain, 'confluence');
      try { results.push({ domain: site.domain, ...(await confluenceUtils.getSpaces({ headers, baseUrl })) }); }
      catch (e) { results.push({ domain: site.domain, error: e.message }); }
    }
    res.json({ results });
  } catch(e) { next(e); }
});

// 5. Confluence Spaces
app.post('/api/confluence/spaces', async (req, res, next) => {
  try {
    const { sites } = req.body;
    const results = [];
    for (const site of sites) {
      const headers = getAuthHeaders(site.email, site.token);
      const baseUrl = getBaseUrl(site.domain, 'confluence');
      try { results.push({ domain: site.domain, spaces: (await confluenceUtils.getSpaces({ headers, baseUrl })).spaces }); }
      catch (e) { results.push({ domain: site.domain, error: e.message }); }
    }
    res.json({ results });
  } catch(e) { next(e); }
});

// 6. Confluence Deep Compare (UPDATED with new types)
app.post('/api/confluence/compare-spaces', async (req, res, next) => {
  try {
    const { spaces } = req.body;
    const results = [];
    
    for (const item of spaces) {
      try {
        const headers = getAuthHeaders(item.site.email, item.site.token);
        const baseUrl = getBaseUrl(item.domain, 'confluence');
        const key = item.spaceKey;

        // 1. Pages, Blogs, Attachments
        const counts = await confluenceUtils.getSpaceContentCounts({ headers, baseUrl, spaceKey: key });

        // 2. Owner (Creator of homepage)
        let owner = "Unknown";
        try {
            const spaceRes = await fetch(`${baseUrl}/space/${key}?expand=homepage.history.createdBy`, { headers });
            const spaceData = await spaceRes.json();
            if(spaceData.homepage?.history?.createdBy) owner = spaceData.homepage.history.createdBy.displayName;
        } catch(e) {}

        // 3. New Specific Counts via CQL
        const countByCQL = async (cql) => {
            try {
                const url = `${baseUrl}/search?cql=${encodeURIComponent(cql)}&limit=0`;
                const res = await fetch(url, { headers });
                const data = await res.json();
                return data.totalSize || 0;
            } catch(e) { return "N/A"; }
        };

        const [dbCount, wbCount, folderCount, smartLinkCount, calendarCount, spaceCalendarCount] = await Promise.all([
            countByCQL(`space="${key}" AND type="database"`),
            countByCQL(`space="${key}" AND type="whiteboard"`),
            countByCQL(`space="${key}" AND type="folder"`),
            countByCQL(`space="${key}" AND type="smart-link"`),
            countByCQL(`space="${key}" AND type="calendar"`), // "Calendars"
            countByCQL(`space="${key}" AND content.type="com.atlassian.confluence.extra.calendar:calendar-content-type"`) // "Space Calendars" (Custom Content)
        ]);

        results.push({
          domain: item.domain,
          spaceName: item.spaceName,
          spaceKey: key,
          owner: owner,
          // New Fields
          databases: dbCount,
          whiteboards: wbCount,
          folders: folderCount,
          smartlinks: smartLinkCount,
          calendars: calendarCount,
          spaceCalendars: spaceCalendarCount,
          ...counts
        });
      } catch (e) {
        results.push({ domain: item.domain, spaceKey: item.spaceKey, error: e.message });
      }
    }
    res.json({ results });
  } catch(e) { next(e); }
});

app.post('/api/insights', async (req, res, next) => {
    req.url = '/api/stats';
    app.handle(req, res);
});

app.use((err, req, res, next) => {
    console.error("Global Server Error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Internal Server Error", message: err.message });
});

app.listen(port, () => console.log(`Running on http://localhost:${port}`));