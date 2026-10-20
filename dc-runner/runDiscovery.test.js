import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runDiscoveryDc } from './runDiscovery.js';

// Mirrors checks/registry.test.js's own tests — runDiscoveryDc is a thin wrapper around
// runChecks + the two stats functions, so these confirm the wrapper's own contract (does it
// call close? does it reduce `site`?) rather than re-testing check logic already covered there.

test('a db that throws on every query: findings degrade to unavailable, nothing throws', async () => {
  const db = { query: async () => { throw new Error('relation does not exist'); }, close: async () => {} };
  const result = await runDiscoveryDc({ site: { name: 'Test DC', type: 'postgres' }, db });
  assert.equal(result.findings.length, 6);
  for (const f of result.findings) assert.equal(f.severity, 'unavailable');
  // computeJiraStatsDc degrades per-metric to null (see stats.test.js) rather than rejecting,
  // so it never hits runDiscovery's .catch() — confirm the degraded shape instead of an .error.
  assert.equal(result.jiraStats.projectCount, null);
  // computeConfluenceStatsDc has no per-field degrade and does reject on a query failure —
  // that's what runDiscovery's .catch() is actually for.
  assert.ok(result.confluenceStats.error);
});

test('does not call db.close() itself — that is the caller\'s responsibility', async () => {
  let closeCalled = false;
  const db = { query: async () => { throw new Error('boom'); }, close: async () => { closeCalled = true; } };
  await runDiscoveryDc({ site: { name: 'Test DC', type: 'postgres' }, db });
  assert.equal(closeCalled, false);
});

test('only passes { name, type } into the checks\' site, not the full connection config', async () => {
  let seenSite = null;
  // A fake db.query that succeeds trivially for every call the DC checks make.
  const db = { query: async () => [{ cnt: 0 }] };
  // Can't intercept the real checks' internal ctx directly without changing checks/*.js, so
  // instead verify indirectly: passing a source object with secret-looking extra fields must
  // not cause a crash or appear in any finding's value/summary/explanation (a cheap but real
  // signal that only name/type actually reach the checks, since nothing in checks/dc/*.js reads
  // any other field and a leak would have to show up as a literal string surfacing somewhere).
  const source = { name: 'Test DC', type: 'postgres', password: 'super-secret-password-xyz' };
  const result = await runDiscoveryDc({ site: source, db });
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('super-secret-password-xyz'), 'password must never appear in findings/stats output');
});
