import fetch from 'node-fetch';

export default async function workflowCustomFields({ headers, jiraBaseUrl }) {
  // Build a customfield_id -> name lookup so the finding reads as field names, not raw IDs.
  const fieldsRes = await fetch(`${jiraBaseUrl}/field`, { headers });
  if (!fieldsRes.ok) throw new Error(`field ${fieldsRes.status} ${fieldsRes.statusText}`);
  const fields = await fieldsRes.json();
  const fieldNameById = new Map(fields.filter((f) => f.custom).map((f) => [f.id, f.name]));

  let startAt = 0;
  const maxResults = 50;
  const workflowsWithCustomFields = [];
  let totalWorkflows = 0;

  while (true) {
    const r = await fetch(
      `${jiraBaseUrl}/workflow/search?expand=transitions&startAt=${startAt}&maxResults=${maxResults}`,
      { headers }
    );
    if (!r.ok) throw new Error(`workflow/search ${r.status} ${r.statusText}`);
    const page = await r.json();
    const values = page.values || [];
    totalWorkflows += values.length;

    for (const wf of values) {
      // Best-effort: scan the transition rules' JSON for anything shaped like a custom
      // field ID. This catches post-functions/validators/conditions that reference a field
      // by ID in a way that shows up in the config — not every possible reference (e.g. some
      // app-provided rules store field references in opaque formats this won't catch).
      const raw = JSON.stringify(wf.transitions || []);
      const ids = new Set([...raw.matchAll(/customfield_\d+/g)].map((m) => m[0]));
      if (ids.size > 0) {
        workflowsWithCustomFields.push({
          name: wf.id?.name || wf.name || 'Unnamed workflow',
          fields: [...ids].map((id) => fieldNameById.get(id) || id),
        });
      }
    }

    if (page.isLast || values.length < maxResults) break;
    startAt += maxResults;
  }

  return {
    id: 'workflow-custom-fields',
    category: 'Workflows',
    title: 'Workflows Referencing Custom Fields',
    severity: 'info',
    value: {
      totalWorkflows,
      workflowsWithCustomFields: workflowsWithCustomFields.length,
      details: workflowsWithCustomFields,
    },
    summary: `${workflowsWithCustomFields.length} of ${totalWorkflows} workflows reference at least one custom field`,
    explanation:
      "Workflows that read or update custom fields (via post-functions, validators, or conditions) need those fields to exist and behave the same way on the target instance. This is a best-effort scan of each workflow's transition rules for custom field IDs — it will miss references made in ways that don't show up as a plain field ID (e.g. some app-provided rules), so treat this as a starting point, not a complete inventory.",
    recommendation:
      workflowsWithCustomFields.length > 0
        ? 'Review the listed workflows before migration to confirm every referenced custom field is accounted for on the target.'
        : null,
    error: null,
  };
}
