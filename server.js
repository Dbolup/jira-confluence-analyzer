import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch'; 
import pg from 'pg';
import mysql from 'mysql2/promise';

// NOTE: Removed external imports to keep this file self-contained and robust
// import * as jiraUtils from './utils/atlassian.js'; 
// import * as confluenceUtils from './utils/confluence.js';

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

// 1. Jira Stats (Issue Count Removed)
app.post('/api/stats', async (req, res, next) => {
  try {
    const { sites } = req.body;
    const results = [];
    
    for (const site of sites) {
      try {
        if (site.type === 'cloud') {
            const headers = getAuthHeaders(site.email, site.token);
            const baseUrl = getBaseUrl(site.domain);
            
            // Helper to fetch
            const fetchAPI = async (endpoint) => {
                const r = await fetch(`${baseUrl}/${endpoint}`, { headers });
                if(!r.ok) throw new Error(`${endpoint} ${r.statusText}`);
                return r.json();
            };
            const safe = (p) => p.catch(e => ({ error: e.message }));

            // CLOUD
            const [p, f, w, ws, it, its, pr, st, ns, iss, sc, scs, itss, fc, fcs, r, fl, perm] = await Promise.all([
                safe(fetchAPI('project')), safe(fetchAPI('field')),
                safe(fetchAPI('workflow')), safe(fetchAPI('workflowscheme')),
                safe(fetchAPI('issuetype')), safe(fetchAPI('issuetypescheme')),
                safe(fetchAPI('priority')), safe(fetchAPI('status')),
                safe(fetchAPI('notificationscheme')), safe(fetchAPI('issuesecurityschemes')),
                safe(fetchAPI('screens')), safe(fetchAPI('screenscheme')),
                safe(fetchAPI('issuetypescreenscheme')), safe(fetchAPI('fieldconfiguration')),
                safe(fetchAPI('fieldconfigurationscheme')), safe(fetchAPI('resolution')),
                safe(fetchAPI('filter/search')), safe(fetchAPI('permissionscheme'))
            ]);

            results.push({
                domain: site.domain, type: 'Cloud', name: site.domain,
                projectCount: p.length || p.total || 0, 
                fieldCount: f.length || 0,
                workflowCount: w.length || 0, workflowSchemeCount: ws.total || 0,
                issueTypeCount: it.length || 0, issueTypeSchemeCount: its.total || 0,
                priorityCount: pr.length || 0, statusCount: st.length || 0, 
                notificationSchemeCount: ns.total || 0, issueSecuritySchemeCount: iss.issueSecuritySchemes ? iss.issueSecuritySchemes.length : 0,
                screenCount: sc.total || 0, screenSchemeCount: scs.total || 0, issueTypeScreenSchemeCount: itss.total || 0,
                fieldConfigurationCount: fc.total || 0, fieldConfigurationSchemeCount: fcs.total || 0,
                resolutionCount: r.length || 0, filterCount: fl.total || 0, permissionSchemeCount: perm.permissionSchemes ? perm.permissionSchemes.length : 0
            });
        } else {
            // DATA CENTER
            const count = async (table) => { try { const res = await queryDB(site, `SELECT count(*) as "cnt" FROM ${table}`); return res[0]?.cnt || 0; } catch(e) { return 0; } };
            
            const [p, cf, w, ws, it, its, st, r, prio, ns, perm, iss, sc, scs, itss, fcs] = await Promise.all([
                count('project'), count('customfield'), 
                count('jiraworkflows'), count('workflowscheme'),
                count('issuetype'), 
                queryDB(site, `SELECT count(*) as "cnt" FROM fieldconfigscheme fcs JOIN fieldconfiguration fc ON fcs.id = fc.fieldconfigscheme WHERE fc.fieldid='issuetype'`).then(r=>r[0]?.cnt||0).catch(()=>0),
                count('issuestatus'), count('resolution'), count('priority'),
                count('notificationscheme'), count('permissionscheme'), count('issuesecurityscheme'),
                count('fieldscreen'), count('fieldscreenscheme'), count('issuetypescreenscheme'),
                count('fieldlayoutscheme')
            ]);

            results.push({
                domain: site.name, type: 'Data Center', name: site.name,
                projectCount: p, fieldCount: cf,
                workflowCount: w, workflowSchemeCount: ws,
                issueTypeCount: it, issueTypeSchemeCount: its,
                statusCount: st, resolutionCount: r, priorityCount: prio,
                notificationSchemeCount: ns, permissionSchemeCount: perm, issueSecuritySchemeCount: iss,
                screenCount: sc, screenSchemeCount: scs, issueTypeScreenSchemeCount: itss,
                fieldConfigurationSchemeCount: fcs, fieldConfigurationCount: "N/A (DB)",
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
                const r = await fetch(`${baseUrl}/project`, { headers });
                const data = await r.json();
                results.push({ sourceName: src.domain, type: 'cloud', projects: data });
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

// 3. Jira Deep Compare
app.post('/api/compare-projects', async (req, res, next) => {
    try {
        const { selection } = req.body;
        const items = selection.map(p => ({ source: p.source, projectKey: p.projectKey, projectId: p.projectId }));

        const detailedResults = await Promise.all(items.map(async (item) => {
            const src = item.source;
            const pKey = item.projectKey;
            
            try {
                if (src.type === 'cloud') {
                    // --- CLOUD ---
                    const headers = getAuthHeaders(src.email, src.token);
                    const baseUrl = getBaseUrl(src.domain);
                    let pId = item.projectId;
                    
                    const projRes = await fetch(`${baseUrl}/project/${pKey}?expand=components,insight`, { headers });
                    const proj = await projRes.json();
                    if (!pId) pId = proj.id;

                    let issueCount = proj.insight?.totalIssueCount ?? 0;
                    try {
                        const countRes = await fetch(`${baseUrl}/search/approximate-count`, { method: 'POST', headers, body: JSON.stringify({ jql: `project = "${pKey}"` }) });
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

                    const isTeamManaged = proj.style === 'next-gen';
                    const label = isTeamManaged ? 'Team-Managed' : '';
                    
                    let statusList = "";
                    try {
                        const stRes = await fetch(`${baseUrl}/project/${pKey}/statuses`, { headers });
                        const stData = await stRes.json();
                        if(Array.isArray(stData)) {
                            const set = new Set();
                            stData.forEach(t => t.statuses.forEach(s => set.add(s.name)));
                            statusList = Array.from(set).sort().join(', ');
                        }
                    } catch(e) {}

                    return {
                        domain: src.domain, source: src.domain, name: proj.name, key: proj.key, type: 'Cloud',
                        lead: proj.lead?.displayName || "Unknown",
                        issueCount: issueCount.toLocaleString(),
                        componentCount: (proj.components || []).length,
                        workflowScheme: isTeamManaged ? label : (wfScheme.values?.[0]?.workflowScheme?.name || "Default"),
                        permissionScheme: isTeamManaged ? label : perm.name,
                        notificationScheme: isTeamManaged ? label : notif.name,
                        issueTypeScheme: isTeamManaged ? label : (itScheme.values?.[0]?.issueTypeScheme?.name || "Default"),
                        priorityScheme: isTeamManaged ? label : priorityName,
                        fieldConfiguration: isTeamManaged ? label : (fcScheme.values?.[0]?.fieldConfigurationScheme?.name || "Default"),
                        issueTypeScreenScheme: isTeamManaged ? label : (screenScheme.values?.[0]?.issueTypeScreenScheme?.name || "Default"),
                        statuses: statusList
                    };
                } else {
                    // --- DATA CENTER ---
                    const [countRes, compRes] = await Promise.all([
                        queryDB(src, `SELECT count(*) as "cnt" FROM jiraissue WHERE project = (SELECT id FROM project WHERE pkey = '${pKey}')`),
                        queryDB(src, `SELECT count(*) as "cnt" FROM component WHERE project = (SELECT id FROM project WHERE pkey = '${pKey}')`)
                    ]);

                    let leadName = "Unknown";
                    try {
                        const leadSql = `SELECT u.display_name FROM project p LEFT JOIN app_user au ON p.lead = au.user_key LEFT JOIN cwd_user u ON au.lower_user_name = u.lower_user_name WHERE p.pkey = '${pKey}'`;
                        const leadData = await queryDB(src, leadSql);
                        if (leadData[0]?.display_name) leadName = leadData[0].display_name;
                    } catch(e) {}

                    const getScheme = async (entity, table) => {
                        try {
                            const sql = `SELECT s.NAME FROM nodeassociation na JOIN ${table} s ON na.SINK_NODE_ID = s.ID WHERE na.SOURCE_NODE_ENTITY = 'Project' AND na.SINK_NODE_ENTITY = '${entity}' AND na.SOURCE_NODE_ID = (SELECT id FROM project WHERE pkey = '${pKey}')`;
                            const r = await queryDB(src, sql);
                            return r[0]?.NAME || "Default";
                        } catch(e) { return "Default"; }
                    };

                    let itSchemeName = "Default";
                    try {
                        const itSql = `SELECT fs.configname FROM fieldconfigscheme fs JOIN configurationcontext cc ON fs.id = cc.fieldconfigscheme WHERE cc.project = (SELECT id FROM project WHERE pkey = '${pKey}') AND cc.fieldid='issuetype'`;
                        const itRes = await queryDB(src, itSql);
                        if(itRes[0]?.configname) itSchemeName = itRes[0].configname;
                    } catch(e) {}

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
                        issueTypeScreenScheme: screenName,
                        issueTypeScheme: itSchemeName,
                        priorityScheme: "Skipped (DC)", 
                        statuses: "Skipped (DC)"       
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
              // Fetch limit 0 just to get 'size'
              const r = await fetch(`${baseUrl}/space?limit=500`, { headers });
              const data = await r.json();
              const spaces = data.results || [];
              
              results.push({ 
                  domain: site.domain, type: 'Cloud', name: site.domain, 
                  total: spaces.length,
                  active: spaces.filter(s => s.status === 'current').length,
                  archived: spaces.filter(s => s.status === 'archived').length,
                  global: spaces.filter(s => s.type === 'global').length,
                  personal: spaces.filter(s => s.type === 'personal').length
              });
          } else {
              const count = async (where='') => {
                  const res = await queryDB(site, `SELECT count(*) as "cnt" FROM spaces ${where}`);
                  return res[0]?.cnt || 0;
              };
              results.push({
                  domain: site.name, type: 'Data Center', name: site.name,
                  total: await count("WHERE spacestatus = 'CURRENT' OR spacestatus IS NULL"), 
                  global: await count("WHERE spacetype = 'global' AND (spacestatus = 'CURRENT' OR spacestatus IS NULL)"),
                  personal: await count("WHERE spacetype = 'personal' AND (spacestatus = 'CURRENT' OR spacestatus IS NULL)"),
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
                const r = await fetch(`${baseUrl}/space?limit=500&status=current`, { headers });
                const data = await r.json();
                results.push({ sourceName: src.domain, type:'cloud', spaces: data.results.map(s => ({ key: s.key, name: s.name, id: s.id })) });
            } else {
                const sql = `SELECT spacekey as "key", spacename as "name", spaceid as "id" FROM spaces WHERE spacestatus = 'CURRENT' OR spacestatus IS NULL ORDER BY spacename`;
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
                // ... CLOUD LOGIC ...
                const headers = getAuthHeaders(src.email, src.token);
                const baseUrl = getBaseUrl(src.domain, 'confluence');
                
                // Get Owner
                let owner = "Unknown";
                try {
                    const spaceRes = await fetch(`${baseUrl}/space/${key}?expand=homepage.history.createdBy`, { headers });
                    const spaceData = await spaceRes.json();
                    if(spaceData.homepage?.history?.createdBy) owner = spaceData.homepage.history.createdBy.displayName;
                } catch(e) {}

                // Count contents via CQL
                const countByCQL = async (cql) => {
                    try {
                        const res = await fetch(`${baseUrl}/search?cql=${encodeURIComponent(cql)}&limit=0`, { headers });
                        const data = await res.json();
                        return data.totalSize || 0;
                    } catch(e) { return 0; }
                };

                const [p, b, db, wb, fo, sl, cal, scal] = await Promise.all([
                    countByCQL(`space="${key}" AND type="page"`),
                    countByCQL(`space="${key}" AND type="blogpost"`),
                    countByCQL(`space="${key}" AND type="database"`),
                    countByCQL(`space="${key}" AND type="whiteboard"`),
                    countByCQL(`space="${key}" AND type="folder"`),
                    countByCQL(`space="${key}" AND type="smart-link"`),
                    countByCQL(`space="${key}" AND type="calendar"`),
                    countByCQL(`space="${key}" AND content.type="com.atlassian.confluence.extra.calendar:calendar-content-type"`)
                ]);
                
                // Attachments are tricky in search, usually best guess via content type
                const a = await countByCQL(`space="${key}" AND type="attachment"`);

                results.push({
                    domain: src.domain, source: src.domain, spaceName: item.spaceName, spaceKey: key, type: 'Cloud',
                    owner: owner,
                    pages: p, blogposts: b, attachments: a,
                    databases: db, whiteboards: wb, folders: fo, smartlinks: sl, calendars: cal, spaceCalendars: scal
                });
            } else {
                // --- DATA CENTER ---
                const count = async (cType) => {
                    const sql = `SELECT count(*) as "cnt" FROM content c JOIN spaces s ON c.spaceid = s.spaceid WHERE s.spacekey = '${key}' AND c.contenttype = '${cType}' AND (c.content_status = 'current' OR c.content_status IS NULL)`;
                    const res = await queryDB(src, sql);
                    return res[0]?.cnt || 0;
                };
                const [p, b, a] = await Promise.all([ count('PAGE'), count('BLOGPOST'), count('ATTACHMENT') ]);

                // Owner Fetch
                let ownerName = "Unknown";
                try {
                    const ownerSql = `SELECT u.display_name FROM spaces s JOIN user_mapping um ON s.creator = um.user_key JOIN cwd_user u ON um.username = u.user_name WHERE s.spacekey = '${key}'`;
                    const ownerRes = await queryDB(src, ownerSql);
                    if(ownerRes[0]?.display_name) ownerName = ownerRes[0].display_name;
                } catch(e) {}

                results.push({
                    domain: src.name, source: src.name, spaceName: item.spaceName, spaceKey: key, type: 'Data Center',
                    owner: ownerName,
                    pages: p, blogposts: b, attachments: a,
                    databases: null, whiteboards: null, calendars: null, spaceCalendars: null, smartlinks: null, folders: null
                });
            }
        } catch (e) { 
            results.push({ 
                domain: src.domain||src.name, 
                source: src.domain || src.name,
                spaceName: item.spaceName,
                spaceKey: item.spaceKey,
                type: src.type,
                error: e.message 
            }); 
        }
    }
    res.json({ results });
  } catch(e) { next(e); }
});

app.use((err, req, res, next) => {
    console.error("Server Error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Server Error", message: err.message });
});

app.listen(port, () => console.log(`Running on http://localhost:${port}`));