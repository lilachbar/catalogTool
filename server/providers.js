/**
 * Resolve which LLM backend powers /api/chat.
 */
import { Cursor } from "@cursor/sdk";
import { openai } from "@ai-sdk/openai";

export const CURSOR_KEY_SETUP_INSTRUCTIONS = `CURSOR_API_KEY is not set.

1. Open https://cursor.com/dashboard/integrations
2. Create an API key (format: crsr_…)
3. Add it to the project .env file:
   CURSOR_API_KEY=crsr_your_key_here
4. Restart: ./run_web.sh`;

export const CURSOR_KEY_INVALID_FORMAT = `CURSOR_API_KEY has an invalid format (expected crsr_…).

Create a new key at https://cursor.com/dashboard/integrations and set it in .env, then restart ./run_web.sh.`;

export const OPENAI_KEY_SETUP_INSTRUCTIONS = `OPENAI_API_KEY is not set.

1. Create a key at https://platform.openai.com/api-keys
2. Add to .env:
   CHAT_PROVIDER=openai
   OPENAI_API_KEY=sk-…
3. Restart: ./run_web.sh`;

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

function readApiKey(provider) {
  if (provider === "cursor") {
    return (process.env.CURSOR_API_KEY || "").trim();
  }
  if (provider === "openai") {
    return (process.env.OPENAI_API_KEY || "").trim();
  }
  return "";
}

export function getProviderStatus() {
  const provider = resolveChatProvider();

  if (provider === "cursor") {
    const apiKey = readApiKey("cursor");
    return {
      provider: "cursor",
      model: process.env.CURSOR_MODEL || "composer-2.5",
      hasApiKey: Boolean(apiKey),
      keyFormatValid: apiKey.startsWith("crsr_"),
    };
  }

  if (provider === "openai") {
    const apiKey = readApiKey("openai");
    return {
      provider: "openai",
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      hasApiKey: Boolean(apiKey),
      keyFormatValid: apiKey.startsWith("sk-"),
    };
  }

  return {
    provider: null,
    model: null,
    hasApiKey: false,
    keyFormatValid: false,
  };
}

/** Local format + optional remote validation for chat API keys. */
export async function validateChatProviderKey({ remote = false } = {}) {
  const provider = resolveChatProvider();

  if (!provider) {
    return {
      ok: false,
      provider: null,
      reason: "not_configured",
      message:
        "No chat provider configured. Set CHAT_PROVIDER=cursor with CURSOR_API_KEY, or CHAT_PROVIDER=openai with OPENAI_API_KEY in .env.",
      setupInstructions: CURSOR_KEY_SETUP_INSTRUCTIONS,
    };
  }

  const apiKey = readApiKey(provider);

  if (!apiKey) {
    return {
      ok: false,
      provider,
      reason: "missing",
      message: provider === "cursor" ? "CURSOR_API_KEY is not set." : "OPENAI_API_KEY is not set.",
      setupInstructions:
        provider === "cursor" ? CURSOR_KEY_SETUP_INSTRUCTIONS : OPENAI_KEY_SETUP_INSTRUCTIONS,
    };
  }

  if (provider === "cursor" && !apiKey.startsWith("crsr_")) {
    return {
      ok: false,
      provider,
      reason: "invalid_format",
      message: "CURSOR_API_KEY has an invalid format.",
      setupInstructions: CURSOR_KEY_INVALID_FORMAT,
    };
  }

  if (provider === "openai" && !apiKey.startsWith("sk-")) {
    return {
      ok: false,
      provider,
      reason: "invalid_format",
      message: "OPENAI_API_KEY has an invalid format (expected sk-…).",
      setupInstructions: OPENAI_KEY_SETUP_INSTRUCTIONS,
    };
  }

  if (!remote) {
    return { ok: true, provider, reason: "format_ok" };
  }

  if (provider === "cursor") {
    try {
      await Cursor.models.list({ apiKey });
      return { ok: true, provider, reason: "verified" };
    } catch (error) {
      const message = error?.message || String(error);
      const lower = message.toLowerCase();
      const invalid =
        lower.includes("invalid") ||
        lower.includes("unauthenticated") ||
        lower.includes("api key");
      return {
        ok: false,
        provider,
        reason: invalid ? "invalid" : "verify_failed",
        message: invalid
          ? "CURSOR_API_KEY is not valid or was rejected by Cursor."
          : `Could not verify CURSOR_API_KEY: ${message}`,
        setupInstructions: `${CURSOR_KEY_SETUP_INSTRUCTIONS}

If you already set a key, create a new one at https://cursor.com/dashboard/integrations and update .env.`,
      };
    }
  }

  return { ok: true, provider, reason: "format_ok" };
}

export function getOpenAiModel() {
  return openai(process.env.OPENAI_MODEL || "gpt-4o-mini");
}

export function missingKeyMessage(provider) {
  if (provider === "cursor") {
    return CURSOR_KEY_SETUP_INSTRUCTIONS;
  }
  if (provider === "openai") {
    return OPENAI_KEY_SETUP_INSTRUCTIONS;
  }
  return "No chat provider configured. Set CHAT_PROVIDER=cursor with CURSOR_API_KEY, or CHAT_PROVIDER=openai with OPENAI_API_KEY in .env.";
}
