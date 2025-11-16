// index.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

dotenv.config();

import {
  getProjects,
  getCustomFields,
  getPermissionSchemes,
  getFilters,
  getDashboards,
  getBoards,
  getWorkflows,
  getWorkflowSchemes,
  getIssueTypes,
  getIssueTypeSchemes,
  getPriorities,
  getPrioritySchemes,
  getStatuses,
  getNotificationSchemes,
  getIssueSecuritySchemes,
  getScreens,
  getScreenSchemes,
  getIssueTypeScreenSchemes,
  getFieldConfigurations,
  getFieldConfigurationSchemes,
  getResolutions,
} from "./utils/atlassian.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/insights", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "insights.html"));
});

app.get("/compare", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "compare.html"));
});

app.get("/credentials", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "credentials.html"));
});

// Simple stats endpoint (just counts)
app.post("/api/stats", async (req, res) => {
  const sites = req.body.sites;
  if (!Array.isArray(sites)) {
    return res.status(400).json({ error: "Expected 'sites' to be an array" });
  }

  const results = await Promise.all(
    sites.map(async (site) => {
      const { email, token, domain } = site;

      const baseUrl = `https://${domain}.atlassian.net/rest/api/3`;
      const agileBaseUrl = `https://${domain}.atlassian.net/rest/agile/1.0`;
      const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;

      const headers = {
        Authorization: authHeader,
        Accept: "application/json",
      };

      try {
        const results = await Promise.allSettled([
          getProjects({ headers, baseUrl }),
          getCustomFields({ headers, baseUrl }),
          getPermissionSchemes({ headers, baseUrl }),
          getFilters({ headers, baseUrl }),
          getDashboards({ headers, baseUrl }),
          getBoards({ headers, agileBaseUrl }),
          getWorkflows({ headers, baseUrl }),
          getWorkflowSchemes({ headers, baseUrl }),
          getIssueTypes({ headers, baseUrl }),
          getIssueTypeSchemes({ headers, baseUrl }),
          getPriorities({ headers, baseUrl }),
          getPrioritySchemes({ headers, baseUrl }),
          getStatuses({ headers, baseUrl }),
          getNotificationSchemes({ headers, baseUrl }),
          getIssueSecuritySchemes({ headers, baseUrl }),
          getScreens({ headers, baseUrl }),
          getScreenSchemes({ headers, baseUrl }),
          getIssueTypeScreenSchemes({ headers, baseUrl }),
          getFieldConfigurations({ headers, baseUrl }),
          getFieldConfigurationSchemes({ headers, baseUrl }),
          getResolutions({ headers, baseUrl }),
        ]);

        // Helper function to safely get value or return error indicator
        const getValue = (result, index, defaultValue = 0) => {
          if (result.status === 'fulfilled') {
            const value = result.value;
            // If it's an object with a total property, return that
            if (typeof value === 'object' && value !== null && 'total' in value) {
              return value.total;
            }
            // If it's an array, return its length
            if (Array.isArray(value)) {
              return value.length;
            }
            // Otherwise return the value directly
            return value;
          }
          console.warn(`API call ${index} failed:`, result.reason?.message);
          return `❌ Error`;
        };

        return {
          domain,
          boardCount: getValue(results[5], 'boards'),
          dashboardCount: getValue(results[4], 'dashboards'),
          fieldCount: getValue(results[1], 'fields'),
          fieldConfigurationCount: getValue(results[18], 'fieldConfigurations'),
          fieldConfigurationSchemeCount: getValue(results[19], 'fieldConfigurationSchemes'),
          filterCount: getValue(results[3], 'filters'),
          issueSecuritySchemeCount: getValue(results[14], 'issueSecuritySchemes'),
          issueTypeCount: getValue(results[8], 'issueTypes'),
          issueTypeSchemeCount: getValue(results[9], 'issueTypeSchemes'),
          issueTypeScreenSchemeCount: getValue(results[17], 'issueTypeScreenSchemes'),
          notificationSchemeCount: getValue(results[13], 'notificationSchemes'),
          permissionSchemeCount: getValue(results[2], 'permissions'),
          priorityCount: getValue(results[10], 'priorities'),
          prioritySchemeCount: getValue(results[11], 'prioritySchemes'),
          projectCount: getValue(results[0], 'projects'),
          resolutionCount: getValue(results[20], 'resolutions'),
          screenCount: getValue(results[15], 'screens'),
          screenSchemeCount: getValue(results[16], 'screenSchemes'),
          statusCount: getValue(results[12], 'statuses'),
          workflowCount: getValue(results[6], 'workflows'),
          workflowSchemeCount: getValue(results[7], 'workflowSchemes'),
        };
      } catch (e) {
        return { domain, error: e.message };
      }
    })
  );

  res.json({ results });
});

