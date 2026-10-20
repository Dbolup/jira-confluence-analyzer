import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { jsonResponse } from './testUtils.js';

let currentFetchImpl = async () => { throw new Error('No fetch mock configured for this test'); };
mock.module('node-fetch', { exports: { default: (...args) => currentFetchImpl(...args) } });

const { default: workflowCustomFields } = await import('./workflowCustomFields.js');

const ctx = { headers: {}, jiraBaseUrl: 'https://x.atlassian.net/rest/api/3' };

test('finds workflows referencing a custom field and resolves the field name', async () => {
  currentFetchImpl = async (url) => {
    if (url.includes('/field')) return jsonResponse([{ id: 'customfield_10042', name: 'Story Points', custom: true }]);
    if (url.includes('/workflow/search')) {
      return jsonResponse({
        isLast: true,
        values: [
          { id: { name: 'Bug Workflow' }, transitions: [{ rules: { postFunctions: [{ configuration: { fieldId: 'customfield_10042' } }] } }] },
          { id: { name: 'Simple Workflow' }, transitions: [] },
        ],
      });
    }
    throw new Error('Unexpected URL: ' + url);
  };
  const finding = await workflowCustomFields(ctx);
  assert.equal(finding.value.totalWorkflows, 2);
  assert.equal(finding.value.workflowsWithCustomFields, 1);
  assert.equal(finding.value.details[0].name, 'Bug Workflow');
  assert.deepEqual(finding.value.details[0].fields, ['Story Points']);
  assert.equal(finding.severity, 'info', 'this check is informational only, never warning/critical');
});

test('falls back to the raw field ID when the field is not in the site\'s field list', async () => {
  currentFetchImpl = async (url) => {
    if (url.includes('/field')) return jsonResponse([]); // no custom fields known
    if (url.includes('/workflow/search')) {
      return jsonResponse({ isLast: true, values: [{ id: { name: 'Odd Workflow' }, transitions: [{ x: 'customfield_99999' }] }] });
    }
    throw new Error('Unexpected URL: ' + url);
  };
  const finding = await workflowCustomFields(ctx);
  assert.deepEqual(finding.value.details[0].fields, ['customfield_99999']);
});

test('no matches: reports zero without error', async () => {
  currentFetchImpl = async (url) => {
    if (url.includes('/field')) return jsonResponse([]);
    if (url.includes('/workflow/search')) return jsonResponse({ isLast: true, values: [{ id: { name: 'Plain' }, transitions: [] }] });
    throw new Error('Unexpected URL: ' + url);
  };
  const finding = await workflowCustomFields(ctx);
  assert.equal(finding.value.workflowsWithCustomFields, 0);
  assert.equal(finding.recommendation, null);
});
