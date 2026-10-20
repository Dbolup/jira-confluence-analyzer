import { test } from 'node:test';
import assert from 'node:assert/strict';
import customFieldAnalysis from './customFieldAnalysis.js';

const TEXT = 'com.atlassian.jira.plugin.system.customfieldtypes:textfield';

test('detects duplicate names and classifies same vs mixed type using customfieldtypekey', async () => {
  const db = {
    query: async (sql) => {
      assert.match(sql, /customfieldtypekey/);
      return [
        { id: 10001, cfname: 'Story Points', customfieldtypekey: TEXT },
        { id: 10002, cfname: 'story points', customfieldtypekey: TEXT },
        { id: 10003, cfname: 'Owner', customfieldtypekey: TEXT },
        { id: 10004, cfname: 'Owner', customfieldtypekey: 'com.atlassian.jira.plugin.system.customfieldtypes:float' },
      ];
    },
  };
  const finding = await customFieldAnalysis({ db });
  assert.equal(finding.value.groups.length, 2);
  assert.equal(finding.value.groups.find((g) => g.name === 'Owner').typeMatch, 'mixed');
  assert.equal(finding.value.groups.find((g) => g.name === 'Story Points').typeMatch, 'same');
  assert.equal(finding.value.usage, null, 'usage metrics are Cloud-only by decision');
  assert.equal(finding.error, null);
});

test('missing customfieldtypekey column: falls back to id/cfname, keeps duplicates, drops types, notes it', async () => {
  const db = {
    query: async (sql) => {
      if (sql.includes('customfieldtypekey')) throw new Error('column "customfieldtypekey" does not exist');
      return [{ id: 1, cfname: 'Owner' }, { id: 2, cfname: 'Owner' }, { id: 3, cfname: 'Sprint' }];
    },
  };
  const finding = await customFieldAnalysis({ db });
  assert.equal(finding.value.groups.length, 1);
  assert.equal(finding.value.groups[0].typeMatch, 'unknown');
  assert.match(finding.error, /customfieldtypekey/);
  assert.notEqual(finding.severity, 'unavailable');
});

test('coerces Postgres/MySQL id types without breaking grouping', async () => {
  const db = { query: async () => [{ id: '1', cfname: 'A', customfieldtypekey: null }, { id: '2', cfname: 'A', customfieldtypekey: null }] };
  const finding = await customFieldAnalysis({ db });
  assert.equal(finding.value.groups[0].count, 2);
});

test('when even the fallback query fails, it throws for the registry to catch as unavailable', async () => {
  const db = { query: async () => { throw new Error('relation "customfield" does not exist'); } };
  await assert.rejects(() => customFieldAnalysis({ db }), /customfield/);
});
