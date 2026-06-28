/**
 * Catalog Tool chat API — Vercel AI SDK + Express.
 * Supports OpenAI or Cursor SDK (CURSOR_API_KEY). Keys stay server-side only.
 */
import "dotenv/config";
import express from "express";
import { convertToModelMessages, stepCountIs, streamText } from "ai";
import { CATALOGONE_AGENT_PROMPT } from "./catalogone-prompt.js";
import { getCatalogoneMcpStatus } from "./catalogone-mcp-client.js";
import { handleCursorChat, logCatalogoneMcpStartup } from "./cursor-chat.js";
import { formatChatError } from "./errors.js";
import { createChatTools } from "./tools.js";
import { registerMcpRoutes } from "./mcp-routes.js";
import {
  getOpenAiModel,
  getProviderStatus,
  missingKeyMessage,
  resolveChatProvider,
} from "./providers.js";

const app = express();
app.use(express.json({ limit: "2mb" }));

registerMcpRoutes(app);

const PORT = Number(process.env.CHAT_SERVER_PORT || 3001);

app.get("/health", async (_req, res) => {
  const status = getProviderStatus();
  const mcp = getCatalogoneMcpStatus();
  res.json({
    ok: Boolean(status.provider && status.hasApiKey),
    ...status,
    catalogoneMcp: mcp,
  });
});

app.post("/api/chat", async (req, res) => {
  const provider = resolveChatProvider();
  const status = getProviderStatus();

  if (!provider || !status.hasApiKey) {
    res.status(503).json({ error: missingKeyMessage(provider) });
    return;
  }

  const { messages } = req.body ?? {};
  if (!Array.isArray(messages)) {
    res.status(400).json({ error: "Request body must include a messages array." });
    return;
  }

  try {
    if (provider === "cursor") {
      await handleCursorChat(req, res, messages);
      return;
    }

    const tools = await createChatTools(req.headers);
    const result = streamText({
      model: getOpenAiModel(),
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

app.listen(PORT, "127.0.0.1", async () => {
  const status = getProviderStatus();
  console.log(`[chat-server] listening on http://127.0.0.1:${PORT}`);
  console.log(`[chat-server] provider=${status.provider || "none"} model=${status.model || "n/a"}`);
  await logCatalogoneMcpStartup();
});
