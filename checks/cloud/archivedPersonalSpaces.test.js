import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { jsonResponse } from './testUtils.js';

let currentFetchImpl = async () => { throw new Error('No fetch mock configured for this test'); };
mock.module('node-fetch', { exports: { default: (...args) => currentFetchImpl(...args) } });

const { default: archivedPersonalSpaces } = await import('./archivedPersonalSpaces.js');

const ctx = { headers: {}, confluenceBaseUrl: 'https://x.atlassian.net/wiki/rest/api' };

function spaces(archived, personal, otherGlobal) {
  const results = [];
  for (let i = 0; i < archived; i++) results.push({ status: 'archived', type: 'global' });
  for (let i = 0; i < personal; i++) results.push({ status: 'current', type: 'personal' });
  for (let i = 0; i < otherGlobal; i++) results.push({ status: 'current', type: 'global' });
  return results;
}

test('warns when archived spaces exceed 30% of the total', async () => {
  // 4 archived, 6 current (10 total) -> 40% archived
  currentFetchImpl = async () => jsonResponse({ results: spaces(4, 1, 5) });
  const finding = await archivedPersonalSpaces(ctx);
  assert.equal(finding.value.total, 10);
  assert.equal(finding.value.archived, 4);
  assert.equal(finding.value.personal, 1);
  assert.equal(finding.severity, 'warning');
});

test('exactly at the 30% boundary does not warn (uses a strict >, matching the code)', async () => {
  // 3 archived, 7 current (10 total) -> exactly 30%
  currentFetchImpl = async () => jsonResponse({ results: spaces(3, 0, 7) });
  const finding = await archivedPersonalSpaces(ctx);
  assert.equal(finding.severity, 'info');
});

test('no spaces: does not divide by zero, stays info', async () => {
  currentFetchImpl = async () => jsonResponse({ results: [] });
  const finding = await archivedPersonalSpaces(ctx);
  assert.equal(finding.value.total, 0);
  assert.equal(finding.severity, 'info');
});
