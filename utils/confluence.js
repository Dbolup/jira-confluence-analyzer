import fetch from "node-fetch";
import "./env.js";

// Helper for clean pagination
// FIX: Confluence uses 'start' (not startAt) and 'limit' (not maxResults)
async function fetchAll(url, headers, resultKey = 'results') {
  let start = 0;
  const limit = 50;
  const allItems = [];

  while (true) {
    const joinChar = url.includes('?') ? '&' : '?';
    const finalUrl = `${url}${joinChar}start=${start}&limit=${limit}`;
    
    const res = await fetch(finalUrl, { headers });
    
    if (!res.ok) {
        // If first fetch fails, throw error. If later page fails, stop and return what we have.
        if (start === 0) {
            const txt = await res.text();
            throw new Error(`Fetch failed (${res.status}): ${txt.substring(0,100)}`);
        }
        break; 
    }

    const data = await res.json();
    const items = data[resultKey] || data.values || [];
    
    if (items.length === 0) break;
    
    allItems.push(...items);
    
    // Stop if we got fewer items than the limit (end of list)
    if (items.length < limit) break;
    
    start += limit;
  }
  
  return allItems;
}

export async function getSpaces({ headers, baseUrl }) {
  // Expand metadata to check for archived status if needed
  const allSpaces = await fetchAll(`${baseUrl}/space?expand=metadata,icon,description.plain`, headers);

  const spaces = allSpaces.map(s => ({
    id: s.id,
    key: s.key,
    name: s.name,
    type: s.type, // 'global' or 'personal'
    status: s.status, // 'current' or 'archived'
  }));

  const globalCount = spaces.filter(s => s.type === 'global').length;
  const personalCount = spaces.filter(s => s.type === 'personal').length;
  const archivedCount = spaces.filter(s => s.status === 'archived').length;
  // If status isn't explicitly 'archived', it's usually 'current'
  const activeCount = spaces.length - archivedCount;

  return {
    total: spaces.length,
    active: activeCount,
    archived: archivedCount,
    global: globalCount,
    personal: personalCount,
    spaces: spaces
  };
}

export async function getSpaceContentCounts({ headers, baseUrl, spaceKey }) {
  const counts = { 
    pages: 0, 
    blogposts: 0, 
    attachments: 0, 
  };

  // Helper: Use Search API (CQL) instead of iterating content
  // It is much faster and more reliable for counts
  const countByCQL = async (cql) => {
    try {
      const url = `${baseUrl}/search?cql=${encodeURIComponent(cql)}&limit=0`; 
      const res = await fetch(url, { headers });
      const data = await res.json();
      return data.totalSize || 0; 
    } catch (e) {
      return -1;
    }
  };

  const [pages, blogs, attachments] = await Promise.all([
    countByCQL(`space="${spaceKey}" AND type="page"`),
    countByCQL(`space="${spaceKey}" AND type="blogpost"`),
    countByCQL(`space="${spaceKey}" AND type="attachment"`)
  ]);

  counts.pages = pages === -1 ? 'Error' : pages;
  counts.blogposts = blogs === -1 ? 'Error' : blogs;
  counts.attachments = attachments === -1 ? 'Error' : attachments;

  return counts;
}