import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { jsonResponse } from './testUtils.js';

let currentFetchImpl = async () => { throw new Error('No fetch mock configured for this test'); };
mock.module('node-fetch', { exports: { default: (...args) => currentFetchImpl(...args) } });

const { default: customFieldAnalysis } = await import('./customFieldAnalysis.js');

const ctx = { headers: {}, jiraBaseUrl: 'https://x.atlassian.net/rest/api/3' };
const cf = (id, name, custom = 'com.atlassian.jira.plugin.system.customfieldtypes:textfield') => ({ id, name, custom: true, schema: { custom } });

// NOTE: '/field/search' must be matched before '/field' — the latter is a prefix of the former.
function route({ fields, search }) {
  return async (url) => {
    if (url.includes('/field/search')) return search(url);
    if (url.includes('/field')) return jsonResponse(fields);
    throw new Error('Unexpected URL: ' + url);
  };
}

test('finds duplicates from /field, skips system fields, and adds usage metrics from /field/search', async () => {
  currentFetchImpl = route({
    fields: [cf('customfield_1', 'Story Points'), cf('customfield_2', 'story points'), { id: 'summary', name: 'Story Points', custom: false }, cf('customfield_3', 'Sprint')],
    search: () => jsonResponse({ isLast: true, values: [{ screensCount: 2, contextsCount: 1 }, { screensCount: 0 }, { screensCount: 1, contextsCount: 1 }] }),
  });
  const finding = await customFieldAnalysis(ctx);
  assert.equal(finding.value.total, 3, 'the system field named "Story Points" must not count');
  assert.equal(finding.value.groups.length, 1);
  assert.equal(finding.value.redundant, 1);
  assert.equal(finding.value.usage.notOnAnyScreen, 1);
  assert.equal(finding.error, null);
  assert.equal(finding.severity, 'critical'); // 1 redundant of 3 = 33%
});

test('usage endpoint failure: duplicates and types survive, the finding carries an error note', async () => {
  currentFetchImpl = route({
    fields: [cf('customfield_1', 'Owner'), cf('customfield_2', 'Owner')],
    search: () => jsonResponse({}, false, 403, 'Forbidden'),
  });
  const finding = await customFieldAnalysis(ctx);
  assert.equal(finding.value.groups.length, 1);
  assert.equal(finding.value.usage, null);
  assert.match(finding.error, /field\/search 403/);
  assert.notEqual(finding.severity, 'unavailable', 'a partial failure must not discard the real duplicate result');
});

test('paginates /field/search until isLast', async () => {
  let searchCalls = 0;
  currentFetchImpl = route({
    fields: [cf('customfield_1', 'A')],
    search: (url) => {
      searchCalls++;
      if (url.includes('startAt=0')) return jsonResponse({ isLast: false, values: Array(100).fill({ screensCount: 1, contextsCount: 1 }) });
      return jsonResponse({ isLast: true, values: Array(5).fill({ screensCount: 1, contextsCount: 1 }) });
    },
  });
  const finding = await customFieldAnalysis(ctx);
  assert.equal(searchCalls, 2);
  assert.equal(finding.value.usage.total, 105);
});

test('falls back to schema.type when a field has no schema.custom', async () => {
  currentFetchImpl = route({
    fields: [{ id: 'customfield_1', name: 'X', custom: true, schema: { type: 'string' } }, { id: 'customfield_2', name: 'X', custom: true, schema: { type: 'string' } }],
    search: () => jsonResponse({ isLast: true, values: [] }),
  });
  const finding = await customFieldAnalysis(ctx);
  assert.equal(finding.value.groups[0].typeMatch, 'same');
});

test('a hard failure on /field itself throws, for the registry to catch as unavailable', async () => {
  currentFetchImpl = async () => jsonResponse({}, false, 500, 'Internal Server Error');
  await assert.rejects(() => customFieldAnalysis(ctx), /field 500/);
});