// Detailed insights endpoint (with active/inactive breakdown)
app.post("/api/insights", async (req, res) => {
  const sites = req.body.sites;
  if (!Array.isArray(sites)) {
    return res.status(400).json({ error: "Expected 'sites' to be an array" });
  }

  const results = await Promise.all(
    sites.map(async (site) => {
      const { email, token, domain } = site;

      const baseUrl = `https://${domain}.atlassian.net/rest/api/3`;
      const agileBaseUrl = `https://${domain}.atlassian.net/rest/agile/1.0`;
      const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;

      const headers = {
        Authorization: authHeader,
        Accept: "application/json",
      };

      try {
        const results = await Promise.allSettled([
          getProjects({ headers, baseUrl }),
          getCustomFields({ headers, baseUrl }),
          getPermissionSchemes({ headers, baseUrl }),
          getFilters({ headers, baseUrl }),
          getDashboards({ headers, baseUrl }),
          getBoards({ headers, agileBaseUrl }),
          getWorkflows({ headers, baseUrl }),
          getWorkflowSchemes({ headers, baseUrl }),
          getIssueTypes({ headers, baseUrl }),
          getIssueTypeSchemes({ headers, baseUrl }),
          getPriorities({ headers, baseUrl }),
          getPrioritySchemes({ headers, baseUrl }),
          getStatuses({ headers, baseUrl }),
          getNotificationSchemes({ headers, baseUrl }),
          getIssueSecuritySchemes({ headers, baseUrl }),
          getScreens({ headers, baseUrl }),
          getScreenSchemes({ headers, baseUrl }),
          getIssueTypeScreenSchemes({ headers, baseUrl }),
          getFieldConfigurations({ headers, baseUrl }),
          getFieldConfigurationSchemes({ headers, baseUrl }),
          getResolutions({ headers, baseUrl }),
        ]);

        // Helper function to safely get value or return error indicator
        const getValue = (result, index, defaultValue = 0) => {
          if (result.status === 'fulfilled') {
            return Array.isArray(result.value) ? result.value.length : result.value;
          }
          console.warn(`API call ${index} failed:`, result.reason?.message);
          return `❌ Error`;
        };

        // Helper function to get complex object results
        const getObjectValue = (result, index) => {
          if (result.status === 'fulfilled') {
            return result.value;
          }
          console.warn(`API call ${index} failed:`, result.reason?.message);
          return { total: '❌ Error', active: '❌ Error', inactive: '❌ Error' };
        };

        const projects = getObjectValue(results[0], 'projects');
        const customFields = getObjectValue(results[1], 'customFields');
        const permissionSchemes = getObjectValue(results[2], 'permissionSchemes');
        const workflowSchemes = getObjectValue(results[7], 'workflowSchemes');
        const issueTypeSchemes = getObjectValue(results[9], 'issueTypeSchemes');

        return {
          domain,
          // Projects with active/archived breakdown
          projectCount: projects.total || getValue(results[0], 'projects'),
          projectsActive: projects.active || 0,
          projectsArchived: projects.archived || 0,

          // Custom fields with duplicates analysis
          fieldCount: customFields.total || getValue(results[1], 'fields'),
          fieldsUnique: customFields.unique || 0,
          fieldsDuplicated: customFields.duplicates || 0,

          // Schemes with active/inactive breakdown
          permissionSchemeCount: permissionSchemes.total || getValue(results[2], 'permissions'),
          permissionSchemesActive: permissionSchemes.active || 0,
          permissionSchemesInactive: permissionSchemes.inactive || 0,

          workflowSchemeCount: workflowSchemes.total || getValue(results[7], 'workflowSchemes'),
          workflowSchemesActive: workflowSchemes.active || 0,
          workflowSchemesInactive: workflowSchemes.inactive || 0,

          issueTypeSchemeCount: issueTypeSchemes.total || getValue(results[9], 'issueTypeSchemes'),
          issueTypeSchemesActive: issueTypeSchemes.active || 0,
          issueTypeSchemesInactive: issueTypeSchemes.inactive || 0,

          // Keep the other metrics as simple counts for now
          filterCount: getValue(results[3], 'filters'),
          dashboardCount: getValue(results[4], 'dashboards'),
          boardCount: getValue(results[5], 'boards'),
          workflowCount: getValue(results[6], 'workflows'),
          issueTypeCount: getValue(results[8], 'issueTypes'),
          priorityCount: getValue(results[10], 'priorities'),
          prioritySchemeCount: getValue(results[11], 'prioritySchemes'),
          statusCount: getValue(results[12], 'statuses'),
          notificationSchemeCount: getValue(results[13], 'notificationSchemes'),
          issueSecuritySchemeCount: getValue(results[14], 'issueSecuritySchemes'),
          screenCount: getValue(results[15], 'screens'),
          screenSchemeCount: getValue(results[16], 'screenSchemes'),
          issueTypeScreenSchemeCount: getValue(results[17], 'issueTypeScreenSchemes'),
          fieldConfigurationCount: getValue(results[18], 'fieldConfigurations'),
          fieldConfigurationSchemeCount: getValue(results[19], 'fieldConfigurationSchemes'),
          resolutionCount: getValue(results[20], 'resolutions'),
        };
      } catch (e) {
        return { domain, error: e.message };
      }
    })
  );

  res.json({ results });
});

