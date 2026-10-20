import 'dotenv/config';
import express from 'express';
import { runChecks } from './checks/registry.js';
import { computeJiraStatsCloud, computeJiraStatsDc, computeConfluenceStatsCloud, computeConfluenceStatsDc } from './stats.js';
import { openDbConnection } from './dbConnection.js';
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
if (!process.env.ENCRYPTION_KEY) {
    console.warn('⚠ ENCRYPTION_KEY is not set — using the built-in development key. Set your own in a real deployment before anyone stores credentials.');
}

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
app.get('/discovery', (req, res) => res.sendFile(path.join(__dirname, 'public/discovery.html')));

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
        // Call sites write queries with MySQL-style '?' placeholders; translate to Postgres's '$1, $2, ...' here.
        let paramIndex = 0;
        const pgQuery = query.replace(/\?/g, () => `$${++paramIndex}`);
        try { const res = await pool.query(pgQuery, params); await pool.end(); return res.rows; }
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
            const jiraBaseUrl = getBaseUrl(site.domain);
            results.push(await computeJiraStatsCloud({ domain: site.domain, headers, jiraBaseUrl }));
        } else {
            results.push(await computeJiraStatsDc({ name: site.name, query: (sql, params) => queryDB(site, sql, params) }));
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

                    // Fetch exactly the endpoints for the mapped schemes
                    const [perm, notif, wfScheme, itScheme, prioList, screenMap, fcMap, stats] = await Promise.all([
                        safeFetch(`${baseUrl}/project/${pKey}/permissionscheme`),
                        safeFetch(`${baseUrl}/project/${pKey}/notificationscheme`),
                        safeFetch(`${baseUrl}/workflowscheme/project?projectId=${pId}`),
                        safeFetch(`${baseUrl}/issuetypescheme/project?projectId=${pId}`),
                        safeFetch(`${baseUrl}/priorityscheme?expand=projects`),
                        safeFetch(`${baseUrl}/issuetypescreenscheme/project?projectId=${pId}`),
                        safeFetch(`${baseUrl}/fieldconfigurationscheme/project?projectId=${pId}`),
                        safeFetch(`${baseUrl}/project/${pKey}/statuses`)
                    ]);

                    // Parse Workflow, Issue Type, Screen, and Field Config directly from the values array
                    const workflowName = wfScheme.values?.[0]?.workflowScheme?.name || "-";
                    const issueTypeName = itScheme.values?.[0]?.issueTypeScheme?.name || "-";
                    const screenName = screenMap.values?.[0]?.issueTypeScreenScheme?.name || "-";
                    const fieldConfigName = fcMap.values?.[0]?.fieldConfigurationScheme?.name || "-";

                    // Parse Priority (Match project inside the expanded projects array)
                    let priorityName = "-";
                    if (prioList.values) {
                        const found = prioList.values.find(s => s.projects?.values?.some(p => String(p.id) === String(pId)));
                        if (found) priorityName = found.name;
                    }

                    // Format Statuses
                    let statusList = "-";
                    if(Array.isArray(stats)) {
                        const set = new Set();
                        stats.forEach(t => t.statuses?.forEach(s => set.add(s.name)));
                        const result = Array.from(set).sort().join(', ');
                        if (result) statusList = result;
                    }

                    // Label Team-Managed projects (which don't use classic schemes)
                    const isTeamManaged = proj.style === 'next-gen';

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
                        queryDB(src, `SELECT count(*) as "cnt" FROM jiraissue WHERE project = (SELECT id FROM project WHERE pkey = ?)`, [pKey]),
                        queryDB(src, `SELECT count(*) as "cnt" FROM component WHERE project = (SELECT id FROM project WHERE pkey = ?)`, [pKey])
                    ]);

                    let leadName = "Unknown";
                    try {
                        const leadSql = `SELECT u.display_name FROM project p LEFT JOIN app_user au ON p.lead = au.user_key LEFT JOIN cwd_user u ON au.lower_user_name = u.lower_user_name WHERE p.pkey = ?`;
                        const leadData = await queryDB(src, leadSql, [pKey]);
                        if (leadData[0]?.display_name) leadName = leadData[0].display_name;
                    } catch(e) {}

                    const getScheme = async (entity, table) => {
                        try {
                            const sql = `SELECT s.NAME FROM nodeassociation na JOIN ${table} s ON na.SINK_NODE_ID = s.ID WHERE na.SOURCE_NODE_ENTITY = 'Project' AND na.SINK_NODE_ENTITY = '${entity}' AND na.SOURCE_NODE_ID = (SELECT id FROM project WHERE pkey = ?)`;
                            const r = await queryDB(src, sql, [pKey]);
                            return r[0]?.NAME || "-";
                        } catch(e) { return "-"; }
                    };

                    const getConfigScheme = async (fieldId) => {
                        try {
                            const sql = `SELECT fs.configname FROM fieldconfigscheme fs JOIN configurationcontext cc ON fs.id = cc.fieldconfigscheme WHERE cc.project = (SELECT id FROM project WHERE pkey = ?) AND cc.fieldid = '${fieldId}'`;
                            const res = await queryDB(src, sql, [pKey]);
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
              const confluenceBaseUrl = getBaseUrl(site.domain, 'confluence');
              results.push(await computeConfluenceStatsCloud({ domain: site.domain, headers, confluenceBaseUrl }));
          } else {
              results.push(await computeConfluenceStatsDc({ name: site.name, query: (sql, params) => queryDB(site, sql, params) }));
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
                    const sql = `SELECT count(*) as "cnt" FROM content c JOIN spaces s ON c.spaceid = s.spaceid WHERE s.spacekey = ? AND c.contenttype = '${cType}' AND (c.content_status = 'current' OR c.content_status IS NULL)`;
                    const res = await queryDB(src, sql, [key]);
                    return res[0]?.cnt || 0;
                };
                const [p, b, a] = await Promise.all([ count('PAGE'), count('BLOGPOST'), count('ATTACHMENT') ]);

                let ownerName = "Unknown";
                try {
                    const ownerSql = `SELECT u.display_name FROM spaces s JOIN user_mapping um ON s.creator = um.user_key JOIN cwd_user u ON um.username = u.user_name WHERE s.spacekey = ?`;
                    const ownerRes = await queryDB(src, ownerSql, [key]);
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

// 7. Discovery — runs the check registry against a single source (Cloud, or DC on Postgres/MySQL).
// Oracle/MSSQL discovery is a separate, not-yet-scoped follow-on (Phase 5's plan).
app.post('/api/discovery/run', async (req, res, next) => {
  try {
    const { source } = req.body;
    if (!source) return res.status(400).json({ error: 'A source is required.' });
    const startedAt = new Date().toISOString();

    if (source.type === 'cloud') {
      const headers = getAuthHeaders(source.email, source.token);
      const jiraBaseUrl = getBaseUrl(source.domain);
      const confluenceBaseUrl = getBaseUrl(source.domain, 'confluence');
      // General Stats (jiraStats/confluenceStats) run alongside the checks, not gating them —
      // a failure here degrades to an { error } object rather than failing the whole run,
      // same "don't let one thing take down the batch" rule the checks themselves follow.
      const [findings, jiraStats, confluenceStats] = await Promise.all([
        runChecks('cloud', { site: source, headers, jiraBaseUrl, confluenceBaseUrl }),
        computeJiraStatsCloud({ domain: source.domain, headers, jiraBaseUrl }).catch((e) => ({ error: e.message })),
        computeConfluenceStatsCloud({ domain: source.domain, headers, confluenceBaseUrl }).catch((e) => ({ error: e.message })),
      ]);
      return res.json({ site: source.domain, startedAt, finishedAt: new Date().toISOString(), findings, jiraStats, confluenceStats });
    }

    if (source.type !== 'postgres' && source.type !== 'mysql') {
      return res.status(400).json({ error: 'Discovery currently supports Cloud, Postgres, and MySQL sources.' });
    }
    let db;
    try {
      // openDbConnection (dbConnection.js) takes plaintext config — this is the one place that
      // decrypts the browser-stored ciphertext before handing it off.
      const dbConfig = { ...source, host: decrypt(source.host), user: decrypt(source.user),
                          database: decrypt(source.database), password: decrypt(source.password) };
      db = await openDbConnection(dbConfig);
      const [findings, jiraStats, confluenceStats] = await Promise.all([
        runChecks('dc', { site: source, db }),
        computeJiraStatsDc({ name: source.name, query: db.query }).catch((e) => ({ error: e.message })),
        computeConfluenceStatsDc({ name: source.name, query: db.query }).catch((e) => ({ error: e.message })),
      ]);
      res.json({ site: source.name, startedAt, finishedAt: new Date().toISOString(), findings, jiraStats, confluenceStats });
    } finally {
      if (db) await db.close();
    }
  } catch (e) { next(e); }
});

// 8. Discovery — validate credentials before committing to a full run.
// Cloud: GET /myself. DC: SELECT 1, same as /api/test-db's already-proven pattern.
app.post('/api/discovery/validate', async (req, res, next) => {
  try {
    const { source } = req.body;
    if (!source) return res.status(400).json({ success: false, error: 'A source is required.' });

    if (source.type === 'cloud') {
      const headers = getAuthHeaders(source.email, source.token);
      const baseUrl = getBaseUrl(source.domain);
      const r = await fetch(`${baseUrl}/myself`, { headers });
      if (!r.ok) return res.json({ success: false, error: `${r.status} ${r.statusText}` });
      const me = await r.json();
      return res.json({ success: true, displayName: me.displayName || me.emailAddress || source.email });
    }

    if (source.type !== 'postgres' && source.type !== 'mysql') {
      return res.status(400).json({ success: false, error: 'Validation currently supports Cloud, Postgres, and MySQL sources.' });
    }
    await queryDB(source, 'SELECT 1');
    res.json({ success: true, displayName: source.name || source.host });
  } catch (e) { res.json({ success: false, error: e.message }); }
});

app.use((err, req, res, next) => {
    console.error("Server Error:", err);
    if (!res.headersSent) res.status(500).json({ error: "Server Error", message: err.message });
});

app.listen(port, () => console.log(`Running on port ${port}`));