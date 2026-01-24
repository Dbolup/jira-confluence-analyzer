function getSavedCreds() {
  try {
    return JSON.parse(localStorage.getItem('atlassianGlobalCreds') || 'null');
  } catch (e) {
    return null;
  }
}

function domainsFromTextarea() {
  const raw = document.getElementById('domains').value || '';
  return raw.split('\n').map(s => s.trim()).filter(Boolean).map(d => d.replace(/^https?:\/\//, '').replace(/\/$/, '').replace('.atlassian.net', ''));
}

document.getElementById('btn-stats').addEventListener('click', async () => {
  const creds = getSavedCreds();
  if (!creds || !creds.email || !creds.token) {
    alert('Please set up credentials first at /credentials');
    return;
  }

  const domains = domainsFromTextarea();
  if (!domains.length) { alert('Enter at least one domain'); return; }

  const sites = domains.map(domain => ({ domain, email: creds.email, token: creds.token }));

  showResponse('Loading...');
  try {
    const res = await fetch('/api/confluence/stats', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sites }) });
    const data = await res.json();
    renderStatsTable(data);
  } catch (e) {
    showResponse('Error: ' + e.message);
  }
});

document.getElementById('btn-spaces').addEventListener('click', async () => {
  const creds = getSavedCreds();
  if (!creds || !creds.email || !creds.token) { alert('Please set up credentials first at /credentials'); return; }

  const domains = domainsFromTextarea();
  if (!domains.length) { alert('Enter at least one domain'); return; }

  const sites = domains.map(domain => ({ domain, email: creds.email, token: creds.token }));

  showResponse('Loading...');
  try {
    const res = await fetch('/api/confluence/spaces', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ sites }) });
    const data = await res.json();
    renderSpacesList(data);
  } catch (e) {
    showResponse('Error: ' + e.message);
  }
});



// Load spaces for a specific domain and populate the select dropdown
document.getElementById('btn-load-spaces').addEventListener('click', async () => {
  const creds = getSavedCreds();
  if (!creds || !creds.email || !creds.token) { alert('Please set up credentials first at /credentials'); return; }

  const domain = (document.getElementById('space-domain').value || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '').replace('.atlassian.net', '');
  if (!domain) { alert('Enter a domain'); return; }

  showResponse('Loading spaces...');
  try {
    const res = await fetch('/api/confluence/spaces', {
      method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ sites: [{ domain, email: creds.email, token: creds.token }] })
    });
    const data = await res.json();
    const first = data.results && data.results[0];
    const select = document.getElementById('space-select');
    select.innerHTML = '<option value="">-- select a space --</option>';
    if (first && first.spaces && Array.isArray(first.spaces)) {
      for (const s of first.spaces) {
        const opt = document.createElement('option');
        opt.value = s.key || s.id || s.name;
        opt.textContent = (s.name || s.key || s.id) + (s.key ? ` (${s.key})` : '');
        select.appendChild(opt);
      }
      showResponse(`Loaded ${first.spaces.length} spaces for ${domain}`);
    } else {
      showResponse('No spaces returned');
    }
  } catch (e) {
    showResponse('Error: ' + e.message);
  }
});

// Use selected space from dropdown when comparing
document.getElementById('btn-compare').addEventListener('click', async () => {
  const creds = getSavedCreds();
  if (!creds || !creds.email || !creds.token) { alert('Please set up credentials first at /credentials'); return; }

  const domain = (document.getElementById('space-domain').value || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '').replace('.atlassian.net', '');
  const select = document.getElementById('space-select');
  const key = (select.value || '').trim();
  if (!domain || !key) { alert('Select a domain and a space from the dropdown'); return; }

  const payload = [{ domain, site: { email: creds.email, token: creds.token }, space: { key, name: key } }];

  showResponse('Loading...');
  try {
    const res = await fetch('/api/confluence/compare-spaces', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ spaces: payload }) });
    const data = await res.json();
    renderCompareResult(data);
  } catch (e) {
    showResponse('Error: ' + e.message);
  }
});

function showResponse(text) {
  const container = document.getElementById('response');
  if (typeof text === 'string') {
    container.innerHTML = `<pre style="white-space:pre-wrap">${escapeHtml(text)}</pre>`;
  } else {
    container.innerHTML = '';
  }
}

function escapeHtml(unsafe) {
  return (unsafe+"").replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;'}[c]));
}

