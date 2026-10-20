import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { jsonResponse } from './testUtils.js';

let currentFetchImpl = async () => { throw new Error('No fetch mock configured for this test'); };
mock.module('node-fetch', { exports: { default: (...args) => currentFetchImpl(...args) } });

const { default: inactiveProjects } = await import('./inactiveProjects.js');

const ctx = { headers: {}, jiraBaseUrl: 'https://x.atlassian.net/rest/api/3' };

function daysAgo(n) { return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString(); }

test('flags projects with no activity in 180+ days, and projects with no activity data at all', async () => {
  currentFetchImpl = async () => jsonResponse({
    isLast: true,
    values: [
      { key: 'OLD', insight: { lastIssueUpdateTime: daysAgo(200) } },
      { key: 'RECENT', insight: { lastIssueUpdateTime: daysAgo(5) } },
      { key: 'NODATA', insight: {} },
    ],
  });
  const finding = await inactiveProjects(ctx);
  assert.equal(finding.value.totalProjects, 3);
  assert.deepEqual(finding.value.projects.sort(), ['NODATA', 'OLD'].sort());
  assert.equal(finding.severity, 'warning');
});

test('all projects active: info, no recommendation', async () => {
  currentFetchImpl = async () => jsonResponse({ isLast: true, values: [{ key: 'A', insight: { lastIssueUpdateTime: daysAgo(1) } }] });
  const finding = await inactiveProjects(ctx);
  assert.equal(finding.value.inactiveProjects, 0);
  assert.equal(finding.severity, 'info');
  assert.equal(finding.recommendation, null);
});
