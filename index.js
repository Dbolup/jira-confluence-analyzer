// index.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

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
            return Array.isArray(result.value) ? result.value.length : result.value;
          }
          console.warn(`API call ${index} failed:`, result.reason?.message);
          return `❌ Error`;
        };

        return {
          domain,
          projectCount: getValue(results[0], 'projects', []),
          fieldCount: getValue(results[1], 'fields', []),
          permissionSchemeCount: getValue(results[2], 'permissions'),
          filterCount: getValue(results[3], 'filters'),
          dashboardCount: getValue(results[4], 'dashboards'),
          boardCount: getValue(results[5], 'boards'),
          workflowCount: getValue(results[6], 'workflows'),
          workflowSchemeCount: getValue(results[7], 'workflowSchemes'),
          issueTypeCount: getValue(results[8], 'issueTypes'),
          issueTypeSchemeCount: getValue(results[9], 'issueTypeSchemes'),
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

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
