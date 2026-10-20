import { test } from 'node:test';
import assert from 'node:assert/strict';
import inactiveProjects from './inactiveProjects.js';

function daysAgo(n) { return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString(); }

test('flags projects with a stale MAX(updated) and projects with no issues at all (null last_update)', async () => {
  const db = {
    query: async () => [
      { pkey: 'OLD', last_update: daysAgo(200) },
      { pkey: 'RECENT', last_update: daysAgo(5) },
      { pkey: 'EMPTY', last_update: null }, // LEFT JOIN with zero issues
    ],
  };
  const finding = await inactiveProjects({ db });
  assert.equal(finding.value.totalProjects, 3);
  assert.deepEqual(finding.value.projects.sort(), ['EMPTY', 'OLD'].sort());
  assert.equal(finding.severity, 'warning');
});

test('no projects: does not throw, reports zero', async () => {
  const db = { query: async () => [] };
  const finding = await inactiveProjects({ db });
  assert.equal(finding.value.totalProjects, 0);
  assert.equal(finding.severity, 'info');
});
