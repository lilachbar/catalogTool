#!/usr/bin/env node
/**
 * Startup prerequisites for Catalog Tool.
 * Exit 0 = OK, 1 = missing catalogone MCP or agent skills.
 */
import "dotenv/config";
import fs from "fs";
import os from "os";
import path from "path";
import { loadCatalogoneMcpConfig } from "./mcp-config.js";
import { validateChatProviderKey } from "./providers.js";

const REQUIRED_SKILLS = ["c1-solution", "c1-development", "c1-testing"];

function getSkillsDir() {
  return process.env.CATALOG_TOOL_SKILLS_DIR || path.join(os.homedir(), ".cursor", "skills");
}

export function checkCatalogoneMcpInstalled() {
  const config = loadCatalogoneMcpConfig();
  if (!config) {
    return {
      ok: false,
      message: `catalogone MCP is not configured.

Install the CatalogOne MCP server and register it in ~/.cursor/mcp.json:

  cd "/path/to/C1 Agent/mcp"
  python3 install.py

Or add mcpServers.catalogone manually (see README.md).`,
    };
  }

  const scriptPath = config.args?.[config.args.length - 1];
  if (!scriptPath || !fs.existsSync(scriptPath)) {
    return {
      ok: false,
      message: `catalogone MCP server script not found.

Expected: ${scriptPath || "(unknown)"}

Install with:
  cd "/path/to/C1 Agent/mcp"
  npm install && npm run build

Then set CATALOGONE_MCP_PATH or ~/.cursor/mcp.json args to dist/index.js`,
    };
  }

  return {
    ok: true,
    source: config.source,
    scriptPath,
  };
}

export function checkCatalogoneSkillsInstalled() {
  const skillsDir = getSkillsDir();
  const missing = REQUIRED_SKILLS.filter(
    (skill) => !fs.existsSync(path.join(skillsDir, skill, "SKILL.md")),
  );

  if (missing.length === 0) {
    return { ok: true, skillsDir };
  }

  return {
    ok: false,
    missing,
    message: `CatalogOne agent skills are not installed (missing: ${missing.join(", ")}).

Copy from the C1 Agent distribution:

  SKILLS_SRC="/path/to/C1 Agent/skills"
  for skill in c1-solution c1-development c1-testing; do
    cp -R "$SKILLS_SRC/$skill" ${skillsDir}/
  done

Skills directory: ${skillsDir}`,
  };
}

export async function runPreflight({ warnChat = true } = {}) {
  const mcp = checkCatalogoneMcpInstalled();
  if (!mcp.ok) {
    return { ok: false, errors: [mcp.message] };
  }

  const skills = checkCatalogoneSkillsInstalled();
  if (!skills.ok) {
    return { ok: false, errors: [skills.message] };
  }

  const warnings = [];
  if (warnChat) {
    const chat = await validateChatProviderKey({ remote: true });
    if (!chat.ok) {
      warnings.push(chat.setupInstructions || chat.message);
    }
  }

  return {
    ok: true,
    mcp,
    skills,
    warnings,
  };
}

function isMain() {
  const entry = process.argv[1] || "";
  return entry.endsWith("preflight-check.js");
}

if (isMain()) {
  runPreflight({ warnChat: true }).then((result) => {
    if (!result.ok) {
      console.error("\nCatalog Tool cannot start — prerequisites missing:\n");
      for (const error of result.errors) {
        console.error(error);
        console.error("");
      }
      process.exit(1);
    }

    console.log("[preflight] catalogone MCP:", result.mcp.scriptPath);
    console.log("[preflight] agent skills:", REQUIRED_SKILLS.join(", "));

    if (result.warnings.length) {
      console.warn("\n[preflight] Chat provider warning:\n");
      for (const warning of result.warnings) {
        console.warn(warning);
        console.warn("");
      }
      console.warn("Merge and MCP Tools will work; Catalog assistant chat will fail until the key is fixed.\n");
    }

    process.exit(0);
  });
}
