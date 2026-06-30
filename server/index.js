/**
 * Catalog Tool chat API — Vercel AI SDK + Express.
 * Supports OpenAI or Cursor SDK (CURSOR_API_KEY). Keys stay server-side only.
 */
import "dotenv/config";
import express from "express";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { CATALOGONE_AGENT_PROMPT } from "./catalogone-prompt.js";
import { probeCatalogoneMcpOnline } from "./catalogone-mcp-client.js";
import { handleCursorChat, logCatalogoneMcpStartup } from "./cursor-chat.js";
import { formatChatError } from "./errors.js";
import { normalizeChatMode, modeSystemNote } from "./chat-mode.js";
import { createChatTools } from "./tools.js";
import { registerMcpRoutes } from "./mcp-routes.js";
import {
  getClaudeModel,
  getOpenAiModel,
  getProviderStatus,
  listModelsForProvider,
  missingKeyMessage,
  resolveChatProvider,
  resolveModelId,
  validateChatProviderKey,
  validateProviderCredentials,
  CHAT_PROVIDER_OPTIONS,
} from "./providers.js";
import { reloadChatEnvFromFile } from "./env-reload.js";
import { getContextUsageBaselines } from "./context-usage.js";

const app = express();
app.use(express.json({ limit: "12mb" }));

registerMcpRoutes(app);

const PORT = Number(process.env.CHAT_SERVER_PORT || 3001);
const HOST = process.env.CHAT_SERVER_HOST || "127.0.0.1";

function appendAttachmentsToModelMessages(modelMessages, attachments) {
  if (!attachments.length) {
    return modelMessages;
  }

  const lastUserIndex = modelMessages.findLastIndex((message) => message.role === "user");
  if (lastUserIndex < 0) {
    return modelMessages;
  }

  const next = [...modelMessages];
  const lastUser = next[lastUserIndex];
  const parts = [];

  if (typeof lastUser.content === "string") {
    parts.push({ type: "text", text: lastUser.content });
  } else if (Array.isArray(lastUser.content)) {
    parts.push(...lastUser.content);
  }

  for (const attachment of attachments) {
    if (attachment?.kind === "file" && attachment.text) {
      parts.push({
        type: "text",
        text: `\n\n---\nAttachment: ${attachment.name}\n\`\`\`\n${attachment.text}\n\`\`\``,
      });
    }
    if (attachment?.kind === "image" && attachment.data) {
      parts.push({
        type: "image",
        image: `data:${attachment.mimeType || "image/png"};base64,${attachment.data}`,
      });
    }
  }

  next[lastUserIndex] = {
    ...lastUser,
    content: parts.length === 1 && parts[0].type === "text" ? parts[0].text : parts,
  };
  return next;
}

app.get("/health", async (_req, res) => {
  const status = getProviderStatus();
  const chatKey = await validateChatProviderKey({ remote: true });
  const mcp = await probeCatalogoneMcpOnline();
  const models = await listModelsForProvider(status.provider);
  const contextBaselines = await getContextUsageBaselines();
  res.json({
    ok: Boolean(chatKey.ok && mcp.online),
    chatReady: chatKey.ok,
    chatProvider: status,
    chatMode: normalizeChatMode(process.env.CHAT_MODE),
    chatKey: {
      ok: chatKey.ok,
      reason: chatKey.reason,
      message: chatKey.message || null,
      setupInstructions: chatKey.setupInstructions || null,
    },
    models,
    catalogoneMcp: mcp,
    contextBaselines,
  });
});

app.get("/api/models", async (_req, res) => {
  const status = getProviderStatus();
  const models = await listModelsForProvider(status.provider);
  res.json(models);
});

app.get("/api/providers", (_req, res) => {
  res.json({
    providers: CHAT_PROVIDER_OPTIONS.map((entry) => ({
      id: entry.id,
      label: entry.label,
      apiKeyEnv: entry.apiKeyEnv,
      modelEnv: entry.modelEnv,
      defaultModel: entry.defaultModel,
      keyHint: entry.keyHint,
    })),
    active: getProviderStatus(),
  });
});

app.post("/api/configure", async (req, res) => {
  const body = req.body ?? {};
  const providerId = String(body.provider || "").trim().toLowerCase();
  const apiKey = body.apiKey ?? body.api_key;
  const model = body.model;
  const validation = await validateProviderCredentials(providerId, apiKey, { remote: true });
  if (!validation.ok) {
    res.status(400).json({
      error: validation.message || validation.setupInstructions || "Invalid API key.",
      reason: validation.reason,
    });
    return;
  }

  reloadChatEnvFromFile();
  res.json({
    ok: true,
    provider: providerId,
    model: resolveModelId(model, providerId),
    chatReady: true,
  });
});

app.post("/api/reload-env", (_req, res) => {
  const result = reloadChatEnvFromFile();
  res.json(result);
});

app.post("/api/chat", async (req, res) => {
  const chatKey = await validateChatProviderKey({ remote: true });
  if (!chatKey.ok) {
    res.status(503).json({
      error: chatKey.setupInstructions || chatKey.message || missingKeyMessage(resolveChatProvider()),
    });
    return;
  }

  const { messages, model: requestedModel, mode: requestedMode, attachments } = req.body ?? {};
  if (!Array.isArray(messages)) {
    res.status(400).json({ error: "Request body must include a messages array." });
    return;
  }

  const mode = normalizeChatMode(requestedMode);
  const safeAttachments = Array.isArray(attachments) ? attachments : [];
  const modelId = resolveModelId(requestedModel, chatKey.provider);

  const modeNote = modeSystemNote(mode);
  const userTurnCount = messages.filter((message) => message.role === "user").length;
  const historyNote = userTurnCount > 1
    ? "Read the full conversation history in the messages below, including earlier user attachments. Answer in context of the entire thread — do not treat the latest message in isolation."
    : "";

  try {
    if (chatKey.provider === "cursor") {
      await handleCursorChat(req, res, messages, modelId, { mode, attachments: safeAttachments });
      return;
    }

    const tools = await createChatTools(req.headers, { mode });
    const chatModel = chatKey.provider === "claude"
      ? getClaudeModel(modelId)
      : getOpenAiModel(modelId);
    const systemPrompt = [CATALOGONE_AGENT_PROMPT, modeNote, historyNote].filter(Boolean).join("\n\n");
    const modelMessages = appendAttachmentsToModelMessages(
      await convertToModelMessages(messages),
      safeAttachments,
    );
    const result = streamText({
      model: chatModel,
      system: systemPrompt,
      messages: modelMessages,
      tools,
      stopWhen: stepCountIs(12),
    });

    result.pipeUIMessageStreamToResponse(res, {
      onError: formatChatError,
    });
  } catch (error) {
    console.error("[chat] error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: formatChatError(error) });
    }
  }
});

app.listen(PORT, HOST, async () => {
  const status = getProviderStatus();
  console.log(`[chat-server] listening on http://${HOST}:${PORT}`);
  console.log(`[chat-server] provider=${status.provider || "none"} model=${status.model || "n/a"}`);
  await logCatalogoneMcpStartup();
});
