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

// Routes
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

// 1. Stats (21 Resources)
app.post('/api/stats', async (req, res, next) => {
  try {
    const { sites } = req.body;
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

// 2. Compare Projects (Deep)
app.post('/api/compare-projects', async (req, res, next) => {
    try {
        const { projects } = req.body;
        const detailed = await Promise.all(projects.map(async (p) => {
            try {
                const headers = getAuthHeaders(p.site.email, p.site.token);
                const baseUrl = getBaseUrl(p.domain);
                const key = p.project.key;
                const id = p.project.id;

                const [proj, perm, notif, its, ws, itss, ps, fcs, stats] = await Promise.all([
                    fetch(`${baseUrl}/project/${key}?expand=components`, { headers }).then(r=>r.json()),
                    fetch(`${baseUrl}/project/${key}/permissionscheme`, { headers }).then(r=>r.ok?r.json():{name:'Default'}),
                    fetch(`${baseUrl}/project/${key}/notificationscheme`, { headers }).then(r=>r.ok?r.json():{name:'Default'}),
                    fetch(`${baseUrl}/project/${key}/issuetypescheme`, { headers }).then(r=>r.ok?r.json():{name:'Default'}),
                    fetch(`${baseUrl}/project/${key}/workflowscheme`, { headers }).then(r=>r.ok?r.json():{name:'Default'}),
                    fetch(`${baseUrl}/project/${key}/issuetypescreenscheme`, { headers }).then(r=>r.ok?r.json():{name:'Default'}),
                    fetch(`${baseUrl}/project/${key}/priorityscheme`, { headers }).then(r=>r.ok?r.json():{name:'Default'}),
                    fetch(`${baseUrl}/fieldconfigurationscheme/project?projectId=${id}`, { headers }).then(r=>r.ok?r.json():{values:[]}),
                    fetch(`${baseUrl}/project/${key}/statuses`, { headers }).then(r=>r.ok?r.json():[])
                ]);

                // Fix: Team-managed projects often return 404 for schemes or generic names.
                // We check if it is a Next Gen project
                const isTeamManaged = proj.style === 'next-gen';
                const schemeLabel = isTeamManaged ? 'Team-Managed (N/A)' : 'Default';

                let fcName = schemeLabel;
                if (fcs.values && fcs.values.length > 0) fcName = fcs.values[0].fieldConfigurationScheme?.name || "Custom";

                const allStats = new Set();
                if(Array.isArray(stats)) stats.forEach(t => t.statuses.forEach(s => allStats.add(s.name)));
                
                return {
                    domain: p.domain, name: proj.name, key: proj.key, lead: proj.lead?.displayName, issueCount: p.project.issueCount,
                    workflowScheme: isTeamManaged ? 'Team-Managed' : (ws.name||schemeLabel),
                    issueTypeScheme: isTeamManaged ? 'Team-Managed' : (its.name||schemeLabel),
                    priorityScheme: isTeamManaged ? 'Team-Managed' : (ps.name||schemeLabel),
                    fieldConfiguration: isTeamManaged ? 'Team-Managed' : fcName,
                    permissionScheme: isTeamManaged ? 'Team-Managed' : (perm.name||schemeLabel),
                    notificationScheme: isTeamManaged ? 'Team-Managed' : (notif.name||schemeLabel),
                    issueTypeScreenScheme: isTeamManaged ? 'Team-Managed' : (itss.name||schemeLabel),
                    componentCount: (proj.components||[]).length,
                    statuses: Array.from(allStats).sort().join(', ')
                };
            } catch (e) { return { domain: p.domain, error: "Fetch Error" }; }
        }));
        res.json({ results: detailed });
    } catch(e) { next(e); }
});

// 3. Confluence Routes
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

app.post('/api/confluence/compare-spaces', async (req, res, next) => {
  try {
    const { spaces } = req.body;
    const results = [];
    for (const item of spaces) {
        const headers = getAuthHeaders(item.site.email, item.site.token);
        const baseUrl = getBaseUrl(item.domain, 'confluence');
        const key = item.spaceKey;
        try {
            const counts = await confluenceUtils.getSpaceContentCounts({ headers, baseUrl, spaceKey: key });
            
            // Fix: Better Owner/Date Fetch
            let owner = "Unknown";
            const spaceRes = await fetch(`${baseUrl}/space/${key}?expand=homepage.history.createdBy`, { headers });
            const spaceData = await spaceRes.json();
            if(spaceData.homepage?.history?.createdBy) owner = spaceData.homepage.history.createdBy.displayName;

            // Fix: Last Activity
            let lastModified = "N/A";
            const hist = await fetch(`${baseUrl}/search?cql=space="${key}" order by lastModified desc limit 1`, { headers }).then(r=>r.json());
            if(hist.results?.[0]) {
                const d = hist.results[0].history?.lastUpdated?.when || hist.results[0].version?.when;
                if(d) lastModified = new Date(d).toLocaleDateString();
            }

            // Fix: Calendar Count
            let calendars = 0;
            const calRes = await fetch(`${baseUrl}/search?cql=space="${key}" AND (type="custom" OR type="calendar") AND content.type="com.atlassian.confluence.extra.calendar:calendar-content-type"&limit=0`, { headers }).then(r=>r.json());
            calendars = calRes.totalSize || 0;

            results.push({ domain: item.domain, spaceName: item.spaceName, spaceKey: key, owner, lastModified, calendars, ...counts });
        } catch (e) { results.push({ domain: item.domain, spaceKey: key, error: e.message }); }
    }
    res.json({ results });
  } catch(e) { next(e); }
});

app.post('/api/projects', async (req, res, next) => {
  // Reuse existing logic for dropdown population
  try {
    const { sites } = req.body;
    const results = [];
    for (const site of sites) {
        const headers = getAuthHeaders(site.email, site.token);
        const baseUrl = getBaseUrl(site.domain);
        try {
            const data = await jiraUtils.getProjects({ headers, baseUrl });
            results.push({ domain: site.domain, projects: data.projects });
        } catch (e) { results.push({ domain: site.domain, error: e.message }); }
    }
    res.json({ results });
  } catch(e) { next(e); }
});

app.listen(port, () => console.log(`Running on http://localhost:${port}`));