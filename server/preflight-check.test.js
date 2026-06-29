import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  checkCatalogoneMcpInstalled,
  checkCatalogoneSkillsInstalled,
} from "./preflight-check.js";

const ENV_KEYS = ["CURSOR_MCP_CONFIG", "CATALOG_TOOL_SKILLS_DIR"];

function snapshotEnv() {
  return Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
}

function restoreEnv(snapshot) {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
}

describe("checkCatalogoneMcpInstalled", () => {
  let envSnapshot;
  let tempDir;

  afterEach(() => {
    restoreEnv(envSnapshot);
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("fails when catalogone MCP is not configured", () => {
    envSnapshot = snapshotEnv();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-tool-mcp-"));
    process.env.CURSOR_MCP_CONFIG = path.join(tempDir, "empty-mcp.json");
    fs.writeFileSync(process.env.CURSOR_MCP_CONFIG, JSON.stringify({ mcpServers: {} }));

    const result = checkCatalogoneMcpInstalled();
    assert.equal(result.ok, false);
    assert.match(result.message, /not configured/i);
  });

  it("fails when MCP script path does not exist", () => {
    envSnapshot = snapshotEnv();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-tool-mcp-"));
    const missingScript = path.join(tempDir, "missing", "index.js");
    const mcpJson = {
      mcpServers: {
        catalogone: {
          command: "node",
          args: [missingScript],
        },
      },
    };
    process.env.CURSOR_MCP_CONFIG = path.join(tempDir, "mcp.json");
    fs.writeFileSync(process.env.CURSOR_MCP_CONFIG, JSON.stringify(mcpJson));

    const result = checkCatalogoneMcpInstalled();
    assert.equal(result.ok, false);
    assert.match(result.message, /not found/i);
  });

  it("passes when MCP script exists", () => {
    envSnapshot = snapshotEnv();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-tool-mcp-"));
    const scriptPath = path.join(tempDir, "dist", "index.js");
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.writeFileSync(scriptPath, "// stub\n");

    const mcpJson = {
      mcpServers: {
        catalogone: {
          command: "node",
          args: [scriptPath],
        },
      },
    };
    process.env.CURSOR_MCP_CONFIG = path.join(tempDir, "mcp.json");
    fs.writeFileSync(process.env.CURSOR_MCP_CONFIG, JSON.stringify(mcpJson));

    const result = checkCatalogoneMcpInstalled();
    assert.equal(result.ok, true);
    assert.equal(result.scriptPath, scriptPath);
  });
});

describe("checkCatalogoneSkillsInstalled", () => {
  let envSnapshot;
  let tempDir;

  afterEach(() => {
    restoreEnv(envSnapshot);
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  it("fails when required skills are missing", () => {
    envSnapshot = snapshotEnv();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-tool-skills-"));
    process.env.CATALOG_TOOL_SKILLS_DIR = tempDir;

    const result = checkCatalogoneSkillsInstalled();
    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, ["c1-solution", "c1-development", "c1-testing"]);
  });

  it("passes when all skills are present", () => {
    envSnapshot = snapshotEnv();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-tool-skills-"));
    process.env.CATALOG_TOOL_SKILLS_DIR = tempDir;

    for (const skill of ["c1-solution", "c1-development", "c1-testing"]) {
      const skillDir = path.join(tempDir, skill);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, "SKILL.md"), "# test\n");
    }

    const result = checkCatalogoneSkillsInstalled();
    assert.equal(result.ok, true);
  });
});
