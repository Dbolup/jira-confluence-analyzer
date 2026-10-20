import { test } from 'node:test';
import assert from 'node:assert/strict';

// render()/downloadPDF() read/write the DOM (document.getElementById) — report.js was written
// for a real browser, so a minimal stub is set up before importing it, the same technique used
// ad-hoc (never as a permanent test) during Phases 3-5's manual verification.
function makeDomStub() {
  const elements = {};
  function makeEl(id) {
    return elements[id] || (elements[id] = { id, value: '', innerHTML: '' });
  }
  globalThis.document = { getElementById: (id) => makeEl(id) };
  return { el: makeEl };
}

const { el } = makeDomStub();
const { render, buildReportHtml, findingCard, SEVERITY_RANK } = await import('./report.js');

const findings = [
  { id: 'a', category: 'Fields', title: 'Custom Field Volume', severity: 'critical', summary: '4000 fields', explanation: 'exp', recommendation: 'consolidate', error: null },
  { id: 'b', category: 'Apps', title: 'Installed Apps', severity: 'warning', summary: '12 apps', explanation: 'exp2', recommendation: 'inventory', error: null },
  { id: 'c', category: 'Workflows', title: 'Workflow Fields', severity: 'info', summary: '3 of 10', explanation: 'exp3', recommendation: null, error: null },
  { id: 'd', category: 'Projects', title: 'Inactive Projects', severity: 'unavailable', summary: 'n/a', explanation: '', recommendation: null, error: 'timed out' },
];

test('SEVERITY_RANK orders critical > warning > unavailable > info', () => {
  assert.ok(SEVERITY_RANK.critical > SEVERITY_RANK.warning);
  assert.ok(SEVERITY_RANK.warning > SEVERITY_RANK.unavailable);
  assert.ok(SEVERITY_RANK.unavailable > SEVERITY_RANK.info);
});

test('buildReportHtml: Key Areas of Concern includes exactly critical/warning/unavailable, sorted worst-first', () => {
  const html = buildReportHtml(findings, { site: 'acme.atlassian.net', finishedAt: new Date().toISOString() }, '');
  const concernSection = html.split('Key Areas of Concern')[1].split('Detailed Findings')[0];
  const order = ['Custom Field Volume', 'Installed Apps'].every((title, i, arr) => {
    if (i === 0) return true;
    return concernSection.indexOf(arr[i - 1]) < concernSection.indexOf(title);
  });
  assert.ok(concernSection.includes('Custom Field Volume'), 'critical finding must appear in concerns');
  assert.ok(concernSection.includes('Installed Apps'), 'warning finding must appear in concerns');
  assert.ok(concernSection.includes('Inactive Projects'), 'unavailable finding must appear in concerns (it is itself a concern)');
  assert.ok(!concernSection.includes('Workflow Fields'), 'info finding must NOT appear in concerns');
  assert.ok(order, 'critical must be listed before warning');
});

test('buildReportHtml: Detailed Findings includes every finding regardless of severity, grouped by category', () => {
  const html = buildReportHtml(findings, { site: 'acme.atlassian.net', finishedAt: new Date().toISOString() }, '');
  const detailSection = html.split('Detailed Findings')[1];
  for (const f of findings) assert.ok(detailSection.includes(f.title), `${f.title} must appear in Detailed Findings`);
  assert.ok(detailSection.includes('>Fields<'), 'category headings must render');
});

test('buildReportHtml: "Prepared for" only renders when provided, never a stray empty field', () => {
  const withName = buildReportHtml(findings, { site: 'x', finishedAt: new Date().toISOString() }, 'Acme Corp');
  const without = buildReportHtml(findings, { site: 'x', finishedAt: new Date().toISOString() }, '');
  assert.match(withName, /Prepared for:<\/strong> Acme Corp/);
  assert.doesNotMatch(without, /Prepared for/);
});

test('buildReportHtml: no critical/warning/unavailable findings shows the explicit "no concerns" message', () => {
  const allInfo = [{ id: 'x', category: 'Fields', title: 'Fine', severity: 'info', summary: 'ok', explanation: '', recommendation: null, error: null }];
  const html = buildReportHtml(allInfo, { site: 'x', finishedAt: new Date().toISOString() }, '');
  assert.match(html, /No critical or warning-level findings/);
});

test('findingCard: renders the recommendation arrow only when a recommendation exists', () => {
  const withRec = findingCard({ title: 'T', severity: 'warning', summary: 'S', explanation: '', recommendation: 'Do X', error: null });
  const withoutRec = findingCard({ title: 'T', severity: 'info', summary: 'S', explanation: '', recommendation: null, error: null });
  assert.match(withRec, /→ Do X/);
  assert.doesNotMatch(withoutRec, /finding-recommendation/);
});

test('findingCard: renders the error line only when a check partially degraded', () => {
  const withError = findingCard({ title: 'T', severity: 'info', summary: 'S', explanation: '', recommendation: null, error: 'partial failure' });
  assert.match(withError, /⚠ partial failure/);
});

