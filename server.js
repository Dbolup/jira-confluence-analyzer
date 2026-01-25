import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch'; 
import pg from 'pg';
import mysql from 'mysql2/promise';
import * as jiraUtils from './utils/atlassian.js';
import * as confluenceUtils from './utils/confluence.js';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// HTML Routes
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/jira-stats', (req, res) => res.sendFile(path.join(__dirname, 'public/jira-stats.html')));
app.get('/compare', (req, res) => res.sendFile(path.join(__dirname, 'public/compare.html')));
app.get('/insights', (req, res) => res.sendFile(path.join(__dirname, 'public/insights.html')));
app.get('/credentials', (req, res) => res.sendFile(path.join(__dirname, 'public/credentials.html')));
app.get('/confluence-stats', (req, res) => res.sendFile(path.join(__dirname, 'public/confluence-stats.html')));
app.get('/confluence-compare', (req, res) => res.sendFile(path.join(__dirname, 'public/confluence-compare.html')));

const getAuthHeaders = (email, token) => ({ 
    'Authorization': `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`, 
    'Accept': 'application/json',
    'Content-Type': 'application/json' 
});

const getBaseUrl = (domain, type = 'jira') => {
    const d = domain.replace(/https?:\/\//, '').split('.')[0];
    return type === 'confluence' ? `https://${d}.atlassian.net/wiki/rest/api` : `https://${d}.atlassian.net/rest/api/3`;
};

// DB Helper
async function queryDB(config, query, params = []) {
    if (config.type === 'postgres') {
        const pool = new Pool({ user: config.user, host: config.host, database: config.database, password: config.password, port: config.port, ssl: { rejectUnauthorized: false } });
        try { const res = await pool.query(query, params); await pool.end(); return res.rows; } catch (e) { await pool.end(); throw e; }
    } else if (config.type === 'mysql') {
        const conn = await mysql.createConnection({ host: config.host, user: config.user, database: config.database, password: config.password, port: config.port });
        const [rows] = await conn.execute(query, params); await conn.end(); return rows;
    }
    throw new Error('Unsupported DB Type');
}

// ==========================================
// 🔷 API ROUTES
// ==========================================

// 1. Stats
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

// 2. Projects Dropdown
app.post('/api/projects', async (req, res, next) => {
  try {
    const { sources, sites } = req.body; 
    const targets = sources || sites || []; 
    const results = [];

    for (const src of targets) {
        try {
            const isCloud = src.type === 'cloud' || (!src.type && src.token);
            if (isCloud) {
                const headers = getAuthHeaders(src.email, src.token);
                const baseUrl = getBaseUrl(src.domain);
                const data = await jiraUtils.getProjects({ headers, baseUrl });
                results.push({ sourceName: src.domain, type: 'cloud', projects: data.projects });
            } else {
                const sql = `SELECT pkey as "key", pname as "name", id FROM project ORDER BY pname`;
                const rows = await queryDB(src, sql);
                results.push({ sourceName: src.name, type: 'dc', projects: rows.map(r => ({ key: r.key, name: r.name, id: r.id })) });
            }
        } catch (e) { results.push({ sourceName: src.domain || src.name, error: e.message }); }
    }
    res.json({ results });
  } catch (e) { next(e); }
});

// 3. Jira Deep Compare (FIXED: Approximate Count + Standard Components)
app.post('/api/compare-projects', async (req, res, next) => {
    try {
        const { selection, projects } = req.body;
        const items = selection || projects.map(p => ({ 
            source: { ...p.site, type: 'cloud', domain: p.domain }, 
            projectKey: p.project.key, 
            projectId: p.project.id 
        }));

        const detailedResults = await Promise.all(items.map(async (item) => {
            const src = item.source;
            const pKey = item.projectKey;
            
            try {
                // --- CLOUD LOGIC ---
                if (src.type === 'cloud' || (!src.type && src.token)) {
                    const headers = getAuthHeaders(src.email, src.token);
                    const baseUrl = getBaseUrl(src.domain);
                    
                    let pId = item.projectId;
                    
                    // 1. Get Project Data
                    const projRes = await fetch(`${baseUrl}/project/${pKey}`, { headers });
                    const proj = await projRes.json();
                    
                    if (!pId) pId = proj.id;

                    // 2. Component Count (Standard Array)
                    const componentCount = (proj.components || []).length;

                    // 3. Issue Count (Approximate Count API)
                    let issueCount = 0;
                    try {
                        const countRes = await fetch(`${baseUrl}/search/approximate-count`, {
                            method: 'POST',
                            headers: headers,
                            body: JSON.stringify({
                                jql: `project = "${pKey}"`
                            })
                        });
                        const countData = await countRes.json();
                        if(typeof countData.count === 'number') {
                            issueCount = countData.count;
                        } else {
                             console.log(`Approx Count failed for ${pKey}`, countData);
                        }
                    } catch(e) { console.error("Count API Error:", e.message); }

                    // 4. Parallel Fetch Schemes
                    const [perm, notif, issueTypeSchemeData, workflowSchemeData, screenSchemeData, allPrioritySchemes, fieldConfigData, stats] = await Promise.all([
                        fetch(`${baseUrl}/project/${pKey}/permissionscheme`, { headers }).then(r=>r.ok?r.json():{name:'Default'}),
                        fetch(`${baseUrl}/project/${pKey}/notificationscheme`, { headers }).then(r=>r.ok?r.json():{name:'Default'}),
                        fetch(`${baseUrl}/issuetypescheme/project?projectId=${pId}`, { headers }).then(r=>r.ok?r.json():{values:[]}),
                        fetch(`${baseUrl}/workflowscheme/project?projectId=${pId}`, { headers }).then(r=>r.ok?r.json():{values:[]}),
                        fetch(`${baseUrl}/issuetypescreenscheme/project?projectId=${pId}`, { headers }).then(r=>r.ok?r.json():{values:[]}),
                        fetch(`${baseUrl}/priorityscheme`, { headers }).then(r=>r.ok?r.json():{values:[]}),
                        fetch(`${baseUrl}/fieldconfigurationscheme/project?projectId=${pId}`, { headers }).then(r=>r.ok?r.json():{values:[]}),
                        fetch(`${baseUrl}/project/${pKey}/statuses`, { headers }).then(r=>r.ok?r.json():[])
                    ]);

                    let priorityName = "Default Priority Scheme";
                    if (allPrioritySchemes.values) {
                        const found = allPrioritySchemes.values.find(scheme => scheme.projects?.values?.some(projRef => projRef.id === pId));
                        if (found) priorityName = found.name;
                    }

                    const isTeamManaged = proj.style === 'next-gen';
                    const label = isTeamManaged ? 'Team-Managed' : '';
                    
                    const allStats = new Set();
                    if(Array.isArray(stats)) stats.forEach(t => t.statuses.forEach(s => allStats.add(s.name)));

                    return {
                        domain: src.domain,
                        source: src.domain,
                        name: proj.name,
                        key: proj.key,
                        lead: proj.lead?.displayName || "Unknown",
                        issueCount: issueCount.toLocaleString(),
                        componentCount: componentCount,
                        
                        workflowScheme: isTeamManaged ? label : (workflowSchemeData.values?.[0]?.workflowScheme?.name || "Default"),
                        issueTypeScheme: isTeamManaged ? label : (issueTypeSchemeData.values?.[0]?.issueTypeScheme?.name || "Default"),
                        priorityScheme: isTeamManaged ? label : priorityName,
                        fieldConfiguration: isTeamManaged ? label : (fieldConfigData.values?.[0]?.fieldConfigurationScheme?.name || "Default"),
                        permissionScheme: isTeamManaged ? label : (perm.name||'Default'),
                        notificationScheme: isTeamManaged ? label : (notif.name||'Default'),
                        issueTypeScreenScheme: isTeamManaged ? label : (screenSchemeData.values?.[0]?.issueTypeScreenScheme?.name || "Default"),
                        statuses: Array.from(allStats).sort().join(', '),
                        type: "Cloud"
                    };
                } 
                // --- DATA CENTER LOGIC ---
                else {
                    const countRes = await queryDB(src, `SELECT count(*) as "cnt" FROM jiraissue WHERE project = (SELECT id FROM project WHERE pkey = '${pKey}')`);
                    const leadRes = await queryDB(src, `SELECT lead FROM project WHERE pkey = '${pKey}'`);
                    const compRes = await queryDB(src, `SELECT count(*) as "cnt" FROM component WHERE project = (SELECT id FROM project WHERE pkey = '${pKey}')`);
                    const wfSql = `SELECT ws.NAME FROM nodeassociation na JOIN workflowscheme ws ON na.SINK_NODE_ID = ws.ID WHERE na.SOURCE_NODE_ENTITY = 'Project' AND na.SINK_NODE_ENTITY = 'WorkflowScheme' AND na.SOURCE_NODE_ID = (SELECT id FROM project WHERE pkey = '${pKey}')`;
                    const wfRes = await queryDB(src, wfSql);

                    return {
                        domain: src.name,
                        source: src.name,
                        key: pKey,
                        name: pKey, 
                        lead: leadRes[0]?.lead || "Unknown",
                        issueCount: countRes[0]?.cnt || 0,
                        componentCount: compRes[0]?.cnt || 0,
                        workflowScheme: wfRes[0]?.NAME || "Default",
                        type: "Data Center"
                    };
                }
            } catch (e) { 
                console.error(e);
                return { domain: src.domain||src.name, source: src.domain||src.name, key: pKey, error: e.message }; 
            }
        }));
        res.json({ results: detailedResults });
    } catch(e) { next(e); }
});

// 4. Confluence Stats & Spaces
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
    const { sources, sites } = req.body;
    const targets = sources || sites || [];
    const results = [];

    for (const src of targets) {
        try {
            const isCloud = src.type === 'cloud' || (!src.type && src.token);
            if (isCloud) {
                const headers = getAuthHeaders(src.email, src.token);
                const baseUrl = getBaseUrl(src.domain, 'confluence');
                const data = await confluenceUtils.getSpaces({ headers, baseUrl });
                results.push({ sourceName: src.domain, type:'cloud', spaces: data.spaces });
            } else {
                const sql = `SELECT spacekey as "key", spacename as "name", spaceid as "id" FROM spaces WHERE spacestatus = 'CURRENT' ORDER BY spacename`;
                const rows = await queryDB(src, sql);
                results.push({ sourceName: src.name, type:'dc', spaces: rows.map(r => ({ key: r.key, name: r.name, id: r.id })) });
            }
        } catch (e) { results.push({ sourceName: src.domain || src.name, error: e.message }); }
    }
    res.json({ results });
  } catch(e) { next(e); }
});

