/**
 * Load catalogone MCP server config for Cursor SDK agents and MCP client.
 * Prefers ~/.cursor/mcp.json (installed MCP) over .env C1_* vars.
 */
import fs from "fs";
import os from "os";
import path from "path";

const DEFAULT_MCP_PATH = path.join(os.homedir(), ".mcp-servers", "catalogone-mcp", "dist", "index.js");
const DEFAULT_MCP_CONFIG = path.join(os.homedir(), ".cursor", "mcp.json");

function loadFromCursorMcpJson() {
  const configPath = process.env.CURSOR_MCP_CONFIG || DEFAULT_MCP_CONFIG;
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const catalogone = raw?.mcpServers?.catalogone;
    if (!catalogone?.command) {
      return null;
    }

    return {
      source: configPath,
      command: catalogone.command,
      args: catalogone.args || [],
      env: {
        NO_PROXY: "*.corp.amdocs.com,localhost,127.0.0.1",
        ...catalogone.env,
      },
    };
  } catch {
    return null;
  }
}

function buildFromEnv() {
  const apigw = process.env.C1_APIGW_URL;
  if (!apigw) {
    return null;
  }

  return {
    source: "env",
    command: "node",
    args: [process.env.CATALOGONE_MCP_PATH || DEFAULT_MCP_PATH],
    env: {
      C1_APIGW_URL: apigw,
      C1_WEB_UI_URL: process.env.C1_WEB_UI_URL || "",
      C1_USERNAME: process.env.C1_USERNAME || "",
      C1_PASSWORD: process.env.C1_PASSWORD || "",
      C1_KEYCLOAK_URL: process.env.C1_KEYCLOAK_URL || "",
      C1_KEYCLOAK_REALM: process.env.C1_KEYCLOAK_REALM || "",
      NO_PROXY: process.env.NO_PROXY || "*.corp.amdocs.com,localhost,127.0.0.1",
    },
  };
}

/** Raw MCP server entry for stdio spawn / Cursor SDK. */
export function loadCatalogoneMcpConfig() {
  return loadFromCursorMcpJson() || buildFromEnv();
}

/** Cursor SDK mcpServers map. */
export function loadCatalogoneMcpServers() {
  const config = loadCatalogoneMcpConfig();
  if (!config) {
    return {};
  }

  return {
    catalogone: {
      type: "stdio",
      command: config.command,
      args: config.args,
      env: config.env,
    },
  };
}
