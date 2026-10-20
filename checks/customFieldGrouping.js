// Shared, pure (no I/O) logic for the custom-field-analysis check — used by both
// checks/cloud/customFieldAnalysis.js and checks/dc/customFieldAnalysis.js so duplicate
// detection, metrics, severity, and the finding's wording live in exactly one place rather than
// two hand-synced copies.
//
// Input shape both checks map their platform's data into: [{ id, name, type }] where `type` is
// the platform's custom-field-type key (or null when unknown).

// PROVISIONAL — like every other threshold in this project, not confirmed Alluvium methodology.
export const CRITICAL_REDUNDANT_SHARE = 0.10;
const MAX_DUPLICATE_ROWS = 25;
const MAX_TYPE_ROWS = 10;
const STALE_DAYS = 365;

// Same name after trim + lowercase + whitespace-collapse. Deliberately no fuzzy matching.
export function normalizeName(name) {
  return String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// "com.atlassian.jira.plugin.system.customfieldtypes:textfield" -> "textfield". Keeps the tables
// readable without losing the part that distinguishes one type from another.
export function shortTypeName(type) {
  if (!type) return 'unknown';
  const afterColon = String(type).split(':').pop();
  return afterColon.split('.').pop() || String(type);
}

export function groupDuplicates(fields) {
  const byName = new Map();
  for (const f of fields) {
    const key = normalizeName(f.name);
    if (!key) continue; // a blank name isn't meaningfully "the same" as another blank name
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(f);
  }

  const groups = [];
  for (const members of byName.values()) {
    if (members.length < 2) continue;
    const knownTypes = new Set(members.filter((m) => m.type).map((m) => m.type));
    const anyUnknown = members.some((m) => !m.type);
    let typeMatch = 'unknown';
    if (knownTypes.size > 1) typeMatch = 'mixed';
    else if (knownTypes.size === 1 && !anyUnknown) typeMatch = 'same';
    groups.push({
      name: String(members[0].name).trim(),
      count: members.length,
      ids: members.map((m) => m.id),
      types: [...knownTypes].map(shortTypeName),
      typeMatch,
    });
  }
  return groups.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function countByType(fields) {
  const counts = new Map();
  for (const f of fields) {
    const t = shortTypeName(f.type);
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  return [...counts.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

export function analyzeCustomFields(fields) {
  const groups = groupDuplicates(fields);
  const fieldsInGroups = groups.reduce((sum, g) => sum + g.count, 0);
  const redundant = fieldsInGroups - groups.length; // one survivor per group would remain
  const total = fields.length;
  return {
    total,
    distinctNames: new Set(fields.map((f) => normalizeName(f.name)).filter(Boolean)).size,
    groups,
    fieldsInGroups,
    redundant,
    redundantShare: total ? redundant / total : 0,
    byType: countByType(fields),
  };
}

export function severityFor(analysis) {
  if (analysis.redundant === 0) return 'info';
  return analysis.redundantShare >= CRITICAL_REDUNDANT_SHARE ? 'critical' : 'warning';
}

// Cloud-only: turns GET /field/search?expand=screensCount,contextsCount,lastUsed results into
// counts. A missing screensCount/contextsCount means 0 per Atlassian's docs. `lastUsed` handling
// is deliberately defensive — only a parseable date in `lastUsed.value` counts, regardless of the
// `type` string, since that enum's exact values aren't verified against a live site from here.
export function summarizeUsage(values, now = Date.now()) {
  let notOnAnyScreen = 0, noContexts = 0, usageKnown = 0, stale = 0;
  const cutoff = now - STALE_DAYS * 24 * 60 * 60 * 1000;
  for (const v of values) {
    if (!v.screensCount) notOnAnyScreen++;
    if (!v.contextsCount) noContexts++;
    const t = v.lastUsed?.value ? new Date(v.lastUsed.value).getTime() : NaN;
    if (!Number.isNaN(t)) {
      usageKnown++;
      if (t < cutoff) stale++;
    }
  }
  return { total: values.length, notOnAnyScreen, noContexts, usageKnown, stale };
}

function pct(n, total) {
  return total ? `${((n / total) * 100).toFixed(1)}%` : '0%';
}

export function buildCustomFieldFinding({ fields, usage = null, error = null }) {
  const a = analyzeCustomFields(fields);
  const severity = severityFor(a);

  const metricRows = [
    ['Total custom fields', a.total],
    ['Distinct field names', a.distinctNames],
    ['Duplicate groups (a name shared by 2+ fields)', a.groups.length],
    ['Fields inside duplicate groups', a.fieldsInGroups],
    ['Redundant fields (would be removed by merging)', `${a.redundant} (${pct(a.redundant, a.total)})`],
  ];
  if (usage) {
    metricRows.push(
      ['Not on any screen', usage.notOnAnyScreen],
      ['In no context (not configured for any project/issue type)', usage.noContexts],
      [`Value not changed in ${STALE_DAYS}+ days`, `${usage.stale} (usage date known for ${usage.usageKnown} of ${usage.total})`],
    );
  }

  const tables = [{ title: 'Custom field metrics', columns: ['Metric', 'Value'], rows: metricRows }];

  if (a.groups.length) {
    const shown = a.groups.slice(0, MAX_DUPLICATE_ROWS);
    const t = {
      title: 'Duplicate field names',
      columns: ['Field name', 'Copies', 'Types', 'Type match'],
      rows: shown.map((g) => [g.name, g.count, g.types.join(', ') || 'unknown', g.typeMatch]),
    };
    if (a.groups.length > shown.length) t.note = `+${a.groups.length - shown.length} more duplicate groups not shown`;
    tables.push(t);
  }

  if (a.byType.length) {
    const top = a.byType.slice(0, MAX_TYPE_ROWS);
    const rest = a.byType.slice(MAX_TYPE_ROWS);
    const rows = top.map((t) => [t.type, t.count]);
    if (rest.length) rows.push([`other (${rest.length} types)`, rest.reduce((s, t) => s + t.count, 0)]);
    tables.push({ title: 'Custom fields by type', columns: ['Type', 'Fields'], rows });
  }

  const summary = a.groups.length
    ? `${a.total} custom fields; ${a.groups.length} duplicate name${a.groups.length === 1 ? '' : 's'} covering ${a.fieldsInGroups} fields — ${a.redundant} redundant (${pct(a.redundant, a.total)})`
    : `${a.total} custom fields; no duplicate names found`;

  return {
    id: 'custom-field-analysis',
    category: 'Fields',
    title: 'Custom Field Duplicates & Metrics',
    severity,
    // Full group list for API consumers; the report itself only renders the capped tables above.
    value: { ...a, groups: a.groups.slice(0, 100), usage },
    summary,
    explanation:
      'Fields count as duplicates when they share a name (ignoring case and extra spaces). Same-type duplicates are usually safe to merge into one field; mixed-type duplicates are a conflict that needs a human decision about which meaning to keep. Every redundant field adds cost to migration, screens, and reporting. (Severity is provisional — a warning for any duplicates, critical when redundant fields reach 10% of all custom fields — pending Alluvium\'s own confirmed guidance.)',
    recommendation:
      severity === 'info'
        ? null
        : 'Review the duplicate names below: merge same-type duplicates into a single field and resolve mixed-type conflicts before migrating.',
    details: { tables },
    error,
  };
}
