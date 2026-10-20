import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runChecks } from './registry.js';

// These exercise the real registry (5 real checks wired in), driven with contexts that make
// every check fail in a controlled way — the point is the orchestrator's own behavior
// (timeout/error handling, type filtering), not re-testing each check's business logic here
// (that's what checks/cloud/*.test.js and checks/dc/*.test.js are for).

test('runChecks("cloud") with an unreachable base URL: every check degrades to unavailable, none crash the batch', async () => {
  const ctx = {
    site: { domain: 'unreachable.invalid' },
    headers: {},
    jiraBaseUrl: 'http://127.0.0.1:1/rest/api/3',
    confluenceBaseUrl: 'http://127.0.0.1:1/wiki/rest/api',
  };
  const findings = await runChecks('cloud', ctx);
  assert.equal(findings.length, 6, 'all 6 cloud checks should be attempted');
  for (const f of findings) {
    assert.equal(f.severity, 'unavailable');
    assert.ok(f.error, `expected an error message on ${f.id}`);
    assert.equal(f.value, null);
  }
});

test('runChecks("dc") with a db that throws on every query: every check degrades to unavailable, none crash the batch', async () => {
  const throwingDb = { query: async () => { throw new Error('relation does not exist'); } };
  const findings = await runChecks('dc', { site: { name: 'Test DC' }, db: throwingDb });
  assert.equal(findings.length, 6, 'all 6 dc checks should be attempted');
  for (const f of findings) {
    assert.equal(f.severity, 'unavailable');
    assert.match(f.error, /relation does not exist/);
  }
});

test('a check that resolves normally passes through unchanged, alongside one that fails', async () => {
  // dc db mock: archivedPersonalSpaces' 4 queries succeed with a fixed shape; everything else
  // (customfield/issuetype/cwd_user/jiraworkflows/pluginstate/project+jiraissue join) throws.
  const db = {
    query: async (sql) => {
      if (sql.includes('FROM spaces')) return [{ cnt: 0 }];
      throw new Error('not mocked for this test');
    },
  };
  const findings = await runChecks('dc', { site: { name: 'Test DC' }, db });
  const spaces = findings.find((f) => f.id === 'archived-personal-spaces');
  const fields = findings.find((f) => f.id === 'custom-field-volume');
  assert.equal(spaces.severity, 'info');
  assert.equal(spaces.error, null);
  assert.equal(fields.severity, 'unavailable');
});
