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

// --- HTML Navigation Routes ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/jira-stats', (req, res) => res.sendFile(path.join(__dirname, 'public/jira-stats.html')));
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

// 1. Jira Basic Stats (Updated with all 21 resources)
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
          
          // Resources Count
          boardCount: boards,
          dashboardCount: dashboards,
          fieldCount: fields.total ?? fields,
          fieldConfigurationCount: fieldConfigs,
          fieldConfigurationSchemeCount: fieldConfigSchemes,
          filterCount: filters,
          issueSecuritySchemeCount: issueSecuritySchemes,
          issueTypeCount: issueTypes,
          issueTypeSchemeCount: issueTypeSchemes.total ?? issueTypeSchemes,
          issueTypeScreenSchemeCount: issueTypeScreenSchemes,
          notificationSchemeCount: notificationSchemes,
          permissionSchemeCount: projects.total ? "Per Project" : 0, // Permission schemes are often distinct per project or shared, usually fetched via scheme endpoint if needed.
          // Correcting Permission Scheme Count (using utils if available or defaulting to fetch length)
          permissionSchemeCount: (await safeCall(jiraUtils.getPermissionSchemes, { headers, baseUrl })) || 0,
          priorityCount: priorities,
          prioritySchemeCount: prioritySchemes,
          projectCount: projects.total ?? projects,
          resolutionCount: resolutions,
          screenCount: screens,
          screenSchemeCount: screenSchemes,
          statusCount: statuses,
          workflowCount: workflows,
          workflowSchemeCount: workflowSchemes.total ?? workflowSchemes
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
        
        const detailedResults = await Promise.all(projects.map(async (p) => {
            try {
                const headers = getAuthHeaders(p.site.email, p.site.token);
                const baseUrl = getBaseUrl(p.domain);
                const projectKey = p.project.key;

                // Parallel fetches for specific resource names
                // We fetch the project, plus specific endpoints for schemes that don't always appear in expand
                const [projectData, permScheme, notifScheme, issueTypeScreenScheme, statusesData] = await Promise.all([
                    // 1. Basic Project Info
                    fetch(`${baseUrl}/project/${projectKey}?expand=issueTypeScheme,components`, { headers }).then(r => r.json()),
                    
                    // 2. Permission Scheme Name
                    fetch(`${baseUrl}/project/${projectKey}/permissionscheme`, { headers }).then(r => r.ok ? r.json() : { name: 'Default Permission Scheme' }),
                    
                    // 3. Notification Scheme Name
                    fetch(`${baseUrl}/project/${projectKey}/notificationscheme`, { headers }).then(r => r.ok ? r.json() : { name: 'Default Notification Scheme' }),
                    
                    // 4. Issue Type Screen Scheme
                    fetch(`${baseUrl}/project/${projectKey}/issuetypescreenscheme`, { headers }).then(r => r.ok ? r.json() : { name: 'N/A' }),

                    // 5. Statuses
                    fetch(`${baseUrl}/project/${projectKey}/statuses`, { headers }).then(r => r.ok ? r.json() : [])
                ]);

                // Sort Statuses Alphabetically
                const allStatuses = new Set();
                if (Array.isArray(statusesData)) {
                    statusesData.forEach(type => type.statuses.forEach(s => allStatuses.add(s.name)));
                }
                const sortedStatuses = Array.from(allStatuses).sort((a, b) => a.localeCompare(b));

                return {
                    domain: p.domain,
                    name: projectData.name,
                    key: projectData.key,
                    lead: projectData.lead?.displayName || "Unknown",
                    issueCount: p.project.issueCount,
                    
                    // Deep Data
                    componentCount: (projectData.components || []).length,
                    issueTypeScheme: projectData.issueTypeScheme?.name || "Default",
                    permissionScheme: permScheme.name || "Default",
                    notificationScheme: notifScheme.name || "Default",
                    issueTypeScreenScheme: issueTypeScreenScheme.name || "N/A",
                    
                    statuses: sortedStatuses.join(', '),
                    allStatuses: sortedStatuses.join(', ')
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