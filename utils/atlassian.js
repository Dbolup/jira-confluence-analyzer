// utils/atlassian.js
import fetch from "node-fetch";
import "./env.js"; // Ensure env is loaded

export async function getProjects({ headers, baseUrl }) {
  let startAt = 0;
  const maxResults = 50;
  const allProjects = [];

  while (true) {
    const response = await fetch(
      `${baseUrl}/project/search?startAt=${startAt}&maxResults=${maxResults}`,
      { headers },
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(`Failed to fetch projects: ${response.status}`);
    }

    const projects = (data.values || []).map((project) => ({
      id: project.id,
      key: project.key,
      name: project.name,
      type: project.projectTypeKey,
      lead: project.lead?.displayName || "Unknown",
      archived: project.archived || false,
    }));

    allProjects.push(...projects);

    if (data.isLast || projects.length < maxResults) {
      break;
    }

    startAt += maxResults;
  }

  const activeCount = allProjects.filter(p => !p.archived).length;
  const archivedCount = allProjects.filter(p => p.archived).length;

  return {
    total: allProjects.length,
    active: activeCount,
    archived: archivedCount,
    projects: allProjects
  };
}

export async function getCustomFields({ headers, baseUrl }) {
  const response = await fetch(`${baseUrl}/field`, { headers });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Failed to fetch fields: ${response.status}`);
  }

  const customFields = data.filter(field => field.custom).map((field) => ({
    id: field.id,
    name: field.name,
    key: field.key,
    type: field.schema?.type || "unknown",
    custom: field.custom || false,
    searchable: field.searchable,
    navigable: field.navigable,
  }));

  // Find duplicates based on name and type
  const duplicateGroups = {};
  customFields.forEach(field => {
    const key = `${field.name}_${field.type}`;
    if (!duplicateGroups[key]) {
      duplicateGroups[key] = [];
    }
    duplicateGroups[key].push(field);
  });

  const duplicates = Object.values(duplicateGroups).filter(group => group.length > 1);
  const duplicateCount = duplicates.reduce((sum, group) => sum + group.length, 0);

  return {
    total: customFields.length,
    unique: customFields.length - duplicateCount,
    duplicates: duplicateCount,
    duplicateGroups: duplicates
  };
}

export async function getPermissionSchemes({ headers, baseUrl }) {
  // Get permission schemes
  const schemesResponse = await fetch(`${baseUrl}/permissionscheme`, { headers });
  const schemesData = await schemesResponse.json();

  if (!schemesResponse.ok) {
    throw new Error(`Permission schemes fetch failed: ${schemesResponse.status}`);
  }

  // Get projects to check which schemes are in use
  const projectsResponse = await fetch(`${baseUrl}/project/search?maxResults=1000`, { headers });
  const projectsData = await projectsResponse.json();
  
  if (!projectsResponse.ok) {
    throw new Error(`Projects fetch failed for permission schemes: ${projectsResponse.status}`);
  }

  const usedSchemeIds = new Set();
  for (const project of projectsData.values || []) {
    if (project.permissionScheme?.id) {
      usedSchemeIds.add(project.permissionScheme.id);
    }
  }

  const schemes = schemesData.permissionSchemes || [];
  const activeCount = schemes.filter(scheme => usedSchemeIds.has(scheme.id)).length;
  const inactiveCount = schemes.length - activeCount;

  return {
    total: schemes.length,
    active: activeCount,
    inactive: inactiveCount
  };
}

export async function getFilters({ headers, baseUrl }) {
  let startAt = 0;
  const maxResults = 50;
  let total = 0;

  while (true) {
    const res = await fetch(`${baseUrl}/filter/search?startAt=${startAt}&maxResults=${maxResults}&overrideSharePermissions=true`, {
      headers,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Filters fetch failed: ${res.status}`);
    }

    total += data.values?.length || 0;

    if (data.isLast || data.values.length < maxResults) {
      break;
    }

    startAt += maxResults;
  }

  return total;
}

export async function getDashboards({ headers, baseUrl }) {
  const res = await fetch(`${baseUrl}/dashboard`, { headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Dashboards fetch failed: ${res.status}`);
  }

  return data.total || 0;
}

export async function getBoards({ headers, agileBaseUrl }) {
  let startAt = 0;
  const maxResults = 50;
  let total = 0;

  while (true) {
    const res = await fetch(`${agileBaseUrl}/board?startAt=${startAt}&maxResults=${maxResults}`, {
      headers,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Boards fetch failed: ${res.status}`);
    }

    total += data.values?.length || 0;

    if (!data.isLast && data.values.length === maxResults) {
      startAt += maxResults;
    } else {
      break;
    }
  }

  return total;
}

export async function getWorkflows({ headers, baseUrl }) {
  const res = await fetch(`${baseUrl}/workflow/search`, { headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Workflows fetch failed: ${res.status}`);
  }

  return data.total || 0;
}

export async function getWorkflowSchemes({ headers, baseUrl }) {
  const res = await fetch(`${baseUrl}/workflowscheme`, { headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Workflow Schemes fetch failed: ${res.status}`);
  }

  // Get projects to check which workflow schemes are in use
  const projectsResponse = await fetch(`${baseUrl}/project/search?maxResults=1000`, { headers });
  const projectsData = await projectsResponse.json();
  
  if (!projectsResponse.ok) {
    throw new Error(`Projects fetch failed for workflow schemes: ${projectsResponse.status}`);
  }

  const usedSchemeIds = new Set();
  for (const project of projectsData.values || []) {
    if (project.workflowScheme?.id) {
      usedSchemeIds.add(project.workflowScheme.id);
    }
  }

  const schemes = data.values || [];
  const activeCount = schemes.filter(scheme => usedSchemeIds.has(scheme.id)).length;
  const inactiveCount = schemes.length - activeCount;

  return {
    total: schemes.length,
    active: activeCount,
    inactive: inactiveCount
  };
}

