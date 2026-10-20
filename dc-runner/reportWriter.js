// Wraps buildReportHtml's output fragment (public/js/report.js) into a standalone HTML document,
// so the produced file needs no external CSS to render correctly on its own.
import fs from 'fs';

// Verbatim copy of discovery.html's report CSS block (public/discovery.html:62-94 as of the
// dc-runner phase). Keep this in sync if that block changes — it's duplicated rather than
// shared because the web app's version lives inline in a page's <style>, and extracting a
// shared CSS file/SEA-asset for one block isn't worth the added build complexity for v1.
const REPORT_CSS = `
        .category-heading { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #666; margin: 2rem 0 0.75rem; }
        .category-heading:first-child { margin-top: 0; }
        .finding { border: 1px solid #e5e5e5; padding: 1.2rem 1.5rem; margin-bottom: 1rem; max-width: 800px; }
        .finding-head { display: flex; align-items: center; gap: 0.6rem; }
        .finding-title { font-weight: 600; font-size: 0.95rem; }
        .badge { display: inline-block; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; padding: 0.2rem 0.5rem; border-radius: 3px; }
        .badge-info { background: #e5e5e5; color: #333; }
        .badge-warning { background: #fef3c7; color: #92400e; }
        .badge-critical { background: #fee2e2; color: #991b1b; }
        .badge-unavailable { background: #f1f5f9; color: #64748b; }
        .finding-summary { margin: 0.6rem 0; font-family: monospace; font-size: 0.85rem; }
        .finding-explanation { font-size: 0.85rem; color: #555; margin-top: 0.4rem; line-height: 1.5; }
        .finding-recommendation { font-size: 0.85rem; color: #000; margin-top: 0.6rem; font-weight: 600; }
        .finding-error { font-size: 0.8rem; color: #991b1b; margin-top: 0.6rem; }

        .report-header { margin-bottom: 2rem; border-bottom: 2px solid #000; padding-bottom: 1.5rem; max-width: 800px; }
        .report-brand { font-size: 0.75rem; font-weight: 700; letter-spacing: 2px; color: #666; }
        .report-header h2 { font-size: 1.4rem; font-weight: 600; margin: 0.3rem 0 1rem; }
        .report-meta { font-size: 0.85rem; color: #444; display: flex; gap: 2rem; flex-wrap: wrap; }
        .report-section { max-width: 800px; margin-bottom: 2.5rem; }
        .report-section h3 { font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem; border-bottom: 1px solid #e5e5e5; padding-bottom: 0.5rem; }
        .concern-row { border-left: 3px solid #64748b; padding: 0.7rem 1rem; margin-bottom: 0.7rem; background: #fafafa; font-size: 0.88rem; }
        .concern-row.severity-critical { border-left-color: #991b1b; }
        .concern-row.severity-warning { border-left-color: #92400e; }
        .concern-rec { margin-top: 0.4rem; font-weight: 600; }
        .no-concerns { color: #666; font-size: 0.9rem; }
        .stats-table { width: 100%; max-width: 500px; border-collapse: collapse; font-size: 0.85rem; }
        .stats-table th, .stats-table td { padding: 0.6rem 1rem; border-bottom: 1px solid #e5e5e5; text-align: left; }
        .stats-table th { font-weight: 600; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.5px; color: #666; background: #fafafa; }
        .stats-table td:first-child { font-weight: 600; background: #fafafa; }
        .stats-table td:last-child { font-family: monospace; }
        .finding-details { margin-top: 1rem; }
        .finding-details h4 { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #666; margin: 1.2rem 0 0.5rem; }
        .details-table { max-width: 100%; }
        .table-note { font-size: 0.8rem; color: #666; margin-top: 0.4rem; font-style: italic; }
`;

export function wrapAsStandaloneHtml(bodyHtml, { title }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>${title}</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Inter', -apple-system, sans-serif; }
        body { background: #fff; color: #000; padding: 3rem; }
${REPORT_CSS}
    </style>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

export function writeReportFile(fullHtml, filePath) {
  fs.writeFileSync(filePath, fullHtml, 'utf8');
}
