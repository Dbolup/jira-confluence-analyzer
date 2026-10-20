// Shared "general stats" computation for a single Jira/Confluence source — used by /api/stats,
// /api/confluence/stats, and the Discovery report's General Stats section, so all three read
// from one place instead of three copies of the same counting logic drifting apart.
//
// The Cloud functions call the Atlassian REST API directly (via node-fetch). The DC functions
// take a `query(sql, params) => rows` function rather than a source config, so callers can pass
// either a fresh queryDB()-backed call per query (what /api/stats already does) or a shared
// connection's query() (what Discovery's DC path opens once per run, per Phase 5) — this module
// doesn't care which, it just needs something that runs SQL and returns rows.
import fetch from 'node-fetch';

export async function computeJiraStatsCloud({ domain, headers, jiraBaseUrl }) {
  const fetchAPI = async (endpoint) => {
    const r = await fetch(`${jiraBaseUrl}/${endpoint}`, { headers });
    if (!r.ok) throw new Error(`${endpoint} ${r.statusText}`);
    return r.json();
  };
  const safe = (p) => p.catch((e) => ({ error: e.message }));
  // Distinguishes a real zero from a failed fetch: null means "couldn't be determined", not "counted as zero".
  const countOf = (result, pick) => (result && result.error ? null : pick(result) ?? 0);

  const [p, f, w, ws, it, its, pr, st, ns, iss, sc, scs, itss, fc, fcs, r, fl, perm] = await Promise.all([
    // Classic GET /project is deprecated by Atlassian; /project/search is its paginated replacement.
    // status=live,archived matches what the classic endpoint used to return (archived projects included).
    safe(fetchAPI('project/search?maxResults=0&status=live,archived')), safe(fetchAPI('field')), safe(fetchAPI('workflow')), safe(fetchAPI('workflowscheme')),
    safe(fetchAPI('issuetype')), safe(fetchAPI('issuetypescheme')), safe(fetchAPI('priority')), safe(fetchAPI('status')),
    safe(fetchAPI('notificationscheme')), safe(fetchAPI('issuesecurityschemes')), safe(fetchAPI('screens')), safe(fetchAPI('screenscheme')),
    safe(fetchAPI('issuetypescreenscheme')), safe(fetchAPI('fieldconfiguration')), safe(fetchAPI('fieldconfigurationscheme')), safe(fetchAPI('resolution')),
    safe(fetchAPI('filter/search')), safe(fetchAPI('permissionscheme')),
  ]);

  return {
    domain, type: 'Cloud', name: domain,
    projectCount: countOf(p, (x) => x.total), fieldCount: countOf(f, (x) => x.length),
    workflowCount: countOf(w, (x) => x.length), workflowSchemeCount: countOf(ws, (x) => x.total),
    issueTypeCount: countOf(it, (x) => x.length), issueTypeSchemeCount: countOf(its, (x) => x.total),
    priorityCount: countOf(pr, (x) => x.length), statusCount: countOf(st, (x) => x.length),
    notificationSchemeCount: countOf(ns, (x) => x.total), issueSecuritySchemeCount: countOf(iss, (x) => x.issueSecuritySchemes?.length),
    screenCount: countOf(sc, (x) => x.total), screenSchemeCount: countOf(scs, (x) => x.total), issueTypeScreenSchemeCount: countOf(itss, (x) => x.total),
    fieldConfigurationCount: countOf(fc, (x) => x.total), fieldConfigurationSchemeCount: countOf(fcs, (x) => x.total),
    resolutionCount: countOf(r, (x) => x.length), filterCount: countOf(fl, (x) => x.total), permissionSchemeCount: countOf(perm, (x) => x.permissionSchemes?.length),
  };
}

export async function computeJiraStatsDc({ name, query }) {
  const count = async (table) => {
    try { const res = await query(`SELECT count(*) as cnt FROM ${table}`); return Number(res[0]?.cnt ?? 0); }
    catch (e) { return null; }
  };

  const [p, cf, w, ws, it, st, r, prio, ns, perm, iss, sc, scs, itss, fcs] = await Promise.all([
    count('project'), count('customfield'), count('jiraworkflows'), count('workflowscheme'), count('issuetype'),
    count('issuestatus'), count('resolution'), count('priority'), count('notificationscheme'), count('permissionscheme'), count('issuesecurityscheme'),
    count('fieldscreen'), count('fieldscreenscheme'), count('issuetypescreenscheme'), count('fieldlayoutscheme'),
  ]);

  let issueTypeSchemeCount = null;
  try {
    const res = await query(`SELECT count(*) as cnt FROM fieldconfigscheme fcs JOIN fieldconfiguration fc ON fcs.id = fc.fieldconfigscheme WHERE fc.fieldid='issuetype'`);
    issueTypeSchemeCount = Number(res[0]?.cnt ?? 0);
  } catch (e) { /* stays null */ }

  return {
    domain: name, type: 'Data Center', name,
    projectCount: p, fieldCount: cf, workflowCount: w, workflowSchemeCount: ws, issueTypeCount: it,
    issueTypeSchemeCount, statusCount: st, resolutionCount: r, priorityCount: prio, notificationSchemeCount: ns,
    permissionSchemeCount: perm, issueSecuritySchemeCount: iss, screenCount: sc, screenSchemeCount: scs,
    issueTypeScreenSchemeCount: itss, fieldConfigurationSchemeCount: fcs, fieldConfigurationCount: 'N/A (DB)',
    filterCount: await count('searchrequest'),
  };
}

export async function computeConfluenceStatsCloud({ domain, headers, confluenceBaseUrl }) {
  const r = await fetch(`${confluenceBaseUrl}/space?limit=500`, { headers });
  if (!r.ok) throw new Error(`space ${r.status} ${r.statusText}`);
  const data = await r.json();
  const spaces = data.results || [];
  return {
    domain, type: 'Cloud', name: domain,
    total: spaces.length,
    active: spaces.filter((s) => s.status === 'current').length,
    archived: spaces.filter((s) => s.status === 'archived').length,
    global: spaces.filter((s) => s.type === 'global').length,
    personal: spaces.filter((s) => s.type === 'personal').length,
  };
}

export async function computeConfluenceStatsDc({ name, query }) {
  const count = async (where = '') => {
    const res = await query(`SELECT count(*) as cnt FROM spaces ${where}`);
    return Number(res[0]?.cnt ?? 0);
  };
  return {
    domain: name, type: 'Data Center', name,
    total: await count("WHERE spacestatus = 'CURRENT' OR spacestatus IS NULL"),
    global: await count("WHERE spacetype = 'global' AND (spacestatus = 'CURRENT' OR spacestatus IS NULL)"),
    personal: await count("WHERE spacetype = 'personal' AND (spacestatus = 'CURRENT' OR spacestatus IS NULL)"),
    archived: await count("WHERE spacestatus = 'ARCHIVED'"),
  };
}
