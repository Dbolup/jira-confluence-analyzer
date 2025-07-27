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
        const [projects, fields, permissions, filters, dashboards, boards, workflows, workflowSchemes, issueTypes, issueTypeSchemes, priorities, prioritySchemes, statuses, notificationSchemes, issueSecuritySchemes, screens, screenSchemes, issueTypeScreenSchemes, fieldConfigurations, fieldConfigurationSchemes, resolutions] = await Promise.all([
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

        return {
          domain,
          projectCount: projects.length,
          fieldCount: fields.length,
          permissionSchemeCount: permissions,
          filterCount: filters,
          dashboardCount: dashboards,
          boardCount: boards,
          workflowCount: workflows,
          workflowSchemeCount: workflowSchemes,
          issueTypeCount: issueTypes,
          issueTypeSchemeCount: issueTypeSchemes,
          priorityCount: priorities,
          prioritySchemeCount: prioritySchemes,
          statusCount: statuses,
          notificationSchemeCount: notificationSchemes,
          issueSecuritySchemeCount: issueSecuritySchemes,
          screenCount: screens,
          screenSchemeCount: screenSchemes,
          issueTypeScreenSchemeCount: issueTypeScreenSchemes,
          fieldConfigurationCount: fieldConfigurations,
          fieldConfigurationSchemeCount: fieldConfigurationSchemes,
          resolutionCount: resolutions,
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
