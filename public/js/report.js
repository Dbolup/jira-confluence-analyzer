// Discovery report generation: turns findings into the report HTML (branding header, Key Areas
// of Concern, Detailed Findings) and wires up the PDF download.
//
// Extracted out of discovery.html's inline script (Phase 6) so this logic is unit-testable —
// every other page in this app keeps its script inline; this is the first shared frontend
// module. discovery.html loads this via a small <script type="module"> bootstrap that assigns
// `render`/`downloadPDF` onto `window`, because the rest of that page's script is a classic
// (non-module) script whose inline onclick="..." handlers (goToStep, downloadPDF, etc.) can
// only find functions on the global object — a module's own top-level bindings aren't global.

export const SEVERITY_RANK = { critical: 3, warning: 2, unavailable: 1, info: 0 };

// Same metrics/labels as jira-stats.html's and confluence-stats.html's own tables, so this
// General Stats section reads as the same table, not a different summary of the same data.
const JIRA_STATS_KEYS = [
  ['projectCount', 'Projects'], ['workflowCount', 'Workflows'], ['workflowSchemeCount', 'Workflow Schemes'],
  ['fieldCount', 'Fields'], ['fieldConfigurationSchemeCount', 'Field Config Schemes'], ['issueTypeCount', 'Issue Types'],
  ['issueTypeSchemeCount', 'Issue Type Schemes'], ['priorityCount', 'Priorities'], ['statusCount', 'Statuses'],
  ['screenCount', 'Screens'], ['screenSchemeCount', 'Screen Schemes'], ['issueTypeScreenSchemeCount', 'Issue Type Screen Schemes'],
  ['notificationSchemeCount', 'Notification Schemes'], ['permissionSchemeCount', 'Permission Schemes'], ['issueSecuritySchemeCount', 'Security Schemes'],
];

const CONFLUENCE_STATS_KEYS = [
  ['total', 'Total Spaces'], ['active', 'Active Spaces'], ['archived', 'Archived'], ['global', 'Global Spaces'], ['personal', 'Personal Spaces'],
];

function statsTable(title, stats, keys) {
  if (!stats || stats.error) {
    return `<div class="report-section"><h3>${title}</h3><p class="no-concerns">Unavailable${stats?.error ? `: ${stats.error}` : ''}.</p></div>`;
  }
  const rows = keys.map(([key, label]) => {
    const v = stats[key];
    const display = v === null || v === undefined ? '<span title="Unavailable" style="color:#aaa; font-style:italic">—</span>' : v;
    return `<tr><td>${label}</td><td>${display}</td></tr>`;
  }).join('');
  return `<div class="report-section"><h3>${title}</h3>
        <table class="stats-table"><thead><tr><th>Metric</th><th>Value</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
}

let lastSite = '';

// Table cells in `details` can hold customer-defined strings (e.g. custom field names), so unlike
// the rest of this file's interpolated text they're escaped — a field named "<b>x" must not
// break, or inject markup into, the report/PDF/standalone HTML file.
export function escapeHtml(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Optional finding.details = { tables: [{ title, columns: [...], rows: [[...]], note? }] }.
// A finding without it renders exactly as before.
function detailsHtml(details) {
  if (!details || !Array.isArray(details.tables) || !details.tables.length) return '';
  return `<div class="finding-details">${details.tables.map((t) => `
        <h4>${escapeHtml(t.title)}</h4>
        <table class="stats-table details-table"><thead><tr>${t.columns.map((c) => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead>
        <tbody>${t.rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
        ${t.note ? `<div class="table-note">${escapeHtml(t.note)}</div>` : ''}`).join('')}
    </div>`;
}

export function findingCard(f) {
  return `<div class="finding">
        <div class="finding-head">
            <span class="finding-title">${f.title}</span>
            <span class="badge badge-${f.severity}">${f.severity}</span>
        </div>
        <div class="finding-summary">${f.summary}</div>
        ${f.explanation ? `<div class="finding-explanation">${f.explanation}</div>` : ''}
        ${f.recommendation ? `<div class="finding-recommendation">→ ${f.recommendation}</div>` : ''}
        ${detailsHtml(f.details)}
        ${f.error ? `<div class="finding-error">⚠ ${f.error}</div>` : ''}
    </div>`;
}

// Pure — no DOM reads. Builds the report markup (branding header, concerns, detailed findings)
// for a given set of findings. `preparedFor` is a plain string, already trimmed by the caller.
export function buildReportHtml(findings, meta, preparedFor) {
  const concerns = findings
    .filter((f) => f.severity === 'critical' || f.severity === 'warning' || f.severity === 'unavailable')
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);

  let html = '<div id="report-content">';

  html += `<div class="report-header">
        <div class="report-brand">ALLUVIUM</div>
        <h2>Instance Discovery Report</h2>
        <div class="report-meta">
            ${preparedFor ? `<div><strong>Prepared for:</strong> ${preparedFor}</div>` : ''}
            <div><strong>Site:</strong> ${meta.site}</div>
            <div><strong>Date:</strong> ${new Date(meta.finishedAt).toLocaleDateString()}</div>
        </div>
    </div>`;

  html += '<div class="report-section"><h3>Key Areas of Concern</h3>';
  if (!concerns.length) {
    html += '<p class="no-concerns">No critical or warning-level findings from this run.</p>';
  } else {
    concerns.forEach((f) => {
      html += `<div class="concern-row severity-${f.severity}">
            <span class="badge badge-${f.severity}">${f.severity}</span>
            <strong>${f.title}</strong> — ${f.summary}
            ${f.recommendation ? `<div class="concern-rec">→ ${f.recommendation}</div>` : ''}
            ${f.error ? `<div class="finding-error">⚠ ${f.error}</div>` : ''}
        </div>`;
    });
  }
  html += '</div>';

  if (meta.jiraStats) html += statsTable('General Stats — Jira', meta.jiraStats, JIRA_STATS_KEYS);
  if (meta.confluenceStats) html += statsTable('General Stats — Confluence', meta.confluenceStats, CONFLUENCE_STATS_KEYS);

  html += '<div class="report-section"><h3>Detailed Findings</h3>';
  const byCategory = {};
  findings.forEach((f) => { (byCategory[f.category] = byCategory[f.category] || []).push(f); });
  Object.keys(byCategory).forEach((category) => {
    html += `<div class="category-heading">${category}</div>`;
    byCategory[category].forEach((f) => { html += findingCard(f); });
  });
  html += '</div>';

  html += '</div>'; // #report-content
  return html;
}

// Renders the report into #findings-area, reading "Prepared For" from the DOM and appending
// the Back/Download actions. Remembers the site name (module-level `lastSite`) for downloadPDF's
// filename, matching the original inline behavior this was extracted from.
export function render(findings, meta) {
  const findingsArea = document.getElementById('findings-area');
  lastSite = meta.site || 'report';

  if (!findings.length) {
    findingsArea.innerHTML = '<p style="color:#999">No findings returned.</p>';
    return;
  }

  const preparedFor = (document.getElementById('prepared-for')?.value || '').trim();
  const html = buildReportHtml(findings, meta, preparedFor);

  findingsArea.innerHTML = html + `<div class="report-actions wizard-actions">
        <button class="btn btn-ghost" onclick="goToStep(2)">← Back to Run</button>
        <button class="btn" onclick="downloadPDF()">Download PDF</button>
    </div>`;
}

export function downloadPDF() {
  const el = document.getElementById('report-content');
  if (!el) return;
  const safeName = lastSite.replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 60) || 'report';
  window.html2pdf().set({
    margin: 10,
    filename: `discovery-report-${safeName}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
  }).from(el).save();
}
