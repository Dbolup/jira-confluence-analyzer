import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch'; 
import pg from 'pg';
import mysql from 'mysql2/promise';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const { Pool } = pg;

const app = express();
const port = process.env.PORT || 3000; 

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// 🔒 SECURITY (AES-256 Encryption)
// ==========================================
const SECRET_KEY = Buffer.from(process.env.ENCRYPTION_KEY || 'v9y$B&E)H@MbQeThWmZq4t7w!z%C*F-J', 'utf8');

function encrypt(text) {
    if (!text) return text;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', SECRET_KEY, iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return 'ENC:' + iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
    if (!text || !text.startsWith('ENC:')) return text; 
    try {
        const parts = text.replace('ENC:', '').split(':');
        const iv = Buffer.from(parts[0], 'hex');
        const encryptedText = Buffer.from(parts[1], 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', SECRET_KEY, iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        return text;
    }
}

app.post('/api/encrypt', (req, res) => {
    const { payload } = req.body;
    const encryptedPayload = {};
    for (const key in payload) {
        encryptedPayload[key] = encrypt(payload[key]);
    }
    res.json(encryptedPayload);
});

// ==========================================
// 🔷 ROUTES & DB
// ==========================================
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));
app.get('/jira-stats', (req, res) => res.sendFile(path.join(__dirname, 'public/jira-stats.html')));
app.get('/compare', (req, res) => res.sendFile(path.join(__dirname, 'public/compare.html')));
app.get('/insights', (req, res) => res.sendFile(path.join(__dirname, 'public/insights.html')));
app.get('/credentials', (req, res) => res.sendFile(path.join(__dirname, 'public/credentials.html')));
app.get('/confluence-stats', (req, res) => res.sendFile(path.join(__dirname, 'public/confluence-stats.html')));
app.get('/confluence-compare', (req, res) => res.sendFile(path.join(__dirname, 'public/confluence-compare.html')));

const getAuthHeaders = (email, token) => ({ 
    'Authorization': `Basic ${Buffer.from(`${decrypt(email)}:${decrypt(token)}`).toString('base64')}`, 
    'Accept': 'application/json',
    'Content-Type': 'application/json' 
});

