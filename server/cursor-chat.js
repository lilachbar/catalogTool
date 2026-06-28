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
import { loadCatalogoneMcpConfig, loadCatalogoneMcpServers } from "./mcp-config.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let sharedAgent = null;
let sharedAgentConfigKey = null;

function mcpConfigKey() {
  return JSON.stringify(loadCatalogoneMcpServers());
}

async function getSharedAgent() {
  const mcpServers = loadCatalogoneMcpServers();
  if (!mcpServers.catalogone) {
    throw new Error(
      "catalogone MCP is not configured. Add catalogone to ~/.cursor/mcp.json or set C1_* vars in .env.",
    );
  }

  const configKey = mcpConfigKey();
  if (sharedAgent && sharedAgentConfigKey === configKey) {
    return sharedAgent;
  }

  if (sharedAgent) {
    await sharedAgent.close();
    sharedAgent = null;
  }

  sharedAgent = await Agent.create({
    apiKey: process.env.CURSOR_API_KEY,
    model: { id: process.env.CURSOR_MODEL || "composer-2.5" },
    name: "Catalog Tool Assistant",
    local: {
      cwd: PROJECT_ROOT,
      settingSources: [],
    },
    mcpServers,
  });
  sharedAgentConfigKey = configKey;
  return sharedAgent;
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

function buildPrompt(messages, latestText) {
  const userTurnCount = messages.filter((message) => message.role === "user").length;
  const mcpReminder =
    "Use catalogone MCP tools for all CatalogOne data (login first if needed). Do not guess catalog contents.";

  if (userTurnCount <= 1) {
    return `${CATALOGONE_AGENT_PROMPT}\n\n${mcpReminder}\n\nUser message:\n${latestText}`;
  }

  return `${mcpReminder}\n\nUser message:\n${latestText}`;
}

export async function handleCursorChat(req, res, messages) {
  const latestText = extractLatestUserText(messages);
  if (!latestText) {
    res.status(400).json({ error: "No user message found in request." });
    return;
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
        const agent = await getSharedAgent();
        const prompt = buildPrompt(messages, latestText);
        const mcpServers = loadCatalogoneMcpServers();
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
      `[chat-server] catalogone MCP: ${tools.length} tools from ${status.source}`,
    );
  } catch (error) {
    console.warn("[chat-server] catalogone MCP: configured but unreachable:", error.message);
  }
}
