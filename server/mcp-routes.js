/**
 * HTTP routes for catalogone MCP tool listing and execution.
 */
import {
  callCatalogoneMcpTool,
  getCatalogoneMcpStatus,
  listCatalogoneMcpTools,
} from "./catalogone-mcp-client.js";

export function registerMcpRoutes(app) {
  app.get("/api/mcp/status", (_req, res) => {
    res.json(getCatalogoneMcpStatus());
  });

  app.get("/api/mcp/tools", async (_req, res) => {
    try {
      const tools = await listCatalogoneMcpTools();
      res.json({
        status: "ok",
        count: tools.length,
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

    try {
      const started = Date.now();
      const result = await callCatalogoneMcpTool(toolName, toolArgs);
      res.json({
        status: "ok",
        toolName,
        durationMs: Date.now() - started,
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
