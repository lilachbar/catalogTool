/**
 * Agent tools — CatalogOne MCP (installed server) + Catalog Tool session helpers.
 */
import { tool } from "ai";
import { z } from "zod";
import {
  PRIORITY_CATALOGONE_TOOLS,
  callCatalogoneMcpTool,
  listCatalogoneMcpTools,
} from "./catalogone-mcp-client.js";
import { modeAllowsWriteTools, READ_ONLY_CATALOGONE_TOOLS } from "./chat-mode.js";
import { fetchCatalogoneEnvFromSession, callInternalApi } from "./mcp-session.js";

function zodFromJsonSchema(inputSchema) {
  if (!inputSchema || inputSchema.type !== "object") {
    return z.object({}).passthrough();
  }

  const properties = inputSchema.properties || {};
  const required = new Set(inputSchema.required || []);
  const shape = {};

  for (const [key, schema] of Object.entries(properties)) {
    let field;
    switch (schema.type) {
      case "string":
        field = z.string();
        break;
      case "number":
      case "integer":
        field = z.number();
        break;
      case "boolean":
        field = z.boolean();
        break;
      case "array":
        field = z.array(z.any());
        break;
      case "object":
        field = z.object({}).passthrough();
        break;
      default:
        field = z.any();
    }
    if (!required.has(key)) {
      field = field.optional();
    }
    shape[key] = field;
  }

  return z.object(shape).passthrough();
}

async function buildCatalogoneMcpTools(envOverride = null, mode = "agent") {
  let mcpTools = [];
  try {
    mcpTools = await listCatalogoneMcpTools({ envOverride });
  } catch (error) {
    console.warn("[chat] Could not list catalogone MCP tools:", error.message);
    return {};
  }

  const byName = new Map(mcpTools.map((entry) => [entry.name, entry]));
  const wrapped = {};
  const allowWrite = modeAllowsWriteTools(mode);

  for (const name of PRIORITY_CATALOGONE_TOOLS) {
    if (!allowWrite && !READ_ONLY_CATALOGONE_TOOLS.has(name)) {
      continue;
    }
    const meta = byName.get(name);
    if (!meta) {
      continue;
    }
    wrapped[name] = tool({
      description: meta.description || `CatalogOne MCP tool: ${name}`,
      inputSchema: zodFromJsonSchema(meta.inputSchema),
      execute: async (args) => callCatalogoneMcpTool(name, args, { envOverride }),
    });
  }

  wrapped.call_catalogone_mcp = tool({
    description: allowWrite
      ? "Call any catalogone MCP tool by name. Use for tools not exposed directly. Prefer dedicated tools when available."
      : "Call a read-only catalogone MCP tool by name (search/get/list/validate only). Do not invoke create/update/publish/delete tools in this mode.",
    inputSchema: z.object({
      toolName: z.string().describe("MCP tool name, e.g. search_catalog"),
      arguments: z
        .record(z.any())
        .optional()
        .describe("Tool arguments object"),
    }),
    execute: async ({ toolName, arguments: toolArgs }) => {
      if (!allowWrite && !READ_ONLY_CATALOGONE_TOOLS.has(toolName)) {
        return {
          error: `Tool "${toolName}" is not allowed in ${mode} mode. Switch to Agent mode to run write actions.`,
        };
      }
      return callCatalogoneMcpTool(toolName, toolArgs || {}, { envOverride });
    },
  });

  wrapped.list_catalogone_mcp_tools = tool({
    description: "List all available catalogone MCP tools and short descriptions.",
    inputSchema: z.object({}),
    execute: async () => {
      const tools = await listCatalogoneMcpTools({ refresh: true, envOverride });
      return tools.map((entry) => ({
        name: entry.name,
        description: entry.description,
      }));
    },
  });

  return wrapped;
}

export async function createChatTools(requestHeaders = {}, { mode = "agent" } = {}) {
  const cookie = requestHeaders.cookie || "";
  const sessionEnv = await fetchCatalogoneEnvFromSession(cookie);
  const envOverride = sessionEnv?.catalogoneEnv || null;
  const mcpTools = await buildCatalogoneMcpTools(envOverride, mode);

  return {
    ...mcpTools,
    get_catalog_tool_session: tool({
      description:
        "Check whether the user is logged in to CatalogOne via this Catalog Tool web UI (sidebar session). Complements catalogone MCP login.",
      inputSchema: z.object({}),
      execute: async () => {
        const result = await callInternalApi("/api/session", {
          headers: cookie ? { Cookie: cookie } : {},
        });
        if (!result.ok) {
          return { loggedIn: false, error: result.data?.error || "Session unavailable" };
        }
        return {
          loggedIn: Boolean(result.data?.logged_in),
          username: result.data?.username || null,
          apigwUrl: result.data?.apigw_url || null,
          environmentLabel: result.data?.environment_label || null,
        };
      },
    }),
    list_catalog_tool_tables: tool({
      description: "List generic element tables this Catalog Tool web app can push (Modify Reason, Action).",
      inputSchema: z.object({}),
      execute: async () => ({
        tables: [
          {
            key: "modify_reason",
            label: "Modify Reason",
            id: "OrderCaptureProductConfiguratorModifyReason",
          },
          {
            key: "action",
            label: "Action",
            id: "OrderCaptureProductConfiguratorAction",
          },
        ],
      }),
    }),
  };
}