test('render(): writes the report into #findings-area, reading "Prepared For" from the DOM', () => {
  el('prepared-for').value = 'Acme Corp';
  render(findings, { site: 'acme.atlassian.net', finishedAt: new Date().toISOString() });
  const out = el('findings-area').innerHTML;
  assert.match(out, /id="report-content"/);
  assert.match(out, /Prepared for:<\/strong> Acme Corp/);
  assert.match(out, /Download PDF/);
  assert.match(out, /Back to Run/);
});

test('render(): an empty findings array shows a plain message instead of an empty report shell', () => {
  render([], { site: 'acme.atlassian.net', finishedAt: new Date().toISOString() });
  const out = el('findings-area').innerHTML;
  assert.match(out, /No findings returned/);
  assert.doesNotMatch(out, /report-content/);
});

test('buildReportHtml: renders the Jira General Stats table using the same labels jira-stats.html uses', () => {
  const html = buildReportHtml(findings, {
    site: 'acme.atlassian.net', finishedAt: new Date().toISOString(),
    jiraStats: { projectCount: 12, workflowCount: 8, fieldCount: 40, issueTypeCount: null },
  }, '');
  assert.match(html, /General Stats — Jira/);
  assert.match(html, /<td>Projects<\/td><td>12<\/td>/);
  assert.match(html, /<td>Workflows<\/td><td>8<\/td>/);
  assert.match(html, /Issue Types.*Unavailable/s, 'a null metric renders as Unavailable, not 0 or blank');
});

test('buildReportHtml: renders the Confluence General Stats table', () => {
  const html = buildReportHtml(findings, {
    site: 'acme.atlassian.net', finishedAt: new Date().toISOString(),
    confluenceStats: { total: 10, active: 8, archived: 2, global: 6, personal: 4 },
  }, '');
  assert.match(html, /General Stats — Confluence/);
  assert.match(html, /<td>Total Spaces<\/td><td>10<\/td>/);
});

test('buildReportHtml: a stats object that itself failed shows its error, not a broken table', () => {
  const html = buildReportHtml(findings, {
    site: 'x', finishedAt: new Date().toISOString(), jiraStats: { error: 'connect ECONNREFUSED' },
  }, '');
  assert.match(html, /General Stats — Jira/);
  assert.match(html, /Unavailable: connect ECONNREFUSED/);
  assert.doesNotMatch(html, /<table/, 'must not render a table body for a failed stats object');
});

test('buildReportHtml: no stats tables at all when neither is provided (e.g. an older response shape)', () => {
  const html = buildReportHtml(findings, { site: 'x', finishedAt: new Date().toISOString() }, '');
  assert.doesNotMatch(html, /General Stats/);
});

// ---------- finding.details tables (custom-field-analysis) ----------

const detailed = {
  id: 'custom-field-analysis', category: 'Fields', title: 'Custom Field Duplicates & Metrics', severity: 'warning',
  summary: '10 custom fields; 1 duplicate name', explanation: '', recommendation: 'merge them', error: null,
  details: {
    tables: [
      { title: 'Custom field metrics', columns: ['Metric', 'Value'], rows: [['Total custom fields', 10]] },
      { title: 'Duplicate field names', columns: ['Field name', 'Copies'], rows: [['Story Points', 2]], note: '+3 more duplicate groups not shown' },
    ],
  },
};

test('findingCard: renders each details table with its title, header, rows, and note', () => {
  const html = findingCard(detailed);
  assert.match(html, /<h4>Custom field metrics<\/h4>/);
  assert.match(html, /<th>Metric<\/th><th>Value<\/th>/);
  assert.match(html, /<td>Total custom fields<\/td><td>10<\/td>/);
  assert.match(html, /<td>Story Points<\/td><td>2<\/td>/);
  assert.match(html, /\+3 more duplicate groups not shown/);
});

test('findingCard: details cells are HTML-escaped — a hostile field name cannot inject markup', () => {
  const html = findingCard({
    ...detailed,
    details: { tables: [{ title: 'T', columns: ['Field name'], rows: [['<img src=x onerror=alert(1)>'], ['a & "b"']] }] },
  });
  assert.ok(!html.includes('<img src=x'), 'raw markup must not survive into the output');
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(html, /a &amp; &quot;b&quot;/);
});

test('findingCard: a finding without details renders exactly as before (no empty details block)', () => {
  const html = findingCard({ title: 'T', severity: 'info', summary: 'S', explanation: '', recommendation: null, error: null });
  assert.doesNotMatch(html, /finding-details/);
});

test('buildReportHtml: a detailed finding\'s tables land inside Detailed Findings', () => {
  const html = buildReportHtml([detailed], { site: 'x', finishedAt: new Date().toISOString() }, '');
  const detailSection = html.split('Detailed Findings')[1];
  assert.match(detailSection, /<h4>Duplicate field names<\/h4>/);
});
