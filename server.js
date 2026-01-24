import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch'; // Ensure node-fetch is imported
import * as jiraUtils from './utils/atlassian.js';
import * as confluenceUtils from './utils/confluence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// --- HTML Navigation Routes ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html'))); // Main Landing Dashboard
app.get('/jira-stats', (req, res) => res.sendFile(path.join(__dirname, 'public/jira-stats.html'))); // RESTORED Jira Stats
app.get('/compare', (req, res) => res.sendFile(path.join(__dirname, 'public/compare.html')));
app.get('/insights', (req, res) => res.sendFile(path.join(__dirname, 'public/insights.html')));
app.get('/credentials', (req, res) => res.sendFile(path.join(__dirname, 'public/credentials.html')));
app.get('/confluence-stats', (req, res) => res.sendFile(path.join(__dirname, 'public/confluence-stats.html')));
app.get('/confluence-compare', (req, res) => res.sendFile(path.join(__dirname, 'public/confluence-compare.html')));

// --- Helper: Auth Headers ---
const getAuthHeaders = (email, token) => ({
  'Authorization': `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`,
  'Accept': 'application/json'
});

const getBaseUrl = (domain, type = 'jira') => {
    const cleanDomain = domain.replace(/https?:\/\//, '').split('.')[0];
    if(type === 'confluence') return `https://${cleanDomain}.atlassian.net/wiki/rest/api`;
    return `https://${cleanDomain}.atlassian.net/rest/api/3`;
};

// ==========================================
// 🔷 JIRA API ROUTES
// ==========================================

// 1. Jira Basic Stats
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

        const safeCall = (fn, ...args) => fn(...args).catch(e => ({ error: e.message }));

        // Parallel Fetch
        const [
            projects, fields, dashboards, boards, workflows, workflowSchemes,
            issueTypes, issueTypeSchemes, priorities, prioritySchemes,
            statuses, notificationSchemes, issueSecuritySchemes,
            screens, screenSchemes, issueTypeScreenSchemes,
            fieldConfigs, fieldConfigSchemes, resolutions, filters
        ] = await Promise.all([
            safeCall(jiraUtils.getProjects, { headers, baseUrl }),
            safeCall(jiraUtils.getCustomFields, { headers, baseUrl }),
            safeCall(jiraUtils.getDashboards, { headers, baseUrl }),
            safeCall(jiraUtils.getBoards, { headers, agileBaseUrl: agileUrl }),
            safeCall(jiraUtils.getWorkflows, { headers, baseUrl }),
            safeCall(jiraUtils.getWorkflowSchemes, { headers, baseUrl }),
            safeCall(jiraUtils.getIssueTypes, { headers, baseUrl }),
            safeCall(jiraUtils.getIssueTypeSchemes, { headers, baseUrl }),
            safeCall(jiraUtils.getPriorities, { headers, baseUrl }),
            safeCall(jiraUtils.getPrioritySchemes, { headers, baseUrl }),
            safeCall(jiraUtils.getStatuses, { headers, baseUrl }),
            safeCall(jiraUtils.getNotificationSchemes, { headers, baseUrl }),
            safeCall(jiraUtils.getIssueSecuritySchemes, { headers, baseUrl }),
            safeCall(jiraUtils.getScreens, { headers, baseUrl }),
            safeCall(jiraUtils.getScreenSchemes, { headers, baseUrl }),
            safeCall(jiraUtils.getIssueTypeScreenSchemes, { headers, baseUrl }),
            safeCall(jiraUtils.getFieldConfigurations, { headers, baseUrl }),
            safeCall(jiraUtils.getFieldConfigurationSchemes, { headers, baseUrl }),
            safeCall(jiraUtils.getResolutions, { headers, baseUrl }),
            safeCall(jiraUtils.getFilters, { headers, baseUrl })
        ]);

        results.push({
          domain: site.domain,
          projectCount: projects.total ?? projects,
          projectsActive: projects.active ?? 0,
          projectsArchived: projects.archived ?? 0,
          fieldCount: fields.total ?? fields,
          fieldsUnique: fields.unique ?? 0,
          fieldsDuplicated: fields.duplicates ?? 0,
          dashboardCount: dashboards,
          boardCount: boards,
          workflowCount: workflows,
          workflowSchemeCount: workflowSchemes.total ?? workflowSchemes,
          workflowSchemesActive: workflowSchemes.active ?? 0,
          workflowSchemesInactive: workflowSchemes.inactive ?? 0,
          issueTypeCount: issueTypes,
          issueTypeSchemeCount: issueTypeSchemes.total ?? issueTypeSchemes,
          issueTypeSchemesActive: issueTypeSchemes.active ?? 0,
          issueTypeSchemesInactive: issueTypeSchemes.inactive ?? 0,
          priorityCount: priorities,
          prioritySchemeCount: prioritySchemes,
          statusCount: statuses,
          notificationSchemeCount: notificationSchemes,
          issueSecuritySchemeCount: issueSecuritySchemes,
          screenCount: screens,
          screenSchemeCount: screenSchemes,
          issueTypeScreenSchemeCount: issueTypeScreenSchemes,
          fieldConfigurationCount: fieldConfigs,
          fieldConfigurationSchemeCount: fieldConfigSchemes,
          resolutionCount: resolutions,
          filterCount: filters
        });

      } catch (e) {
        results.push({ domain: site.domain, error: e.message });
      }
    }
    res.json({ results });
  } catch (err) { next(err); }
});

