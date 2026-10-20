import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

// stats.js imports node-fetch directly for its two Cloud functions — same reason (and same
// technique) as checks/cloud/*.test.js: Node's module mocking (--experimental-test-module-mocks,
// set in package.json's test script), not a new test dependency.
let currentFetchImpl = async () => { throw new Error('No fetch mock configured for this test'); };
mock.module('node-fetch', { exports: { default: (...args) => currentFetchImpl(...args) } });

const { computeJiraStatsCloud, computeJiraStatsDc, computeConfluenceStatsCloud, computeConfluenceStatsDc } = await import('./stats.js');

function jsonResponse(body, ok = true, status = 200, statusText = 'OK') {
  return { ok, status, statusText, json: async () => body };
}

test('computeJiraStatsCloud: matches the same shape jira-stats.html\'s table reads', async () => {
  currentFetchImpl = async (url) => {
    if (url.includes('/project/search')) return jsonResponse({ total: 12 });
    if (url.includes('/field')) return jsonResponse(Array(40).fill({}));
    if (url.includes('/workflowscheme')) return jsonResponse({ total: 3 });
    if (url.includes('/workflow')) return jsonResponse(Array(8).fill({}));
    if (url.includes('/issuetypescheme')) return jsonResponse({ total: 2 });
    if (url.includes('/issuetype')) return jsonResponse(Array(6).fill({}));
    if (url.includes('/priority')) return jsonResponse(Array(5).fill({}));
    if (url.includes('/status')) return jsonResponse(Array(10).fill({}));
    if (url.includes('/notificationscheme')) return jsonResponse({ total: 1 });
    if (url.includes('/issuesecurityschemes')) return jsonResponse({ issueSecuritySchemes: [{}, {}] });
    if (url.includes('/screenscheme')) return jsonResponse({ total: 4 });
    if (url.includes('/screens')) return jsonResponse({ total: 9 });
    if (url.includes('/issuetypescreenscheme')) return jsonResponse({ total: 2 });
    if (url.includes('/fieldconfigurationscheme')) return jsonResponse({ total: 1 });
    if (url.includes('/fieldconfiguration')) return jsonResponse({ total: 1 });
    if (url.includes('/resolution')) return jsonResponse(Array(3).fill({}));
    if (url.includes('/filter/search')) return jsonResponse({ total: 7 });
    if (url.includes('/permissionscheme')) return jsonResponse({ permissionSchemes: [{}, {}, {}] });
    throw new Error('Unexpected URL: ' + url);
  };
  const stats = await computeJiraStatsCloud({ domain: 'acme.atlassian.net', headers: {}, jiraBaseUrl: 'https://acme.atlassian.net/rest/api/3' });
  assert.equal(stats.projectCount, 12);
  assert.equal(stats.fieldCount, 40);
  assert.equal(stats.permissionSchemeCount, 3);
  assert.equal(stats.type, 'Cloud');
});

test('computeJiraStatsCloud: a single failed endpoint degrades to null for that metric only, not the whole thing', async () => {
  currentFetchImpl = async (url) => {
    if (url.includes('/field')) return jsonResponse({}, false, 500, 'Internal Server Error');
    if (url.includes('/project/search')) return jsonResponse({ total: 5 });
    return jsonResponse([]);
  };
  const stats = await computeJiraStatsCloud({ domain: 'x', headers: {}, jiraBaseUrl: 'https://x.atlassian.net/rest/api/3' });
  assert.equal(stats.fieldCount, null);
  assert.equal(stats.projectCount, 5, 'other metrics must still compute correctly');
});

test('computeConfluenceStatsCloud: counts by status/type from the space list', async () => {
  currentFetchImpl = async () => jsonResponse({
    results: [
      { status: 'current', type: 'global' }, { status: 'current', type: 'global' },
      { status: 'current', type: 'personal' }, { status: 'archived', type: 'global' },
    ],
  });
  const stats = await computeConfluenceStatsCloud({ domain: 'x', headers: {}, confluenceBaseUrl: 'https://x.atlassian.net/wiki/rest/api' });
  assert.equal(stats.total, 4);
  assert.equal(stats.active, 3);
  assert.equal(stats.archived, 1);
  assert.equal(stats.global, 3);
  assert.equal(stats.personal, 1);
});

test('computeConfluenceStatsCloud: a non-ok response throws (this function has no per-field degrade, matching pre-refactor behavior)', async () => {
  currentFetchImpl = async () => jsonResponse({}, false, 404, 'Not Found');
  await assert.rejects(() => computeConfluenceStatsCloud({ domain: 'x', headers: {}, confluenceBaseUrl: 'https://x/wiki/rest/api' }), /404/);
});

test('computeJiraStatsDc: counts via the injected query() function, coerces string counts to numbers', async () => {
  const query = async (sql) => {
    if (sql.includes('FROM project')) return [{ cnt: '12' }];
    if (sql.includes('FROM customfield')) return [{ cnt: 40 }];
    if (sql.includes('fieldconfigscheme')) return [{ cnt: 2 }];
    return [{ cnt: 0 }];
  };
  const stats = await computeJiraStatsDc({ name: 'Test DC', query });
  assert.equal(typeof stats.projectCount, 'number');
  assert.equal(stats.projectCount, 12);
  assert.equal(stats.fieldCount, 40);
  assert.equal(stats.fieldConfigurationCount, 'N/A (DB)', 'not queryable from the DB, matches the pre-refactor placeholder');
  assert.equal(stats.type, 'Data Center');
});

test('computeJiraStatsDc: a query that throws degrades that one metric to null, not the whole result', async () => {
  const query = async (sql) => {
    if (sql.includes('FROM project')) throw new Error('relation "project" does not exist');
    return [{ cnt: 5 }];
  };
  const stats = await computeJiraStatsDc({ name: 'Test DC', query });
  assert.equal(stats.projectCount, null);
  assert.equal(stats.fieldCount, 5, 'other metrics still compute');
});

test('computeConfluenceStatsDc: current+archived split via the injected query()', async () => {
  const query = async (sql) => {
    if (sql.includes("spacetype = 'global'")) return [{ cnt: 5 }];
    if (sql.includes("spacetype = 'personal'")) return [{ cnt: 1 }];
    if (sql.includes("spacestatus = 'ARCHIVED'")) return [{ cnt: 2 }];
    if (sql.includes("spacestatus = 'CURRENT'")) return [{ cnt: 6 }];
    throw new Error('Unmocked: ' + sql);
  };
  const stats = await computeConfluenceStatsDc({ name: 'Test DC', query });
  assert.equal(stats.total, 6);
  assert.equal(stats.global, 5);
  assert.equal(stats.personal, 1);
  assert.equal(stats.archived, 2);
});
