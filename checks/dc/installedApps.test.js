import { test } from 'node:test';
import assert from 'node:assert/strict';
import installedApps from './installedApps.js';

// This check is the least certain in the project (see the file's own header comment) — these
// tests only cover the key-prefix heuristic's logic, not whether `pluginstate` is really the
// right table on a live instance, which can't be verified from here.

test('excludes com.atlassian.* keys, flags scriptrunner/groovyrunner by key pattern', async () => {
  const db = {
    query: async () => [
      { plugin_key: 'com.atlassian.jira.plugins.cmdb' },
      { plugin_key: 'com.onresolve.jira.groovy.groovyrunner' },
      { plugin_key: 'is.origo.jira.tempo-plugin' },
    ],
  };
  const finding = await installedApps({ db });
  assert.equal(finding.value.totalApps, 2);
  assert.deepEqual(finding.value.scriptingApps, ['com.onresolve.jira.groovy.groovyrunner']);
  assert.equal(finding.severity, 'warning');
});

test('recommendation always tells the operator to confirm manually, regardless of severity', async () => {
  const db = { query: async () => [{ plugin_key: 'is.origo.jira.tempo-plugin' }] };
  const finding = await installedApps({ db });
  assert.equal(finding.severity, 'info');
  assert.match(finding.recommendation, /Manage Apps/);
});

test('a missing/renamed pluginstate table throws for the registry to catch as unavailable, not a wrong count', async () => {
  const db = { query: async () => { throw new Error('relation "pluginstate" does not exist'); } };
  await assert.rejects(() => installedApps({ db }));
});
