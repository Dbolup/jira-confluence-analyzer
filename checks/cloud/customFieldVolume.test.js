import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { jsonResponse } from './testUtils.js';

// node-fetch is a real import inside customFieldVolume.js, not the global fetch — Node's
// built-in module mocking (--experimental-test-module-mocks, set in package.json's test
// script) intercepts the import itself, so no new test dependency (e.g. nock) is needed.
let currentFetchImpl = async () => { throw new Error('No fetch mock configured for this test'); };
mock.module('node-fetch', { exports: { default: (...args) => currentFetchImpl(...args) } });

const { default: customFieldVolume } = await import('./customFieldVolume.js');

const ctx = { headers: {}, jiraBaseUrl: 'https://x.atlassian.net/rest/api/3' };

test('reports critical at exactly the boundary ratio (Wale\'s own anecdote: 4000 fields / 800 users)', async () => {
  currentFetchImpl = async (url) => {
    if (url.includes('/field')) return jsonResponse(Array(4000).fill({ custom: true }));
    if (url.includes('/issuetype')) return jsonResponse(Array(12).fill({}));
    if (url.includes('/license/approximateLicenseCount')) return jsonResponse({ value: 800 });
    throw new Error('Unexpected URL: ' + url);
  };
  const finding = await customFieldVolume(ctx);
  assert.equal(finding.severity, 'critical');
  assert.equal(finding.value.customFieldCount, 4000);
  assert.equal(finding.value.ratio, 5);
  assert.equal(finding.error, null);
});

test('reports info when the ratio is low, and only counts fields with custom:true', async () => {
  currentFetchImpl = async (url) => {
    if (url.includes('/field')) return jsonResponse([...Array(50).fill({ custom: true }), ...Array(20).fill({ custom: false })]);
    if (url.includes('/issuetype')) return jsonResponse(Array(5).fill({}));
    if (url.includes('/license/approximateLicenseCount')) return jsonResponse({ value: 200 });
    throw new Error('Unexpected URL: ' + url);
  };
  const finding = await customFieldVolume(ctx);
  assert.equal(finding.value.customFieldCount, 50, 'system fields (custom:false) must not be counted');
  assert.equal(finding.severity, 'info');
  assert.equal(finding.recommendation, null);
});

test('degrades gracefully when the license endpoint fails: keeps real counts, no ratio, stays info (not a false alarm)', async () => {
  currentFetchImpl = async (url) => {
    if (url.includes('/field')) return jsonResponse(Array(4000).fill({ custom: true })); // would be critical if a ratio existed
    if (url.includes('/issuetype')) return jsonResponse(Array(5).fill({}));
    if (url.includes('/license/approximateLicenseCount')) return jsonResponse({}, false, 403, 'Forbidden');
    throw new Error('Unexpected URL: ' + url);
  };
  const finding = await customFieldVolume(ctx);
  assert.equal(finding.value.customFieldCount, 4000);
  assert.equal(finding.value.userCount, null);
  assert.equal(finding.value.ratio, null);
  assert.equal(finding.severity, 'info');
  assert.match(finding.error, /license\/approximateLicenseCount/);
});

test('a hard failure on a required call (field) throws, for the registry to catch as unavailable', async () => {
  currentFetchImpl = async (url) => {
    if (url.includes('/field')) return jsonResponse({}, false, 500, 'Internal Server Error');
    return jsonResponse([]);
  };
  await assert.rejects(() => customFieldVolume(ctx), /field 500/);
});
