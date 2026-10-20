import { test } from 'node:test';
import assert from 'node:assert/strict';
import workflowCustomFields from './workflowCustomFields.js';

test('scans the XML descriptor text for customfield_<id> and resolves the name', async () => {
  const db = {
    query: async (sql) => {
      if (sql.includes('FROM customfield')) return [{ id: 10042, cfname: 'Story Points' }];
      if (sql.includes('FROM jiraworkflows')) {
        return [
          { workflowname: 'Bug Workflow', descriptor: '<workflow><meta-attributes><arg name="value">customfield_10042</arg></meta-attributes></workflow>' },
          { workflowname: 'Simple Workflow', descriptor: '<workflow></workflow>' },
        ];
      }
      throw new Error('Unmocked query: ' + sql);
    },
  };
  const finding = await workflowCustomFields({ db });
  assert.equal(finding.value.totalWorkflows, 2);
  assert.equal(finding.value.workflowsWithCustomFields, 1);
  assert.equal(finding.value.details[0].name, 'Bug Workflow');
  assert.deepEqual(finding.value.details[0].fields, ['Story Points']);
});

test('handles a null/missing descriptor without throwing', async () => {
  const db = {
    query: async (sql) => {
      if (sql.includes('FROM customfield')) return [];
      if (sql.includes('FROM jiraworkflows')) return [{ workflowname: 'Weird', descriptor: null }];
      throw new Error('Unmocked query: ' + sql);
    },
  };
  const finding = await workflowCustomFields({ db });
  assert.equal(finding.value.workflowsWithCustomFields, 0);
});