export async function getIssueTypes({ headers, baseUrl }) {
  const res = await fetch(`${baseUrl}/issuetype`, { headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Issue Types fetch failed: ${res.status}`);
  }

  return data.length;
}

export async function getIssueTypeSchemes({ headers, baseUrl }) {
  let startAt = 0;
  const maxResults = 50;
  const allSchemes = [];

  while (true) {
    const res = await fetch(`${baseUrl}/issuetypescheme?startAt=${startAt}&maxResults=${maxResults}`, { headers });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Issue Type Schemes fetch failed: ${res.status}`);
    }

    allSchemes.push(...(data.values || []));

    if (data.isLast || (data.values || []).length < maxResults) {
      break;
    }

    startAt += maxResults;
  }

  // Get projects to check which issue type schemes are in use
  const projectsResponse = await fetch(`${baseUrl}/project/search?maxResults=1000`, { headers });
  const projectsData = await projectsResponse.json();
  
  if (!projectsResponse.ok) {
    throw new Error(`Projects fetch failed for issue type schemes: ${projectsResponse.status}`);
  }

  const usedSchemeIds = new Set();
  for (const project of projectsData.values || []) {
    if (project.issueTypeScheme?.id) {
      usedSchemeIds.add(project.issueTypeScheme.id);
    }
  }

  const activeCount = allSchemes.filter(scheme => usedSchemeIds.has(scheme.id)).length;
  const inactiveCount = allSchemes.length - activeCount;

  return {
    total: allSchemes.length,
    active: activeCount,
    inactive: inactiveCount
  };
}

export async function getPriorities({ headers, baseUrl }) {
  const res = await fetch(`${baseUrl}/priority`, { headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Priorities fetch failed: ${res.status}`);
  }

  return data.length;
}

export async function getPrioritySchemes({ headers, baseUrl }) {
  const res = await fetch(`${baseUrl}/priorityscheme`, { headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Priority Schemes fetch failed: ${res.status}`);
  }

  return (data.values || []).length;
}

export async function getStatuses({ headers, baseUrl }) {
  const res = await fetch(`${baseUrl}/status`, { headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Statuses fetch failed: ${res.status}`);
  }

  return data.length;
}

export async function getNotificationSchemes({ headers, baseUrl }) {
  const res = await fetch(`${baseUrl}/notificationscheme`, { headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Notification Schemes fetch failed: ${res.status}`);
  }

  return (data.values || []).length;
}

export async function getIssueSecuritySchemes({ headers, baseUrl }) {
  const res = await fetch(`${baseUrl}/issuesecurityschemes`, { headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Issue Security Schemes fetch failed: ${res.status}`);
  }

  return (data.issueSecuritySchemes || []).length;
}

export async function getScreens({ headers, baseUrl }) {
  let startAt = 0;
  const maxResults = 100;
  let total = 0;

  while (true) {
    const res = await fetch(`${baseUrl}/screens?startAt=${startAt}&maxResults=${maxResults}`, { headers });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Screens fetch failed: ${res.status}`);
    }

    total += (data.values || []).length;

    if (data.isLast || (data.values || []).length < maxResults) {
      break;
    }

    startAt += maxResults;
  }

  return total;
}

export async function getScreenSchemes({ headers, baseUrl }) {
  const res = await fetch(`${baseUrl}/screenscheme`, { headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Screen Schemes fetch failed: ${res.status}`);
  }

  return (data.values || []).length;
}

export async function getIssueTypeScreenSchemes({ headers, baseUrl }) {
  let startAt = 0;
  const maxResults = 50;
  let total = 0;

  while (true) {
    const res = await fetch(`${baseUrl}/issuetypescreenscheme?startAt=${startAt}&maxResults=${maxResults}`, { headers });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Issue Type Screen Schemes fetch failed: ${res.status}`);
    }

    total += (data.values || []).length;

    if (data.isLast || (data.values || []).length < maxResults) {
      break;
    }

    startAt += maxResults;
  }

  return total;
}

export async function getFieldConfigurations({ headers, baseUrl }) {
  let startAt = 0;
  const maxResults = 50;
  let total = 0;

  while (true) {
    const res = await fetch(`${baseUrl}/fieldconfiguration?startAt=${startAt}&maxResults=${maxResults}`, { headers });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Field Configurations fetch failed: ${res.status}`);
    }

    total += (data.values || []).length;

    if (data.isLast || (data.values || []).length < maxResults) {
      break;
    }

    startAt += maxResults;
  }

  return total;
}

export async function getFieldConfigurationSchemes({ headers, baseUrl }) {
  const v2BaseUrl = baseUrl.replace('/rest/api/3', '/rest/api/2');
  const res = await fetch(`${v2BaseUrl}/fieldconfigurationscheme`, { headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Field Configuration Schemes fetch failed: ${res.status}`);
  }

  return data.total || 0;
}

export async function getResolutions({ headers, baseUrl }) {
  const res = await fetch(`${baseUrl}/resolution`, { headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Resolutions fetch failed: ${res.status}`);
  }

  return data.length;
}