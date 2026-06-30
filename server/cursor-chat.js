/**
 * Catalog Tool chat via Cursor SDK (local agent + catalogone MCP).
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Agent, CursorAgentError, JsonlLocalAgentStore } from "@cursor/sdk";
import { createUIMessageStream, pipeUIMessageStreamToResponse } from "ai";
import { CATALOGONE_AGENT_PROMPT } from "./catalogone-prompt.js";
import { getCatalogoneMcpStatus, listCatalogoneMcpTools } from "./catalogone-mcp-client.js";
import { formatChatError } from "./errors.js";
import { modeSystemNote, normalizeChatMode, resolveCursorSdkMode } from "./chat-mode.js";
import {
  buildConversationTranscript,
  extractLatestTurnImages,
  extractTextFromUiMessage,
  mergeAttachmentsIntoText,
} from "./chat-history.js";
import { loadAllCursorMcpServers } from "./mcp-config.js";
import { fetchCatalogoneEnvFromSession } from "./mcp-session.js";
import { formatPageContextNote } from "./ui-control.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_AGENT_STORE_DIR = path.join(PROJECT_ROOT, ".catalog-tool", "agent-store");

let sharedLocalAgentStore = null;

function getLocalAgentStore() {
  if (!sharedLocalAgentStore) {
    fs.mkdirSync(LOCAL_AGENT_STORE_DIR, { recursive: true });
    sharedLocalAgentStore = new JsonlLocalAgentStore(LOCAL_AGENT_STORE_DIR);
  }
  return sharedLocalAgentStore;
}

const agentCache = new Map();

function agentCacheKey(mcpServers, modelId) {
  return JSON.stringify({ mcpServers, modelId });
}

async function getAgentForMcpServers(mcpServers, modelId) {
  if (!mcpServers.catalogone) {
    console.warn("[chat-server] Creating Cursor agent without catalogone MCP — install it in ~/.cursor/mcp.json for CatalogOne access.");
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
      store: getLocalAgentStore(),
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
    const text = extractTextFromUiMessage(message);
    if (text) {
      return text;
    }
  }
  return "";
}

function buildPrompt(messages, latestText, sessionEnv, mode = "agent", latestAttachments = [], pageContext = null) {
  const userTurnCount = messages.filter((message) => message.role === "user").length;
  const connectedNote = sessionEnv?.environmentLabel
    ? `The user is already connected to CatalogOne environment "${sessionEnv.environmentLabel}" via the Catalog Tool sidebar. Use catalogone MCP tools with the pre-configured credentials — do NOT call login.`
    : "Use catalogone MCP tools for all CatalogOne data (call login first if needed). Do not guess catalog contents.";

  const normalizedMode = normalizeChatMode(mode);
  const modeNote = modeSystemNote(normalizedMode);
  const modeBehavior = {
    agent: "You may use CatalogOne MCP tools to inspect and modify the catalog when appropriate.",
    plan: "Use Cursor Plan behavior: investigate with read-only MCP tools first, then present a numbered plan. Do not execute write/modify/publish actions until the user confirms.",
    ask: "Answer the question only. Use read-only MCP tools (search, get, list, validate) when live data is needed. Never create, update, publish, share, or delete catalog data in Ask mode.",
  };

  const transcript = buildConversationTranscript(messages, latestAttachments);
  const historyNote = userTurnCount > 1
    ? "Read the full conversation history below, including earlier user attachments. Answer in context of the entire thread — do not treat the latest message in isolation."
    : null;

  const sections = [];
  if (userTurnCount <= 1) {
    sections.push(CATALOGONE_AGENT_PROMPT);
  }
  if (modeNote) {
    sections.push(modeNote);
  }
  if (modeBehavior[normalizedMode]) {
    sections.push(modeBehavior[normalizedMode]);
  }
  sections.push(connectedNote);
  const pageNote = formatPageContextNote(pageContext);
  if (pageNote) {
    sections.push(pageNote);
  }
  if (historyNote) {
    sections.push(historyNote);
  }
  if (transcript) {
    sections.push(`Conversation history:\n${transcript}`);
  } else {
    sections.push(`User message:\n${latestText || "See attached context."}`);
  }

  return sections.filter(Boolean).join("\n\n");
}

function buildUserMessage(text, attachments = [], imageAttachments = []) {
  const images = [
    ...imageAttachments
      .filter((attachment) => attachment?.data || attachment?.url)
      .map((attachment) => {
        if (attachment.data) {
          return {
            data: attachment.data,
            mimeType: attachment.mimeType || "image/png",
          };
        }
        const url = attachment.url || "";
        const commaIndex = url.indexOf(",");
        return {
          data: commaIndex >= 0 ? url.slice(commaIndex + 1) : url,
          mimeType: attachment.mimeType || "image/png",
        };
      }),
    ...attachments
      .filter((attachment) => attachment?.kind === "image" && attachment.data)
      .map((attachment) => ({
        data: attachment.data,
        mimeType: attachment.mimeType || "image/png",
      })),
  ];

  const mergedText = mergeAttachmentsIntoText(text, attachments.filter((entry) => entry?.kind === "file"));
  if (images.length) {
    return { text: mergedText, images };
  }
  return mergedText;
}

function resolveSdkMode(mode) {
  return resolveCursorSdkMode(mode);
}

export async function handleCursorChat(req, res, messages, modelId = null, options = {}) {
  const { mode: requestedMode = "agent", attachments = [], pageContext = null } = options;
  const mode = normalizeChatMode(requestedMode);
  const resolvedModel = modelId || process.env.CURSOR_MODEL || "composer-2.5";
  const latestText = extractLatestUserText(messages);
  const safeAttachments = Array.isArray(attachments) ? attachments : [];
  if (!latestText && safeAttachments.length === 0) {
    res.status(400).json({ error: "No user message found in request." });
    return;
  }

  const cookie = req.headers.cookie || "";
  const sessionEnv = await fetchCatalogoneEnvFromSession(cookie);
  const mcpServers = loadAllCursorMcpServers({
    envOverride: sessionEnv?.catalogoneEnv || null,
    sessionCookie: cookie,
  });

  if (!mcpServers.catalogone) {
    console.warn("[chat-server] catalogone MCP not found in Cursor MCP config; agent may have limited CatalogOne access.");
  }

  if (sessionEnv?.environmentLabel) {
    console.log(
      `[chat-server] Cursor agent using connected environment: ${sessionEnv.environmentLabel} (mode=${mode})`,
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
        const prompt = buildPrompt(
          messages,
          latestText || "See attached context.",
          sessionEnv,
          mode,
          safeAttachments,
          pageContext,
        );
        const latestImages = extractLatestTurnImages(messages, safeAttachments);
        const userMessage = buildUserMessage(prompt, [], latestImages);
        let streamedLength = 0;

        const run = await agent.send(userMessage, {
          mode: resolveSdkMode(mode),
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