function renderStatsTable(data) {
  const container = document.getElementById('response');
  const results = data.results || [];
  const icons = { spaceCount: '🗂️' };
  const tips = { spaceCount: 'Total spaces in the Confluence site' };
  let html = '<table>'; 
  html += `<thead><tr><th>Domain</th><th style="text-align:right" class="has-tooltip" data-tip="${escapeHtml(tips.spaceCount)}"><span class="metric-icon">${icons.spaceCount}</span>Spaces</th></tr></thead><tbody>`;
  for (const r of results) {
    if (r.error) {
      html += `<tr><td class="metric-label">${escapeHtml(r.domain)}</td><td style="color:#ef4444;text-align:right">Error</td></tr>`;
    } else {
      html += `<tr><td class="metric-label">${escapeHtml(r.domain)}</td><td class="metric-value" style="text-align:right">${escapeHtml(String(r.spaceCount))}</td></tr>`;
    }
  }
  html += '</tbody></table>';
  container.innerHTML = html;
  // show export buttons
  document.getElementById('confluence-export').style.display = 'flex';
  document.getElementById('confluence-csv').onclick = () => exportTableToCSV(results, 'confluence-stats.csv');
  document.getElementById('confluence-pdf').onclick = () => exportTableToPDF(container.innerHTML, 'confluence-stats');
}

function renderSpacesList(data) {
  const container = document.getElementById('response');
  const results = data.results || [];
  const first = results[0];
  if (!first) { container.innerHTML = 'No data'; return; }
  if (first.error) { container.innerHTML = `<div style="color:#ef4444">${escapeHtml(first.error)}</div>`; return; }
  const spaces = first.spaces || [];
  const icons = { key: '🔑', name: '📛', type: '🏷️' };
  const tips = { key: 'Space key', name: 'Space name', type: 'Space type' };
  let html = `<table><thead><tr><th class="has-tooltip" data-tip="${escapeHtml(tips.key)}"><span class="metric-icon">${icons.key}</span>Key</th><th class="has-tooltip" data-tip="${escapeHtml(tips.name)}"><span class="metric-icon">${icons.name}</span>Name</th><th class="has-tooltip" data-tip="${escapeHtml(tips.type)}"><span class="metric-icon">${icons.type}</span>Type</th></tr></thead><tbody>`;
  for (const s of spaces) {
    html += `<tr><td class="metric-label">${escapeHtml(String(s.key||s.id||''))}</td><td>${escapeHtml(s.name||'')}</td><td>${escapeHtml(s.type||'')}</td></tr>`;
  }
  html += '</tbody></table>';
  container.innerHTML = html;
  document.getElementById('confluence-export').style.display = 'flex';
  document.getElementById('confluence-csv').onclick = () => exportTableToCSV(spaces, 'confluence-spaces.csv');
  document.getElementById('confluence-pdf').onclick = () => exportTableToPDF(container.innerHTML, 'confluence-spaces');
}

function renderCompareResult(data) {
  const container = document.getElementById('response');
  const results = data.results || [];
  if (!results.length) { container.innerHTML = 'No result'; return; }
  const r = results[0];
  if (r.error) { container.innerHTML = `<div style="color:#ef4444">${escapeHtml(r.error)}</div>`; return; }
  const counts = r.counts || {};
  let html = '<table style="width:100%;border-collapse:collapse"><tbody>';
  for (const [k, v] of Object.entries(counts)) {
    html += `<tr><td style="padding:8px;font-weight:600;text-transform:capitalize">${escapeHtml(k.replace(/([A-Z])/g, ' $1'))}</td><td style="padding:8px;text-align:right">${escapeHtml(String(v))}</td></tr>`;
  }
  html += '</tbody></table>';
  container.innerHTML = html;
  // export
  document.getElementById('confluence-export').style.display = 'flex';
  document.getElementById('confluence-csv').onclick = () => exportTableToCSVObject(counts, 'confluence-compare.csv');
  document.getElementById('confluence-pdf').onclick = () => exportTableToPDF(container.innerHTML, 'confluence-compare');
}

// CSV/PDF helpers (simple implementations)
function exportTableToCSV(rows, filename) {
  if (!Array.isArray(rows)) return;
  const keys = Object.keys(rows[0] || {});
  const header = keys.join(',');
  const lines = rows.map(r => keys.map(k => `"${String(r[k] ?? '')}"`).join(','));
  const csv = header + '\n' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function exportTableToCSVObject(obj, filename) {
  const keys = Object.keys(obj || {});
  const lines = keys.map(k => `${k},${String(obj[k] ?? '')}`);
  const csv = 'Metric,Value\n' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

function exportTableToPDF(htmlContent, title) {
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`<html><head><title>${title}</title></head><body>${htmlContent}</body></html>`);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
}

// Auto-populate domains textarea from sessionStorage atlassianCredentials if present
function populateDomainsFromSession() {
  try {
    const stored = sessionStorage.getItem('atlassianCredentials');
    if (!stored) return;
    const sites = JSON.parse(stored);
    const domains = sites.map(s => s.domain).filter(Boolean);
    if (domains.length) {
      document.getElementById('domains').value = domains.join('\n');
    }
  } catch (e) {
    // ignore
  }
}

// Run on load
setTimeout(populateDomainsFromSession, 50);
