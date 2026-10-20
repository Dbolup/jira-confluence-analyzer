import { test } from 'node:test';
import assert from 'node:assert/strict';
import archivedPersonalSpaces from './archivedPersonalSpaces.js';

function fakeDb({ current, global, personal, archived }) {
  return {
    query: async (sql) => {
      if (sql.includes("spacestatus = 'CURRENT'") && sql.includes("spacetype = 'global'")) return [{ cnt: global }];
      if (sql.includes("spacetype = 'personal'")) return [{ cnt: personal }];
      if (sql.includes("spacestatus = 'ARCHIVED'")) return [{ cnt: archived }];
      if (sql.includes("spacestatus = 'CURRENT'")) return [{ cnt: current }];
      throw new Error('Unmocked query: ' + sql);
    },
  };
}

test('total is current + archived (not the DC stats page\'s "total", which excludes archived)', async () => {
  const db = fakeDb({ current: 6, global: 5, personal: 1, archived: 4 });
  const finding = await archivedPersonalSpaces({ db });
  assert.equal(finding.value.total, 10);
  assert.equal(finding.value.archived, 4);
  assert.equal(finding.severity, 'warning'); // 4/10 = 40% > 30%
});

test('below the threshold stays info', async () => {
  const db = fakeDb({ current: 9, global: 8, personal: 1, archived: 1 });
  const finding = await archivedPersonalSpaces({ db });
  assert.equal(finding.severity, 'info');
});