const getBaseUrl = (domain, type = 'jira') => {
    let d = domain.replace(/https?:\/\//, '').split('/')[0];
    if (!d.includes('.')) d += '.atlassian.net';
    return type === 'confluence' ? `https://${d}/wiki/rest/api` : `https://${d}/rest/api/3`;
};

async function queryDB(config, query, params = []) {
    if (config.type === 'postgres') {
        const pgConfig = {
            user: decrypt(config.user), host: decrypt(config.host), database: decrypt(config.database),
            password: decrypt(config.password), port: config.port
        };
        if (config.ssl) pgConfig.ssl = { rejectUnauthorized: false };
        const pool = new Pool(pgConfig);
        try { const res = await pool.query(query, params); await pool.end(); return res.rows; } 
        catch (e) { await pool.end(); throw e; }
    } else if (config.type === 'mysql') {
        const conn = await mysql.createConnection({ 
            host: decrypt(config.host), user: decrypt(config.user), database: decrypt(config.database), 
            password: decrypt(config.password), port: config.port 
        });
        const [rows] = await conn.execute(query, params); await conn.end(); return rows;
    }
    throw new Error('Unsupported DB Type');
}

app.post('/api/test-db', async (req, res) => {
    try { await queryDB(req.body, 'SELECT 1'); res.json({ success: true }); } 
    catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// 1. Jira Stats
app.post('/api/stats', async (req, res, next) => {
  try {
    const { sites } = req.body;
    const results = [];
    for (const site of sites) {
      try {
        if (site.type === 'cloud') {
            const headers = getAuthHeaders(site.email, site.token);
            const baseUrl = getBaseUrl(site.domain);
            const fetchAPI = async (endpoint) => {
                const r = await fetch(`${baseUrl}/${endpoint}`, { headers });
                if(!r.ok) throw new Error(`${endpoint} ${r.statusText}`);
                return r.json();
            };
            const safe = (p) => p.catch(e => ({ error: e.message }));

            const [p, f, w, ws, it, its, pr, st, ns, iss, sc, scs, itss, fc, fcs, r, fl, perm] = await Promise.all([
                safe(fetchAPI('project')), safe(fetchAPI('field')), safe(fetchAPI('workflow')), safe(fetchAPI('workflowscheme')),
                safe(fetchAPI('issuetype')), safe(fetchAPI('issuetypescheme')), safe(fetchAPI('priority')), safe(fetchAPI('status')),
                safe(fetchAPI('notificationscheme')), safe(fetchAPI('issuesecurityschemes')), safe(fetchAPI('screens')), safe(fetchAPI('screenscheme')),
                safe(fetchAPI('issuetypescreenscheme')), safe(fetchAPI('fieldconfiguration')), safe(fetchAPI('fieldconfigurationscheme')), safe(fetchAPI('resolution')),
                safe(fetchAPI('filter/search')), safe(fetchAPI('permissionscheme'))
            ]);

            results.push({
                domain: site.domain, type: 'Cloud', name: site.domain,
                projectCount: p.length || p.total || 0, fieldCount: f.length || 0,
                workflowCount: w.length || 0, workflowSchemeCount: ws.total || 0,
                issueTypeCount: it.length || 0, issueTypeSchemeCount: its.total || 0,
                priorityCount: pr.length || 0, statusCount: st.length || 0, 
                notificationSchemeCount: ns.total || 0, issueSecuritySchemeCount: iss.issueSecuritySchemes ? iss.issueSecuritySchemes.length : 0,
                screenCount: sc.total || 0, screenSchemeCount: scs.total || 0, issueTypeScreenSchemeCount: itss.total || 0,
                fieldConfigurationCount: fc.total || 0, fieldConfigurationSchemeCount: fcs.total || 0,
                resolutionCount: r.length || 0, filterCount: fl.total || 0, permissionSchemeCount: perm.permissionSchemes ? perm.permissionSchemes.length : 0
            });
        } else {
            const count = async (table) => { try { const res = await queryDB(site, `SELECT count(*) as "cnt" FROM ${table}`); return res[0]?.cnt || 0; } catch(e) { return 0; } };
            const [p, cf, w, ws, it, st, r, prio, ns, perm, iss, sc, scs, itss, fcs] = await Promise.all([
                count('project'), count('customfield'), count('jiraworkflows'), count('workflowscheme'), count('issuetype'), 
                count('issuestatus'), count('resolution'), count('priority'), count('notificationscheme'), count('permissionscheme'), count('issuesecurityscheme'),
                count('fieldscreen'), count('fieldscreenscheme'), count('issuetypescreenscheme'), count('fieldlayoutscheme')
            ]);
            results.push({
                domain: site.name, type: 'Data Center', name: site.name,
                projectCount: p, fieldCount: cf, workflowCount: w, workflowSchemeCount: ws, issueTypeCount: it,
                issueTypeSchemeCount: await queryDB(site, `SELECT count(*) as "cnt" FROM fieldconfigscheme fcs JOIN fieldconfiguration fc ON fcs.id = fc.fieldconfigscheme WHERE fc.fieldid='issuetype'`).then(r=>r[0]?.cnt||0).catch(()=>0),
                statusCount: st, resolutionCount: r, priorityCount: prio, notificationSchemeCount: ns, permissionSchemeCount: perm, issueSecuritySchemeCount: iss,
                screenCount: sc, screenSchemeCount: scs, issueTypeScreenSchemeCount: itss, fieldConfigurationSchemeCount: fcs, fieldConfigurationCount: "N/A (DB)",
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
                    // --- CLOUD LOGIC ---
                    const headers = getAuthHeaders(src.email, src.token);
                    const baseUrl = getBaseUrl(src.domain);
                    
                    const safeFetch = async (url, options = { headers }) => {
                        try { const r = await fetch(url, options); return r.ok ? await r.json() : {}; } 
                        catch(e) { return {}; }
                    };

                    const proj = await safeFetch(`${baseUrl}/project/${pKey}?expand=components,insight`);
                    let pId = item.projectId || proj.id;

                    let issueCount = proj.insight?.totalIssueCount ?? 0;
                    try {
                        const countReq = await safeFetch(`${baseUrl}/search/approximate-count`, { method: 'POST', headers, body: JSON.stringify({ jql: `project = "${pKey}"` }) });
                        if(typeof countReq.count === 'number') issueCount = countReq.count;
                    } catch(e) {}

                    // Fetch 1: Get standard endpoints 
                    const [perm, notif, wfScheme, itScheme, prioList, screenMap, fcMap, stats] = await Promise.all([
                        safeFetch(`${baseUrl}/project/${pKey}/permissionscheme`),
                        safeFetch(`${baseUrl}/project/${pKey}/notificationscheme`),
                        safeFetch(`${baseUrl}/workflowscheme/project?projectId=${pId}`),
                        safeFetch(`${baseUrl}/issuetypescheme/project?projectId=${pId}`),
                        safeFetch(`${baseUrl}/priorityscheme?expand=projects`),
                        safeFetch(`${baseUrl}/issuetypescreenscheme/project?projectId=${pId}`), // Extract nested 'issueTypeScreenScheme.name'
                        safeFetch(`${baseUrl}/config/fieldschemes?projectId=${pId}`), // NEW ENDPOINT
                        safeFetch(`${baseUrl}/project/${pKey}/statuses`)
                    ]);

                    // Parse Workflow and Issue Type
                    const workflowName = wfScheme.values?.[0]?.workflowScheme?.name || "-";
                    const issueTypeName = itScheme.values?.[0]?.issueTypeScheme?.name || "-";

                    // Parse Priority 
                    let priorityName = "-";
                    if (prioList.values) {
                        const found = prioList.values.find(s => s.projects?.values?.some(p => String(p.id) === String(pId)));
                        if (found) priorityName = found.name;
                    }

                    // Parse Issue Type Screen Scheme 
                    let screenName = "-";
                    if (screenMap.values && screenMap.values.length > 0) {
                        screenName = screenMap.values[0].issueTypeScreenScheme?.name || "-";
                    } else if (screenMap.issueTypeScreenScheme?.name) {
                        screenName = screenMap.issueTypeScreenScheme.name;
                    }

                    // Parse Field Configuration Scheme
                    let fieldConfigName = "-";
                    if (fcMap.values && fcMap.values.length > 0) {
                        fieldConfigName = fcMap.values[0].name || "-";
                    } else if (fcMap.name) {
                        fieldConfigName = fcMap.name;
                    }

                    // Parse Statuses
                    let statusList = "-";
                    if(Array.isArray(stats)) {
                        const set = new Set();
                        stats.forEach(t => t.statuses?.forEach(s => set.add(s.name)));
                        const result = Array.from(set).sort().join(', ');
                        if (result) statusList = result;
                    }

                    const isTeamManaged = proj.style === 'next-gen';
                    const label = isTeamManaged ? 'Team-Managed' : '-';

                    return {
                        domain: src.domain, source: src.domain, name: proj.name, key: proj.key, type: 'Cloud',
                        lead: proj.lead?.displayName || "Unknown",
                        issueCount: issueCount.toLocaleString(),
                        componentCount: (proj.components || []).length,
                        workflowScheme: isTeamManaged ? 'Team-Managed' : workflowName,
                        permissionScheme: isTeamManaged ? 'Team-Managed' : (perm.name || "-"),
                        notificationScheme: isTeamManaged ? 'Team-Managed' : (notif.name || "-"),
                        issueTypeScheme: isTeamManaged ? 'Team-Managed' : issueTypeName,
                        priorityScheme: isTeamManaged ? 'Team-Managed' : priorityName,
                        fieldConfiguration: isTeamManaged ? 'Team-Managed' : fieldConfigName,
                        issueTypeScreenScheme: isTeamManaged ? 'Team-Managed' : screenName,
                        statuses: statusList
                    };
                } else {
                    // --- DATA CENTER LOGIC ---
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
                            return r[0]?.NAME || "-";
                        } catch(e) { return "-"; }
                    };

                    const getConfigScheme = async (fieldId) => {
                        try {
                            const sql = `SELECT fs.configname FROM fieldconfigscheme fs JOIN configurationcontext cc ON fs.id = cc.fieldconfigscheme WHERE cc.project = (SELECT id FROM project WHERE pkey = '${pKey}') AND cc.fieldid = '${fieldId}'`;
                            const res = await queryDB(src, sql);
                            return res[0]?.configname || "-"; 
                        } catch(e) { return "-"; }
                    };

                    const [wfName, permName, notifName, fcName, screenName, itName, prioName] = await Promise.all([
                        getScheme('WorkflowScheme', 'workflowscheme'),
                        getScheme('PermissionScheme', 'permissionscheme'),
                        getScheme('NotificationScheme', 'notificationscheme'),
                        getScheme('FieldLayoutScheme', 'fieldlayoutscheme'),
                        getScheme('IssueTypeScreenScheme', 'issuetypescreenscheme'),
                        getConfigScheme('issuetype'),
                        getConfigScheme('priority')
                    ]);

                    return {
                        domain: src.name, source: src.name, name: pKey, key: pKey, type: 'Data Center',
                        lead: leadName, issueCount: countRes[0]?.cnt || 0, componentCount: compRes[0]?.cnt || 0,
                        workflowScheme: wfName, permissionScheme: permName, notificationScheme: notifName,
                        fieldConfiguration: fcName, issueTypeScreenScheme: screenName, issueTypeScheme: itName,
                        priorityScheme: prioName, statuses: "Skipped (DC)"
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
                const headers = getAuthHeaders(src.email, src.token);
                const baseUrl = getBaseUrl(src.domain, 'confluence');
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

                const [p, b, db, wb, fo, sl, cal, scal, a] = await Promise.all([
                    countByCQL(`space="${key}" AND type="page"`), countByCQL(`space="${key}" AND type="blogpost"`),
                    countByCQL(`space="${key}" AND type="database"`), countByCQL(`space="${key}" AND type="whiteboard"`),
                    countByCQL(`space="${key}" AND type="folder"`), countByCQL(`space="${key}" AND type="smart-link"`),
                    countByCQL(`space="${key}" AND type="calendar"`), countByCQL(`space="${key}" AND content.type="com.atlassian.confluence.extra.calendar:calendar-content-type"`),
                    countByCQL(`space="${key}" AND type="attachment"`)
                ]);

                results.push({
                    domain: src.domain, source: src.domain, spaceName: item.spaceName, spaceKey: key, type: 'Cloud',
                    owner: owner, pages: p, blogposts: b, attachments: a,
                    databases: db, whiteboards: wb, folders: fo, smartlinks: sl, calendars: cal, spaceCalendars: scal
                });
            } else {
                const count = async (cType) => {
                    const sql = `SELECT count(*) as "cnt" FROM content c JOIN spaces s ON c.spaceid = s.spaceid WHERE s.spacekey = '${key}' AND c.contenttype = '${cType}' AND (c.content_status = 'current' OR c.content_status IS NULL)`;
                    const res = await queryDB(src, sql);
                    return res[0]?.cnt || 0;
                };
                const [p, b, a] = await Promise.all([ count('PAGE'), count('BLOGPOST'), count('ATTACHMENT') ]);

                let ownerName = "Unknown";
                try {
                    const ownerSql = `SELECT u.display_name FROM spaces s JOIN user_mapping um ON s.creator = um.user_key JOIN cwd_user u ON um.username = u.user_name WHERE s.spacekey = '${key}'`;
                    const ownerRes = await queryDB(src, ownerSql);
                    if(ownerRes[0]?.display_name) ownerName = ownerRes[0].display_name;
                } catch(e) {}

                results.push({
                    domain: src.name, source: src.name, spaceName: item.spaceName, spaceKey: key, type: 'Data Center',
                    owner: ownerName, pages: p, blogposts: b, attachments: a,
                    databases: null, whiteboards: null, calendars: null, spaceCalendars: null, smartlinks: null, folders: null
                });
            }
        } catch (e) { results.push({ domain: src.domain||src.name, source: src.domain||src.name, spaceName: item.spaceName, spaceKey: item.spaceKey, type: src.type, error: e.message }); }
    }
    res.json({ results });
  } catch(e) { next(e); }
});

app.use((err, req, res, next) => {
    console.error("Server Error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Server Error", message: err.message });
});

app.listen(port, () => console.log(`Running on port ${port}`));