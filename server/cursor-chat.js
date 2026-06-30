/**
 * Catalog Tool chat via Cursor SDK (local agent + catalogone MCP).
 */
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import { Agent, CursorAgentError } from "@cursor/sdk";
import { createUIMessageStream, pipeUIMessageStreamToResponse } from "ai";
import { CATALOGONE_AGENT_PROMPT } from "./catalogone-prompt.js";
import { getCatalogoneMcpStatus, listCatalogoneMcpTools } from "./catalogone-mcp-client.js";
import { formatChatError } from "./errors.js";
import { loadCatalogoneMcpServers } from "./mcp-config.js";
import { fetchCatalogoneEnvFromSession } from "./mcp-session.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const agentCache = new Map();

function agentCacheKey(mcpServers, modelId) {
  return JSON.stringify({ mcpServers, modelId });
}

async function getAgentForMcpServers(mcpServers, modelId) {
  if (!mcpServers.catalogone) {
    throw new Error(
      "catalogone MCP is not configured. Add catalogone to ~/.cursor/mcp.json or set C1_* vars in .env.",
    );
  }

  const cacheKey = agentCacheKey(mcpServers, modelId);
  const cached = agentCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const agent = await Agent.create({
    apiKey: process.env.CURSOR_API_KEY,
    model: { id: modelId },
    name: "Catalog Tool Assistant",
    local: {
      cwd: PROJECT_ROOT,
      settingSources: [],
    },
    mcpServers,
  });

  agentCache.set(cacheKey, agent);
  if (agentCache.size > 4) {
    const oldestKey = agentCache.keys().next().value;
    const oldestAgent = agentCache.get(oldestKey);
    agentCache.delete(oldestKey);
    await oldestAgent?.close?.();
  }

  return agent;
}

function extractLatestUserText(messages) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }
    if (Array.isArray(message.parts)) {
      const text = message.parts
        .filter((part) => part.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim();
      if (text) {
        return text;
      }
    }
    if (typeof message.content === "string" && message.content.trim()) {
      return message.content.trim();
    }
  }
  return "";
}

function buildPrompt(messages, latestText, sessionEnv) {
  const userTurnCount = messages.filter((message) => message.role === "user").length;
  const connectedNote = sessionEnv?.environmentLabel
    ? `The user is already connected to CatalogOne environment "${sessionEnv.environmentLabel}" via the Catalog Tool sidebar. Use catalogone MCP tools with the pre-configured credentials — do NOT call login.`
    : "Use catalogone MCP tools for all CatalogOne data (call login first if needed). Do not guess catalog contents.";

  if (userTurnCount <= 1) {
    return `${CATALOGONE_AGENT_PROMPT}\n\n${connectedNote}\n\nUser message:\n${latestText}`;
  }

  return `${connectedNote}\n\nUser message:\n${latestText}`;
}

export async function handleCursorChat(req, res, messages, modelId = null) {
  const resolvedModel = modelId || process.env.CURSOR_MODEL || "composer-2.5";
  const latestText = extractLatestUserText(messages);
  if (!latestText) {
    res.status(400).json({ error: "No user message found in request." });
    return;
  }

  const cookie = req.headers.cookie || "";
  const sessionEnv = await fetchCatalogoneEnvFromSession(cookie);
  const mcpServers = loadCatalogoneMcpServers({
    envOverride: sessionEnv?.catalogoneEnv || null,
  });

  if (sessionEnv?.environmentLabel) {
    console.log(
      `[chat-server] Cursor agent using connected environment: ${sessionEnv.environmentLabel}`,
    );
  }

  const stream = createUIMessageStream({
    originalMessages: messages,
    onError: formatChatError,
    execute: async ({ writer }) => {
      const textId = crypto.randomUUID();
      writer.write({ type: "start" });
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id: textId });

      try {
        const agent = await getAgentForMcpServers(mcpServers, resolvedModel);
        const prompt = buildPrompt(messages, latestText, sessionEnv);
        let streamedLength = 0;

        const run = await agent.send(prompt, {
          mode: "agent",
          mcpServers,
          onDelta: ({ update }) => {
            if (update?.type === "text-delta" && update.text) {
              writer.write({ type: "text-delta", id: textId, delta: update.text });
              streamedLength += update.text.length;
            }
          },
        });

        for await (const message of run.stream()) {
          if (message.type !== "assistant") {
            continue;
          }
          for (const block of message.message.content) {
            if (block.type !== "text" || !block.text) {
              continue;
            }
            const remainder = block.text.slice(streamedLength);
            if (remainder) {
              writer.write({ type: "text-delta", id: textId, delta: remainder });
              streamedLength = block.text.length;
            }
          }
        }

        const result = await run.wait();
        if (result.status === "error") {
          throw new Error(result.result || "Cursor agent run failed.");
        }

        if (streamedLength === 0 && result.result) {
          writer.write({ type: "text-delta", id: textId, delta: result.result });
        }

        writer.write({ type: "text-end", id: textId });
        writer.write({ type: "finish-step" });
        writer.write({ type: "finish", finishReason: "stop" });
      } catch (error) {
        if (error instanceof CursorAgentError) {
          throw error;
        }
        throw error;
      }
    },
  });

  pipeUIMessageStreamToResponse({ response: res, stream });
}

export async function logCatalogoneMcpStartup() {
  const status = getCatalogoneMcpStatus();
  if (!status.configured) {
    console.warn("[chat-server] catalogone MCP: NOT configured");
    return;
  }
  try {
    const tools = await listCatalogoneMcpTools();
    console.log(
      `[chat-server] catalogone MCP: ${tools.length} tools from ${status.source} (default until user connects in web UI)`,
    );
  } catch (error) {
    console.warn("[chat-server] catalogone MCP: configured but unreachable:", error.message);
  }
}