// 2. Load Jira Projects
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
      } catch (e) {
        results.push({ domain: site.domain, error: e.message });
      }
    }
    res.json({ results });
  } catch(err) { next(err); }
});

// 3. Compare Jira Projects (Deep Fetch Fixed)
app.post('/api/compare-projects', async (req, res, next) => {
    try {
        const { projects } = req.body;
        
        // We need to fetch details for EACH project individually
        // This includes: Components, Schemes, and Statuses
        const detailedResults = await Promise.all(projects.map(async (p) => {
            try {
                const headers = getAuthHeaders(p.site.email, p.site.token);
                const baseUrl = getBaseUrl(p.domain);
                const projectKey = p.project.key;

                // 1. Fetch Project Details (Schemes & Components)
                // We expand these fields to get the names directly
                const projectRes = await fetch(
                    `${baseUrl}/project/${projectKey}?expand=issueTypeScheme,permissions,notificationScheme,components,issueTypeScreenScheme`,
                    { headers }
                );
                
                if(!projectRes.ok) throw new Error(`Failed to fetch project ${projectKey}`);
                const projectData = await projectRes.json();

                // 2. Fetch Statuses separately (they are often not in the main project expansion)
                const statusRes = await fetch(`${baseUrl}/project/${projectKey}/statuses`, { headers });
                const statusData = statusRes.ok ? await statusRes.json() : [];
                // Flatten status names
                const allStatuses = new Set();
                if (Array.isArray(statusData)) {
                    statusData.forEach(type => type.statuses.forEach(s => allStatuses.add(s.name)));
                }

                return {
                    domain: p.domain,
                    name: projectData.name,
                    key: projectData.key,
                    lead: projectData.lead?.displayName || "Unknown",
                    issueCount: p.project.issueCount, // Passed from previous step
                    
                    // Deep Data
                    componentCount: (projectData.components || []).length,
                    issueTypeScheme: projectData.issueTypeScheme?.name || "Default",
                    permissionScheme: projectData.permissions?.name || "Default",
                    notificationScheme: projectData.notificationScheme?.name || "Default",
                    issueTypeScreenScheme: projectData.issueTypeScreenScheme?.name || "Default",
                    statuses: Array.from(allStatuses).join(', '),
                    allStatuses: Array.from(allStatuses).join(', ') // For the "show more" feature
                };

            } catch (e) {
                console.error(`Error fetching detail for ${p.project.key}:`, e.message);
                return {
                    domain: p.domain,
                    name: p.project.name,
                    key: p.project.key,
                    error: "Failed to fetch details"
                };
            }
        }));

        res.json({ results: detailedResults });
    } catch(err) { next(err); }
});


// ==========================================
// 📘 CONFLUENCE API ROUTES
// ==========================================

app.post('/api/confluence/stats', async (req, res, next) => {
  try {
    const { sites } = req.body;
    const results = [];
    for (const site of sites) {
      try {
        const headers = getAuthHeaders(site.email, site.token);
        const baseUrl = getBaseUrl(site.domain, 'confluence');
        const data = await confluenceUtils.getSpaces({ headers, baseUrl });
        results.push({ domain: site.domain, ...data });
      } catch (e) {
        results.push({ domain: site.domain, error: e.message });
      }
    }
    res.json({ results });
  } catch(err) { next(err); }
});

app.post('/api/confluence/spaces', async (req, res, next) => {
  try {
    const { sites } = req.body;
    const results = [];
    for (const site of sites) {
      try {
        const headers = getAuthHeaders(site.email, site.token);
        const baseUrl = getBaseUrl(site.domain, 'confluence');
        const data = await confluenceUtils.getSpaces({ headers, baseUrl });
        results.push({ domain: site.domain, spaces: data.spaces });
      } catch (e) {
        results.push({ domain: site.domain, error: e.message });
      }
    }
    res.json({ results });
  } catch(err) { next(err); }
});

app.post('/api/confluence/compare-spaces', async (req, res, next) => {
  try {
    const { spaces } = req.body;
    const results = [];
    for (const item of spaces) {
      try {
        const headers = getAuthHeaders(item.site.email, item.site.token);
        const baseUrl = getBaseUrl(item.domain, 'confluence');
        const counts = await confluenceUtils.getSpaceContentCounts({ 
          headers, baseUrl, spaceKey: item.spaceKey 
        });
        results.push({
          domain: item.domain,
          spaceName: item.spaceName,
          spaceKey: item.spaceKey,
          ...counts
        });
      } catch (e) {
        results.push({ domain: item.domain, spaceKey: item.spaceKey, error: e.message });
      }
    }
    res.json({ results });
  } catch(err) { next(err); }
});

app.post('/api/insights', async (req, res, next) => {
    // Forward to stats logic for simplicity
    req.url = '/api/stats';
    app.handle(req, res);
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error("Global Server Error:", err);
    if (!res.headersSent) {
        res.status(500).json({ error: "Internal Server Error", message: err.message });
    }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});