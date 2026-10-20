import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { jsonResponse } from './testUtils.js';

let currentFetchImpl = async () => { throw new Error('No fetch mock configured for this test'); };
mock.module('node-fetch', { exports: { default: (...args) => currentFetchImpl(...args) } });

const { default: installedApps } = await import('./installedApps.js');

const ctx = { headers: {}, jiraBaseUrl: 'https://x.atlassian.net/rest/api/3' };

test('excludes Atlassian bundled system plugins, keeps genuine installs, flags ScriptRunner', async () => {
  currentFetchImpl = async (url) => {
    assert.ok(url.includes('/rest/plugins/1.0/'), 'must use the UPM endpoint, not the Connect-app one');
    return jsonResponse({
      plugins: [
        { userInstalled: false, key: 'com.atlassian.jira.plugins.cmdb', name: '${project.name}' },
        { userInstalled: false, key: 'jira.webfragments.admin', name: 'Admin Menu Sections' },
        { userInstalled: true, key: 'com.onresolve.jira.groovy.groovyrunner', name: 'ScriptRunner for Jira' },
        { userInstalled: true, key: 'is.origo.jira.tempo-plugin', name: 'Tempo Timesheets' },
      ],
    });
  };
  const finding = await installedApps(ctx);
  assert.equal(finding.value.totalApps, 2, 'only the 2 userInstalled:true apps count');
  assert.deepEqual(finding.value.apps.sort(), ['Tempo Timesheets', 'ScriptRunner for Jira'].sort());
  assert.deepEqual(finding.value.scriptingApps, ['ScriptRunner for Jira']);
  assert.equal(finding.severity, 'warning');
  assert.match(finding.explanation.toLowerCase(), /scriptrunner/);
});

test('no scripting app present: explanation does not mention ScriptRunner (the generic-text bug fixed on the real site)', async () => {
  currentFetchImpl = async () => jsonResponse({
    plugins: [
      { userInstalled: false, key: 'com.atlassian.jira.plugins.cmdb' },
      { userInstalled: true, key: 'is.origo.jira.tempo-plugin', name: 'Tempo Timesheets' },
    ],
  });
  const finding = await installedApps(ctx);
  assert.equal(finding.severity, 'info');
  assert.equal(finding.value.totalApps, 1);
  assert.doesNotMatch(finding.explanation.toLowerCase(), /scriptrunner/, 'must not name ScriptRunner unless one was actually found');
  assert.equal(finding.recommendation, null);
});

test('zero customer-installed apps: summary says so plainly', async () => {
  currentFetchImpl = async () => jsonResponse({ plugins: [{ userInstalled: false, key: 'com.atlassian.core' }] });
  const finding = await installedApps(ctx);
  assert.equal(finding.value.totalApps, 0);
  assert.equal(finding.summary, 'No customer-installed apps found.');
});

test('a 403 (the real 406-turned-403-style failure this endpoint can produce) throws for the registry to catch', async () => {
  currentFetchImpl = async () => jsonResponse({}, false, 403, 'Forbidden');
  await assert.rejects(() => installedApps(ctx), /403/);
});
