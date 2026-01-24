function getSavedCreds(){try{return JSON.parse(localStorage.getItem('atlassianGlobalCreds')||'null')}catch(e){return null}}

async function loadSpacesFor(domain){
  const creds=getSavedCreds();
  if(!creds||!creds.email||!creds.token)throw new Error('Missing credentials');
  const d=domain.trim().replace(/^https?:\/\//,'').replace(/\/$/,'').replace('.atlassian.net','');
  const res=await fetch('/api/confluence/spaces',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sites:[{domain:d,email:creds.email,token:creds.token}]})});
  const data=await res.json();
  const first=data.results&&data.results[0];
  return first&&first.spaces?first.spaces:[];
}

function populateSelect(selectEl,spaces){
  selectEl.innerHTML='';
  const empty=document.createElement('option'); empty.value=''; empty.textContent='-- select space --'; selectEl.appendChild(empty);
  for(const s of spaces){
    const o=document.createElement('option'); o.value=s.key||s.id||s.name; o.textContent=(s.name||s.key||s.id)+(s.key?` (${s.key})`:''); selectEl.appendChild(o);
  }
}

async function onLoad(side){
  try{
    const domain=document.getElementById(side+'-domain').value||'';
    if(!domain) return alert('Enter domain');
    const select=document.getElementById(side+'-select');
    select.innerHTML='<option>Loading...</option>';
    const spaces=await loadSpacesFor(domain);
    populateSelect(select,spaces);
  }catch(e){alert('Failed to load spaces: '+e.message)}
}

async function compareTwo(){
  try{
    const creds=getSavedCreds(); if(!creds||!creds.email||!creds.token) return alert('Please save credentials at /credentials');
    const ld=document.getElementById('left-domain').value||''; const rd=document.getElementById('right-domain').value||'';
    const ls=document.getElementById('left-select').value||''; const rs=document.getElementById('right-select').value||'';
    if(!ld||!rd||!ls||!rs) return alert('Provide domains and select spaces for both sides');
    // New behavior: support unlimited sites (collect all site blocks if present)
    const blocks = document.querySelectorAll('.compare-site-block');
    const payload = [];
    blocks.forEach(b => {
      const domain = (b.querySelector('.domain-input')?.value||'').trim().replace(/^https?:\/\//,'').replace(/\/$/,'').replace('.atlassian.net','');
      const key = (b.querySelector('.space-select')?.value||'').trim();
      if (domain && key) payload.push({ domain, site: { email: creds.email, token: creds.token }, space: { key, name: key } });
    });
    if (payload.length < 2) return alert('Select at least two spaces to compare');
    document.getElementById('compare-result').textContent='Loading...';
    const res=await fetch('/api/confluence/compare-spaces',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({spaces:payload})});
    const data=await res.json();
    renderCompareMany(data);
  }catch(e){document.getElementById('compare-result').textContent='Error: '+e.message}
}

function renderCompareTwo(data){
  // Deprecated single-two renderer, keep for compatibility
  const results=(data.results||[]);
  if(results.length<2){ document.getElementById('compare-result').textContent='No results'; return }
  renderCompareMany(data);
}

function renderCompareMany(data){
  const results = data.results || [];
  if (!results.length) { document.getElementById('compare-result').textContent = 'No results'; return; }
  const icons = { metric: '📊', site: '🗂️' };
  const tips = { metric: 'Metric name', site: 'Site (domain or space key)' };
  const labels = results.map(r => r.space?.key || r.domain || r.key || 'site');
  const metricsSet = new Set();
  results.forEach(r => { const c = r.counts || {}; Object.keys(c).forEach(k => metricsSet.add(k)); });
  const metrics = Array.from(metricsSet);
  let html = '<table><thead><tr>' +
    `<th class="has-tooltip" data-tip="${escapeHtml(tips.metric)}"><span class="metric-icon">${icons.metric}</span>Metric</th>` +
    labels.map(l => `<th class="has-tooltip" data-tip="${escapeHtml(tips.site+' - '+l)}"><span class="metric-icon">${icons.site}</span>${escapeHtml(l)}</th>`).join('') +
    '</tr></thead><tbody>';
  for (const m of metrics) {
    html += `<tr><td style="font-weight:600">${escapeHtml(m.replace(/([A-Z])/g,' $1'))}</td>`;
    for (const r of results) {
      const v = r.counts?.[m] ?? 0;
      html += `<td style="text-align:right">${escapeHtml(String(v))}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  document.getElementById('compare-result').innerHTML = html;
  // show export buttons and wire them
  const exp = document.getElementById('compare-export'); if (exp) exp.style.display = 'flex';
  const csvBtn = document.getElementById('compare-csv');
  if (csvBtn) csvBtn.onclick = () => {
    // build CSV
    const keys = ['Metric', ...labels];
    const rows = [keys.join(',')];
    metrics.forEach(m => {
      const line = [m, ...results.map(r => String(r.counts?.[m] ?? 0))];
      rows.push(line.map(v => '"'+v+'"').join(','));
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='confluence-compare.csv'; a.click(); URL.revokeObjectURL(url);
  };
  const pdfBtn = document.getElementById('compare-pdf');
  if (pdfBtn) pdfBtn.onclick = () => { exportComparePDF(html); };


function exportComparePDF(html) {
  const win = window.open('', '_blank'); win.document.write(`<html><body>${html}</body></html>`); win.document.close(); setTimeout(()=>{win.print(); win.close();},200);
}
function escapeHtml(s){return (s+"").replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;'}[c]))}

// attach
// attach dynamic handlers
function createSiteBlock(index) {
  const container = document.getElementById('sites-container');
  const div = document.createElement('div');
  div.className = 'compare-site-block';
  div.style.marginBottom = '8px';
  div.innerHTML = `
    <div style="display:flex;gap:8px;align-items:end">
      <div style="flex:1">
        <label>Domain</label>
        <input class="domain-input" placeholder="your-domain" />
      </div>
      <div style="width:260px">
        <label>Space</label>
        <div style="display:flex;gap:8px">
          <button class="btn btn-ghost load-btn">Load</button>
          <select class="space-select" style="flex:1"></select>
        </div>
      </div>
      <div style="width:72px">
        <button class="btn btn-ghost remove-btn">Remove</button>
      </div>
    </div>
  `;
  container.appendChild(div);
  const loadBtn = div.querySelector('.load-btn');
  const removeBtn = div.querySelector('.remove-btn');
  const select = div.querySelector('.space-select');
  loadBtn.addEventListener('click', async () => {
    const domain = div.querySelector('.domain-input').value || '';
    try {
      const spaces = await loadSpacesFor(domain);
      populateSelect(select, spaces);
    } catch (e) { alert('Failed to load: '+e.message); }
  });
  removeBtn.addEventListener('click', () => div.remove());
}

document.getElementById('add-site').addEventListener('click', () => createSiteBlock());
// create two default blocks
createSiteBlock(); createSiteBlock();

nd=document.getElementById('btn-compare-two'); if(nd) nd.addEventListener('click',compareTwo);
nd=document.getElementById('compare-csv'); if(nd) nd.addEventListener('click',()=>{/* handled after render */});
nd=document.getElementById('compare-pdf'); if(nd) nd.addEventListener('click',()=>{});

// try populate domains from session
setTimeout(()=>{try{const s=sessionStorage.getItem('atlassianCredentials'); if(!s) return; const arr=JSON.parse(s); if(arr[0]){document.getElementById('left-domain').value=arr[0].domain||''; if(arr[1]) document.getElementById('right-domain').value=arr[1].domain||''}}catch(e){}},50);
