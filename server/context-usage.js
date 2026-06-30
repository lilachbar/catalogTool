/**
 * Token estimates for fixed context components (system prompt, tools, MCP overhead).
 */
import { CATALOGONE_AGENT_PROMPT } from "./catalogone-prompt.js";
import { modeSystemNote } from "./chat-mode.js";
import { listCatalogoneMcpTools } from "./catalogone-mcp-client.js";

const BASELINE_CACHE_MS = 5 * 60 * 1000;
let cachedBaselines = null;
let cachedAt = 0;

export function estimateTokenCount(text) {
  if (!text) {
    return 0;
  }
  return Math.ceil(String(text).length / 4);
}

function estimateToolDefinitionTokens(tools) {
  if (!Array.isArray(tools) || tools.length === 0) {
    return 6700;
  }

  let total = 0;
  for (const entry of tools) {
    total += estimateTokenCount(entry.name);
    total += estimateTokenCount(entry.description);
    total += estimateTokenCount(JSON.stringify(entry.inputSchema || {}));
  }
  // Wrapper tools (call_catalogone_mcp, list_catalogone_mcp_tools, session helpers).
  total += 900;
  return total;
}

export async function getContextUsageBaselines({ refresh = false } = {}) {
  const now = Date.now();
  if (!refresh && cachedBaselines && now - cachedAt < BASELINE_CACHE_MS) {
    return cachedBaselines;
  }

  const systemPromptText = [
    CATALOGONE_AGENT_PROMPT,
    modeSystemNote("agent"),
  ].filter(Boolean).join("\n\n");

  let toolDefinitions = 6700;
  let mcpToolCount = 0;
  try {
    const tools = await listCatalogoneMcpTools();
    mcpToolCount = tools.length;
    toolDefinitions = estimateToolDefinitionTokens(tools);
  } catch {
    toolDefinitions = 6700;
  }

  const baselines = {
    systemPrompt: estimateTokenCount(systemPromptText),
    toolDefinitions,
    rules: 0,
    skills: 0,
    mcp: Math.max(400, 120 + mcpToolCount * 8),
    subagentDefinitions: 0,
    summarizedConversation: 0,
    mcpToolCount,
    updatedAt: new Date().toISOString(),
  };

  cachedBaselines = baselines;
  cachedAt = now;
  return baselines;
}
