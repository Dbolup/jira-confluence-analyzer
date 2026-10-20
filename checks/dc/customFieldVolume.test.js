import { test } from 'node:test';
import assert from 'node:assert/strict';
import customFieldVolume from './customFieldVolume.js';

function fakeDb(responses) {
  return { query: async (sql) => {
    for (const [pattern, rows] of responses) if (sql.includes(pattern)) return rows;
    throw new Error('Unmocked query: ' + sql);
  } };
}

test('reports critical at exactly the boundary ratio, same threshold as the Cloud check', async () => {
  const db = fakeDb([
    ['FROM customfield', [{ cnt: 4000 }]],
    ['FROM issuetype', [{ cnt: 12 }]],
    ['FROM cwd_user', [{ cnt: 800 }]],
  ]);
  const finding = await customFieldVolume({ db });
  assert.equal(finding.severity, 'critical');
  assert.equal(finding.value.ratio, 5);
});

test('coerces Postgres-style string counts (BIGINT) to real numbers', async () => {
  // pg returns COUNT(*) as a string, not a number, by default — the check must Number() it.
  const db = fakeDb([
    ['FROM customfield', [{ cnt: '50' }]],
    ['FROM issuetype', [{ cnt: '5' }]],
    ['FROM cwd_user', [{ cnt: '200' }]],
  ]);
  const finding = await customFieldVolume({ db });
  assert.equal(typeof finding.value.customFieldCount, 'number');
  assert.equal(finding.value.customFieldCount, 50);
  assert.equal(finding.value.ratio, 0.3); // 50/200=0.25, rounded to 1 decimal by the check's own toFixed(1)
});

test('a query failure (e.g. table does not exist) throws for the registry to catch', async () => {
  const db = { query: async () => { throw new Error('relation "customfield" does not exist'); } };
  await assert.rejects(() => customFieldVolume({ db }));
});
