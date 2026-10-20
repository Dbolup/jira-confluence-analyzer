import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeName, shortTypeName, groupDuplicates, countByType, analyzeCustomFields,
  severityFor, summarizeUsage, buildCustomFieldFinding,
} from './customFieldGrouping.js';

const TEXT = 'com.atlassian.jira.plugin.system.customfieldtypes:textfield';
const NUM = 'com.atlassian.jira.plugin.system.customfieldtypes:float';
const f = (id, name, type = TEXT) => ({ id, name, type });

test('normalizeName ignores case, edge whitespace, and repeated internal whitespace', () => {
  assert.equal(normalizeName('  Story   Points '), 'story points');
  assert.equal(normalizeName('STORY POINTS'), normalizeName('story points'));
  assert.equal(normalizeName(null), '');
});

test('shortTypeName keeps the distinguishing tail of a type key', () => {
  assert.equal(shortTypeName(TEXT), 'textfield');
  assert.equal(shortTypeName(null), 'unknown');
  assert.equal(shortTypeName('string'), 'string');
});

test('groupDuplicates: same-name fields group; case/space variants count as the same name', () => {
  const groups = groupDuplicates([f('1', 'Story Points', NUM), f('2', ' story  points', NUM), f('3', 'Sprint')]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].count, 2);
  assert.equal(groups[0].typeMatch, 'same');
});

test('groupDuplicates: a group whose copies have different types is "mixed"', () => {
  const [g] = groupDuplicates([f('1', 'Owner', TEXT), f('2', 'Owner', NUM)]);
  assert.equal(g.typeMatch, 'mixed');
  assert.deepEqual(g.types.sort(), ['float', 'textfield']);
});

test('groupDuplicates: unknown types (DC fallback) are "unknown", never falsely "same"', () => {
  const [g] = groupDuplicates([f('1', 'Owner', null), f('2', 'Owner', null)]);
  assert.equal(g.typeMatch, 'unknown');
  // A known type alongside an unknown one also can't be called "same".
  const [g2] = groupDuplicates([f('1', 'Owner', TEXT), f('2', 'Owner', null)]);
  assert.equal(g2.typeMatch, 'unknown');
});

test('groupDuplicates: blank names are ignored (two blanks are not "the same field")', () => {
  assert.deepEqual(groupDuplicates([f('1', ''), f('2', '   '), f('3', null)]), []);
});

test('groupDuplicates sorts worst-first, then alphabetically', () => {
  const groups = groupDuplicates([f('1', 'B'), f('2', 'B'), f('3', 'A'), f('4', 'A'), f('5', 'C'), f('6', 'C'), f('7', 'C')]);
  assert.deepEqual(groups.map((g) => g.name), ['C', 'A', 'B']);
});

test('analyzeCustomFields: redundant = fields in groups minus one survivor per group', () => {
  // 3 copies of A (2 redundant) + 2 copies of B (1 redundant) + 1 unique = 6 fields, 3 redundant
  const a = analyzeCustomFields([f('1', 'A'), f('2', 'A'), f('3', 'A'), f('4', 'B'), f('5', 'B'), f('6', 'C')]);
  assert.equal(a.total, 6);
  assert.equal(a.groups.length, 2);
  assert.equal(a.fieldsInGroups, 5);
  assert.equal(a.redundant, 3);
  assert.equal(a.redundantShare, 0.5);
  assert.equal(a.distinctNames, 3);
});

test('analyzeCustomFields on an empty list does not divide by zero', () => {
  const a = analyzeCustomFields([]);
  assert.equal(a.redundantShare, 0);
  assert.equal(severityFor(a), 'info');
});

test('severity: no duplicates is info; some is warning; >=10% redundant is critical (boundary inclusive)', () => {
  assert.equal(severityFor({ redundant: 0, redundantShare: 0 }), 'info');
  assert.equal(severityFor({ redundant: 1, redundantShare: 0.0999 }), 'warning');
  assert.equal(severityFor({ redundant: 10, redundantShare: 0.1 }), 'critical');
});