// 5. Confluence Deep Compare
app.post('/api/confluence/compare-spaces', async (req, res, next) => {
  try {
    const { spaces } = req.body;
    const results = [];
    
    const items = spaces.map(s => s.spaceKey ? s : { ...s, spaceKey: s.key });

    for (const item of items) {
        const domain = item.domain || item.source?.domain; 
        const site = item.site || item.source; 
        const key = item.spaceKey;

        if (!site || !site.token) {
             results.push({ domain: domain || "Unknown", spaceKey: key, error: "Missing Cloud Credentials" });
             continue;
        }

        const headers = getAuthHeaders(site.email, site.token);
        const baseUrl = getBaseUrl(domain, 'confluence');

        try {
            const counts = await confluenceUtils.getSpaceContentCounts({ headers, baseUrl, spaceKey: key });

            let owner = "Unknown";
            try {
                const spaceRes = await fetch(`${baseUrl}/space/${key}?expand=homepage.history.createdBy`, { headers });
                const spaceData = await spaceRes.json();
                if(spaceData.homepage?.history?.createdBy) owner = spaceData.homepage.history.createdBy.displayName;
            } catch(e) {}

            const countByCQL = async (cql) => {
                try {
                    const res = await fetch(`${baseUrl}/search?cql=${encodeURIComponent(cql)}&limit=0`, { headers });
                    const data = await res.json();
                    return data.totalSize || 0;
                } catch(e) { return 0; }
            };

            const [db, wb, fo, sl, cal, scal] = await Promise.all([
                countByCQL(`space="${key}" AND type="database"`),
                countByCQL(`space="${key}" AND type="whiteboard"`),
                countByCQL(`space="${key}" AND type="folder"`),
                countByCQL(`space="${key}" AND type="smart-link"`),
                countByCQL(`space="${key}" AND type="calendar"`),
                countByCQL(`space="${key}" AND content.type="com.atlassian.confluence.extra.calendar:calendar-content-type"`)
            ]);

            results.push({
              domain: domain,
              source: domain,
              spaceName: item.spaceName,
              spaceKey: key,
              owner: owner,
              databases: db, whiteboards: wb, folders: fo, smartlinks: sl, 
              calendars: cal, spaceCalendars: scal,
              ...counts
            });
        } catch (e) { results.push({ domain: domain, spaceKey: key, error: e.message }); }
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