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
    let d = domain.replace(/https?:\/\//, '').split('/')[0];
    if (!d.includes('.')) d += '.atlassian.net';
    return type === 'confluence' ? `https://${d}/wiki/rest/api` : `https://${d}/rest/api/3`;
};

// --- DB Helper ---
async function queryDB(config, query, params = []) {
    if (config.type === 'postgres') {
        const pgConfig = {
            user: config.user, host: config.host, database: config.database,
            password: config.password, port: config.port
        };
        if (config.ssl) pgConfig.ssl = { rejectUnauthorized: false };
        
        const pool = new Pool(pgConfig);
        try { 
            const res = await pool.query(query, params); 
            await pool.end(); 
            return res.rows; 
        } catch (e) { await pool.end(); throw e; }
    } else if (config.type === 'mysql') {
        const conn = await mysql.createConnection({ 
            host: config.host, user: config.user, database: config.database, 
            password: config.password, port: config.port 
        });
        const [rows] = await conn.execute(query, params); 
        await conn.end(); 
        return rows;
    }
    throw new Error('Unsupported DB Type');
}

// ==========================================
// 🔷 API ROUTES
// ==========================================

// 0. Test Connection
app.post('/api/test-db', async (req, res) => {
    try {
        await queryDB(req.body, 'SELECT 1');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// 1. Jira Stats (Removed Issue Count)
app.post('/api/stats', async (req, res, next) => {
  try {
    const { sites } = req.body;
    const results = [];
    
    for (const site of sites) {
      try {
        if (site.type === 'cloud') {
            const headers = getAuthHeaders(site.email, site.token);
            const baseUrl = getBaseUrl(site.domain);
            const agileUrl = baseUrl.replace('/api/3', '/agile/1.0');
            const safe = (fn, ...args) => fn(...args).catch(e => ({ error: e.message }));

            // CLOUD: Uses REST API
            const [p, f, w, ws, it, its, pr, st, ns, iss, sc, scs, itss, fc, fcs, r, fl, perm] = await Promise.all([
                safe(jiraUtils.getProjects, { headers, baseUrl }), safe(jiraUtils.getCustomFields, { headers, baseUrl }),
                safe(jiraUtils.getWorkflows, { headers, baseUrl }), safe(jiraUtils.getWorkflowSchemes, { headers, baseUrl }),
                safe(jiraUtils.getIssueTypes, { headers, baseUrl }), safe(jiraUtils.getIssueTypeSchemes, { headers, baseUrl }),
                safe(jiraUtils.getPriorities, { headers, baseUrl }), safe(jiraUtils.getStatuses, { headers, baseUrl }),
                safe(jiraUtils.getNotificationSchemes, { headers, baseUrl }), safe(jiraUtils.getIssueSecuritySchemes, { headers, baseUrl }),
                safe(jiraUtils.getScreens, { headers, baseUrl }), safe(jiraUtils.getScreenSchemes, { headers, baseUrl }),
                safe(jiraUtils.getIssueTypeScreenSchemes, { headers, baseUrl }), safe(jiraUtils.getFieldConfigurations, { headers, baseUrl }),
                safe(jiraUtils.getFieldConfigurationSchemes, { headers, baseUrl }), safe(jiraUtils.getResolutions, { headers, baseUrl }),
                safe(jiraUtils.getFilters, { headers, baseUrl }), safe(jiraUtils.getPermissionSchemes, { headers, baseUrl })
            ]);

            results.push({
                domain: site.domain, type: 'Cloud', name: site.domain,
                projectCount: p.total??p, fieldCount: f.total??f, 
                workflowCount: w, workflowSchemeCount: ws.total??ws,
                issueTypeCount: it, issueTypeSchemeCount: its.total??its,
                priorityCount: pr, statusCount: st, 
                notificationSchemeCount: ns, issueSecuritySchemeCount: iss,
                screenCount: sc, screenSchemeCount: scs, issueTypeScreenSchemeCount: itss,
                fieldConfigurationCount: fc, fieldConfigurationSchemeCount: fcs,
                resolutionCount: r, filterCount: fl, permissionSchemeCount: perm
            });
        } else {
            // DATA CENTER: Uses SQL
            const count = async (table) => {
                try {
                    const res = await queryDB(site, `SELECT count(*) as "cnt" FROM ${table}`);
                    return res[0]?.cnt || 0;
                } catch(e) { return 0; }
            };

            const [p, cf, w, ws, it, its, st, r, prio, ns, perm, iss, sc, scs, itss, fcs] = await Promise.all([
                count('project'), count('customfield'), 
                count('jiraworkflows'), count('workflowscheme'),
                count('issuetype'), count('fieldconfigscheme'),
                count('issuestatus'), count('resolution'), count('priority'),
                count('notificationscheme'), count('permissionscheme'), count('issuesecurityscheme'),
                count('fieldscreen'), count('fieldscreenscheme'), count('issuetypescreenscheme'),
                count('fieldlayoutscheme')
            ]);

            results.push({
                domain: site.name, type: 'Data Center', name: site.name,
                projectCount: p, fieldCount: cf, // Issue Count Removed
                workflowCount: w, workflowSchemeCount: ws,
                issueTypeCount: it, issueTypeSchemeCount: its,
                statusCount: st, resolutionCount: r, priorityCount: prio,
                notificationSchemeCount: ns, permissionSchemeCount: perm, issueSecuritySchemeCount: iss,
                screenCount: sc, screenSchemeCount: scs, issueTypeScreenSchemeCount: itss,
                fieldConfigurationSchemeCount: fcs,
                fieldConfigurationCount: "N/A (DB)",
                filterCount: await count('searchrequest')
            });
        }
      } catch (e) { results.push({ domain: site.domain || site.name, error: e.message }); }
    }
    res.json({ results });
  } catch (e) { next(e); }
});

// 2. Projects Dropdown
app.post('/api/projects', async (req, res, next) => {
  try {
    const { sources } = req.body; 
    const results = [];
    for (const src of sources) {
        try {
            if (src.type === 'cloud') {
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

// 3. Jira Deep Compare (Full DC Support)
app.post('/api/compare-projects', async (req, res, next) => {
    try {
        const { selection } = req.body;
        const items = selection.map(p => ({ source: p.source, projectKey: p.projectKey, projectId: p.projectId }));

        const detailedResults = await Promise.all(items.map(async (item) => {
            const src = item.source;
            const pKey = item.projectKey;
            
            try {
                if (src.type === 'cloud') {
                    // --- CLOUD LOGIC ---
                    const headers = getAuthHeaders(src.email, src.token);
                    const baseUrl = getBaseUrl(src.domain);
                    let pId = item.projectId;
                    
                    const projRes = await fetch(`${baseUrl}/project/${pKey}?expand=components,insight`, { headers });
                    const proj = await projRes.json();
                    if (!pId) pId = proj.id;

                    let issueCount = proj.insight?.totalIssueCount ?? 0;
                    try {
                        const countRes = await fetch(`${baseUrl}/search/approximate-count`, {
                            method: 'POST', headers, body: JSON.stringify({ jql: `project = "${pKey}"` })
                        });
                        const cData = await countRes.json();
                        if(typeof cData.count === 'number') issueCount = cData.count;
                    } catch(e) {}

                    const [perm, notif, wfScheme, itScheme, prioScheme, screenScheme, fcScheme] = await Promise.all([
                        fetch(`${baseUrl}/project/${pKey}/permissionscheme`, { headers }).then(r=>r.ok?r.json():{name:'Default'}),
                        fetch(`${baseUrl}/project/${pKey}/notificationscheme`, { headers }).then(r=>r.ok?r.json():{name:'Default'}),
                        fetch(`${baseUrl}/workflowscheme/project?projectId=${pId}`, { headers }).then(r=>r.ok?r.json():{values:[]}),
                        fetch(`${baseUrl}/issuetypescheme/project?projectId=${pId}`, { headers }).then(r=>r.ok?r.json():{values:[]}),
                        fetch(`${baseUrl}/priorityscheme`, { headers }).then(r=>r.ok?r.json():{values:[]}),
                        fetch(`${baseUrl}/issuetypescreenscheme/project?projectId=${pId}`, { headers }).then(r=>r.ok?r.json():{values:[]}),
                        fetch(`${baseUrl}/fieldconfigurationscheme/project?projectId=${pId}`, { headers }).then(r=>r.ok?r.json():{values:[]})
                    ]);

                    let priorityName = "Default";
                    if (prioScheme.values) {
                        const found = prioScheme.values.find(s => s.projects?.values?.some(ref => ref.id === pId));
                        if (found) priorityName = found.name;
                    }

                    return {
                        domain: src.domain, source: src.domain, name: proj.name, key: proj.key, type: 'Cloud',
                        lead: proj.lead?.displayName || "Unknown",
                        issueCount: issueCount.toLocaleString(),
                        componentCount: (proj.components || []).length,
                        workflowScheme: wfScheme.values?.[0]?.workflowScheme?.name || "Default",
                        permissionScheme: perm.name,
                        notificationScheme: notif.name,
                        issueTypeScheme: itScheme.values?.[0]?.issueTypeScheme?.name || "Default",
                        priorityScheme: priorityName,
                        fieldConfiguration: fcScheme.values?.[0]?.fieldConfigurationScheme?.name || "Default",
                        screenScheme: screenScheme.values?.[0]?.issueTypeScreenScheme?.name || "Default"
                    };
                } else {
                    // --- DATA CENTER LOGIC (Improved) ---
                    
                    // 1. Basic Stats & Lead Name
                    const [countRes, compRes] = await Promise.all([
                        queryDB(src, `SELECT count(*) as "cnt" FROM jiraissue WHERE project = (SELECT id FROM project WHERE pkey = '${pKey}')`),
                        queryDB(src, `SELECT count(*) as "cnt" FROM component WHERE project = (SELECT id FROM project WHERE pkey = '${pKey}')`)
                    ]);

                    // Lead Name Join (Project -> AppUser -> CwdUser)
                    let leadName = "Unknown";
                    try {
                        // Standard Jira 8.x schema
                        const leadSql = `
                            SELECT u.display_name 
                            FROM project p
                            LEFT JOIN app_user au ON p.lead = au.user_key
                            LEFT JOIN cwd_user u ON au.lower_user_name = u.lower_user_name
                            WHERE p.pkey = '${pKey}'
                        `;
                        const leadData = await queryDB(src, leadSql);
                        if (leadData[0]?.display_name) leadName = leadData[0].display_name;
                        else {
                            // Fallback for older Jira
                            const oldLeadSql = `SELECT lead FROM project WHERE pkey = '${pKey}'`;
                            const oldLead = await queryDB(src, oldLeadSql);
                            leadName = oldLead[0]?.lead || "Unknown";
                        }
                    } catch(e) { console.error("Lead SQL Error", e); }

                    // 2. Resolve Schemes
                    const getScheme = async (entity, table) => {
                        try {
                            const sql = `SELECT s.NAME FROM nodeassociation na JOIN ${table} s ON na.SINK_NODE_ID = s.ID WHERE na.SOURCE_NODE_ENTITY = 'Project' AND na.SINK_NODE_ENTITY = '${entity}' AND na.SOURCE_NODE_ID = (SELECT id FROM project WHERE pkey = '${pKey}')`;
                            const r = await queryDB(src, sql);
                            return r[0]?.NAME || "Default";
                        } catch(e) { return "Default"; }
                    };

                    const [wfName, permName, notifName, fcName, screenName] = await Promise.all([
                        getScheme('WorkflowScheme', 'workflowscheme'),
                        getScheme('PermissionScheme', 'permissionscheme'),
                        getScheme('NotificationScheme', 'notificationscheme'),
                        getScheme('FieldLayoutScheme', 'fieldlayoutscheme'),
                        getScheme('IssueTypeScreenScheme', 'issuetypescreenscheme')
                    ]);

                    return {
                        domain: src.name, source: src.name, name: pKey, key: pKey, type: 'Data Center',
                        lead: leadName,
                        issueCount: countRes[0]?.cnt || 0,
                        componentCount: compRes[0]?.cnt || 0,
                        workflowScheme: wfName,
                        permissionScheme: permName,
                        notificationScheme: notifName,
                        fieldConfiguration: fcName,
                        screenScheme: screenName,
                        issueTypeScheme: "N/A (DB)", // Too complex for single SQL
                        priorityScheme: "N/A (DB)"
                    };
                }
            } catch (e) { return { domain: src.domain||src.name, source: src.domain||src.name, key: pKey, error: e.message }; }
        }));
        res.json({ results: detailedResults });
    } catch(e) { next(e); }
});

// 4. Confluence Stats
app.post('/api/confluence/stats', async (req, res, next) => {
  try {
    const { sites } = req.body;
    const results = [];
    for (const site of sites) {
      try {
          if (site.type === 'cloud') {
              const headers = getAuthHeaders(site.email, site.token);
              const baseUrl = getBaseUrl(site.domain, 'confluence');
              results.push({ domain: site.domain, type: 'Cloud', name: site.domain, ...(await confluenceUtils.getSpaces({ headers, baseUrl })) });
          } else {
              const count = async (where='') => {
                  const res = await queryDB(site, `SELECT count(*) as "cnt" FROM spaces ${where}`);
                  return res[0]?.cnt || 0;
              };
              results.push({
                  domain: site.name, type: 'Data Center', name: site.name,
                  total: await count("WHERE spacestatus = 'CURRENT'"),
                  global: await count("WHERE spacetype = 'global' AND spacestatus = 'CURRENT'"),
                  personal: await count("WHERE spacetype = 'personal' AND spacestatus = 'CURRENT'"),
                  archived: await count("WHERE spacestatus = 'ARCHIVED'")
              });
          }
      } catch (e) { results.push({ domain: site.domain||site.name, error: e.message }); }
    }
    res.json({ results });
  } catch(e) { next(e); }
});

// 5. Confluence Spaces
app.post('/api/confluence/spaces', async (req, res, next) => {
  try {
    const { sources } = req.body;
    const results = [];
    for (const src of sources) {
        try {
            if (src.type === 'cloud') {
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

// 6. Confluence Deep Compare
app.post('/api/confluence/compare-spaces', async (req, res, next) => {
  try {
    const { spaces } = req.body;
    const results = [];
    for (const item of spaces) {
        const src = item.source;
        const key = item.spaceKey;
        try {
            if (src.type === 'cloud') {
                const headers = getAuthHeaders(src.email, src.token);
                const baseUrl = getBaseUrl(src.domain, 'confluence');
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
                    countByCQL(`space="${key}" AND type="database"`), countByCQL(`space="${key}" AND type="whiteboard"`),
                    countByCQL(`space="${key}" AND type="folder"`), countByCQL(`space="${key}" AND type="smart-link"`),
                    countByCQL(`space="${key}" AND type="calendar"`), countByCQL(`space="${key}" AND content.type="com.atlassian.confluence.extra.calendar:calendar-content-type"`)
                ]);

                results.push({
                    domain: src.domain, source: src.domain, spaceName: item.spaceName, spaceKey: key, type: 'Cloud',
                    owner, databases: db, whiteboards: wb, folders: fo, smartlinks: sl, calendars: cal, spaceCalendars: scal, ...counts
                });
            } else {
                // DC Logic
                const count = async (cType) => {
                    const sql = `SELECT count(*) as "cnt" FROM content c JOIN spaces s ON c.spaceid = s.spaceid WHERE s.spacekey = '${key}' AND c.contenttype = '${cType}' AND c.content_status = 'current'`;
                    const res = await queryDB(src, sql);
                    return res[0]?.cnt || 0;
                };
                const [p, b, a] = await Promise.all([ count('PAGE'), count('BLOGPOST'), count('ATTACHMENT') ]);

                results.push({
                    domain: src.name, source: src.name, spaceName: item.spaceName, spaceKey: key, type: 'Data Center',
                    pages: p, blogposts: b, attachments: a,
                    databases: null, whiteboards: null, calendars: null, spaceCalendars: null, smartlinks: null, folders: null, owner: "N/A (DB)"
                });
            }
        } catch (e) { results.push({ domain: src.domain||src.name, error: e.message }); }
    }
    res.json({ results });
  } catch(e) { next(e); }
});

app.use((err, req, res, next) => {
    console.error("Server Error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Server Error", message: err.message });
});

app.listen(port, () => console.log(`Running on http://localhost:${port}`));