test('countByType counts and sorts by frequency', () => {
  const rows = countByType([f('1', 'a', TEXT), f('2', 'b', TEXT), f('3', 'c', NUM), f('4', 'd', null)]);
  assert.deepEqual(rows[0], { type: 'textfield', count: 2 });
  assert.ok(rows.find((r) => r.type === 'unknown'));
});

test('summarizeUsage: a missing screensCount/contextsCount means 0; only parseable dates count as known', () => {
  const now = Date.parse('2026-09-24T00:00:00Z');
  const u = summarizeUsage([
    { screensCount: 3, contextsCount: 1, lastUsed: { value: '2026-09-01T00:00:00Z' } }, // fresh
    { lastUsed: { value: '2024-01-01T00:00:00Z' } },                                     // no screens/contexts, stale
    { screensCount: 0, contextsCount: 2, lastUsed: { value: 'not-a-date' } },            // unparseable -> not "known"
    { screensCount: 1, contextsCount: 1 },                                               // no lastUsed at all
  ], now);
  assert.equal(u.total, 4);
  assert.equal(u.notOnAnyScreen, 2);
  assert.equal(u.noContexts, 1);
  assert.equal(u.usageKnown, 2);
  assert.equal(u.stale, 1);
});

test('buildCustomFieldFinding: no duplicates -> info, no recommendation, no duplicates table', () => {
  const out = buildCustomFieldFinding({ fields: [f('1', 'A'), f('2', 'B')] });
  assert.equal(out.severity, 'info');
  assert.equal(out.recommendation, null);
  assert.match(out.summary, /no duplicate names found/);
  assert.ok(!out.details.tables.some((t) => t.title === 'Duplicate field names'));
});

test('buildCustomFieldFinding: duplicates -> warning with a duplicates table and a recommendation', () => {
  const fields = [...Array(2).fill(0).map((_, i) => f(`d${i}`, 'Dup')), ...Array(98).fill(0).map((_, i) => f(`u${i}`, `Unique ${i}`))];
  const out = buildCustomFieldFinding({ fields });
  assert.equal(out.severity, 'warning'); // 1 redundant of 100 = 1%
  assert.ok(out.recommendation);
  const dup = out.details.tables.find((t) => t.title === 'Duplicate field names');
  assert.deepEqual(dup.rows[0].slice(0, 2), ['Dup', 2]);
});

test('buildCustomFieldFinding: the duplicates table is capped at 25 rows with a "+N more" note', () => {
  const fields = [];
  for (let i = 0; i < 30; i++) { fields.push(f(`a${i}`, `Name ${i}`), f(`b${i}`, `Name ${i}`)); }
  const dup = buildCustomFieldFinding({ fields }).details.tables.find((t) => t.title === 'Duplicate field names');
  assert.equal(dup.rows.length, 25);
  assert.match(dup.note, /\+5 more duplicate groups not shown/);
});

test('buildCustomFieldFinding: more than 10 types collapse the tail into an "other" row that still sums correctly', () => {
  const fields = Array.from({ length: 12 }, (_, i) => f(`${i}`, `F${i}`, `pkg:type${i}`));
  const byType = buildCustomFieldFinding({ fields }).details.tables.find((t) => t.title === 'Custom fields by type');
  assert.equal(byType.rows.length, 11);
  assert.deepEqual(byType.rows[10], ['other (2 types)', 2]);
});

test('buildCustomFieldFinding: usage rows appear only when usage is provided; error passes through', () => {
  const without = buildCustomFieldFinding({ fields: [f('1', 'A')] });
  assert.ok(!without.details.tables[0].rows.some((r) => /Not on any screen/.test(r[0])));
  const withUsage = buildCustomFieldFinding({
    fields: [f('1', 'A')], usage: { total: 1, notOnAnyScreen: 1, noContexts: 0, usageKnown: 1, stale: 1 }, error: 'partial',
  });
  assert.ok(withUsage.details.tables[0].rows.some((r) => /Not on any screen/.test(r[0])));
  assert.equal(withUsage.error, 'partial');
});
