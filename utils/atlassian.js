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
    }));

    allProjects.push(...projects);

    if (data.isLast || projects.length < maxResults) {
      break;
    }

    startAt += maxResults;
  }

  return allProjects;
}

export async function getCustomFields({ headers, baseUrl }) {
  const response = await fetch(`${baseUrl}/field`, { headers });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Failed to fetch fields: ${response.status}`);
  }

  return data.map((field) => ({
    id: field.id,
    name: field.name,
    key: field.key,
    type: field.schema?.type || "unknown",
    custom: field.custom || false,
    searchable: field.searchable,
    navigable: field.navigable,
  }));
}

export async function getPermissionSchemes({ headers, baseUrl }) {
  const response = await fetch(`${baseUrl}/permissionscheme`, { headers });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(`Permission schemes fetch failed: ${response.status}`);
  }

  return (data.permissionSchemes || []).length;
}

export async function getFilters({ headers, baseUrl }) {
  let startAt = 0;
  const maxResults = 50;
  let total = 0;

  while (true) {
    const res = await fetch(`${baseUrl}/filter/search?startAt=${startAt}&maxResults=${maxResults}`, {
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

  return (data.values || []).length;
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
  let total = 0;

  while (true) {
    const res = await fetch(`${baseUrl}/issuetypescheme?startAt=${startAt}&maxResults=${maxResults}`, { headers });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Issue Type Schemes fetch failed: ${res.status}`);
    }

    total += (data.values || []).length;

    if (data.isLast || (data.values || []).length < maxResults) {
      break;
    }

    startAt += maxResults;
  }

  return total;
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
  const v2BaseUrl = baseUrl.replace('/rest/api/3', '/rest/api/2');
  const res = await fetch(`${v2BaseUrl}/priorityscheme`, { headers });
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
  const v2BaseUrl = baseUrl.replace('/rest/api/3', '/rest/api/2');
  const res = await fetch(`${v2BaseUrl}/issuesecurityschemes`, { headers });
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
  let startAt = 0;
  const maxResults = 50;
  let total = 0;

  while (true) {
    const res = await fetch(`${baseUrl}/fieldconfigurationscheme?startAt=${startAt}&maxResults=${maxResults}`, { headers });
    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Field Configuration Schemes fetch failed: ${res.status}`);
    }

    total += (data.values || []).length;

    if (data.isLast || (data.values || []).length < maxResults) {
      break;
    }

    startAt += maxResults;
  }

  return total;
}

export async function getResolutions({ headers, baseUrl }) {
  const res = await fetch(`${baseUrl}/resolution`, { headers });
  const data = await res.json();

  if (!res.ok) {
    throw new Error(`Resolutions fetch failed: ${res.status}`);
  }

  return data.length;
}
