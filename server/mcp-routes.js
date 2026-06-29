/**
 * HTTP routes for catalogone MCP tool listing and execution.
 */
import {
  callCatalogoneMcpTool,
  getCatalogoneMcpStatus,
  listCatalogoneMcpTools,
  probeCatalogoneMcpOnline,
} from "./catalogone-mcp-client.js";
import { parseCatalogoneEnvFromRequest } from "./mcp-env.js";

export function registerMcpRoutes(app) {
  app.get("/api/mcp/status", async (req, res) => {
    const catalogoneEnv = parseCatalogoneEnvFromRequest(req);

    try {
      const base = getCatalogoneMcpStatus();
      if (req.query.quick === "1") {
        res.json({
          ...base,
          online: null,
          checking: false,
          credentialsSource: catalogoneEnv ? "connected_session" : "mcp_json",
        });
        return;
      }

      const status = await probeCatalogoneMcpOnline({
        force: req.query.force === "1",
        envOverride: catalogoneEnv,
      });
      res.json(status);
    } catch (error) {
      res.status(500).json({
        configured: false,
        online: false,
        error: error.message || "Failed to check MCP status",
      });
    }
  });

  app.get("/api/mcp/tools", async (req, res) => {
    const catalogoneEnv = parseCatalogoneEnvFromRequest(req);

    try {
      const tools = await listCatalogoneMcpTools({ envOverride: catalogoneEnv });
      res.json({
        status: "ok",
        count: tools.length,
        credentialsSource: catalogoneEnv ? "connected_session" : "mcp_json",
        tools: tools.map((tool) => ({
          name: tool.name,
          title: tool.title || tool.name,
          description: tool.description || "",
          inputSchema: tool.inputSchema || { type: "object", properties: {} },
        })),
      });
    } catch (error) {
      res.status(503).json({ error: error.message || "Failed to list MCP tools" });
    }
  });

  app.post("/api/mcp/call", async (req, res) => {
    const toolName = (req.body?.toolName || req.body?.name || "").trim();
    const toolArgs = req.body?.arguments ?? req.body?.args ?? {};

    if (!toolName) {
      res.status(400).json({ error: "toolName is required" });
      return;
    }

    if (toolArgs !== null && typeof toolArgs !== "object") {
      res.status(400).json({ error: "arguments must be a JSON object" });
      return;
    }

    const catalogoneEnv = parseCatalogoneEnvFromRequest(req);

    try {
      const started = Date.now();
      const result = await callCatalogoneMcpTool(toolName, toolArgs, { envOverride: catalogoneEnv });
      res.json({
        status: "ok",
        toolName,
        durationMs: Date.now() - started,
        credentialsSource: catalogoneEnv ? "connected_session" : "mcp_json",
        result,
      });
    } catch (error) {
      res.status(500).json({
        status: "error",
        toolName,
        error: error.message || "MCP tool call failed",
      });
    }
  });
}
