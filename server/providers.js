/**
 * Resolve which LLM backend powers /api/chat.
 */
import { openai } from "@ai-sdk/openai";

export function resolveChatProvider() {
  const explicit = (process.env.CHAT_PROVIDER || "").trim().toLowerCase();

  if (explicit === "cursor") {
    return "cursor";
  }
  if (explicit === "openai") {
    return "openai";
  }

  if (process.env.CURSOR_API_KEY) {
    return "cursor";
  }
  if (process.env.OPENAI_API_KEY) {
    return "openai";
  }

  return null;
}

export function getProviderStatus() {
  const provider = resolveChatProvider();

  if (provider === "cursor") {
    return {
      provider: "cursor",
      model: process.env.CURSOR_MODEL || "composer-2.5",
      hasApiKey: Boolean(process.env.CURSOR_API_KEY),
    };
  }

  if (provider === "openai") {
    return {
      provider: "openai",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      hasApiKey: Boolean(process.env.OPENAI_API_KEY),
    };
  }

  return {
    provider: null,
    model: null,
    hasApiKey: false,
  };
}

export function getOpenAiModel() {
  return openai(process.env.OPENAI_MODEL || "gpt-4o-mini");
}

export function missingKeyMessage(provider) {
  if (provider === "cursor") {
    return "CURSOR_API_KEY is not configured. Create a key at cursor.com/dashboard → API Keys (format crsr_...) and restart ./run_web.sh.";
  }
  if (provider === "openai") {
    return "OPENAI_API_KEY is not configured. Copy .env.example to .env and set your key.";
  }
  return "No chat provider configured. Set CHAT_PROVIDER=cursor with CURSOR_API_KEY, or CHAT_PROVIDER=openai with OPENAI_API_KEY.";
}
