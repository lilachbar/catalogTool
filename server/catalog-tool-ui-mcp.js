#!/usr/bin/env node
/**
 * Minimal MCP server exposing Catalog Tool page context + UI actions for Cursor SDK.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const FLASK_BASE_URL = process.env.FLASK_BASE_URL || "http://127.0.0.1:8080";
const SESSION_COOKIE = process.env.CATALOG_TOOL_SESSION_COOKIE || "";

async function flaskFetch(subpath, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (SESSION_COOKIE) {
    headers.Cookie = SESSION_COOKIE;
  }
  const response = await fetch(`${FLASK_BASE_URL}${subpath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || response.statusText };
  }
}

function toolText(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function toolError(message) {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

async function queueAndWait(action) {
  const queued = await flaskFetch("/api/ui-control/queue", { method: "POST", body: action });
  const actionId = queued?.id;
  if (!actionId) {
    return { ok: false, error: queued?.error || "Failed to queue UI action." };
  }

  const deadline = Date.now() + 45000;
  while (Date.now() < deadline) {
    const result = await flaskFetch(`/api/ui-control/result/${encodeURIComponent(actionId)}`);
    if (result?.status === "done") {
      return result.result ?? { ok: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return { ok: false, error: "Timed out waiting for browser UI action.", actionId };
}

const tools = {
  get_catalog_tool_page: {
    description: "Read the live Catalog Tool web page: active view, workflow step, field values, and clickable controls.",
    inputSchema: { type: "object", properties: {} },
  },
  catalog_tool_ui_action: {
    description: "Click a control or navigate the Catalog Tool UI. Use actionId from get_catalog_tool_page (e.g. createBrBtn for Create BR and Import, workflow:push:review for Step 2).",
    inputSchema: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["click", "set_view", "workflow_step", "set_field"],
          description: "Action type. Default click.",
        },
        actionId: { type: "string", description: "Control id from page context, e.g. createBrBtn" },
        label: { type: "string", description: "Fallback label match, e.g. Create BR and Import" },
        view: { type: "string", description: "For set_view: push | dg-import | mcp-tools" },
        workflow: { type: "string", enum: ["push", "dg"] },
        step: { type: "string", description: "For workflow_step: upload | review | publish | import" },
        fieldId: { type: "string" },
        value: { type: "string" },
      },
    },
  },
};

function handleRequest(request) {
  if (request.method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "catalog-tool-ui", version: "1.0.0" },
    };
  }

  if (request.method === "tools/list") {
    return {
      tools: Object.entries(tools).map(([name, meta]) => ({
        name,
        description: meta.description,
        inputSchema: meta.inputSchema,
      })),
    };
  }

  if (request.method === "tools/call") {
    const toolName = request.params?.name;
    const args = request.params?.arguments || {};

    if (toolName === "get_catalog_tool_page") {
      return toolText(await flaskFetch("/api/ui-control/context"));
    }

    if (toolName === "catalog_tool_ui_action") {
      return toolText(await queueAndWait(args));
    }

    return toolError(`Unknown tool: ${toolName}`);
  }

  if (request.id !== undefined) {
    return { error: { code: -32601, message: `Method not found: ${request.method}` } };
  }
  return null;
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() || "";
  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      continue;
    }
    const result = handleRequest(request);
    if (request.id === undefined || result === null) {
      continue;
    }
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, result })}\n`);
  }
});
