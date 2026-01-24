import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import bodyParser from 'body-parser';
import * as jiraUtils from './utils/atlassian.js';
import * as confluenceUtils from './utils/confluence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- HTML Routes ---
// Organized Dashboard
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

// Jira Pages
app.get('/jira-stats', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html'))); // Or rename your old index.html to jira-stats.html
app.get('/compare', (req, res) => res.sendFile(path.join(__dirname, 'public/compare.html')));
app.get('/insights', (req, res) => res.sendFile(path.join(__dirname, 'public/insights.html')));

// Confluence Pages
app.get('/confluence-stats', (req, res) => res.sendFile(path.join(__dirname, 'public/confluence-stats.html')));
app.get('/confluence-compare', (req, res) => res.sendFile(path.join(__dirname, 'public/confluence-compare.html')));

// Shared
app.get('/credentials', (req, res) => res.sendFile(path.join(__dirname, 'public/credentials.html')));

// --- Helpers ---
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

// 1. Jira Basic Stats (Dashboards, Fields, Projects, etc.)
app.post('/api/stats', async (req, res) => {
  const { sites } = req.body;
  const results = [];

  for (const site of sites) {
    try {
      const headers = getAuthHeaders(site.email, site.token);
      const baseUrl = getBaseUrl(site.domain);
      const agileUrl = baseUrl.replace('/api/3', '/agile/1.0');

      // Run all your atlassian.js functions in parallel
      const [
        projects, fields, dashboards, boards, workflows, issues, screens
      ] = await Promise.all([
        jiraUtils.getProjects({ headers, baseUrl }).catch(e => ({ error: e.message })),
        jiraUtils.getCustomFields({ headers, baseUrl }).catch(e => ({ error: e.message })),
        jiraUtils.getDashboards({ headers, baseUrl }).catch(e => ({ error: e.message })),
        jiraUtils.getBoards({ headers, agileBaseUrl: agileUrl }).catch(e => ({ error: e.message })),
        jiraUtils.getWorkflows({ headers, baseUrl }).catch(e => ({ error: e.message })),
        jiraUtils.getIssueTypes({ headers, baseUrl }).catch(e => ({ error: e.message })),
        jiraUtils.getScreens({ headers, baseUrl }).catch(e => ({ error: e.message }))
      ]);

      results.push({
        domain: site.domain,
        projectCount: projects.total || 0,
        fieldCount: fields.total || 0,
        dashboardCount: typeof dashboards === 'object' ? 0 : dashboards,
        boardCount: typeof boards === 'object' ? 0 : boards,
        workflowCount: typeof workflows === 'object' ? 0 : workflows,
        issueTypeCount: typeof issues === 'object' ? 0 : issues,
        screenCount: typeof screens === 'object' ? 0 : screens,
        // Add other mappings as needed based on your atlassian.js
      });

    } catch (e) {
      results.push({ domain: site.domain, error: e.message });
    }
  }
  res.json({ results });
});

// 2. Load Jira Projects (For Compare Dropdown)
app.post('/api/projects', async (req, res) => {
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
});

// 3. Compare Jira Projects
app.post('/api/compare-projects', async (req, res) => {
    // Note: Since atlassian.js didn't contain specific per-project detailed analysis
    // (like fetching schemes per project), this is a basic placeholder.
    // If you had custom logic here, you'll need to paste it back in.
    const { projects } = req.body;
    const results = projects.map(p => ({
        domain: p.domain,
        name: p.project.name,
        key: p.project.key,
        lead: p.project.lead,
        issueCount: p.project.issueCount,
        // Defaulting others because specific logic wasn't in the provided file
        statuses: "N/A",
        permissionScheme: "N/A" 
    }));
    res.json({ results });
});


// ==========================================
// 📘 CONFLUENCE API ROUTES (Fixed)
// ==========================================

// 1. Confluence Stats
app.post('/api/confluence/stats', async (req, res) => {
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
});

// 2. Load Spaces List
app.post('/api/confluence/spaces', async (req, res) => {
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
});

// 3. Compare Spaces
app.post('/api/confluence/compare-spaces', async (req, res) => {
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
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});