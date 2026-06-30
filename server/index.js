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

const app = express();
app.use(express.json({ limit: "2mb" }));

registerMcpRoutes(app);

const PORT = Number(process.env.CHAT_SERVER_PORT || 3001);
const HOST = process.env.CHAT_SERVER_HOST || "127.0.0.1";

app.get("/health", async (_req, res) => {
  const status = getProviderStatus();
  const chatKey = await validateChatProviderKey({ remote: true });
  const mcp = await probeCatalogoneMcpOnline();
  const models = await listModelsForProvider(status.provider);
  res.json({
    ok: Boolean(chatKey.ok && mcp.online),
    chatReady: chatKey.ok,
    chatProvider: status,
    chatKey: {
      ok: chatKey.ok,
      reason: chatKey.reason,
      message: chatKey.message || null,
      setupInstructions: chatKey.setupInstructions || null,
    },
    models,
    catalogoneMcp: mcp,
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
  const { provider, apiKey, model } = req.body ?? {};
  const providerId = String(provider || "").trim().toLowerCase();
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

  const { messages, model: requestedModel } = req.body ?? {};
  if (!Array.isArray(messages)) {
    res.status(400).json({ error: "Request body must include a messages array." });
    return;
  }

  const modelId = resolveModelId(requestedModel, chatKey.provider);

  try {
    if (chatKey.provider === "cursor") {
      await handleCursorChat(req, res, messages, modelId);
      return;
    }

    const tools = await createChatTools(req.headers);
    const chatModel = chatKey.provider === "claude"
      ? getClaudeModel(modelId)
      : getOpenAiModel(modelId);
    const result = streamText({
      model: chatModel,
      system: CATALOGONE_AGENT_PROMPT,
      messages: await convertToModelMessages(messages),
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
