export default async function workflowCustomFields({ db }) {
  const fieldRows = await db.query('SELECT id, cfname FROM customfield');
  const fieldNameById = new Map(fieldRows.map((f) => [`customfield_${f.id}`, f.cfname]));

  // DC stores workflows as XML in jiraworkflows.descriptor, not JSON like Cloud — but the same
  // best-effort regex scan for a bare "customfield_<id>" pattern works directly on the XML text,
  // no XML parsing needed, since post-functions/validators/conditions embed the field ID as plain
  // text in their argument values.
  const workflowRows = await db.query('SELECT workflowname, descriptor FROM jiraworkflows');

  const workflowsWithCustomFields = [];
  for (const wf of workflowRows) {
    const raw = String(wf.descriptor || '');
    const ids = new Set([...raw.matchAll(/customfield_\d+/g)].map((m) => m[0]));
    if (ids.size > 0) {
      workflowsWithCustomFields.push({
        name: wf.workflowname || 'Unnamed workflow',
        fields: [...ids].map((id) => fieldNameById.get(id) || id),
      });
    }
  }

  return {
    id: 'workflow-custom-fields',
    category: 'Workflows',
    title: 'Workflows Referencing Custom Fields',
    severity: 'info',
    value: {
      totalWorkflows: workflowRows.length,
      workflowsWithCustomFields: workflowsWithCustomFields.length,
      details: workflowsWithCustomFields,
    },
    summary: `${workflowsWithCustomFields.length} of ${workflowRows.length} workflows reference at least one custom field`,
    explanation:
      "Workflows that read or update custom fields (via post-functions, validators, or conditions) need those fields to exist and behave the same way on the target instance. This is a best-effort scan of each workflow's XML descriptor for custom field IDs — it will miss references made in ways that don't show up as a plain field ID (e.g. some app-provided rules), so treat this as a starting point, not a complete inventory.",
    recommendation:
      workflowsWithCustomFields.length > 0
        ? 'Review the listed workflows before migration to confirm every referenced custom field is accounted for on the target.'
        : null,
    error: null,
  };
}