// Projects endpoint - fetches projects from sites
app.post("/api/projects", async (req, res) => {
  const sites = req.body.sites;
  if (!Array.isArray(sites)) {
    return res.status(400).json({ error: "Expected 'sites' to be an array" });
  }

  const results = await Promise.all(
    sites.map(async (site) => {
      const { email, token, domain } = site;

      const baseUrl = `https://${domain}.atlassian.net/rest/api/3`;
      const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;

      const headers = {
        Authorization: authHeader,
        Accept: "application/json",
      };

      try {
        const projectsResult = await getProjects({ headers, baseUrl });
        
        return {
          domain,
          projects: projectsResult.projects || []
        };
      } catch (e) {
        return { domain, error: e.message };
      }
    })
  );

  res.json({ results });
});

// Compare projects endpoint
app.post("/api/compare-projects", async (req, res) => {
  const projects = req.body.projects;
  if (!Array.isArray(projects)) {
    return res.status(400).json({ error: "Expected 'projects' to be an array" });
  }

  const results = await Promise.all(
    projects.map(async (item) => {
      const { domain, site, project } = item;
      const { email, token } = site;

      const baseUrl = `https://${domain}.atlassian.net/rest/api/3`;
      const authHeader = `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;

      const headers = {
        Authorization: authHeader,
        Accept: "application/json",
      };

      try {
        // Fetch all project data in parallel
        const [componentsRes, issueTypeSchemeRes, permissionSchemeRes, notificationSchemeRes, statusesRes] = await Promise.allSettled([
          // Components
          fetch(`${baseUrl}/project/${project.key}/components`, { headers }),
          // Issue Type Scheme
          fetch(`${baseUrl}/issuetypescheme/project?projectId=${project.id}`, { headers }),
          // Permission Scheme
          fetch(`${baseUrl}/project/${project.key}/permissionscheme`, { headers }),
          // Notification Scheme
          fetch(`${baseUrl}/project/${project.key}/notificationscheme`, { headers }),
          // Statuses
          fetch(`${baseUrl}/project/${project.key}/statuses`, { headers })
        ]);

        // Helper to safely get data
        const getData = async (result, defaultValue = null) => {
          if (result.status === 'fulfilled' && result.value.ok) {
            return await result.value.json();
          }
          return defaultValue;
        };

        const componentsData = await getData(componentsRes, []);
        const issueTypeSchemeData = await getData(issueTypeSchemeRes, { values: [] });
        const permissionSchemeData = await getData(permissionSchemeRes, {});
        const notificationSchemeData = await getData(notificationSchemeRes, {});
        const statusesData = await getData(statusesRes, []);

        // Find the issue type scheme for this project
        const projectScheme = issueTypeSchemeData?.values?.find(scheme => 
          scheme.projectIds?.includes(project.id)
        );

        // Extract unique statuses names from nested structure
        const uniqueStatuses = statusesData && Array.isArray(statusesData) ? 
          [...new Set(statusesData.flatMap(issueType => 
            issueType.statuses ? issueType.statuses.map(status => status.name) : []
          ))].sort() : [];
        
        const statusNames = uniqueStatuses.length > 0 ? uniqueStatuses.join(', ') : 'N/A';

        return {
          domain,
          name: project.name,
          key: project.key,
          lead: project.lead || 'N/A',
          issueCount: project.issueCount || 0,
          componentCount: Array.isArray(componentsData) ? componentsData.length : 0,
          issueTypeScheme: projectScheme?.issueTypeScheme?.name || 'N/A',
          permissionScheme: permissionSchemeData?.name || 'N/A',
          notificationScheme: notificationSchemeData?.name || 'N/A',
          statuses: statusNames
        };
      } catch (e) {
        return { 
          domain, 
          name: project.name,
          key: project.key,
          lead: project.lead || 'N/A',
          error: e.message 
        };
      }
    })
  );

  res.json({ results });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});