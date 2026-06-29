/**
 * Programmatic client for the installed catalogone MCP server.
 * Uses the same stdio protocol as c1-run.sh.
 */
import { spawn } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { loadCatalogoneMcpConfig, applyMcpEnv } from "./mcp-config.js";

const DEFAULT_MCP_ROOT = path.join(os.homedir(), ".mcp-servers", "catalogone-mcp");
const CALL_TIMEOUT_MS = Number(process.env.C1_MCP_TIMEOUT_MS || 120000);

let cachedToolList = null;
let cachedToolListAt = 0;
const TOOL_LIST_TTL_MS = 5 * 60 * 1000;

function resolveMcpServerEntry(envOverride = null) {
  const config = loadCatalogoneMcpConfig();
  if (!config) {
    return null;
  }

  const command = config.command || "node";
  const args = config.args?.length
    ? config.args
    : [path.join(DEFAULT_MCP_ROOT, "dist", "index.js")];

  const mcpScript = args[args.length - 1];
  if (!fs.existsSync(mcpScript)) {
    throw new Error(`catalogone MCP server not found at ${mcpScript}`);
  }

  return {
    command,
    args,
    env: applyMcpEnv(config.env, envOverride),
  };
}

function runMcpRequest(requestBuilder, { timeoutMs = CALL_TIMEOUT_MS, envOverride = null } = {}) {
  const entry = resolveMcpServerEntry(envOverride);
  if (!entry) {
    throw new Error(
      "catalogone MCP is not configured. Check ~/.cursor/mcp.json or set C1_APIGW_URL in .env.",
    );
  }

  return new Promise((resolve, reject) => {
    const server = spawn(entry.command, entry.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: entry.env,
    });

    let buffer = "";
    let stderr = "";
    let settled = false;

    const finish = (fn, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      server.kill();
      fn(value);
    };

    const timer = setTimeout(() => {
      finish(reject, new Error(`catalogone MCP call timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    server.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    server.stdout.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        try {
          const data = JSON.parse(line);
          if (data.id !== 2) {
            continue;
          }
          if (data.error) {
            finish(reject, new Error(data.error.message || JSON.stringify(data.error)));
            return;
          }
          finish(resolve, data.result || {});
          return;
        } catch {
          // ignore partial/non-json lines
        }
      }
    });

    server.on("error", (error) => finish(reject, error));

    const init = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "catalog-tool-chat", version: "1.0.0" },
      },
    });
    const initialized = JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    const request = JSON.stringify(requestBuilder());

    setTimeout(() => {
      server.stdin.write(`${init}\n`);
      setTimeout(() => {
        server.stdin.write(`${initialized}\n`);
        setTimeout(() => {
          server.stdin.write(`${request}\n`);
        }, 200);
      }, 300);
    }, 300);
  });
}

function parseToolTextResult(result) {
  if (!result?.content) {
    return result;
  }
  const texts = result.content
    .filter((part) => part.type === "text")
    .map((part) => part.text);
  if (texts.length === 1) {
    try {
      return JSON.parse(texts[0]);
    } catch {
      return texts[0];
    }
  }
  return texts;
}

export function getCatalogoneMcpStatus() {
  try {
    const entry = resolveMcpServerEntry();
    if (!entry) {
      return { configured: false, online: false, source: null, serverPath: null };
    }
    return {
      configured: true,
      online: null,
      source: loadCatalogoneMcpConfig()?.source || "unknown",
      serverPath: entry.args[entry.args.length - 1],
    };
  } catch (error) {
    return { configured: false, online: false, error: error.message };
  }
}

const ONLINE_PROBE_TIMEOUT_MS = 20000;
let cachedOnlineStatus = null;
let cachedOnlineStatusAt = 0;
const ONLINE_STATUS_TTL_MS = 30 * 1000;
const ONLINE_STATUS_FAIL_TTL_MS = 5 * 1000;

export async function probeCatalogoneMcpOnline({ force = false, envOverride = null } = {}) {
  const base = getCatalogoneMcpStatus();
  if (!base.configured) {
    const offline = {
      ...base,
      online: false,
      onlineError: base.error || "catalogone MCP is not configured",
    };
    if (!envOverride) {
      cachedOnlineStatus = offline;
      cachedOnlineStatusAt = Date.now();
    }
    return offline;
  }

  const now = Date.now();
  if (!force && !envOverride && cachedOnlineStatus) {
    const ttl = cachedOnlineStatus.online ? ONLINE_STATUS_TTL_MS : ONLINE_STATUS_FAIL_TTL_MS;
    if (now - cachedOnlineStatusAt < ttl) {
      return cachedOnlineStatus;
    }
  }

  try {
    const tools = await Promise.race([
      listCatalogoneMcpTools({ refresh: true, envOverride }),
      new Promise((_, reject) => {
        setTimeout(
          () => reject(new Error(`MCP server did not respond within ${ONLINE_PROBE_TIMEOUT_MS / 1000}s`)),
          ONLINE_PROBE_TIMEOUT_MS,
        );
      }),
    ]);
    const online = {
      ...base,
      online: true,
      toolCount: tools.length,
      credentialsSource: envOverride ? "connected_session" : "mcp_json",
    };
    if (!envOverride) {
      cachedOnlineStatus = online;
      cachedOnlineStatusAt = now;
    }
    return online;
  } catch (error) {
    const offline = {
      ...base,
      online: false,
      onlineError: error.message || "MCP server is offline or failed to start",
      credentialsSource: envOverride ? "connected_session" : "mcp_json",
    };
    if (!envOverride) {
      cachedOnlineStatus = offline;
      cachedOnlineStatusAt = now;
    }
    return offline;
  }
}

export async function listCatalogoneMcpTools({ refresh = false, envOverride = null } = {}) {
  const now = Date.now();
  if (!refresh && !envOverride && cachedToolList && now - cachedToolListAt < TOOL_LIST_TTL_MS) {
    return cachedToolList;
  }

  const result = await runMcpRequest(
    () => ({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    }),
    { envOverride },
  );

  const tools = result.tools || [];
  if (!envOverride) {
    cachedToolList = tools;
    cachedToolListAt = now;
  }
  return tools;
}

export async function callCatalogoneMcpTool(toolName, toolArgs = {}, { envOverride = null } = {}) {
  const result = await runMcpRequest(
    () => ({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/call",
      params: { name: toolName, arguments: toolArgs },
    }),
    { envOverride },
  );

  if (result.isError) {
    const message = parseToolTextResult(result);
    throw new Error(typeof message === "string" ? message : JSON.stringify(message));
  }

  return parseToolTextResult(result);
}

/** Top tools exposed as first-class OpenAI/Vercel SDK tools (plus generic fallback). */
export const PRIORITY_CATALOGONE_TOOLS = [
  "login",
  "search_catalog",
  "find_reusable_entities",
  "search_business_requests",
  "get_business_request",
  "create_business_request",
  "validate_business_request",
  "list_catalog_items",
  "get_entity_details",
  "get_entity_prices",
  "search_price_policies",
  "get_business_parameters",
  "list_entity_types",
  "create_entity",
  "publish_business_request",
];
