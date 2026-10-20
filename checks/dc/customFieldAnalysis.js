import { buildCustomFieldFinding } from '../customFieldGrouping.js';

// Counts, duplicates, and by-type only — usage metrics (screens/values) are Cloud-only by
// decision: the DC tables involved (fieldscreenlayoutitem/customfieldvalue) are unverified from
// here and customfieldvalue can be very large.
export default async function customFieldAnalysis({ db }) {
  let rows;
  let error = null;
  try {
    // customfield/id/cfname are already proven elsewhere in this codebase; customfieldtypekey is
    // standard Jira schema but new here, so a failure degrades to "no type breakdown" rather
    // than failing the whole check.
    rows = await db.query('SELECT id, cfname, customfieldtypekey FROM customfield');
  } catch (e) {
    rows = await db.query('SELECT id, cfname FROM customfield');
    error = 'The field type column (customfieldtypekey) could not be read on this instance; the by-type breakdown and same/mixed-type classification are omitted.';
  }

  const fields = rows.map((r) => ({ id: r.id, name: r.cfname, type: r.customfieldtypekey ?? null }));
  return buildCustomFieldFinding({ fields, usage: null, error });
}
